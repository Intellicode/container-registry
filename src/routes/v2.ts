/**
 * OCI Distribution Specification v2 API routes.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { createAuthMiddleware } from "../middleware/auth.ts";
import { createBlobRoutes } from "./blobs.ts";
import { createManifestRoutes } from "./manifests.ts";
import { createTagRoutes } from "./tags.ts";
import { getConfig } from "../config.ts";

/**
 * Creates the v2 API routes handler.
 */
export function createV2Routes(): Hono {
  const v2 = new Hono({ strict: false }); // Allow trailing slashes
  const config = getConfig();

  // Apply authentication middleware to all v2 routes
  v2.use("*", createAuthMiddleware(config.auth));

  // Base endpoint - API version check
  // Returns 200 OK if the registry implements the V2 API
  // This endpoint is used by docker login and all registry operations
  // strict: false allows both /v2 and /v2/ to match
  v2.get("/", (c: Context) => c.json({}));

  // Mount blob upload routes
  v2.route("/", createBlobRoutes());

  // Mount manifest routes
  v2.route("/", createManifestRoutes());

  // Mount tag routes
  v2.route("/", createTagRoutes());

  return v2;
}
