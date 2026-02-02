/**
 * Storage driver interface for container registry.
 * Defines the contract for storing and retrieving blobs, manifests, and repository metadata.
 */
export interface StorageDriver {
  // Blob operations
  /**
   * Check if a blob exists in storage
   * @param digest - The digest of the blob (e.g., "sha256:abc123...")
   * @returns true if blob exists, false otherwise
   */
  hasBlob(digest: string): Promise<boolean>;

  /**
   * Retrieve a blob by digest
   * @param digest - The digest of the blob
   * @returns ReadableStream of blob content, or null if not found
   */
  getBlob(digest: string): Promise<ReadableStream<Uint8Array> | null>;

  /**
   * Get the size of a blob in bytes
   * @param digest - The digest of the blob
   * @returns Size in bytes, or null if blob not found
   */
  getBlobSize(digest: string): Promise<number | null>;

  /**
   * Store a blob with the given digest
   * @param digest - The digest of the blob
   * @param stream - ReadableStream containing the blob data
   */
  putBlob(digest: string, stream: ReadableStream<Uint8Array>): Promise<void>;

  /**
   * Delete a blob from storage
   * @param digest - The digest of the blob to delete
   * @returns true if blob was deleted, false if not found
   */
  deleteBlob(digest: string): Promise<boolean>;

  // Repository layer links
  /**
   * Create a link from a repository to a blob (layer)
   * @param repository - Repository name (e.g., "myorg/myimage")
   * @param digest - The digest of the blob
   */
  linkBlob(repository: string, digest: string): Promise<void>;

  /**
   * Remove a link from a repository to a blob
   * @param repository - Repository name
   * @param digest - The digest of the blob
   */
  unlinkBlob(repository: string, digest: string): Promise<void>;

  /**
   * Check if a repository has a link to a blob (layer)
   * @param repository - Repository name
   * @param digest - The digest of the blob
   * @returns true if layer link exists, false otherwise
   */
  hasLayerLink(repository: string, digest: string): Promise<boolean>;

  // Manifest operations
  /**
   * Retrieve a manifest by reference (tag or digest)
   * @param repository - Repository name
   * @param reference - Tag name or digest
   * @returns Manifest content and digest, or null if not found
   */
  getManifest(
    repository: string,
    reference: string,
  ): Promise<{ content: Uint8Array; digest: string } | null>;

  /**
   * Store a manifest with the given reference
   * @param repository - Repository name
   * @param reference - Tag name or digest
   * @param content - Manifest content as bytes
   * @param digest - The digest of the manifest
   */
  putManifest(
    repository: string,
    reference: string,
    content: Uint8Array,
    digest: string,
  ): Promise<void>;

  /**
   * Delete a manifest by reference
   * @param repository - Repository name
   * @param reference - Tag name or digest
   * @returns true if manifest was deleted, false if not found
   */
  deleteManifest(repository: string, reference: string): Promise<boolean>;

  // Tag operations
  /**
   * List all tags in a repository
   * @param repository - Repository name
   * @param options - Pagination options
   * @returns Array of tag names
   */
  listTags(
    repository: string,
    options?: { limit?: number; last?: string },
  ): Promise<string[]>;

  // Repository operations
  /**
   * List all repositories
   * @param options - Pagination options
   * @returns Array of repository names
   */
  listRepositories(options?: { limit?: number; last?: string }): Promise<
    string[]
  >;
}
