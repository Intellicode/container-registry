import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";
import type { StorageDriver } from "./interface.ts";

/**
 * Filesystem-based storage driver implementation.
 * Stores blobs in a content-addressable structure and repository metadata in a hierarchical structure.
 */
export class FilesystemStorage implements StorageDriver {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  /**
   * Validate and parse a digest according to OCI spec
   * Format: algorithm:encoded
   * algorithm: [a-z0-9]+([+._-][a-z0-9]+)*
   * encoded: [a-zA-Z0-9=_-]+
   */
  private parseDigest(digest: string): { algorithm: string; hash: string } {
    // OCI digest format: algorithm:encoded
    // Split on first colon only
    const colonIndex = digest.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid digest format: ${digest}`);
    }

    const algorithm = digest.substring(0, colonIndex);
    const hash = digest.substring(colonIndex + 1);

    // Validate algorithm: [a-z0-9]+([+._-][a-z0-9]+)*
    if (!/^[a-z0-9]+([+._-][a-z0-9]+)*$/i.test(algorithm)) {
      throw new Error(`Invalid digest algorithm: ${algorithm}`);
    }

    // Validate hash: must be hex for common algorithms (sha256, sha512)
    // For now, enforce lowercase hex to match OCI spec
    if (!hash || !/^[a-f0-9]+$/i.test(hash)) {
      throw new Error(`Invalid digest hash: ${hash}`);
    }

    // Reject path traversal attempts
    if (
      algorithm.includes("..") || algorithm.includes("/") ||
      algorithm.includes("\\")
    ) {
      throw new Error(
        `Invalid digest algorithm contains path separators: ${algorithm}`,
      );
    }

    if (hash.includes("..") || hash.includes("/") || hash.includes("\\")) {
      throw new Error(`Invalid digest hash contains path separators: ${hash}`);
    }

    return { algorithm, hash };
  }

  /**
   * Validate repository name according to OCI distribution spec
   * Format: [a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*
   */
  private validateRepository(repository: string): void {
    if (!repository) {
      throw new Error("Repository name cannot be empty");
    }

    // OCI distribution spec: repository name components separated by /
    // Each component: lowercase alphanumeric, dots, dashes, underscores
    // Must start with alphanumeric
    const components = repository.split("/");

    for (const component of components) {
      if (!component) {
        throw new Error(
          `Invalid repository name: empty component in ${repository}`,
        );
      }

      // Each component must match [a-z0-9]+([._-][a-z0-9]+)*
      if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(component)) {
        throw new Error(`Invalid repository component: ${component}`);
      }

      // Reject path traversal
      if (component === "." || component === "..") {
        throw new Error(
          `Invalid repository name contains path traversal: ${repository}`,
        );
      }
    }

    // Additional safety: ensure no backslashes or other path separators
    if (repository.includes("\\") || repository.includes("\0")) {
      throw new Error(
        `Invalid repository name contains illegal characters: ${repository}`,
      );
    }
  }

  /**
   * Validate tag name according to OCI distribution spec
   * Format: [a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}
   */
  private validateTag(tag: string): void {
    if (!tag) {
      throw new Error("Tag name cannot be empty");
    }

    // OCI spec: tag must be valid ASCII, max 128 chars
    // Must match [a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}
    if (tag.length > 128) {
      throw new Error(`Tag name too long: ${tag.length} > 128`);
    }

    if (!/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(tag)) {
      throw new Error(`Invalid tag name: ${tag}`);
    }

    // Reject path traversal
    if (
      tag.includes("..") || tag.includes("/") || tag.includes("\\") ||
      tag.includes("\0")
    ) {
      throw new Error(`Invalid tag name contains path separators: ${tag}`);
    }
  }

  /**
   * Ensure a path is within the root directory (prevent path traversal)
   */
  private validatePath(path: string): void {
    const resolved = resolve(path);
    if (
      !resolved.startsWith(this.rootPath + "/") && resolved !== this.rootPath
    ) {
      throw new Error(`Path traversal detected: ${path}`);
    }
  }

  /**
   * Get the path for a blob based on its digest
   * Uses two-level directory structure: sha256/ab/abcdef1234...
   */
  private getBlobPath(digest: string): string {
    const { algorithm, hash } = this.parseDigest(digest);

    // Two-level directory structure to avoid inode limits
    const prefix = hash.length >= 2 ? hash.substring(0, 2) : hash;
    const path = join(this.rootPath, "blobs", algorithm, prefix, hash);
    this.validatePath(path);
    return path;
  }

  /**
   * Get the path for a repository's layer link
   */
  private getLayerLinkPath(repository: string, digest: string): string {
    this.validateRepository(repository);
    const { algorithm, hash } = this.parseDigest(digest);

    const path = join(
      this.rootPath,
      "repositories",
      repository,
      "_layers",
      algorithm,
      hash,
      "link",
    );
    this.validatePath(path);
    return path;
  }

  /**
   * Get the path for a manifest revision link
   */
  private getManifestRevisionPath(repository: string, digest: string): string {
    this.validateRepository(repository);
    const { algorithm, hash } = this.parseDigest(digest);

    const path = join(
      this.rootPath,
      "repositories",
      repository,
      "_manifests",
      "revisions",
      algorithm,
      hash,
      "link",
    );
    this.validatePath(path);
    return path;
  }

  /**
   * Get the path for a manifest tag link
   */
  private getManifestTagPath(repository: string, tag: string): string {
    this.validateRepository(repository);
    this.validateTag(tag);

    const path = join(
      this.rootPath,
      "repositories",
      repository,
      "_manifests",
      "tags",
      tag,
      "current",
      "link",
    );
    this.validatePath(path);
    return path;
  }

  /**
   * Get the tags directory for a repository
   */
  private getTagsPath(repository: string): string {
    this.validateRepository(repository);

    const path = join(
      this.rootPath,
      "repositories",
      repository,
      "_manifests",
      "tags",
    );
    this.validatePath(path);
    return path;
  }

  /**
   * Check if a reference is a digest (starts with algorithm:)
   */
  private isDigest(reference: string): boolean {
    try {
      this.parseDigest(reference);
      return true;
    } catch {
      return false;
    }
  }

  // Blob operations

  async hasBlob(digest: string): Promise<boolean> {
    try {
      const path = this.getBlobPath(digest);
      const stat = await Deno.stat(path);
      return stat.isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  async getBlob(digest: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const path = this.getBlobPath(digest);
      const file = await Deno.open(path, { read: true });
      return file.readable;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  async getBlobSize(digest: string): Promise<number | null> {
    try {
      const path = this.getBlobPath(digest);
      const stat = await Deno.stat(path);
      return stat.size;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  async putBlob(
    digest: string,
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const path = this.getBlobPath(digest);
    const dir = join(path, "..");
    await ensureDir(dir);

    // Write to temporary file first for atomic operation
    const tempPath = `${path}.tmp.${Date.now()}.${
      Math.random().toString(36).substring(2, 15)
    }`;

    try {
      const file = await Deno.open(tempPath, {
        write: true,
        create: true,
        truncate: true,
      });

      try {
        await stream.pipeTo(file.writable);
      } catch (error) {
        // Clean up file handle if pipe fails
        try {
          file.close();
        } catch {
          // Ignore close errors
        }
        throw error;
      }

      // Atomic rename
      await Deno.rename(tempPath, path);
    } catch (error) {
      // Clean up temporary file on error
      try {
        await Deno.remove(tempPath);
      } catch {
        // Ignore removal errors
      }
      throw error;
    }
  }

  async deleteBlob(digest: string): Promise<boolean> {
    try {
      const path = this.getBlobPath(digest);
      await Deno.remove(path);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  // Repository layer links

  async linkBlob(repository: string, digest: string): Promise<void> {
    const linkPath = this.getLayerLinkPath(repository, digest);
    const dir = join(linkPath, "..");
    await ensureDir(dir);

    // Write the digest to the link file
    await Deno.writeTextFile(linkPath, digest);
  }

  async unlinkBlob(repository: string, digest: string): Promise<void> {
    try {
      const linkPath = this.getLayerLinkPath(repository, digest);
      await Deno.remove(linkPath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  async hasLayerLink(repository: string, digest: string): Promise<boolean> {
    try {
      const linkPath = this.getLayerLinkPath(repository, digest);
      const stat = await Deno.stat(linkPath);
      return stat.isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  // Manifest operations

  async getManifest(
    repository: string,
    reference: string,
  ): Promise<{ content: Uint8Array; digest: string } | null> {
    try {
      let digest: string;

      if (this.isDigest(reference)) {
        // Reference is already a digest
        // Check if the revision link exists
        const revisionPath = this.getManifestRevisionPath(
          repository,
          reference,
        );
        digest = await Deno.readTextFile(revisionPath);
      } else {
        // Reference is a tag, read the link to get the digest
        const tagPath = this.getManifestTagPath(repository, reference);
        digest = await Deno.readTextFile(tagPath);
      }

      // Read the manifest from the blob storage
      const blobStream = await this.getBlob(digest);
      if (!blobStream) {
        return null;
      }

      // Read the entire stream into a Uint8Array
      const reader = blobStream.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLength += value.length;
        }
      } finally {
        reader.releaseLock();
      }

      // Combine chunks into a Uint8Array
      const content = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.length;
      }

      return { content, digest };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  async putManifest(
    repository: string,
    reference: string,
    content: Uint8Array,
    digest: string,
  ): Promise<void> {
    // Store the manifest as a blob
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(content);
        controller.close();
      },
    });
    await this.putBlob(digest, stream);

    // Create revision link
    const revisionPath = this.getManifestRevisionPath(repository, digest);
    const revisionDir = join(revisionPath, "..");
    await ensureDir(revisionDir);
    await Deno.writeTextFile(revisionPath, digest);

    // If reference is a tag (not a digest), create tag link
    if (!this.isDigest(reference)) {
      const tagPath = this.getManifestTagPath(repository, reference);
      const tagDir = join(tagPath, "..");
      await ensureDir(tagDir);
      await Deno.writeTextFile(tagPath, digest);
    }
  }

  async deleteManifest(
    repository: string,
    reference: string,
  ): Promise<boolean> {
    try {
      // OCI spec requires deletion by digest only
      if (!this.isDigest(reference)) {
        throw new Error("Deletion by tag is not supported, use digest");
      }

      // Check if the manifest revision exists
      const revisionPath = this.getManifestRevisionPath(repository, reference);
      try {
        await Deno.stat(revisionPath);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return false;
        }
        throw error;
      }

      // Delete the manifest revision link
      await Deno.remove(revisionPath);

      // Find and delete all tags pointing to this digest
      const tagsPath = this.getTagsPath(repository);
      try {
        for await (const entry of Deno.readDir(tagsPath)) {
          if (entry.isDirectory) {
            const tagLinkPath = this.getManifestTagPath(repository, entry.name);
            try {
              const tagDigest = await Deno.readTextFile(tagLinkPath);
              if (tagDigest === reference) {
                // This tag points to the deleted manifest, remove it
                await Deno.remove(tagLinkPath);
              }
            } catch (error) {
              // Ignore errors reading individual tags (they might be deleted concurrently)
              if (!(error instanceof Deno.errors.NotFound)) {
                throw error;
              }
            }
          }
        }
      } catch (error) {
        // If tags directory doesn't exist, that's fine
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }

      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  // Tag operations

  async listTags(
    repository: string,
    options?: { limit?: number; last?: string },
  ): Promise<string[]> {
    try {
      const tagsPath = this.getTagsPath(repository);
      const tags: string[] = [];

      for await (const entry of Deno.readDir(tagsPath)) {
        if (entry.isDirectory) {
          tags.push(entry.name);
        }
      }

      // Sort alphabetically (lexicographic)
      const sortedTags = tags.sort();

      // Apply pagination
      if (!options) {
        return sortedTags;
      }

      let result = sortedTags;

      // Filter by 'last' parameter (exclusive)
      if (options.last) {
        const lastIndex = result.findIndex((tag) => tag === options.last);
        if (lastIndex !== -1) {
          result = result.slice(lastIndex + 1);
        }
      }

      // Apply limit
      if (options.limit && options.limit > 0) {
        result = result.slice(0, options.limit);
      }

      return result;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  // Repository operations

  async listRepositories(options?: { limit?: number; last?: string }): Promise<
    string[]
  > {
    try {
      const repositoriesPath = join(this.rootPath, "repositories");
      const repositories: string[] = [];

      await this.scanRepositories(repositoriesPath, "", repositories);

      // Sort alphabetically (lexicographic)
      const sortedRepos = repositories.sort();

      // Apply pagination
      if (!options) {
        return sortedRepos;
      }

      let result = sortedRepos;

      // Filter by 'last' parameter (exclusive)
      if (options.last) {
        const lastIndex = result.findIndex((repo) => repo === options.last);
        if (lastIndex !== -1) {
          result = result.slice(lastIndex + 1);
        }
      }

      // Apply limit
      if (options.limit && options.limit > 0) {
        result = result.slice(0, options.limit);
      }

      return result;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Count how many repositories have a link to this blob
   * @param digest - The digest of the blob
   * @returns Number of repositories that reference this blob
   */
  async countBlobReferences(digest: string): Promise<number> {
    // Validate digest format
    const { algorithm, hash } = this.parseDigest(digest);
    let count = 0;

    try {
      const repositoriesPath = join(this.rootPath, "repositories");

      // Recursively scan for layer links to this blob
      await this.scanBlobReferences(
        repositoriesPath,
        "",
        digest,
        algorithm,
        hash,
        (found) => {
          if (found) count++;
        },
      );
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }

    return count;
  }

  /**
   * Recursively scan for references to a specific blob
   */
  private async scanBlobReferences(
    basePath: string,
    currentPath: string,
    digest: string,
    algorithm: string,
    hash: string,
    callback: (found: boolean) => void,
  ): Promise<void> {
    const fullPath = currentPath ? join(basePath, currentPath) : basePath;

    try {
      for await (const entry of Deno.readDir(fullPath)) {
        if (!entry.isDirectory) continue;

        // Check if this is a _layers directory
        if (entry.name === "_layers" && currentPath) {
          // Check if this repository has a link to our blob
          const layerLinkPath = join(
            this.rootPath,
            "repositories",
            currentPath,
            "_layers",
            algorithm,
            hash,
            "link",
          );
          try {
            const stat = await Deno.stat(layerLinkPath);
            if (stat.isFile) {
              callback(true);
            }
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
              throw error;
            }
          }
          continue;
        }

        // Skip other metadata directories
        if (entry.name.startsWith("_")) {
          continue;
        }

        // Recursively scan subdirectories
        const newPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        await this.scanBlobReferences(
          basePath,
          newPath,
          digest,
          algorithm,
          hash,
          callback,
        );
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  /**
   * Recursively scan for repositories
   * A directory is considered a repository if it contains a _manifests directory
   */
  private async scanRepositories(
    basePath: string,
    currentPath: string,
    results: string[],
  ): Promise<void> {
    const fullPath = currentPath ? join(basePath, currentPath) : basePath;

    try {
      for await (const entry of Deno.readDir(fullPath)) {
        if (!entry.isDirectory) continue;

        // Skip metadata directories
        if (entry.name.startsWith("_")) {
          // Check if this is a repository (has _manifests)
          if (entry.name === "_manifests" && currentPath) {
            results.push(currentPath);
          }
          continue;
        }

        // Recursively scan subdirectories
        const newPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        await this.scanRepositories(basePath, newPath, results);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }
}
