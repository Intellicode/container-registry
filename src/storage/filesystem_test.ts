import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { FilesystemStorage } from "./filesystem.ts";
import { join } from "@std/path";

// Helper function to create a test directory
async function createTestDir(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "registry-test-" });
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

// Helper function to create a ReadableStream from Uint8Array
function createStream(data: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// Helper function to read a stream into Uint8Array
async function readStream(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
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

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

Deno.test("FilesystemStorage - blob operations", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("hasBlob returns false for non-existent blob", async () => {
      const exists = await storage.hasBlob("sha256:0000000000000000000000000000000000000000000000000000000000000000");
      assertEquals(exists, false);
    });

    await t.step("putBlob stores a blob", async () => {
      const data = new TextEncoder().encode("test blob content");
      const digest = "sha256:abc123def456abc123def456abc123def456abc123def456abc123def456abcd";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);

      const exists = await storage.hasBlob(digest);
      assertEquals(exists, true);
    });

    await t.step("getBlob retrieves a stored blob", async () => {
      const data = new TextEncoder().encode("test blob content 2");
      const digest = "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);

      const retrievedStream = await storage.getBlob(digest);
      assertExists(retrievedStream);

      const retrievedData = await readStream(retrievedStream);
      assertEquals(retrievedData, data);
    });

    await t.step("getBlob returns null for non-existent blob", async () => {
      const stream = await storage.getBlob("sha256:0000000000000000000000000000000000000000000000000000000000000000");
      assertEquals(stream, null);
    });

    await t.step("getBlobSize returns correct size", async () => {
      const data = new TextEncoder().encode("exactly 25 bytes here!!");
      const digest = "sha256:9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);

      const size = await storage.getBlobSize(digest);
      assertEquals(size, data.length);
    });

    await t.step("getBlobSize returns null for non-existent blob", async () => {
      const size = await storage.getBlobSize("sha256:0000000000000000000000000000000000000000000000000000000000000000");
      assertEquals(size, null);
    });

    await t.step("deleteBlob removes a blob", async () => {
      const data = new TextEncoder().encode("to be deleted");
      const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);
      const deleted = await storage.deleteBlob(digest);

      assertEquals(deleted, true);

      const exists = await storage.hasBlob(digest);
      assertEquals(exists, false);
    });

    await t.step("deleteBlob returns false for non-existent blob", async () => {
      const deleted = await storage.deleteBlob("sha256:0000000000000000000000000000000000000000000000000000000000000000");
      assertEquals(deleted, false);
    });

    await t.step("putBlob creates two-level directory structure", async () => {
      const data = new TextEncoder().encode("structure test");
      const digest = "sha256:abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);

      // Verify the path structure exists
      const expectedPath = join(
        testDir,
        "blobs",
        "sha256",
        "ab",
        "abcdef123456abcdef123456abcdef123456abcdef123456abcdef123456abcd",
      );
      const stat = await Deno.stat(expectedPath);
      assertEquals(stat.isFile, true);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - atomic writes", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("putBlob writes atomically", async () => {
      const data = new TextEncoder().encode("atomic write test");
      const digest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

      // Create a stream that will fail mid-write
      let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
        null;
      const failingStream = new ReadableStream({
        start(controller) {
          controllerRef = controller;
          controller.enqueue(data);
        },
      });

      // Manually close the controller to simulate a failed write
      setTimeout(() => {
        if (controllerRef) {
          try {
            controllerRef.error(new Error("Simulated write failure"));
          } catch {
            // Ignore if already closed
          }
        }
      }, 10);

      // The write should fail
      try {
        await storage.putBlob(digest, failingStream);
        // If we get here, the test should fail
        throw new Error("Expected putBlob to fail");
      } catch (error) {
        // Expected to fail
        if (
          error instanceof Error &&
          error.message === "Expected putBlob to fail"
        ) {
          throw error;
        }
      }

      // Verify no partial file was left behind
      const exists = await storage.hasBlob(digest);
      assertEquals(exists, false);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - large blob streaming", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("handles large blobs without loading into memory", async () => {
      // Create a 10MB blob
      const chunkSize = 1024 * 1024; // 1MB
      const numChunks = 10;
      const digest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

      // Create a stream that yields data in chunks
      let chunkIndex = 0;
      const largeStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < numChunks) {
            const chunk = new Uint8Array(chunkSize);
            chunk.fill(chunkIndex % 256);
            controller.enqueue(chunk);
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });

      await storage.putBlob(digest, largeStream);

      const size = await storage.getBlobSize(digest);
      assertEquals(size, chunkSize * numChunks);

      // Verify we can read it back
      const retrievedStream = await storage.getBlob(digest);
      assertExists(retrievedStream);

      // Read in chunks to verify streaming works
      const reader = retrievedStream.getReader();
      let totalRead = 0;
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
          totalRead++;
        }
      } finally {
        reader.releaseLock();
      }

      // We should have read some data
      assertEquals(totalRead > 0, true);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - repository layer links", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("linkBlob creates a layer link", async () => {
      const digest = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
      const repository = "myorg/myimage";

      await storage.linkBlob(repository, digest);

      // Verify the link file exists
      const linkPath = join(
        testDir,
        "repositories",
        repository,
        "_layers",
        "sha256",
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "link",
      );
      const content = await Deno.readTextFile(linkPath);
      assertEquals(content, digest);
    });

    await t.step("unlinkBlob removes a layer link", async () => {
      const digest = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
      const repository = "myorg/myimage";

      await storage.linkBlob(repository, digest);
      await storage.unlinkBlob(repository, digest);

      // Verify the link file no longer exists
      const linkPath = join(
        testDir,
        "repositories",
        repository,
        "_layers",
        "sha256",
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "link",
      );

      await assertRejects(
        async () => await Deno.stat(linkPath),
        Deno.errors.NotFound,
      );
    });

    await t.step("linkBlob supports nested repository names", async () => {
      const digest = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const repository = "org/team/project/image";

      await storage.linkBlob(repository, digest);

      const linkPath = join(
        testDir,
        "repositories",
        repository,
        "_layers",
        "sha256",
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "link",
      );
      const exists = await Deno.stat(linkPath);
      assertEquals(exists.isFile, true);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - manifest operations", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("putManifest stores a manifest by tag", async () => {
      const content = new TextEncoder().encode('{"test": "manifest"}');
      const digest = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
      const repository = "myorg/myimage";
      const tag = "v1.0.0";

      await storage.putManifest(repository, tag, content, digest);

      // Verify the blob was stored
      const blobExists = await storage.hasBlob(digest);
      assertEquals(blobExists, true);

      // Verify the tag link was created
      const tagPath = join(
        testDir,
        "repositories",
        repository,
        "_manifests",
        "tags",
        tag,
        "current",
        "link",
      );
      const tagContent = await Deno.readTextFile(tagPath);
      assertEquals(tagContent, digest);

      // Verify the revision link was created
      const revisionPath = join(
        testDir,
        "repositories",
        repository,
        "_manifests",
        "revisions",
        "sha256",
        "1111111111111111111111111111111111111111111111111111111111111111",
        "link",
      );
      const revisionContent = await Deno.readTextFile(revisionPath);
      assertEquals(revisionContent, digest);
    });

    await t.step("getManifest retrieves a manifest by tag", async () => {
      const content = new TextEncoder().encode('{"tag": "test"}');
      const digest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
      const repository = "myorg/myimage";
      const tag = "latest";

      await storage.putManifest(repository, tag, content, digest);

      const result = await storage.getManifest(repository, tag);
      assertExists(result);
      assertEquals(result.digest, digest);
      assertEquals(result.content, content);
    });

    await t.step("getManifest retrieves a manifest by digest", async () => {
      const content = new TextEncoder().encode('{"digest": "test"}');
      const digest = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
      const repository = "myorg/myimage";

      await storage.putManifest(repository, digest, content, digest);

      const result = await storage.getManifest(repository, digest);
      assertExists(result);
      assertEquals(result.digest, digest);
      assertEquals(result.content, content);
    });

    await t.step("getManifest returns null for non-existent manifest", async () => {
      const result = await storage.getManifest("myorg/myimage", "nonexistent");
      assertEquals(result, null);
    });

    await t.step("deleteManifest removes a manifest by tag", async () => {
      const content = new TextEncoder().encode('{"delete": "test"}');
      const digest = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
      const repository = "myorg/myimage";
      const tag = "todelete";

      await storage.putManifest(repository, tag, content, digest);

      const deleted = await storage.deleteManifest(repository, tag);
      assertEquals(deleted, true);

      const result = await storage.getManifest(repository, tag);
      assertEquals(result, null);
    });

    await t.step(
      "deleteManifest returns false for non-existent manifest",
      async () => {
        const deleted = await storage.deleteManifest(
          "myorg/myimage",
          "nonexistent",
        );
        assertEquals(deleted, false);
      },
    );
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - tag operations", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("listTags returns empty array for repository with no tags", async () => {
      const tags = await storage.listTags("empty/repo");
      assertEquals(tags, []);
    });

    await t.step("listTags returns all tags for a repository", async () => {
      const content = new TextEncoder().encode("{}");
      const repository = "myorg/myimage";

      await storage.putManifest(repository, "v1.0.0", content, "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a");
      await storage.putManifest(repository, "v2.0.0", content, "sha256:bbbb00000000000000000000000000000000000000000000000000000000000b");
      await storage.putManifest(repository, "latest", content, "sha256:cccc00000000000000000000000000000000000000000000000000000000000c");

      const tags = await storage.listTags(repository);
      assertEquals(tags.length, 3);
      assertEquals(tags.includes("v1.0.0"), true);
      assertEquals(tags.includes("v2.0.0"), true);
      assertEquals(tags.includes("latest"), true);
    });

    await t.step("listTags returns sorted tags", async () => {
      const content = new TextEncoder().encode("{}");
      const repository = "myorg/sorted";

      await storage.putManifest(repository, "zebra", content, "sha256:ffffffff00000000000000000000000000000000000000000000000000000fff");
      await storage.putManifest(repository, "alpha", content, "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a");
      await storage.putManifest(repository, "beta", content, "sha256:bbbb00000000000000000000000000000000000000000000000000000000000b");

      const tags = await storage.listTags(repository);
      assertEquals(tags, ["alpha", "beta", "zebra"]);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - repository operations", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("listRepositories returns empty array when no repositories", async () => {
      const repos = await storage.listRepositories();
      assertEquals(repos, []);
    });

    await t.step("listRepositories returns all repositories", async () => {
      const content = new TextEncoder().encode("{}");

      await storage.putManifest("org1/image1", "v1", content, "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a");
      await storage.putManifest("org1/image2", "v1", content, "sha256:bbbb00000000000000000000000000000000000000000000000000000000000b");
      await storage.putManifest("org2/image1", "v1", content, "sha256:cccc00000000000000000000000000000000000000000000000000000000000c");

      const repos = await storage.listRepositories();
      assertEquals(repos.length, 3);
      assertEquals(repos.includes("org1/image1"), true);
      assertEquals(repos.includes("org1/image2"), true);
      assertEquals(repos.includes("org2/image1"), true);
    });

    await t.step("listRepositories supports nested repository names", async () => {
      const content = new TextEncoder().encode("{}");

      await storage.putManifest(
        "org/team/project/image",
        "v1",
        content,
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      );

      const repos = await storage.listRepositories();
      assertEquals(repos.includes("org/team/project/image"), true);
    });

    await t.step("listRepositories returns sorted repositories", async () => {
      // Use a fresh storage instance to avoid interference from previous tests
      const freshTestDir = await createTestDir();
      const freshStorage = new FilesystemStorage(freshTestDir);

      try {
        const content = new TextEncoder().encode("{}");

        await freshStorage.putManifest("zebra/image", "v1", content, "sha256:ffffffff00000000000000000000000000000000000000000000000000000fff");
        await freshStorage.putManifest("alpha/image", "v1", content, "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a");
        await freshStorage.putManifest("beta/image", "v1", content, "sha256:bbbb00000000000000000000000000000000000000000000000000000000000b");

        const repos = await freshStorage.listRepositories();
        assertEquals(repos[0], "alpha/image");
        assertEquals(repos[1], "beta/image");
        assertEquals(repos[2], "zebra/image");
      } finally {
        await cleanupTestDir(freshTestDir);
      }
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - concurrent access", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("handles concurrent blob writes", async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const data = new TextEncoder().encode(`concurrent test ${i}`);
        const digest = `sha256:666666666666666666666666666666666666666666666666666666666666666${i}`;
        const stream = createStream(data);
        promises.push(storage.putBlob(digest, stream));
      }

      await Promise.all(promises);

      // Verify all blobs were written
      for (let i = 0; i < 10; i++) {
        const exists = await storage.hasBlob(`sha256:666666666666666666666666666666666666666666666666666666666666666${i}`);
        assertEquals(exists, true);
      }
    });

    await t.step("handles concurrent reads and writes", async () => {
      // Write some blobs first
      for (let i = 0; i < 5; i++) {
        const data = new TextEncoder().encode(`initial ${i}`);
        const digest = `sha256:777777777777777777777777777777777777777777777777777777777777777${i}`;
        const stream = createStream(data);
        await storage.putBlob(digest, stream);
      }

      // Mix reads and writes
      const promises = [];

      // Concurrent reads - need to consume the streams to avoid leaks
      for (let i = 0; i < 5; i++) {
        promises.push(
          (async () => {
            const stream = await storage.getBlob(`sha256:777777777777777777777777777777777777777777777777777777777777777${i}`);
            if (stream) {
              // Cancel the stream to close the file handle
              await stream.cancel();
            }
          })(),
        );
      }

      // Concurrent writes
      for (let i = 5; i < 10; i++) {
        const data = new TextEncoder().encode(`concurrent ${i}`);
        const digest = `sha256:777777777777777777777777777777777777777777777777777777777777777${i}`;
        const stream = createStream(data);
        promises.push(storage.putBlob(digest, stream));
      }

      await Promise.all(promises);

      // Verify all operations succeeded
      for (let i = 0; i < 10; i++) {
        const exists = await storage.hasBlob(`sha256:777777777777777777777777777777777777777777777777777777777777777${i}`);
        assertEquals(exists, true);
      }
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - error handling", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("handles invalid digest format", async () => {
      await assertRejects(
        async () => await storage.hasBlob("invalid"),
        Error,
        "Invalid digest format",
      );

      await assertRejects(
        async () => await storage.hasBlob("sha256:"),
        Error,
        "Invalid digest hash",
      );

      await assertRejects(
        async () => await storage.hasBlob(":hash"),
        Error,
        "Invalid digest algorithm",
      );
    });

    await t.step("creates directories automatically", async () => {
      const data = new TextEncoder().encode("auto dir test");
      const digest = "sha256:9999999999999999999999999999999999999999999999999999999999999999";
      const stream = createStream(data);

      // This should succeed even though directories don't exist
      await storage.putBlob(digest, stream);

      const exists = await storage.hasBlob(digest);
      assertEquals(exists, true);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("FilesystemStorage - configurable storage path", async (t) => {
  await t.step("uses provided storage path", async () => {
    const testDir = await createTestDir();
    const customPath = join(testDir, "custom-storage");
    const storage = new FilesystemStorage(customPath);

    try {
      const data = new TextEncoder().encode("custom path test");
      const digest = "sha256:8888888888888888888888888888888888888888888888888888888888888888";
      const stream = createStream(data);

      await storage.putBlob(digest, stream);

      // Verify blob was stored in custom path
      const blobPath = join(
        customPath,
        "blobs",
        "sha256",
        "88",
        "8888888888888888888888888888888888888888888888888888888888888888",
      );
      const stat = await Deno.stat(blobPath);
      assertEquals(stat.isFile, true);
    } finally {
      await cleanupTestDir(testDir);
    }
  });
});

Deno.test("FilesystemStorage - security validations", async (t) => {
  const testDir = await createTestDir();
  const storage = new FilesystemStorage(testDir);

  try {
    await t.step("rejects path traversal in digest", async () => {
      const data = new TextEncoder().encode("test");
      const stream = createStream(data);

      await assertRejects(
        async () => await storage.putBlob("sha256:../../etc/passwd", stream),
        Error,
        "Invalid digest hash",
      );
    });

    await t.step("rejects path traversal in repository", async () => {
      await assertRejects(
        async () =>
          await storage.linkBlob(
            "../../../etc/passwd",
            "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a",
          ),
        Error,
        "Invalid repository",
      );

      await assertRejects(
        async () =>
          await storage.listTags("repo/../../../etc/passwd"),
        Error,
        "Invalid repository",
      );
    });

    await t.step("rejects path traversal in tag", async () => {
      const content = new TextEncoder().encode("test");
      const digest = "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a";

      await assertRejects(
        async () =>
          await storage.putManifest(
            "myrepo",
            "../../../etc/passwd",
            content,
            digest,
          ),
        Error,
        "Invalid tag name",
      );
    });

    await t.step("rejects invalid repository names", async () => {
      await assertRejects(
        async () =>
          await storage.linkBlob(
            "UPPERCASE",
            "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a",
          ),
        Error,
        "Invalid repository component",
      );

      await assertRejects(
        async () =>
          await storage.linkBlob(
            "has spaces",
            "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a",
          ),
        Error,
        "Invalid repository component",
      );
    });

    await t.step("rejects invalid tag names", async () => {
      const content = new TextEncoder().encode("test");
      const digest = "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a";

      await assertRejects(
        async () =>
          await storage.putManifest("myrepo", "tag:with:colon", content, digest),
        Error,
        "Invalid tag name",
      );

      await assertRejects(
        async () =>
          await storage.putManifest("myrepo", "tag/with/slash", content, digest),
        Error,
        "Invalid tag name",
      );
    });

    await t.step("accepts valid OCI names", async () => {
      // Valid repository names
      await storage.linkBlob(
        "lowercase",
        "sha256:aaaa00000000000000000000000000000000000000000000000000000000000a",
      );
      await storage.linkBlob(
        "with-dash",
        "sha256:bbbb00000000000000000000000000000000000000000000000000000000000b",
      );
      await storage.linkBlob(
        "with.dot",
        "sha256:cccc00000000000000000000000000000000000000000000000000000000000c",
      );
      await storage.linkBlob(
        "with_underscore",
        "sha256:dddd0000000000000000000000000000000000000000000000000000000000dd",
      );
      await storage.linkBlob(
        "nested/repo/name",
        "sha256:eeee0000000000000000000000000000000000000000000000000000000000ee",
      );

      // Valid tag names
      const content = new TextEncoder().encode("test");
      const digest = "sha256:ffff0000000000000000000000000000000000000000000000000000000000ff";
      await storage.putManifest("myrepo", "v1.0.0", content, digest);
      await storage.putManifest("myrepo", "latest", content, digest);
      await storage.putManifest("myrepo", "tag_with_underscore", content, digest);
      await storage.putManifest("myrepo", "tag-with-dash", content, digest);
      await storage.putManifest("myrepo", "tag.with.dot", content, digest);

      // All should succeed without error
      assertEquals(true, true);
    });
  } finally {
    await cleanupTestDir(testDir);
  }
});
