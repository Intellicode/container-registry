/**
 * OCI Distribution Specification types.
 * Based on https://github.com/opencontainers/distribution-spec/blob/main/spec.md
 */

/**
 * Supported manifest media types.
 */
export const ManifestMediaTypes = {
  OCI_MANIFEST: "application/vnd.oci.image.manifest.v1+json",
  OCI_INDEX: "application/vnd.oci.image.index.v1+json",
  DOCKER_MANIFEST_V2: "application/vnd.docker.distribution.manifest.v2+json",
  DOCKER_MANIFEST_LIST:
    "application/vnd.docker.distribution.manifest.list.v2+json",
} as const;

export type ManifestMediaType =
  (typeof ManifestMediaTypes)[keyof typeof ManifestMediaTypes];

/**
 * Content digest format: <algorithm>:<hex-encoded-hash>
 * Example: sha256:abc123...
 */
export type Digest = string;

/**
 * Repository name format: [namespace/]name
 * Example: library/nginx, myorg/myapp
 */
export type RepositoryName = string;

/**
 * Tag reference (e.g., latest, v1.0.0)
 */
export type Tag = string;

/**
 * Reference can be either a tag or a digest
 */
export type Reference = Tag | Digest;

/**
 * OCI Image Manifest
 */
export interface ImageManifest {
  schemaVersion: 2;
  mediaType: ManifestMediaType;
  config: Descriptor;
  layers: Descriptor[];
  annotations?: Record<string, string>;
}

/**
 * OCI Image Index (multi-platform manifest list)
 */
export interface ImageIndex {
  schemaVersion: 2;
  mediaType: string;
  manifests: ManifestDescriptor[];
  annotations?: Record<string, string>;
}

/**
 * Content descriptor
 */
export interface Descriptor {
  mediaType: string;
  digest: Digest;
  size: number;
  annotations?: Record<string, string>;
}

/**
 * Manifest descriptor with optional platform information
 */
export interface ManifestDescriptor extends Descriptor {
  platform?: Platform;
}

/**
 * Platform specification
 */
export interface Platform {
  architecture: string;
  os: string;
  "os.version"?: string;
  "os.features"?: string[];
  variant?: string;
}

/**
 * Catalog response for listing repositories
 */
export interface CatalogResponse {
  repositories: string[];
}

/**
 * Tags list response
 */
export interface TagsListResponse {
  name: string;
  tags: string[];
}
