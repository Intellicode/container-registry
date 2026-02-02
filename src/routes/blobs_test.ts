import { assertEquals } from "@std/assert";
import { createBlobRoutes } from "./blobs.ts";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { resetConfig } from "../config.ts";

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

Deno.test("HEAD /v2/<name>/blobs/<digest> - blob exists", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const blobData = new TextEncoder().encode("test blob content");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    await storage.putBlob(digest, createStream(blobData));

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/" + digest, {
      method: "HEAD",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Length"), blobData.length.toString());
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("HEAD /v2/<name>/blobs/<digest> - blob not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();
    const digest = "sha256:nonexistent0000000000000000000000000000000000000000000000000000000";

    const req = new Request("http://localhost/myrepo/blobs/" + digest, {
      method: "HEAD",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.errors[0].code, "BLOB_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("HEAD /v2/<name>/blobs/<digest> - invalid digest", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/invalid-digest", {
      method: "HEAD",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.errors[0].code, "DIGEST_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - download blob", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const blobData = new TextEncoder().encode("test blob content");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    await storage.putBlob(digest, createStream(blobData));

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/" + digest);

    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Length"), blobData.length.toString());
    assertEquals(res.headers.get("Content-Type"), "application/octet-stream");
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);

    if (res.body) {
      const content = await readStream(res.body);
      assertEquals(content, blobData);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - blob not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();
    const digest = "sha256:nonexistent0000000000000000000000000000000000000000000000000000000";

    const req = new Request("http://localhost/myrepo/blobs/" + digest);

    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.errors[0].code, "BLOB_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - range request", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const blobData = new TextEncoder().encode("0123456789abcdefghijklmnopqrstuvwxyz");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    await storage.putBlob(digest, createStream(blobData));

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/" + digest, {
      headers: {
        "Range": "bytes=0-9",
      },
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 206);
    assertEquals(res.headers.get("Content-Length"), "10");
    assertEquals(res.headers.get("Content-Range"), `bytes 0-9/${blobData.length}`);
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);

    if (res.body) {
      const content = await readStream(res.body);
      const expected = new TextEncoder().encode("0123456789");
      assertEquals(content, expected);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - range request to end", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const blobData = new TextEncoder().encode("0123456789abcdefghijklmnopqrstuvwxyz");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    await storage.putBlob(digest, createStream(blobData));

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/" + digest, {
      headers: {
        "Range": "bytes=30-",
      },
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 206);
    const expectedLength = blobData.length - 30;
    assertEquals(res.headers.get("Content-Length"), expectedLength.toString());
    assertEquals(res.headers.get("Content-Range"), `bytes 30-${blobData.length - 1}/${blobData.length}`);

    if (res.body) {
      const content = await readStream(res.body);
      const expected = new TextEncoder().encode("uvwxyz");
      assertEquals(content, expected);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - invalid range request", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const blobData = new TextEncoder().encode("test blob content");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    await storage.putBlob(digest, createStream(blobData));

    const app = createBlobRoutes();

    const req = new Request("http://localhost/myrepo/blobs/" + digest, {
      headers: {
        "Range": "bytes=1000-2000",
      },
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 416);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/<digest> - invalid repository name", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    const req = new Request("http://localhost/INVALID-REPO/blobs/" + digest);

    const res = await app.fetch(req);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.errors[0].code, "NAME_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});
