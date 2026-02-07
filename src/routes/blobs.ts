/**
 * Blob upload routes for OCI Distribution Specification.
 * Implements monolithic (single-request) blob upload flow.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";
import { FilesystemStorage } from "../storage/filesystem.ts";
import {
  createDigestStream,
  isValidDigest,
  parseDigest,
} from "../services/digest.ts";
import { getConfig } from "../config.ts";
import {
  blobUnknown,
  blobUploadUnknown,
  digestInvalid,
  nameInvalid,
} from "../utils/errors.ts";
import {
  isValidUUID,
  REPOSITORY_NAME_ERROR_MESSAGE,
  validateRepositoryName,
} from "../utils/validation.ts";

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

  if (
    !resolvedPath.startsWith(resolvedUploadsDir + "/") &&
    resolvedPath !== resolvedUploadsDir
  ) {
    throw new Error(`Path traversal detected: ${uuid}`);
  }

  return uploadPath;
}

/**
 * Check if an upload session exists.
 */
async function uploadExists(
  uuid: string,
  rootDirectory: string,
): Promise<boolean> {
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
async function cleanupUpload(
  uuid: string,
  rootDirectory: string,
): Promise<void> {
  try {
    const uploadPath = getUploadPath(uuid, rootDirectory);
    await Deno.remove(uploadPath, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get the path for upload data file.
 */
function getUploadDataPath(uuid: string, rootDirectory: string): string {
  const uploadPath = getUploadPath(uuid, rootDirectory);
  return join(uploadPath, "data");
}

/**
 * Get the path for upload start timestamp file.
 */
function getUploadStartedAtPath(uuid: string, rootDirectory: string): string {
  const uploadPath = getUploadPath(uuid, rootDirectory);
  return join(uploadPath, "startedat");
}

/**
 * Get current upload size by checking data file size.
 */
async function getUploadSize(
  uuid: string,
  rootDirectory: string,
): Promise<number> {
  try {
    const dataPath = getUploadDataPath(uuid, rootDirectory);
    const stat = await Deno.stat(dataPath);
    return stat.size;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return 0;
    }
    throw error;
  }
}

/**
 * Parse Content-Range header.
 * Formats: "0-1023", "bytes 0-1023", "0-1023/2048"
 */
function parseContentRange(
  rangeHeader: string | undefined,
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }

  // Remove "bytes " prefix if present
  let range = rangeHeader.replace(/^bytes\s+/i, "");

  // Remove total size if present (e.g., "0-1023/2048" -> "0-1023")
  range = range.split("/")[0];

  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (isNaN(start) || isNaN(end) || start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Append chunk data to upload session.
 */
async function appendUploadChunk(
  uuid: string,
  rootDirectory: string,
  chunk: ReadableStream<Uint8Array>,
): Promise<void> {
  const dataPath = getUploadDataPath(uuid, rootDirectory);

  // Open file for appending
  const file = await Deno.open(dataPath, {
    write: true,
    create: true,
    append: true,
  });

  try {
    await chunk.pipeTo(file.writable);
  } catch (error) {
    try {
      file.close();
    } catch {
      // Ignore close errors
    }
    throw error;
  }
}

/**
 * Creates the blob upload routes handler.
 */
export function createBlobRoutes(): Hono {
  const blobs = new Hono({ strict: false });
  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  /**
   * POST /v2/<name>/blobs/uploads/
   * Initiates a blob upload session or mounts an existing blob from another repository.
   *
   * Query parameters:
   * - mount: digest to mount from another repository
   * - from: source repository name
   */
  blobs.post("/:name{.+}/blobs/uploads", async (c: Context) => {
    const name = c.req.param("name");
    const mountDigest = c.req.query("mount");
    const fromRepository = c.req.query("from");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(name, REPOSITORY_NAME_ERROR_MESSAGE);
    }

    // Handle blob mount request
    if (mountDigest && fromRepository) {
      // Validate source repository name
      if (!validateRepositoryName(fromRepository)) {
        // Fall back to normal upload initiation if source repo is invalid
        // (per spec: if mount fails, fall back to upload)
      } else if (isValidDigest(mountDigest)) {
        // Check if blob exists in storage
        const blobExists = await storage.hasBlob(mountDigest);

        // Check if source repository has a link to this blob
        const hasSourceLink = await storage.hasLayerLink(
          fromRepository,
          mountDigest,
        );

        if (blobExists && hasSourceLink) {
          // Mount successful: create link in target repository
          await storage.linkBlob(name, mountDigest);

          // Build blob location URL
          const blobUrl = `/v2/${name}/blobs/${mountDigest}`;

          // Return 201 Created with blob location
          c.header("Location", blobUrl);
          c.header("Docker-Content-Digest", mountDigest);

          return c.body(null, 201);
        }
      }

      // If mount fails (blob doesn't exist, no access, or invalid digest),
      // fall back to normal upload initiation
    }

    // Normal upload initiation (or mount fallback)
    // Generate unique upload session ID
    const uuid = crypto.randomUUID();
    const uploadPath = getUploadPath(uuid, config.storage.rootDirectory);

    // Create upload directory
    await ensureDir(uploadPath);

    // Create startedat file with current timestamp
    const startedAtPath = getUploadStartedAtPath(
      uuid,
      config.storage.rootDirectory,
    );
    await Deno.writeTextFile(startedAtPath, new Date().toISOString());

    // Build upload URL
    const uploadUrl = `/v2/${name}/blobs/uploads/${uuid}`;

    // Return 202 Accepted with upload session details
    c.header("Location", uploadUrl);
    c.header("Docker-Upload-UUID", uuid);
    c.header("Range", "0-0");

    return c.body(null, 202);
  });

  /**
   * GET /v2/<name>/blobs/uploads/<uuid>
   * Check upload session status.
   */
  blobs.get("/:name{.+}/blobs/uploads/:uuid", async (c: Context) => {
    const name = c.req.param("name");
    const uuid = c.req.param("uuid");

    // Validate UUID format to prevent path traversal
    if (!isValidUUID(uuid)) {
      return blobUploadUnknown(uuid);
    }

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(name, REPOSITORY_NAME_ERROR_MESSAGE);
    }

    // Check if upload session exists
    if (!(await uploadExists(uuid, config.storage.rootDirectory))) {
      return blobUploadUnknown(uuid);
    }

    // Get current upload size
    const currentSize = await getUploadSize(uuid, config.storage.rootDirectory);

    // Build upload URL
    const uploadUrl = `/v2/${name}/blobs/uploads/${uuid}`;

    // Return 204 No Content with upload status
    c.header("Location", uploadUrl);
    c.header("Docker-Upload-UUID", uuid);

    // Range header format: "0-<offset>" where offset is the last byte received
    // If no data has been uploaded yet, return "0-0"
    if (currentSize > 0) {
      c.header("Range", `0-${currentSize - 1}`);
    } else {
      c.header("Range", "0-0");
    }

    return c.body(null, 204);
  });

  /**
   * PATCH /v2/<name>/blobs/uploads/<uuid>
   * Upload a chunk of data to an existing upload session.
   */
  blobs.patch("/:name{.+}/blobs/uploads/:uuid", async (c: Context) => {
    const name = c.req.param("name");
    const uuid = c.req.param("uuid");
    const contentRangeHeader = c.req.header("Content-Range");

    // Validate UUID format to prevent path traversal
    if (!isValidUUID(uuid)) {
      return blobUploadUnknown(uuid);
    }

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Check if upload session exists
    if (!(await uploadExists(uuid, config.storage.rootDirectory))) {
      return blobUploadUnknown(uuid);
    }

    // Get current upload size
    const currentSize = await getUploadSize(uuid, config.storage.rootDirectory);

    // Parse and validate Content-Range header if present
    if (contentRangeHeader) {
      const range = parseContentRange(contentRangeHeader);
      if (!range) {
        return c.json({
          errors: [{
            code: "BLOB_UPLOAD_INVALID",
            message: "invalid Content-Range header format",
            detail: "expected format: <start>-<end> or bytes <start>-<end>",
          }],
        }, 400);
      }

      // Validate range is contiguous with current data
      if (range.start !== currentSize) {
        c.header("Range", `0-${currentSize - 1}`);
        return c.json({
          errors: [{
            code: "RANGE_NOT_SATISFIABLE",
            message: "range not contiguous with existing data",
            detail:
              `expected range to start at ${currentSize}, got ${range.start}`,
          }],
        }, 416);
      }
    }

    // Get request body
    const body = c.req.raw.body;
    if (!body) {
      return c.json({
        errors: [{
          code: "BLOB_UPLOAD_INVALID",
          message: "request body is empty",
        }],
      }, 400);
    }

    try {
      // Append chunk to upload data
      await appendUploadChunk(uuid, config.storage.rootDirectory, body);

      // Get new upload size
      const newSize = await getUploadSize(uuid, config.storage.rootDirectory);

      // Build upload URL
      const uploadUrl = `/v2/${name}/blobs/uploads/${uuid}`;

      // Return 202 Accepted with updated range
      c.header("Location", uploadUrl);
      c.header("Docker-Upload-UUID", uuid);
      c.header("Range", `0-${newSize - 1}`);

      return c.body(null, 202);
    } catch (error) {
      throw error;
    }
  });

  /**
   * PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest>
   * Completes a monolithic blob upload or chunked upload with optional final chunk.
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
        REPOSITORY_NAME_ERROR_MESSAGE,
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

    // Get request body as stream (may be empty if all data was uploaded via PATCH)
    const body = c.req.raw.body;

    // Check if there's existing upload data from PATCH requests
    const existingSize = await getUploadSize(
      uuid,
      config.storage.rootDirectory,
    );
    const hasExistingData = existingSize > 0;

    // Track resources for cleanup on error (declared outside try block for catch access)
    let openedFile: Deno.FsFile | null = null;
    let digestBranch: ReadableStream<Uint8Array> | null = null;

    try {
      // Parse digest to get the algorithm
      const parsedDigest = parseDigest(digest);
      if (!parsedDigest) {
        await cleanupUpload(uuid, config.storage.rootDirectory);
        return digestInvalid(digest, "invalid digest format");
      }

      let finalStream: ReadableStream<Uint8Array>;

      if (hasExistingData && body) {
        // Case 1: Has existing data from PATCH + final chunk in PUT body
        // Need to combine existing data file with incoming body
        const dataPath = getUploadDataPath(uuid, config.storage.rootDirectory);
        const existingFile = await Deno.open(dataPath, { read: true });
        openedFile = existingFile;

        // Track whether streams have been fully consumed or cancelled
        let existingStreamConsumed = false;
        let bodyStreamConsumed = false;

        // Create a stream that reads existing data first, then the body
        finalStream = new ReadableStream({
          async pull(controller) {
            // First, read all existing data
            if (!existingStreamConsumed) {
              const existingReader = existingFile.readable.getReader();
              try {
                while (true) {
                  const { done, value } = await existingReader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
              } finally {
                existingReader.releaseLock();
              }
              existingStreamConsumed = true;
            }

            // Then, read all body data
            if (!bodyStreamConsumed && body) {
              const bodyReader = body.getReader();
              try {
                while (true) {
                  const { done, value } = await bodyReader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
              } finally {
                bodyReader.releaseLock();
              }
              bodyStreamConsumed = true;
            }

            controller.close();
          },
          cancel() {
            // Ensure file handle is closed if stream is cancelled
            if (!existingStreamConsumed) {
              try {
                existingFile.close();
              } catch {
                // File may already be closed
              }
            }
            // Cancel body stream if not consumed
            if (!bodyStreamConsumed && body) {
              body.cancel().catch(() => {});
            }
          },
        });
      } else if (hasExistingData && !body) {
        // Case 2: Has existing data from PATCH, no body in PUT (all data already uploaded)
        const dataPath = getUploadDataPath(uuid, config.storage.rootDirectory);
        const existingFile = await Deno.open(dataPath, { read: true });
        openedFile = existingFile;
        finalStream = existingFile.readable;
      } else if (!hasExistingData && body) {
        // Case 3: No existing data, body in PUT (monolithic upload)
        finalStream = body;
      } else {
        // Case 4: No data at all
        await cleanupUpload(uuid, config.storage.rootDirectory);
        return digestInvalid(digest, "request body is empty");
      }

      // Create digest stream to compute hash while streaming data
      // This approach uses stream tee'ing to simultaneously:
      // 1. Calculate the digest (without re-reading from disk)
      // 2. Write to temporary staging file
      // 3. Stream to final storage location
      // This reduces memory pressure by avoiding buffering the entire blob,
      // and eliminates redundant disk I/O from re-reading the uploaded file.
      const { stream: digestStream, digest: digestPromise } =
        createDigestStream(
          parsedDigest.algorithm,
        );

      // Create a two-way tee to process the stream in parallel
      // Branch 1: Digest calculation
      // Branch 2: Storage (will be consumed by putBlob)
      let storageBranch: ReadableStream<Uint8Array>;
      [digestBranch, storageBranch] = finalStream.tee();

      // Start digest calculation in background
      const computeDigestTask = digestBranch
        .pipeThrough(digestStream)
        .pipeTo(new WritableStream()); // Consume the digest stream

      // Stream directly to storage (putBlob handles atomic writes internally)
      // This eliminates the intermediate temp file read
      await storage.putBlob(digest, storageBranch);

      // Wait for digest calculation to complete
      await computeDigestTask;
      // Mark digestBranch as consumed so catch block doesn't try to cancel it
      digestBranch = null;
      const computedDigest = await digestPromise;

      // Verify digest matches
      if (computedDigest !== digest) {
        // Clean up on digest mismatch
        await storage.deleteBlob(digest);
        await cleanupUpload(uuid, config.storage.rootDirectory);
        return digestInvalid(
          digest,
          `digest mismatch: computed ${computedDigest}`,
        );
      }

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
      // Clean up resources on error
      // Cancel any unconsummed tee'd stream to prevent resource leaks
      if (digestBranch) {
        try {
          await digestBranch.cancel();
        } catch {
          // Ignore cancel errors
        }
      }
      // Close file handle if stream wasn't fully consumed
      if (openedFile) {
        try {
          openedFile.close();
        } catch {
          // File may already be closed via readable consumption
        }
      }
      await cleanupUpload(uuid, config.storage.rootDirectory);
      throw error;
    }
  });

  /**
   * DELETE /v2/<name>/blobs/uploads/<uuid>
   * Cancel an upload session.
   */
  blobs.on("DELETE", "/:name{.+}/blobs/uploads/:uuid", async (c: Context) => {
    const name = c.req.param("name");
    const uuid = c.req.param("uuid");

    // Validate UUID format to prevent path traversal
    if (!isValidUUID(uuid)) {
      return blobUploadUnknown(uuid);
    }

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Check if upload session exists
    if (!(await uploadExists(uuid, config.storage.rootDirectory))) {
      return blobUploadUnknown(uuid);
    }

    // Remove upload session directory and data
    await cleanupUpload(uuid, config.storage.rootDirectory);

    // Return 204 No Content
    return c.body(null, 204);
  });

  /**
   * HEAD /v2/<name>/blobs/<digest>
   * Check if a blob exists.
   */
  blobs.on("HEAD", "/:name{.+}/blobs/:digest", async (c: Context) => {
    const name = c.req.param("name");
    const digest = c.req.param("digest");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Validate digest format
    if (!isValidDigest(digest)) {
      return digestInvalid(digest, "invalid digest format");
    }

    // Check if blob exists in storage
    const exists = await storage.hasBlob(digest);
    if (!exists) {
      return blobUnknown(digest);
    }

    // Get blob size
    const size = await storage.getBlobSize(digest);
    if (size === null) {
      return blobUnknown(digest);
    }

    // Return 200 OK with headers
    c.header("Content-Length", size.toString());
    c.header("Docker-Content-Digest", digest);

    return c.body(null, 200);
  });

  /**
   * GET /v2/<name>/blobs/<digest>
   * Download a blob.
   */
  blobs.get("/:name{.+}/blobs/:digest", async (c: Context) => {
    const name = c.req.param("name");
    const digest = c.req.param("digest");
    const rangeHeader = c.req.header("Range");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Validate digest format
    if (!isValidDigest(digest)) {
      return digestInvalid(digest, "invalid digest format");
    }

    // Get blob stream
    const stream = await storage.getBlob(digest);
    if (!stream) {
      return blobUnknown(digest);
    }

    // Get blob size
    const size = await storage.getBlobSize(digest);
    if (size === null) {
      // Cancel stream before returning error to prevent file handle leak
      await stream.cancel();
      return blobUnknown(digest);
    }

    // Handle Range requests
    if (rangeHeader) {
      // Parse range header (e.g., "bytes=0-1023")
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1;

        // Validate range
        if (start >= size || start < 0 || end < start || end >= size) {
          // Cancel stream before returning error to prevent file handle leak
          await stream.cancel();
          c.header("Content-Range", `bytes */${size}`);
          return c.body("Requested range not satisfiable", 416);
        }

        // Create a range stream by skipping to offset and limiting bytes
        const contentLength = end - start + 1;

        // Read and discard bytes until start position
        let bytesRead = 0;
        const reader = stream.getReader();

        // Skip to start position
        while (bytesRead < start) {
          const { done, value } = await reader.read();
          if (done) {
            reader.releaseLock();
            await stream.cancel();
            return c.body("Unexpected end of stream", 500);
          }
          const toSkip = Math.min(value.length, start - bytesRead);
          bytesRead += toSkip;

          // If we haven't skipped the entire chunk, we need to handle partial chunk
          if (toSkip < value.length) {
            // Create a new stream with the remaining data from this chunk
            const partialChunk = value.slice(toSkip);
            let remainingBytes = contentLength;
            let lockReleased = false;

            const rangeStream = new ReadableStream({
              async start(controller) {
                try {
                  // Enqueue the partial chunk first
                  if (remainingBytes > 0) {
                    const toEnqueue = partialChunk.slice(
                      0,
                      Math.min(partialChunk.length, remainingBytes),
                    );
                    controller.enqueue(toEnqueue);
                    remainingBytes -= toEnqueue.length;
                  }

                  // Continue reading from the original stream
                  while (remainingBytes > 0) {
                    const { done, value } = await reader.read();
                    if (done) {
                      break;
                    }
                    const toEnqueue = value.slice(
                      0,
                      Math.min(value.length, remainingBytes),
                    );
                    controller.enqueue(toEnqueue);
                    remainingBytes -= toEnqueue.length;
                  }
                } finally {
                  // Always release the lock if not already released
                  if (!lockReleased) {
                    lockReleased = true;
                    reader.releaseLock();
                  }
                  controller.close();
                }
              },
              async cancel() {
                // Release the reader first, then cancel the underlying stream
                if (!lockReleased) {
                  lockReleased = true;
                  reader.releaseLock();
                }
                await stream.cancel();
              },
            });

            c.header("Content-Length", contentLength.toString());
            c.header("Content-Range", `bytes ${start}-${end}/${size}`);
            c.header("Content-Type", "application/octet-stream");
            c.header("Docker-Content-Digest", digest);
            return c.body(rangeStream, 206);
          }
        }

        // Create limited stream for the range
        let remainingBytes = contentLength;
        let lockReleased = false;

        const rangeStream = new ReadableStream({
          async start(controller) {
            try {
              while (remainingBytes > 0) {
                const { done, value } = await reader.read();
                if (done) {
                  break;
                }
                const toEnqueue = value.slice(
                  0,
                  Math.min(value.length, remainingBytes),
                );
                controller.enqueue(toEnqueue);
                remainingBytes -= toEnqueue.length;
              }
            } finally {
              // Always release the lock if not already released
              if (!lockReleased) {
                lockReleased = true;
                reader.releaseLock();
              }
              controller.close();
            }
          },
          async cancel() {
            // Release the reader first, then cancel the underlying stream
            if (!lockReleased) {
              lockReleased = true;
              reader.releaseLock();
            }
            await stream.cancel();
          },
        });

        c.header("Content-Length", contentLength.toString());
        c.header("Content-Range", `bytes ${start}-${end}/${size}`);
        c.header("Content-Type", "application/octet-stream");
        c.header("Docker-Content-Digest", digest);
        return c.body(rangeStream, 206);
      }
    }

    // Return full blob
    c.header("Content-Length", size.toString());
    c.header("Content-Type", "application/octet-stream");
    c.header("Docker-Content-Digest", digest);

    return c.body(stream, 200);
  });

  /**
   * DELETE /v2/<name>/blobs/<digest>
   * Delete a blob from a repository.
   */
  blobs.on("DELETE", "/:name{.+}/blobs/:digest", async (c: Context) => {
    const name = c.req.param("name");
    const digest = c.req.param("digest");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Validate digest format
    if (!isValidDigest(digest)) {
      return digestInvalid(digest, "invalid digest format");
    }

    // Check if blob exists in storage
    const exists = await storage.hasBlob(digest);
    if (!exists) {
      return blobUnknown(digest);
    }

    // Check if this repository has a link to the blob
    const hasLink = await storage.hasLayerLink(name, digest);
    if (!hasLink) {
      return blobUnknown(digest);
    }

    // Remove repository's link to the blob
    await storage.unlinkBlob(name, digest);

    // Count remaining references to the blob across all repositories
    const refCount = await storage.countBlobReferences(digest);

    // Only delete the actual blob if no other repositories reference it
    if (refCount === 0) {
      await storage.deleteBlob(digest);
    }

    // Return 202 Accepted
    return c.body(null, 202);
  });

  return blobs;
}
