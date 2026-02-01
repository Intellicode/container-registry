/**
 * Hono application configuration for the container registry.
 */

import { type Context, Hono, type Next } from "hono";
import { logger } from "hono/logger";
import { ErrorCodes, RegistryError } from "./types/errors.ts";
import { createV2Routes } from "./routes/v2.ts";
import { isDevelopment } from "./middleware/errors.ts";

/**
 * Creates and configures the Hono application.
 */
export function createApp(): Hono {
  // Set strict: false to allow both /v2 and /v2/ to work
  const app = new Hono({ strict: false });

  // Configure error handler
  app.onError((err, c) => {
    console.error("Error handling request:", err);

    // Handle known registry errors
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode);
    }

    // Handle unexpected errors - return OCI-compliant 500 error
    // Never expose stack traces or internal error details in production
    const isDev = isDevelopment();
    const body = {
      errors: [
        {
          code: ErrorCodes.UNKNOWN,
          message: "unknown error",
          ...(isDev && { detail: String(err) }),
        },
      ],
    };

    return c.json(body, 500);
  });

  // Add request logging middleware
  app.use("*", logger());

  // Add Docker-Distribution-API-Version header to all responses
  app.use("*", async (c: Context, next: Next) => {
    await next();
    c.header("Docker-Distribution-API-Version", "registry/2.0");
  });

  // Mount v2 API routes at /v2
  // Note: Hono's route() adds the prefix, so routes defined in v2Routes are relative
  app.route("/v2", createV2Routes());

  return app;
}
