/**
 * Hono application configuration for the container registry.
 */

import { type Context, Hono, type Next } from "hono";
import { logger } from "hono/logger";
import { createV2Routes } from "./routes/v2.ts";

/**
 * Creates and configures the Hono application.
 */
export function createApp(): Hono {
  // Set strict: false to allow both /v2 and /v2/ to work
  const app = new Hono({ strict: false });

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
