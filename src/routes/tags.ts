/**
 * Tag routes for OCI Distribution Specification.
 * Implements tag listing endpoint.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { getConfig } from "../config.ts";
import { nameInvalid, nameUnknown } from "../utils/errors.ts";
import {
  REPOSITORY_NAME_ERROR_MESSAGE,
  validateRepositoryName,
} from "../utils/validation.ts";
import {
  applyPagination,
  buildPaginationLink,
  parsePaginationParams,
} from "../utils/pagination.ts";

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
      return nameInvalid(name, REPOSITORY_NAME_ERROR_MESSAGE);
    }

    // Parse pagination parameters
    const pagination = parsePaginationParams(
      c.req.query("n"),
      c.req.query("last"),
    );

    // Get tags from storage with pagination
    const tagList = await storage.listTags(name, {
      limit: pagination.limit + 1, // Fetch one extra to check if there are more results
      last: pagination.last,
    });

    // Check if repository exists by verifying if the tags directory exists
    // If listTags returns empty array, we need to check if repository exists
    if (tagList.length === 0 && !pagination.last) {
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

    // Apply pagination
    const { items: tags, hasMore } = applyPagination(tagList, pagination.limit);

    // Build Link header if there are more results
    if (hasMore && tags.length > 0) {
      const lastTag = tags[tags.length - 1];
      c.header(
        "Link",
        buildPaginationLink(`/v2/${name}/tags/list`, pagination.limit, lastTag),
      );
    }

    // Return tags response
    return c.json({
      name,
      tags,
    });
  });

  return tags;
}
