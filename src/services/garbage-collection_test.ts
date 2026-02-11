import { assertEquals, assertGreater } from "@std/assert";
import { join } from "@std/path";
import { GarbageCollectionService, formatBytes, formatDuration } from "./garbage-collection.ts";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { calculateDigest } from "./digest.ts";

// Helper function to create a test directory
async function createTestDir(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "gc-test-" });
  return tempDir;
}

// Helper function to clean up test directory
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
  } catch {
    // Ignore errors
  }
}

// Helper function to create a blob
async function createBlob(
  storage: FilesystemStorage,
  content: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const digest = await calculateDigest(data);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  await storage.putBlob(digest, stream);
  return digest;
}

// Helper function to create a manifest with blobs
async function createManifest(
  storage: FilesystemStorage,
  repository: string,
  tag: string,
  configDigest: string,
  layerDigests: string[],
): Promise<string> {
  const manifest = {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: 100,
    },
    layers: layerDigests.map((digest) => ({
      mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
      digest,
      size: 100,
    })),
  };

  const encoder = new TextEncoder();
  const content = encoder.encode(JSON.stringify(manifest));
  const digest = await calculateDigest(content);

  await storage.putManifest(repository, tag, content, digest);
  return digest;
}

Deno.test("GarbageCollectionService - no orphaned blobs", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create blobs
    const configDigest = await createBlob(storage, "config content");
    const layerDigest = await createBlob(storage, "layer content");

    // Create manifest referencing the blobs
    await createManifest(storage, "test/repo", "latest", configDigest, [
      layerDigest,
    ]);

    // Run GC
    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: true,
        minAge: 0, // Consider all blobs
      },
      storage,
    );

    const result = await gcService.run();

    // All blobs should be referenced (config + layer + manifest itself)
    assertEquals(result.totalBlobs, 3);
    assertEquals(result.referencedBlobs, 3);
    assertEquals(result.orphanedBlobs, 0);
    assertEquals(result.deletedBlobs, 0);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - identifies orphaned blobs", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create blobs
    const configDigest = await createBlob(storage, "config content");
    const layerDigest = await createBlob(storage, "layer content");
    const orphanDigest = await createBlob(storage, "orphan content");

    // Create manifest referencing only config and layer
    await createManifest(storage, "test/repo", "latest", configDigest, [
      layerDigest,
    ]);

    // Run GC (dry run)
    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: true,
        minAge: 0,
      },
      storage,
    );

    const result = await gcService.run();

    // 4 total blobs: config, layer, orphan, manifest
    assertEquals(result.totalBlobs, 4);
    assertEquals(result.referencedBlobs, 3); // config + layer + manifest
    assertEquals(result.orphanedBlobs, 1); // orphan
    assertEquals(result.deletedBlobs, 1); // Would delete 1 in dry run

    // Verify orphan blob still exists (dry run)
    const orphanExists = await storage.hasBlob(orphanDigest);
    assertEquals(orphanExists, true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - deletes orphaned blobs", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create blobs
    const configDigest = await createBlob(storage, "config content");
    const layerDigest = await createBlob(storage, "layer content");
    const orphanDigest = await createBlob(storage, "orphan content");

    // Create manifest
    await createManifest(storage, "test/repo", "latest", configDigest, [
      layerDigest,
    ]);

    // Run GC (actual delete)
    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: false,
        minAge: 0,
      },
      storage,
    );

    const result = await gcService.run();

    assertEquals(result.orphanedBlobs, 1);
    assertEquals(result.deletedBlobs, 1);
    assertGreater(result.reclaimedBytes, 0);

    // Verify orphan blob was deleted
    const orphanExists = await storage.hasBlob(orphanDigest);
    assertEquals(orphanExists, false);

    // Verify referenced blobs still exist
    const configExists = await storage.hasBlob(configDigest);
    const layerExists = await storage.hasBlob(layerDigest);
    assertEquals(configExists, true);
    assertEquals(layerExists, true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - respects minAge", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create an orphan blob
    const orphanDigest = await createBlob(storage, "orphan content");

    // Run GC with high minAge (blob is too new)
    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: false,
        minAge: 3600, // 1 hour - blob is too new
      },
      storage,
    );

    const result = await gcService.run();

    // Blob should be skipped due to age
    assertEquals(result.orphanedBlobs, 0);
    assertEquals(result.skippedBlobs, 1);
    assertEquals(result.deletedBlobs, 0);

    // Verify blob still exists
    const orphanExists = await storage.hasBlob(orphanDigest);
    assertEquals(orphanExists, true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - analyze returns details", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create blobs
    const configDigest = await createBlob(storage, "config");
    const orphanDigest = await createBlob(storage, "orphan");

    // Create manifest
    await createManifest(storage, "test/repo", "v1", configDigest, []);

    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: true,
        minAge: 0,
      },
      storage,
    );

    const analysis = await gcService.analyze();

    // Should have referenced blobs set
    assertEquals(analysis.referencedBlobs.has(configDigest), true);

    // Should identify orphan
    const orphan = analysis.orphanedBlobs.find(
      (b) => b.digest === orphanDigest,
    );
    assertEquals(orphan !== undefined, true);
    assertEquals(orphan?.reason, "not_referenced");
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - handles empty storage", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: true,
        minAge: 0,
      },
      storage,
    );

    const result = await gcService.run();

    assertEquals(result.totalBlobs, 0);
    assertEquals(result.referencedBlobs, 0);
    assertEquals(result.orphanedBlobs, 0);
    assertEquals(result.deletedBlobs, 0);
    assertEquals(result.errors.length, 0);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - multiple repositories", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create blobs
    const config1 = await createBlob(storage, "config1");
    const config2 = await createBlob(storage, "config2");
    const sharedLayer = await createBlob(storage, "shared layer");
    const orphan = await createBlob(storage, "orphan");

    // Create manifests in different repos
    await createManifest(storage, "repo1", "latest", config1, [sharedLayer]);
    await createManifest(storage, "repo2", "latest", config2, [sharedLayer]);

    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: false,
        minAge: 0,
      },
      storage,
    );

    const result = await gcService.run();

    // 6 total: config1, config2, sharedLayer, orphan, manifest1, manifest2
    assertEquals(result.totalBlobs, 6);
    // Referenced: config1, config2, sharedLayer, manifest1, manifest2
    assertEquals(result.referencedBlobs, 5);
    assertEquals(result.orphanedBlobs, 1);
    assertEquals(result.deletedBlobs, 1);

    // Verify orphan deleted, shared layer kept
    assertEquals(await storage.hasBlob(orphan), false);
    assertEquals(await storage.hasBlob(sharedLayer), true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("GarbageCollectionService - skips active uploads", async () => {
  const testDir = await createTestDir();

  try {
    const storage = new FilesystemStorage(testDir);

    // Create a blob that will appear orphaned
    const blobDigest = await createBlob(storage, "uploading blob");

    // Simulate an active upload session referencing this digest
    const uploadDir = join(testDir, "uploads", "session-123");
    await Deno.mkdir(uploadDir, { recursive: true });
    await Deno.writeTextFile(join(uploadDir, "digest"), blobDigest);
    await Deno.writeTextFile(
      join(uploadDir, "startedat"),
      new Date().toISOString(),
    );

    const gcService = new GarbageCollectionService(
      {
        rootDirectory: testDir,
        dryRun: false,
        minAge: 0,
      },
      storage,
    );

    const result = await gcService.run();

    // Blob should be skipped due to active upload
    assertEquals(result.skippedBlobs, 1);
    assertEquals(result.deletedBlobs, 0);

    // Verify blob still exists
    assertEquals(await storage.hasBlob(blobDigest), true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Test helper functions
Deno.test("formatBytes - formats correctly", () => {
  assertEquals(formatBytes(0), "0 B");
  assertEquals(formatBytes(512), "512.00 B");
  assertEquals(formatBytes(1024), "1.00 KB");
  assertEquals(formatBytes(1536), "1.50 KB");
  assertEquals(formatBytes(1048576), "1.00 MB");
  assertEquals(formatBytes(1073741824), "1.00 GB");
});

Deno.test("formatDuration - formats correctly", () => {
  assertEquals(formatDuration(500), "500ms");
  assertEquals(formatDuration(1000), "1.0s");
  assertEquals(formatDuration(45000), "45.0s");
  assertEquals(formatDuration(60000), "1m 0s");
  assertEquals(formatDuration(90000), "1m 30s");
});
