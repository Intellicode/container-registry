/**
 * Catalog routes for OCI Distribution Specification.
 * Implements repository listing endpoint.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { getConfig } from "../config.ts";

/**
 * Creates the catalog routes handler.
 */
export function createCatalogRoutes(): Hono {
  const catalog = new Hono();
  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  /**
   * GET /v2/_catalog
   * List all repositories in the registry.
   * Supports pagination with query parameters:
   * - n: limit number of results
   * - last: last repository from previous page (exclusive)
   */
  catalog.get("/_catalog", async (c: Context) => {
    // Parse pagination parameters
    const nParam = c.req.query("n");
    const lastParam = c.req.query("last");

    let limit: number | undefined;
    if (nParam) {
      const parsed = parseInt(nParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        limit = config.pagination.defaultLimit;
      } else {
        // Enforce maximum limit
        limit = Math.min(parsed, config.pagination.maxLimit);
      }
    } else {
      limit = config.pagination.defaultLimit;
    }

    // Get repositories from storage with pagination
    const repositories = await storage.listRepositories({
      limit: limit + 1, // Fetch one extra to check if there are more results
      last: lastParam,
    });

    // Check if there are more results
    const hasMore = repositories.length > limit;
    const repos = hasMore ? repositories.slice(0, limit) : repositories;

    // Build Link header if there are more results
    if (hasMore && repos.length > 0) {
      const lastRepo = repos[repos.length - 1];
      const linkUrl = `/v2/_catalog?n=${limit}&last=${
        encodeURIComponent(lastRepo)
      }`;
      c.header("Link", `<${linkUrl}>; rel="next"`);
    }

    // Return catalog response
    return c.json({
      repositories: repos,
    });
  });

  return catalog;
}
