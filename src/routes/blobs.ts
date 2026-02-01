/**
 * Blob upload routes for OCI Distribution Specification.
 * Implements monolithic (single-request) blob upload flow.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { calculateDigest, isValidDigest, parseDigest } from "../services/digest.ts";
import { getConfig } from "../config.ts";
import {
  blobUploadUnknown,
  digestInvalid,
  nameInvalid,
} from "../utils/errors.ts";

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
 * Validates UUID format to prevent path traversal attacks.
 * UUID must be a valid v4 UUID format.
 */
function isValidUUID(uuid: string): boolean {
  // UUID v4 format: 8-4-4-4-12 hex digits
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Get the path for upload session storage.
 * Validates UUID and ensures path is within uploads directory.
 */
function getUploadPath(uuid: string, rootDirectory: string): string {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid UUID format: ${uuid}`);
  }
  
  const uploadsDir = join(rootDirectory, "uploads");
  const uploadPath = join(uploadsDir, uuid);
  
  // Ensure resolved path is within uploads directory
  const resolvedPath = resolve(uploadPath);
  const resolvedUploadsDir = resolve(uploadsDir);
  
  if (!resolvedPath.startsWith(resolvedUploadsDir + "/") && resolvedPath !== resolvedUploadsDir) {
    throw new Error(`Path traversal detected: ${uuid}`);
  }
  
  return uploadPath;
}

/**
 * Check if an upload session exists.
 */
async function uploadExists(uuid: string, rootDirectory: string): Promise<boolean> {
  try {
    const path = getUploadPath(uuid, rootDirectory);
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/**
 * Cleanup an upload session directory.
 */
async function cleanupUpload(uuid: string, rootDirectory: string): Promise<void> {
  try {
    const uploadPath = getUploadPath(uuid, rootDirectory);
    await Deno.remove(uploadPath, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates the blob upload routes handler.
 */
export function createBlobRoutes(): Hono {
  const blobs = new Hono();
  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  /**
   * POST /v2/<name>/blobs/uploads/
   * Initiates a blob upload session.
   */
  blobs.post("/:name{.+}/blobs/uploads/", async (c: Context) => {
    const name = c.req.param("name");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        "repository name must match [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*",
      );
    }

    // Generate unique upload session ID
    const uuid = crypto.randomUUID();
    const uploadPath = getUploadPath(uuid, config.storage.rootDirectory);

    // Create upload directory
    await ensureDir(uploadPath);

    // Build upload URL
    const uploadUrl = `/v2/${name}/blobs/uploads/${uuid}`;

    // Return 202 Accepted with upload session details
    c.header("Location", uploadUrl);
    c.header("Docker-Upload-UUID", uuid);
    c.header("Range", "0-0");

    return c.body(null, 202);
  });

  /**
   * PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest>
   * Completes a monolithic blob upload.
   */
  blobs.put("/:name{.+}/blobs/uploads/:uuid", async (c: Context) => {
    const name = c.req.param("name");
    const uuid = c.req.param("uuid");
    const digest = c.req.query("digest");

    // Validate UUID format to prevent path traversal
    if (!isValidUUID(uuid)) {
      return blobUploadUnknown(uuid);
    }

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        "repository name must match [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*",
      );
    }

    // Validate digest parameter
    if (!digest) {
      return digestInvalid("", "digest query parameter is required");
    }

    if (!isValidDigest(digest)) {
      return digestInvalid(digest, "invalid digest format");
    }

    // Check if upload session exists
    if (!(await uploadExists(uuid, config.storage.rootDirectory))) {
      return blobUploadUnknown(uuid);
    }

    // Get request body as stream
    const body = c.req.raw.body;
    if (!body) {
      // Clean up upload session on error
      await cleanupUpload(uuid, config.storage.rootDirectory);
      return digestInvalid(digest, "request body is empty");
    }

    try {
      // Write blob to temporary file in upload directory
      const uploadPath = getUploadPath(uuid, config.storage.rootDirectory);
      const tempFile = join(uploadPath, "data");

      // Stream body to temporary file
      const file = await Deno.open(tempFile, {
        write: true,
        create: true,
        truncate: true,
      });

      try {
        await body.pipeTo(file.writable);
      } catch (error) {
        try {
          file.close();
        } catch {
          // Ignore close errors
        }
        throw error;
      }

      // Parse digest to get the algorithm
      const parsedDigest = parseDigest(digest);
      if (!parsedDigest) {
        await cleanupUpload(uuid, config.storage.rootDirectory);
        return digestInvalid(digest, "invalid digest format");
      }

      // Calculate digest from uploaded file using the same algorithm
      const uploadedFile = await Deno.open(tempFile, { read: true });
      const computedDigest = await calculateDigest(uploadedFile.readable, parsedDigest.algorithm);
      uploadedFile.close();

      // Verify digest matches
      if (computedDigest !== digest) {
        // Clean up upload session on digest mismatch
        await cleanupUpload(uuid, config.storage.rootDirectory);
        return digestInvalid(
          digest,
          `digest mismatch: computed ${computedDigest}`,
        );
      }

      // Store blob in content-addressable storage
      const blobFile = await Deno.open(tempFile, { read: true });
      await storage.putBlob(digest, blobFile.readable);
      blobFile.close();

      // Create repository layer link
      await storage.linkBlob(name, digest);

      // Clean up upload session
      await cleanupUpload(uuid, config.storage.rootDirectory);

      // Build blob location URL
      const blobUrl = `/v2/${name}/blobs/${digest}`;

      // Return 201 Created
      c.header("Location", blobUrl);
      c.header("Docker-Content-Digest", digest);

      return c.body(null, 201);
    } catch (error) {
      // Clean up on error
      await cleanupUpload(uuid, config.storage.rootDirectory);
      throw error;
    }
  });

  return blobs;
}
