/**
 * Garbage Collection service for container registry.
 * Implements mark-and-sweep algorithm to identify and remove orphaned blobs.
 */

import { join } from "@std/path";
import { expandGlob } from "@std/fs";
import type { StorageDriver } from "../storage/interface.ts";
import type { ImageManifest, ImageIndex } from "../types/oci.ts";

/**
 * Configuration for the garbage collection service.
 */
export interface GarbageCollectionConfig {
  rootDirectory: string;
  dryRun: boolean;
  minAge: number; // seconds - don't delete blobs newer than this
}

/**
 * Result of a garbage collection run.
 */
export interface GarbageCollectionResult {
  totalBlobs: number;
  referencedBlobs: number;
  orphanedBlobs: number;
  deletedBlobs: number;
  skippedBlobs: number; // Blobs skipped due to age or active uploads
  reclaimedBytes: number;
  durationMs: number;
  errors: string[];
}

/**
 * Information about an orphaned blob.
 */
export interface OrphanedBlob {
  digest: string;
  size: number;
  age: number; // seconds
  reason: "not_referenced" | "skipped_too_new" | "skipped_active_upload";
}

/**
 * Garbage collection service that identifies and removes orphaned blobs.
 */
export class GarbageCollectionService {
  private config: GarbageCollectionConfig;
  private storage: StorageDriver;

  constructor(config: GarbageCollectionConfig, storage: StorageDriver) {
    this.config = config;
    this.storage = storage;
  }

  /**
   * Run garbage collection.
   * @returns Result of the garbage collection run
   */
  async run(): Promise<GarbageCollectionResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Phase 1: Mark - Find all referenced blobs
    const referencedBlobs = await this.markReferencedBlobs();

    // Phase 2: Get all blobs in storage
    const allBlobs = await this.storage.listBlobs();

    // Phase 3: Identify orphaned blobs
    const orphanedBlobs: OrphanedBlob[] = [];
    const now = Date.now();
    const activeUploads = await this.getActiveUploadDigests();

    for (const digest of allBlobs) {
      if (referencedBlobs.has(digest)) {
        continue; // Blob is referenced, skip
      }

      // Get blob metadata
      const metadata = await this.storage.getBlobMetadata(digest);
      if (!metadata) {
        continue; // Blob no longer exists
      }

      const ageSeconds = (now - metadata.createdAt.getTime()) / 1000;

      // Check if blob is too new
      if (ageSeconds < this.config.minAge) {
        orphanedBlobs.push({
          digest,
          size: metadata.size,
          age: ageSeconds,
          reason: "skipped_too_new",
        });
        continue;
      }

      // Check if blob is part of an active upload
      if (activeUploads.has(digest)) {
        orphanedBlobs.push({
          digest,
          size: metadata.size,
          age: ageSeconds,
          reason: "skipped_active_upload",
        });
        continue;
      }

      orphanedBlobs.push({
        digest,
        size: metadata.size,
        age: ageSeconds,
        reason: "not_referenced",
      });
    }

    // Phase 4: Sweep - Delete orphaned blobs (if not dry run)
    let deletedCount = 0;
    let reclaimedBytes = 0;
    let skippedCount = 0;

