/**
 * Tag routes for OCI Distribution Specification.
 * Implements tag listing endpoint.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { getConfig } from "../config.ts";
import { nameInvalid, nameUnknown } from "../utils/errors.ts";

/**
 * Validates repository name according to OCI distribution spec.
 * Centralizes validation logic to match FilesystemStorage requirements.
 * Format: [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*
 */
function validateRepositoryName(name: string): boolean {
  if (!name) {
    return false;
  }

  const components = name.split("/");
  for (const component of components) {
    if (!component) {
      return false;
    }
    // Each component must match [a-z0-9]+([._-][a-z0-9]+)*
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(component)) {
      return false;
    }
    // Reject path traversal
    if (component === "." || component === "..") {
      return false;
    }
  }
  // Additional safety: ensure no backslashes or other path separators
  if (name.includes("\\") || name.includes("\0")) {
    return false;
  }
  return true;
}

/**
 * Creates the tag routes handler.
 */
export function createTagRoutes(): Hono {
  const tags = new Hono();
  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  /**
   * GET /v2/<name>/tags/list
   * List all tags for a repository.
   */
  tags.get("/:name{.+}/tags/list", async (c: Context) => {
    const name = c.req.param("name");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        "repository name must match [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*",
      );
    }

    // Get tags from storage
    const tagList = await storage.listTags(name);

    // Check if repository exists by verifying if the tags directory exists
    // If listTags returns empty array, we need to check if repository exists
    if (tagList.length === 0) {
      // Check if repository exists by attempting to stat the repository directory
      try {
        const repoPath = `${config.storage.rootDirectory}/repositories/${name}`;
        const stat = await Deno.stat(repoPath);
        if (!stat.isDirectory) {
          return nameUnknown(name);
        }
        // Repository exists but has no tags - return empty array
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return nameUnknown(name);
        }
        throw error;
      }
    }

    // Return tags response
    return c.json({
      name,
      tags: tagList,
    });
  });

  return tags;
}
