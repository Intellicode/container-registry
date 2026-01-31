import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import type { StorageDriver } from "./interface.ts";

/**
 * Filesystem-based storage driver implementation.
 * Stores blobs in a content-addressable structure and repository metadata in a hierarchical structure.
 */
export class FilesystemStorage implements StorageDriver {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Get the path for a blob based on its digest
   * Uses two-level directory structure: sha256/ab/abcdef1234...
   */
  private getBlobPath(digest: string): string {
    const [algorithm, hash] = digest.split(":");
    if (!algorithm || !hash) {
      throw new Error(`Invalid digest format: ${digest}`);
    }
    // Two-level directory structure to avoid inode limits
    // For hashes shorter than 2 chars, use the full hash as prefix
    const prefix = hash.length >= 2 ? hash.substring(0, 2) : hash;
    return join(this.rootPath, "blobs", algorithm, prefix, hash);
  }

  /**
   * Get the path for a repository's layer link
   */
  private getLayerLinkPath(repository: string, digest: string): string {
    const [algorithm, hash] = digest.split(":");
    if (!algorithm || !hash) {
      throw new Error(`Invalid digest format: ${digest}`);
    }
    return join(
      this.rootPath,
      "repositories",
      repository,
      "_layers",
      algorithm,
      hash,
      "link",
    );
  }

  /**
   * Get the path for a manifest revision link
   */
  private getManifestRevisionPath(repository: string, digest: string): string {
    const [algorithm, hash] = digest.split(":");
    if (!algorithm || !hash) {
      throw new Error(`Invalid digest format: ${digest}`);
    }
    return join(
      this.rootPath,
      "repositories",
      repository,
      "_manifests",
      "revisions",
      algorithm,
      hash,
      "link",
    );
  }

  /**
   * Get the path for a manifest tag link
   */
  private getManifestTagPath(repository: string, tag: string): string {
    return join(
      this.rootPath,
      "repositories",
      repository,
      "_manifests",
      "tags",
      tag,
      "current",
      "link",
    );
  }

  /**
   * Get the tags directory for a repository
   */
  private getTagsPath(repository: string): string {
    return join(this.rootPath, "repositories", repository, "_manifests", "tags");
  }

  /**
   * Check if a reference is a digest (starts with algorithm:)
   */
  private isDigest(reference: string): boolean {
    return /^[a-z0-9]+:[a-f0-9]+$/i.test(reference);
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

  async getBlob(digest: string): Promise<ReadableStream | null> {
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

  async putBlob(digest: string, stream: ReadableStream): Promise<void> {
    const path = this.getBlobPath(digest);
    const dir = join(path, "..");
    await ensureDir(dir);

    // Write to temporary file first for atomic operation
    const tempPath = `${path}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;

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

  // Manifest operations

  async getManifest(
    repository: string,
    reference: string,
  ): Promise<{ content: Uint8Array; digest: string } | null> {
    try {
      let digest: string;

      if (this.isDigest(reference)) {
        // Reference is already a digest
        digest = reference;
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

      // Combine chunks into a single Uint8Array
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

  async deleteManifest(repository: string, reference: string): Promise<boolean> {
    try {
      if (this.isDigest(reference)) {
        // Delete revision link
        const revisionPath = this.getManifestRevisionPath(repository, reference);
        await Deno.remove(revisionPath);
      } else {
        // Delete tag link
        const tagPath = this.getManifestTagPath(repository, reference);
        await Deno.remove(tagPath);
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

  async listTags(repository: string): Promise<string[]> {
    try {
      const tagsPath = this.getTagsPath(repository);
      const tags: string[] = [];

      for await (const entry of Deno.readDir(tagsPath)) {
        if (entry.isDirectory) {
          tags.push(entry.name);
        }
      }

      return tags.sort();
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }
  }

  // Repository operations

  async listRepositories(): Promise<string[]> {
    try {
      const repositoriesPath = join(this.rootPath, "repositories");
      const repositories: string[] = [];

      await this.scanRepositories(repositoriesPath, "", repositories);

      return repositories.sort();
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
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
        const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        await this.scanRepositories(basePath, newPath, results);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }
}
