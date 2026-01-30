/**
 * Hono application configuration for the container registry.
 */

import { type Context, Hono, type Next } from "hono";
import { logger } from "hono/logger";

/**
 * Creates and configures the Hono application.
 */
export function createApp(): Hono {
  const app = new Hono();

  // Add request logging middleware
  app.use("*", logger());

  // Add Docker-Distribution-API-Version header to all responses
  app.use("*", async (c: Context, next: Next) => {
    await next();
    c.header("Docker-Distribution-API-Version", "registry/2.0");
  });

  // Base endpoint - API version check
  // Returns 200 OK if the registry implements the V2 API
  app.get("/v2/", (c: Context) => {
    return c.json({});
  });

  return app;
}
