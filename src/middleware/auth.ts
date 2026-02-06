/**
 * Authentication middleware for the container registry.
 */

import type { Context, Next } from "hono";
import { ErrorCodes, RegistryError } from "../types/errors.ts";
import type { AuthConfig } from "../config.ts";
import { AuthService } from "../services/auth.ts";
import { TokenService } from "../services/token.ts";

/**
 * Creates authentication middleware that validates Basic Auth or Bearer token credentials.
 * If authentication is enabled and no valid credentials are provided,
 * returns a 401 Unauthorized response with WWW-Authenticate header.
 */
export function createAuthMiddleware(
  authConfig: AuthConfig,
  authService?: AuthService,
  tokenService?: TokenService,
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
      return respondUnauthorized(c, authConfig);
    }

    // For token auth, validate Bearer token
    if (authConfig.type === "token") {
      if (!tokenService) {
        console.error("Token auth enabled but no token service provided");
        return respondUnauthorized(c, authConfig);
      }

      // Parse Bearer token
      const token = TokenService.parseBearerToken(authHeader);
      if (!token) {
        return respondUnauthorized(
          c,
          authConfig,
          "malformed authorization header",
        );
      }

      // Validate token
      const result = await tokenService.validateToken(token);
      if (!result.valid) {
        return respondUnauthorized(
          c,
          authConfig,
          result.error || "invalid token",
        );
      }

      // Token is valid, store payload in context for potential use by routes
      c.set("tokenPayload", result.payload);
      await next();
      return;
    }

    // For basic auth, validate credentials
    if (authConfig.type === "basic") {
      if (!authService) {
        console.error("Basic auth enabled but no auth service provided");
        return respondUnauthorized(c, authConfig);
      }

      // Parse Basic Auth credentials
      const credentials = AuthService.parseBasicAuth(authHeader);
      if (!credentials) {
        return respondUnauthorized(
          c,
          authConfig,
          "malformed authorization header",
        );
      }

      // Validate credentials
      const isValid = await authService.validateCredentials(
        credentials.username,
        credentials.password,
      );

      if (!isValid) {
        return respondUnauthorized(c, authConfig, "invalid credentials");
      }

      // Credentials are valid, allow request to proceed
      await next();
      return;
    }

    // Unknown auth type - should not happen due to type system
    console.error(`Unknown auth type: ${authConfig.type}`);
    return respondUnauthorized(c, authConfig);
  };
}

/**
 * Helper to return 401 Unauthorized response with WWW-Authenticate header
 */
function respondUnauthorized(
  c: Context,
  authConfig: AuthConfig,
  message: string = "authentication required",
) {
  const error = new RegistryError(ErrorCodes.UNAUTHORIZED, message);

  if (authConfig.type === "token" && authConfig.token) {
    // Generate Bearer challenge with scope based on the request path
    const scope = extractScope(c);
    const challenge = TokenService.generateChallenge(
      authConfig.token.realm,
      authConfig.token.service,
      scope,
    );
    c.header("WWW-Authenticate", challenge);
  } else {
    // Basic auth challenge
    const escapedRealm = authConfig.realm.replace(/["\\]/g, "\\$&");
    c.header("WWW-Authenticate", `Basic realm="${escapedRealm}"`);
  }

  return c.json(error.toResponse(), 401);
}

/**
 * Extracts scope from request path for Bearer challenge
 * Format: repository:<name>:<action> or registry:catalog:*
 */
function extractScope(c: Context): string | undefined {
  const path = c.req.path;

  // Match /v2/<name>/manifests/* or /v2/<name>/blobs/*
  const manifestMatch = path.match(/^\/v2\/([^/]+)\/manifests\//);
  const blobMatch = path.match(/^\/v2\/([^/]+)\/blobs\//);
  const tagsMatch = path.match(/^\/v2\/([^/]+)\/tags\//);

  if (manifestMatch) {
    const name = manifestMatch[1];
    const method = c.req.method;
    const action = method === "GET" || method === "HEAD" ? "pull" : "push";
    return `repository:${name}:${action}`;
  }

  if (blobMatch) {
    const name = blobMatch[1];
    const method = c.req.method;
    const action = method === "GET" || method === "HEAD" ? "pull" : "push";
    return `repository:${name}:${action}`;
  }

  if (tagsMatch) {
    const name = tagsMatch[1];
    return `repository:${name}:pull`;
  }

  // Catalog endpoint
  if (path === "/v2/_catalog") {
    return "registry:catalog:*";
  }

  return undefined;
}
