/**
 * Hono application configuration for the container registry.
 */

import { type Context, Hono, type Next } from "hono";
import { RegistryError } from "./types/errors.ts";
import { createV2Routes } from "./routes/v2.ts";
import { isDevelopment } from "./middleware/errors.ts";
import { createAuthService } from "./services/auth.ts";
import { createTokenService } from "./services/token.ts";
import { createUploadCleanupService } from "./services/upload-cleanup.ts";
import { createAccessControlService } from "./services/access-control.ts";
import { createAuthorizationMiddleware } from "./middleware/authorization.ts";
import { createLoggingMiddleware, getLogger } from "./middleware/logging.ts";
import { getConfig } from "./config.ts";

/**
 * Creates and configures the Hono application.
 * Returns both the app and the cleanup service so it can be stopped in tests.
 */
export async function createApp(): Promise<
  { app: Hono; cleanup: ReturnType<typeof createUploadCleanupService> }
> {
  // Set strict: false to allow both /v2 and /v2/ to work
  const app = new Hono({ strict: false });

  // Initialize auth service if needed
  const config = getConfig();
  const logger = getLogger(config.log);
  let authService;
  let tokenService;

  if (config.auth.type === "basic" && config.auth.htpasswd) {
    try {
      authService = await createAuthService(config.auth.htpasswd);
      logger.info("basic auth initialized", {
        user_count: authService.getCredentialCount(),
      });
    } catch (error) {
      logger.error("failed to initialize auth service", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } else if (config.auth.type === "token" && config.auth.token) {
    try {
      tokenService = await createTokenService(config.auth.token);
      logger.info("token service initialized", {
        issuer: config.auth.token.issuer,
      });
    } catch (error) {
      logger.error("failed to initialize token service", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Initialize access control service
  const accessControlService = createAccessControlService(config.access);
  if (accessControlService.isEnabled()) {
    logger.info("access control enabled", {
      rule_count: config.access.rules.length,
      default_policy: config.access.defaultPolicy,
      admin_users: config.access.adminUsers,
    });
  }

  // Initialize upload cleanup service
  const cleanupService = createUploadCleanupService({
    rootDirectory: config.storage.rootDirectory,
    uploadTimeout: config.storage.uploadTimeout,
    cleanupInterval: config.storage.cleanupInterval,
  });

  // Configure error handler
  app.onError((err, c) => {
    // Get request-scoped logger if available, otherwise use app logger
    // deno-lint-ignore no-explicit-any
    const reqLogger = (c as any).get("logger") || logger;
    reqLogger.error("unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      method: c.req.method,
      path: c.req.path,
    });

    // Handle known registry errors
    if (err instanceof RegistryError) {
      return c.json(
        err.toResponse(),
        err.statusCode as 400 | 401 | 403 | 404 | 415 | 429,
      );
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

  // Add structured logging middleware
  app.use("*", createLoggingMiddleware(config.log));

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

  return { app, cleanup: cleanupService };
}
