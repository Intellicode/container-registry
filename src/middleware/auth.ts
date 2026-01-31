/**
 * Authentication middleware for the container registry.
 */

import type { Context, Next } from "hono";
import { ErrorCodes, RegistryError } from "../types/errors.ts";
import type { AuthConfig } from "../config.ts";

/**
 * Creates authentication middleware that checks if authentication is required.
 * If authentication is enabled and no valid credentials are provided,
 * returns a 401 Unauthorized response with WWW-Authenticate header.
 */
export function createAuthMiddleware(authConfig: AuthConfig) {
  return async (c: Context, next: Next) => {
    // If authentication is disabled, allow all requests
    if (!authConfig.enabled) {
      await next();
      return;
    }

    // Check for Authorization header
    const authHeader = c.req.header("Authorization");

    // For now, since we haven't implemented actual authentication yet,
    // we just check if the header exists
    // In future stories (like Story 011: Basic Auth), we'll validate credentials
    if (!authHeader) {
      // Return 401 Unauthorized with WWW-Authenticate header
      const error = new RegistryError(
        ErrorCodes.UNAUTHORIZED,
        "authentication required",
      );

      // Escape quotes and backslashes in the realm to prevent header injection or malformed challenges
      const escapedRealm = authConfig.realm.replace(/["\\]/g, "\\$&");
      c.header("WWW-Authenticate", `Basic realm="${escapedRealm}"`);
      return c.json(error.toResponse(), 401);
    }

    // If auth header is present, continue for now
    // TODO: Implement actual credential validation in Story 011
    await next();
  };
}
