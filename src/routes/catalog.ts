/**
 * Catalog routes for OCI Distribution Specification.
 * Implements repository listing endpoint.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { getConfig } from "../config.ts";
import {
  applyPagination,
  buildPaginationLink,
  parsePaginationParams,
} from "../utils/pagination.ts";

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
    const pagination = parsePaginationParams(
      c.req.query("n"),
      c.req.query("last"),
    );

    // Get repositories from storage with pagination
    const repositories = await storage.listRepositories({
      limit: pagination.limit + 1, // Fetch one extra to check if there are more results
      last: pagination.last,
    });

    // Apply pagination
    const { items: repos, hasMore } = applyPagination(
      repositories,
      pagination.limit,
    );

    // Build Link header if there are more results
    if (hasMore && repos.length > 0) {
      const lastRepo = repos[repos.length - 1];
      c.header(
        "Link",
        buildPaginationLink("/v2/_catalog", pagination.limit, lastRepo),
      );
    }

    // Return catalog response
    return c.json({
      repositories: repos,
    });
  });

  return catalog;
}
