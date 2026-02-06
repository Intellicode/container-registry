/**
 * Hono application configuration for the container registry.
 */

import { type Context, Hono, type Next } from "hono";
import { logger } from "hono/logger";
import { RegistryError } from "./types/errors.ts";
import { createV2Routes } from "./routes/v2.ts";
import { isDevelopment } from "./middleware/errors.ts";
import { createAuthService } from "./services/auth.ts";
import { createTokenService } from "./services/token.ts";
import { createUploadCleanupService } from "./services/upload-cleanup.ts";
import { createAccessControlService } from "./services/access-control.ts";
import { createAuthorizationMiddleware } from "./middleware/authorization.ts";
import { getConfig } from "./config.ts";

/**
 * Creates and configures the Hono application.
 */
export async function createApp(): Promise<Hono> {
  // Set strict: false to allow both /v2 and /v2/ to work
  const app = new Hono({ strict: false });

  // Initialize auth service if needed
  const config = getConfig();
  let authService;
  let tokenService;
  
  if (config.auth.type === "basic" && config.auth.htpasswd) {
    try {
      authService = await createAuthService(config.auth.htpasswd);
      console.log(`Loaded ${authService.getCredentialCount()} users from htpasswd file`);
    } catch (error) {
      console.error(`Failed to initialize auth service: ${error}`);
      throw error;
    }
  } else if (config.auth.type === "token" && config.auth.token) {
    try {
      tokenService = await createTokenService(config.auth.token);
      console.log(`Token service initialized with issuer: ${config.auth.token.issuer}`);
    } catch (error) {
      console.error(`Failed to initialize token service: ${error}`);
      throw error;
    }
  }

  // Initialize access control service
  const accessControlService = createAccessControlService(config.access);
  if (accessControlService.isEnabled()) {
    console.log(`Access control enabled with ${config.access.rules.length} rules`);
    console.log(`Default policy: ${config.access.defaultPolicy}`);
    console.log(`Admin users: ${config.access.adminUsers.join(", ") || "none"}`);
  }

  // Initialize upload cleanup service
  createUploadCleanupService({
    rootDirectory: config.storage.rootDirectory,
    uploadTimeout: config.storage.uploadTimeout,
    cleanupInterval: config.storage.cleanupInterval,
  });

  // Configure error handler
  app.onError((err, c) => {
    console.error("Error handling request:", err);

    // Handle known registry errors
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode as 400 | 401 | 403 | 404 | 415 | 429);
    }

    // Handle unexpected errors - return plain 500 error
    // Never expose stack traces or internal error details in production
    const isDev = isDevelopment();
    const body = {
      error: "internal server error",
      ...(isDev && { detail: String(err) }),
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

  // Add authorization middleware after authentication
  // This must come before v2 routes so it can check permissions
  app.use("/v2/*", createAuthorizationMiddleware(accessControlService));

  // Mount v2 API routes at /v2
  // Note: Hono's route() adds the prefix, so routes defined in v2Routes are relative
  app.route("/v2", createV2Routes(authService, tokenService));

  return app;
}
