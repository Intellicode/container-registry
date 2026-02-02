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
   */
  catalog.get("/_catalog", async (c: Context) => {
    // Get repositories from storage
    const repositories = await storage.listRepositories();

    // Return catalog response
    return c.json({
      repositories,
    });
  });

  return catalog;
}