    for (const blob of orphanedBlobs) {
      if (blob.reason !== "not_referenced") {
        skippedCount++;
        continue;
      }

      if (!this.config.dryRun) {
        try {
          const deleted = await this.storage.deleteBlob(blob.digest);
          if (deleted) {
            deletedCount++;
            reclaimedBytes += blob.size;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to delete blob ${blob.digest}: ${errorMsg}`);
        }
      } else {
        // In dry run, count as would-be deleted
        deletedCount++;
        reclaimedBytes += blob.size;
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      totalBlobs: allBlobs.length,
      referencedBlobs: referencedBlobs.size,
      orphanedBlobs: orphanedBlobs.filter((b) => b.reason === "not_referenced").length,
      deletedBlobs: deletedCount,
      skippedBlobs: skippedCount,
      reclaimedBytes,
      durationMs,
      errors,
    };
  }

  /**
   * Get detailed information about orphaned blobs without deleting them.
   * Useful for previewing what would be deleted.
   */
  async analyze(): Promise<{
    referencedBlobs: Set<string>;
    orphanedBlobs: OrphanedBlob[];
  }> {
    const referencedBlobs = await this.markReferencedBlobs();
    const allBlobs = await this.storage.listBlobs();
    const now = Date.now();
    const activeUploads = await this.getActiveUploadDigests();

    const orphanedBlobs: OrphanedBlob[] = [];

    for (const digest of allBlobs) {
      if (referencedBlobs.has(digest)) {
        continue;
      }

      const metadata = await this.storage.getBlobMetadata(digest);
      if (!metadata) {
        continue;
      }

      const ageSeconds = (now - metadata.createdAt.getTime()) / 1000;

      if (ageSeconds < this.config.minAge) {
        orphanedBlobs.push({
          digest,
          size: metadata.size,
          age: ageSeconds,
          reason: "skipped_too_new",
        });
      } else if (activeUploads.has(digest)) {
        orphanedBlobs.push({
          digest,
          size: metadata.size,
          age: ageSeconds,
          reason: "skipped_active_upload",
        });
      } else {
        orphanedBlobs.push({
          digest,
          size: metadata.size,
          age: ageSeconds,
          reason: "not_referenced",
        });
      }
    }

    return { referencedBlobs, orphanedBlobs };
  }

  /**
   * Mark phase: Find all blobs referenced by any manifest.
   * Returns a Set of digest strings.
   */
  private async markReferencedBlobs(): Promise<Set<string>> {
    const referenced = new Set<string>();
    const repositories = await this.storage.listRepositories();

    for (const repo of repositories) {
      // Get all tags in this repository
      const tags = await this.storage.listTags(repo);

      for (const tag of tags) {
        try {
          const manifest = await this.storage.getManifest(repo, tag);
          if (!manifest) {
            continue;
          }

          // The manifest itself is stored as a blob
          referenced.add(manifest.digest);

          // Parse manifest and extract referenced blobs
          const content = new TextDecoder().decode(manifest.content);
          const parsed = JSON.parse(content) as ImageManifest | ImageIndex;

          this.extractReferencedBlobs(parsed, referenced);
        } catch (error) {
          // Log error but continue processing other manifests
          console.error(`Error processing manifest ${repo}:${tag}:`, error);
        }
      }

      // Also scan manifest revisions (digests) that might not have tags
      await this.scanManifestRevisions(repo, referenced);
    }

    return referenced;
  }

  /**
   * Scan manifest revisions directory for manifests without tags.
   */
  private async scanManifestRevisions(
    repository: string,
    referenced: Set<string>,
  ): Promise<void> {
    const revisionsPath = join(
      this.config.rootDirectory,
      "repositories",
      repository,
      "_manifests",
      "revisions",
    );

    try {
      // Scan for revision links: revisions/<algorithm>/<hash>/link
      const globPattern = join(revisionsPath, "*", "*", "link");

      for await (const entry of expandGlob(globPattern)) {
        if (!entry.isFile) continue;

        try {
          const digest = await Deno.readTextFile(entry.path);

          // Skip if already processed
          if (referenced.has(digest)) continue;

          // Add the manifest blob itself
          referenced.add(digest);

          // Get and parse the manifest
          const manifest = await this.storage.getManifest(repository, digest);
          if (manifest) {
            const content = new TextDecoder().decode(manifest.content);
            const parsed = JSON.parse(content) as ImageManifest | ImageIndex;
            this.extractReferencedBlobs(parsed, referenced);
          }
        } catch {
          // Ignore individual errors
        }
      }
    } catch {
      // Directory might not exist, which is fine
    }
  }

  /**
   * Extract all referenced blob digests from a manifest.
   */
  private extractReferencedBlobs(
    manifest: ImageManifest | ImageIndex,
    referenced: Set<string>,
  ): void {
    // Image manifest: config + layers
    if ("config" in manifest && manifest.config) {
      referenced.add(manifest.config.digest);
    }

    if ("layers" in manifest && Array.isArray(manifest.layers)) {
      for (const layer of manifest.layers) {
        referenced.add(layer.digest);
      }
    }

    // Image index/manifest list: referenced manifests
    // Note: We don't recursively resolve nested manifests here because
    // they should be in the manifest revisions and will be processed separately
    if ("manifests" in manifest && Array.isArray(manifest.manifests)) {
      for (const m of manifest.manifests) {
        referenced.add(m.digest);
      }
    }
  }

  /**
   * Get digests of blobs that are part of active upload sessions.
   * These should not be deleted even if they appear orphaned.
   */
  private async getActiveUploadDigests(): Promise<Set<string>> {
    const digests = new Set<string>();
    const uploadsDir = join(this.config.rootDirectory, "uploads");

    try {
      const globPattern = join(uploadsDir, "*", "digest");

      for await (const entry of expandGlob(globPattern)) {
        if (!entry.isFile) continue;

        try {
          const digest = await Deno.readTextFile(entry.path);
          if (digest.trim()) {
            digests.add(digest.trim());
          }
        } catch {
          // Ignore read errors
        }
      }
    } catch {
      // No uploads directory is fine
    }

    return digests;
  }
}

/**
 * Format bytes into human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
