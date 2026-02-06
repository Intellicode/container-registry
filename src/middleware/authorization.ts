/**
 * Authorization middleware for repository-level access control.
 */

import type { Context, Next } from "hono";
import { ErrorCodes, RegistryError } from "../types/errors.ts";
import type {
  AccessControlService,
  Permission,
} from "../services/access-control.ts";

/**
 * Creates authorization middleware that checks repository-level permissions.
 * Must be used after authentication middleware to have access to username.
 */
export function createAuthorizationMiddleware(
  accessControlService: AccessControlService,
) {
  return async (c: Context, next: Next) => {
    // If access control is disabled, allow all requests
    if (!accessControlService.isEnabled()) {
      await next();
      return;
    }

    // Extract repository name and required permission from request
    const { repository, permission } = extractRepositoryAndPermission(c);

    // If we can't determine the repository or permission, allow the request
    // (this handles routes like /v2/ base endpoint)
    if (!repository || !permission) {
      await next();
      return;
    }

    // Get username from context (set by auth middleware)
    const username = getUsernameFromContext(c);
    if (!username) {
      // No authentication - treat as anonymous user
      // Check if anonymous access is allowed
      if (!accessControlService.checkPermission("", repository, permission)) {
        return respondForbidden(c, repository, permission);
      }
    } else {
      // Check if user has permission
      if (
        !accessControlService.checkPermission(username, repository, permission)
      ) {
        return respondForbidden(c, repository, permission);
      }
    }

    // Permission granted, continue
    await next();
  };
}

/**
 * Extracts repository name and required permission from the request.
 * Returns undefined if the route doesn't require authorization.
 */
function extractRepositoryAndPermission(
  c: Context,
): { repository?: string; permission?: Permission } {
  const path = c.req.path;
  const method = c.req.method;

  // Match /v2/<name>/manifests/* or /v2/<name>/blobs/* or /v2/<name>/tags/*
  // Repository name can contain slashes, so we match everything until /manifests/, /blobs/, or /tags/
  const manifestMatch = path.match(/^\/v2\/(.+?)\/manifests\//);
  const blobMatch = path.match(/^\/v2\/(.+?)\/blobs\//);
  const tagsMatch = path.match(/^\/v2\/(.+?)\/tags\//);

  let repository: string | undefined;
  let permission: Permission | undefined;

  if (manifestMatch) {
    repository = manifestMatch[1];
    if (method === "GET" || method === "HEAD") {
      permission = "pull";
    } else if (method === "PUT" || method === "POST") {
      permission = "push";
    } else if (method === "DELETE") {
      permission = "delete";
    }
  } else if (blobMatch) {
    repository = blobMatch[1];
    if (method === "GET" || method === "HEAD") {
      permission = "pull";
    } else if (method === "PUT" || method === "POST" || method === "PATCH") {
      permission = "push";
    } else if (method === "DELETE") {
      permission = "delete";
    }
  } else if (tagsMatch) {
    repository = tagsMatch[1];
    permission = "pull"; // Tag listing is read-only
  } else if (path === "/v2/_catalog") {
    // Catalog endpoint - use special repository pattern
    repository = "_catalog";
    permission = "pull";
  }

  return { repository, permission };
}

/**
 * Gets username from context.
 * Tries to extract from token payload (JWT auth) or from basic auth.
 */
function getUsernameFromContext(c: Context): string | undefined {
  // Try to get username from JWT token payload
  const tokenPayload = c.get("tokenPayload");
  if (
    tokenPayload && typeof tokenPayload === "object" && "sub" in tokenPayload
  ) {
    return tokenPayload.sub as string;
  }

  // Try to get username from basic auth
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const base64Credentials = authHeader.slice(6);
      const credentials = atob(base64Credentials);
      const colonIndex = credentials.indexOf(":");
      if (colonIndex !== -1) {
        return credentials.slice(0, colonIndex);
      }
    } catch {
      // Failed to parse basic auth, treat as no username
      return undefined;
    }
  }

  return undefined;
}

/**
 * Returns 403 Forbidden response with DENIED error
 */
function respondForbidden(
  c: Context,
  repository: string,
  permission: Permission,
) {
  const error = new RegistryError(
    ErrorCodes.DENIED,
    "requested access to the resource is denied",
    {
      repository,
      action: permission,
    },
  );

  return c.json(error.toResponse(), 403);
}
