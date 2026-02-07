/**
 * Manifest routes for OCI Distribution Specification.
 * Implements manifest upload, download, and validation.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { calculateDigest, isValidDigest } from "../services/digest.ts";
import { getConfig } from "../config.ts";
import {
  digestInvalid,
  manifestBlobUnknown,
  manifestInvalid,
  manifestUnacceptable,
  manifestUnknown,
  nameInvalid,
  unsupported,
} from "../utils/errors.ts";
import type {
  Descriptor,
  ImageIndex,
  ImageManifest,
  ManifestMediaType,
} from "../types/oci.ts";
import { ManifestMediaTypes } from "../types/oci.ts";
import {
  REPOSITORY_NAME_ERROR_MESSAGE,
  validateRepositoryName,
} from "../utils/validation.ts";
import { streamToUint8Array } from "../utils/streams.ts";

/**
 * Check if a media type is supported for manifests.
 */
function isSupportedMediaType(
  mediaType: string,
): mediaType is ManifestMediaType {
  return Object.values(ManifestMediaTypes).includes(
    mediaType as ManifestMediaType,
  );
}

/**
 * Validate manifest JSON structure based on media type.
 */
function validateManifestStructure(
  manifest: unknown,
  mediaType: ManifestMediaType,
): { valid: boolean; error?: string } {
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, error: "manifest must be a JSON object" };
  }

  const obj = manifest as Record<string, unknown>;

  // Check schema version
  if (obj.schemaVersion !== 2) {
    return {
      valid: false,
      error: "schemaVersion must be 2",
    };
  }

  // Check media type matches
  if (obj.mediaType !== mediaType) {
    return {
      valid: false,
      error:
        `manifest mediaType ${obj.mediaType} does not match Content-Type ${mediaType}`,
    };
  }

  // Validate based on manifest type
  if (
    mediaType === ManifestMediaTypes.OCI_MANIFEST ||
    mediaType === ManifestMediaTypes.DOCKER_MANIFEST_V2
  ) {
    // Image manifest validation
    if (!obj.config || typeof obj.config !== "object") {
      return { valid: false, error: "config is required" };
    }

    if (!Array.isArray(obj.layers)) {
      return { valid: false, error: "layers must be an array" };
    }

    // Validate config descriptor
    const configError = validateDescriptor(obj.config as Descriptor);
    if (configError) {
      return { valid: false, error: `invalid config: ${configError}` };
    }

    // Validate layer descriptors
    const layers = obj.layers as unknown[];
    for (let i = 0; i < layers.length; i++) {
      const layerError = validateDescriptor(layers[i] as Descriptor);
      if (layerError) {
        return { valid: false, error: `invalid layer ${i}: ${layerError}` };
      }
    }
  } else if (
    mediaType === ManifestMediaTypes.OCI_INDEX ||
    mediaType === ManifestMediaTypes.DOCKER_MANIFEST_LIST
  ) {
    // Image index/manifest list validation
    if (!Array.isArray(obj.manifests)) {
      return { valid: false, error: "manifests must be an array" };
    }

    // Validate manifest descriptors
    const manifestsArray = obj.manifests as unknown[];
    for (let i = 0; i < manifestsArray.length; i++) {
      const manifestError = validateDescriptor(manifestsArray[i] as Descriptor);
      if (manifestError) {
        return {
          valid: false,
          error: `invalid manifest ${i}: ${manifestError}`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate a descriptor object.
 */
function validateDescriptor(descriptor: Descriptor): string | null {
  if (!descriptor || typeof descriptor !== "object") {
    return "descriptor must be an object";
  }

  if (!descriptor.mediaType || typeof descriptor.mediaType !== "string") {
    return "mediaType is required";
  }

  if (!descriptor.digest || typeof descriptor.digest !== "string") {
    return "digest is required";
  }

  if (!isValidDigest(descriptor.digest)) {
    return `invalid digest format: ${descriptor.digest}`;
  }

  if (typeof descriptor.size !== "number" || descriptor.size < 0) {
    return "size must be a non-negative number";
  }

  return null;
}

/**
 * Extract all blob digests referenced by a manifest.
 */
function extractBlobDigests(manifest: ImageManifest | ImageIndex): string[] {
  const digests: string[] = [];

  if ("config" in manifest && manifest.config) {
    // Image manifest - includes config blob
    digests.push(manifest.config.digest);
  }

  if ("layers" in manifest && Array.isArray(manifest.layers)) {
    // Image manifest - includes layer blobs
    for (const layer of manifest.layers) {
      digests.push(layer.digest);
    }
  }

  if ("manifests" in manifest && Array.isArray(manifest.manifests)) {
    // Image index/manifest list - includes referenced manifests
    // Note: For manifest lists, we don't verify referenced manifests exist
    // since they might be uploaded later or exist in other registries
    // This matches Docker registry behavior
  }

  return digests;
}

/**
 * Represents an acceptable media type with its quality value.
 */
interface AcceptableMediaType {
  mediaType: string;
  quality: number;
}

/**
 * Parse Accept header into media types with quality values.
 * Format: type/subtype[;q=value], ...
 * Quality values range from 0 to 1, default is 1.
 *
 * @param acceptHeader - The Accept header value from the request
 * @returns Array of acceptable media types sorted by quality (highest first)
 */
function parseAcceptHeader(acceptHeader: string): AcceptableMediaType[] {
  const types: AcceptableMediaType[] = [];

  // Split by comma and parse each type
  const parts = acceptHeader.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Split media type and parameters
    const [mediaType, ...params] = trimmed.split(";").map((s) => s.trim());

    // Extract quality value from parameters
    let quality = 1.0;
    for (const param of params) {
      const [key, value] = param.split("=").map((s) => s.trim());
      if (key === "q" && value) {
        const parsed = parseFloat(value);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          quality = parsed;
        }
      }
    }

    types.push({ mediaType, quality });
  }

  // Sort by quality (highest first)
  types.sort((a, b) => b.quality - a.quality);

  return types;
}

/**
 * Check if a specific media type matches an Accept pattern.
 *
 * @param pattern - The Accept pattern (may include wildcards)
 * @param mediaType - The specific media type to check
 * @returns true if the media type matches the pattern
 */
function matchesMediaType(pattern: string, mediaType: string): boolean {
  // Handle wildcards
  if (pattern === "*/*") {
    return true;
  }

  // Handle partial wildcards like "application/*"
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return mediaType.startsWith(prefix + "/");
  }

  // Exact match
  return pattern === mediaType;
}

/**
 * Parse Accept header and check if the manifest media type is acceptable.
 * Returns true if no Accept header is present (accept anything) or if the
 * manifest's media type matches one of the accepted types.
 * Respects quality values for prioritization.
 *
 * @param acceptHeader - The Accept header value from the request
 * @param manifestMediaType - The media type of the manifest
 * @returns true if the manifest is acceptable, false otherwise
 */
function isAcceptable(
  acceptHeader: string | undefined,
  manifestMediaType: string,
): boolean {
  // If no Accept header, accept anything
  if (!acceptHeader) {
    return true;
  }

  // Parse Accept header with quality values
  const acceptedTypes = parseAcceptHeader(acceptHeader);

  // Check if manifest media type matches any accepted type
  // Already sorted by quality, so first match is the best match
  for (const acceptedType of acceptedTypes) {
    if (matchesMediaType(acceptedType.mediaType, manifestMediaType)) {
      return true;
    }
  }

  return false;
}

/**
 * Creates the manifest routes handler.
 */
export function createManifestRoutes(): Hono {
  const manifests = new Hono();
  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  /**
   * GET /v2/<name>/manifests/<reference>
   * Download a manifest by tag or digest.
   */
  manifests.get("/:name{.+}/manifests/:reference", async (c: Context) => {
    const name = c.req.param("name");
    const reference = c.req.param("reference");
    const acceptHeader = c.req.header("Accept");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Get manifest from storage
    const result = await storage.getManifest(name, reference);
    if (!result) {
      return manifestUnknown(reference);
    }

    // Parse manifest to get media type
    const decoder = new TextDecoder();
    const manifestText = decoder.decode(result.content);
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      return manifestInvalid("manifest is not valid JSON");
    }

    const manifestObj = manifest as Record<string, unknown>;
    const mediaType = manifestObj.mediaType as string;

    // Check content negotiation
    if (!isAcceptable(acceptHeader, mediaType)) {
      return manifestUnacceptable(
        `manifest media type ${mediaType} does not match Accept header`,
        {
          acceptHeader,
          manifestMediaType: mediaType,
        },
      );
    }

    // Set headers and return manifest content
    c.header("Content-Type", mediaType || "application/octet-stream");
    c.header("Docker-Content-Digest", result.digest);
    c.header("Content-Length", result.content.length.toString());

    // Return the manifest content
    return c.body(manifestText, 200);
  });

  /**
   * PUT /v2/<name>/manifests/<reference>
   * Upload a manifest by tag or digest.
   */
  manifests.put("/:name{.+}/manifests/:reference", async (c: Context) => {
    const name = c.req.param("name");
    const reference = c.req.param("reference");
    const contentType = c.req.header("Content-Type");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // Validate Content-Type header
    if (!contentType) {
      return unsupported("Content-Type header is required");
    }

    if (!isSupportedMediaType(contentType)) {
      return unsupported(
        `unsupported manifest media type: ${contentType}`,
        {
          supportedTypes: Object.values(ManifestMediaTypes),
        },
      );
    }

    // Get request body
    const body = c.req.raw.body;
    if (!body) {
      return manifestInvalid("request body is empty");
    }

    // Read body as Uint8Array (preserve raw bytes for digest calculation)
    const content = await streamToUint8Array(body);

    // Parse and validate manifest JSON
    const decoder = new TextDecoder();
    const manifestText = decoder.decode(content);
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      return manifestInvalid("manifest is not valid JSON");
    }

    // Validate manifest structure
    const validation = validateManifestStructure(manifest, contentType);
    if (!validation.valid) {
      return manifestInvalid(validation.error || "invalid manifest structure");
    }

    // Extract blob digests and verify they exist
    const blobDigests = extractBlobDigests(
      manifest as ImageManifest | ImageIndex,
    );
    for (const digest of blobDigests) {
      const exists = await storage.hasBlob(digest);
      if (!exists) {
        return manifestBlobUnknown(digest);
      }
    }

    // Calculate manifest digest from raw bytes
    const manifestDigest = await calculateDigest(content);

    // If reference is a digest, verify it matches calculated digest
    if (isValidDigest(reference)) {
      if (reference !== manifestDigest) {
        return digestInvalid(
          reference,
          `provided digest does not match calculated digest ${manifestDigest}`,
        );
      }
    }

    // Store manifest
    await storage.putManifest(name, reference, content, manifestDigest);

    // Build location URL
    const locationUrl = `/v2/${name}/manifests/${manifestDigest}`;

    // Return 201 Created
    c.header("Location", locationUrl);
    c.header("Docker-Content-Digest", manifestDigest);

    return c.body(null, 201);
  });

  /**
   * DELETE /v2/<name>/manifests/<reference>
   * Delete a manifest by digest (not tag).
   * Per OCI spec, deletion must use digest reference.
   */
  manifests.delete("/:name{.+}/manifests/:reference", async (c: Context) => {
    const name = c.req.param("name");
    const reference = c.req.param("reference");

    // Validate repository name
    if (!validateRepositoryName(name)) {
      return nameInvalid(
        name,
        REPOSITORY_NAME_ERROR_MESSAGE,
      );
    }

    // OCI spec requires deletion by digest, not tag
    if (!isValidDigest(reference)) {
      return unsupported("deletion by tag is not supported, use digest");
    }

    // Delete manifest
    try {
      const deleted = await storage.deleteManifest(name, reference);
      if (!deleted) {
        return manifestUnknown(reference);
      }

      return c.body(null, 202);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not supported")) {
        return unsupported(error.message);
      }
      throw error;
    }
  });

  /**
   * HEAD /v2/<name>/manifests/<reference>
   * Check if a manifest exists.
   */
  manifests.on(
    "HEAD",
    "/:name{.+}/manifests/:reference",
    async (c: Context) => {
      const name = c.req.param("name");
      const reference = c.req.param("reference");
      const acceptHeader = c.req.header("Accept");

      // Validate repository name
      if (!validateRepositoryName(name)) {
        return nameInvalid(
          name,
          REPOSITORY_NAME_ERROR_MESSAGE,
        );
      }

      // Get manifest from storage
      const result = await storage.getManifest(name, reference);
      if (!result) {
        return manifestUnknown(reference);
      }

      // Parse manifest to get media type
      const decoder = new TextDecoder();
      const manifestText = decoder.decode(result.content);
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestText);
      } catch {
        return manifestInvalid("manifest is not valid JSON");
      }

      const manifestObj = manifest as Record<string, unknown>;
      const mediaType = manifestObj.mediaType as string;

      // Check content negotiation
      if (!isAcceptable(acceptHeader, mediaType)) {
        return manifestUnacceptable(
          `manifest media type ${mediaType} does not match Accept header`,
          {
            acceptHeader,
            manifestMediaType: mediaType,
          },
        );
      }

      // Return headers only
      c.header("Content-Type", mediaType || "application/octet-stream");
      c.header("Docker-Content-Digest", result.digest);
      c.header("Content-Length", result.content.length.toString());

      return c.body(null, 200);
    },
  );

  return manifests;
}
