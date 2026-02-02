/**
 * Authentication middleware for the container registry.
 */

import type { Context, Next } from "hono";
import { ErrorCodes, RegistryError } from "../types/errors.ts";
import type { AuthConfig } from "../config.ts";
import { AuthService } from "../services/auth.ts";

/**
 * Creates authentication middleware that validates Basic Auth credentials.
 * If authentication is enabled and no valid credentials are provided,
 * returns a 401 Unauthorized response with WWW-Authenticate header.
 */
export function createAuthMiddleware(
  authConfig: AuthConfig,
  authService?: AuthService,
) {
  return async (c: Context, next: Next) => {
    // If authentication is disabled, allow all requests
    if (authConfig.type === "none") {
      await next();
      return;
    }

    // Check for Authorization header
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      // Return 401 Unauthorized with WWW-Authenticate header
      return respondUnauthorized(c, authConfig.realm, "authentication required");
    }

    // For basic auth, validate credentials
    if (authConfig.type === "basic") {
      if (!authService) {
        console.error("Basic auth enabled but no auth service provided");
        return respondUnauthorized(c, authConfig.realm, "authentication required");
      }

      // Parse Basic Auth credentials
      const credentials = AuthService.parseBasicAuth(authHeader);
      if (!credentials) {
        return respondUnauthorized(c, authConfig.realm, "malformed authorization header");
      }

      // Validate credentials
      const isValid = await authService.validateCredentials(
        credentials.username,
        credentials.password,
      );

      if (!isValid) {
        return respondUnauthorized(c, authConfig.realm, "invalid credentials");
      }

      // Credentials are valid, allow request to proceed
      await next();
      return;
    }

    // Unknown auth type - should not happen due to type system
    console.error(`Unknown auth type: ${authConfig.type}`);
    return respondUnauthorized(c, authConfig.realm, "authentication required");
  };
}

/**
 * Helper to return 401 Unauthorized response with WWW-Authenticate header
 */
function respondUnauthorized(c: Context, realm: string, message: string) {
  const error = new RegistryError(ErrorCodes.UNAUTHORIZED, message);
  
  // Escape quotes and backslashes in the realm to prevent header injection or malformed challenges
  const escapedRealm = realm.replace(/["\\]/g, "\\$&");
  c.header("WWW-Authenticate", `Basic realm="${escapedRealm}"`);
  return c.json(error.toResponse(), 401);
}
