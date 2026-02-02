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
   * Supports pagination with query parameters:
   * - n: limit number of results
   * - last: last tag from previous page (exclusive)
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

    // Get tags from storage with pagination
    const tagList = await storage.listTags(name, {
      limit: limit + 1, // Fetch one extra to check if there are more results
      last: lastParam,
    });

    // Check if repository exists by verifying if the tags directory exists
    // If listTags returns empty array, we need to check if repository exists
    if (tagList.length === 0 && !lastParam) {
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

    // Check if there are more results
    const hasMore = tagList.length > limit;
    const tags = hasMore ? tagList.slice(0, limit) : tagList;

    // Build Link header if there are more results
    if (hasMore && tags.length > 0) {
      const lastTag = tags[tags.length - 1];
      const linkUrl = `/v2/${name}/tags/list?n=${limit}&last=${
        encodeURIComponent(lastTag)
      }`;
      c.header("Link", `<${linkUrl}>; rel="next"`);
    }

    // Return tags response
    return c.json({
      name,
      tags,
    });
  });

  return tags;
}
