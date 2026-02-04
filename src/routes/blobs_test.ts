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

// Story 012: Chunked Upload Tests

Deno.test("PATCH /v2/<name>/blobs/uploads/<uuid> - upload first chunk", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    assertEquals(initiateRes.status, 202);

    const uploadUrl = initiateRes.headers.get("Location");
    const uuid = initiateRes.headers.get("Docker-Upload-UUID");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    const patchReq = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": chunk1.length.toString(),
        "Content-Range": "0-5",
      },
      body: createStream(chunk1),
    });

    const patchRes = await app.fetch(patchReq);
    assertEquals(patchRes.status, 202);
    assertEquals(patchRes.headers.get("Location"), `/myrepo/blobs/uploads/${uuid}`);
    assertEquals(patchRes.headers.get("Docker-Upload-UUID"), uuid);
    assertEquals(patchRes.headers.get("Range"), "0-5");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PATCH /v2/<name>/blobs/uploads/<uuid> - upload multiple chunks", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    assertEquals(initiateRes.status, 202);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    const patch1Req = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "0-5",
      },
      body: createStream(chunk1),
    });
    const patch1Res = await app.fetch(patch1Req);
    assertEquals(patch1Res.status, 202);
    assertEquals(patch1Res.headers.get("Range"), "0-5");

    // Upload second chunk
    const chunk2 = new TextEncoder().encode("World!");
    const patch2Req = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "6-11",
      },
      body: createStream(chunk2),
    });
    const patch2Res = await app.fetch(patch2Req);
    assertEquals(patch2Res.status, 202);
    assertEquals(patch2Res.headers.get("Range"), "0-11");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PATCH /v2/<name>/blobs/uploads/<uuid> - invalid Content-Range", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Try to upload with invalid range format
    const chunk = new TextEncoder().encode("test");
    const patchReq = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "invalid-range",
      },
      body: createStream(chunk),
    });

    const patchRes = await app.fetch(patchReq);
    assertEquals(patchRes.status, 400);
    const body = await patchRes.json();
    assertEquals(body.errors[0].code, "BLOB_UPLOAD_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PATCH /v2/<name>/blobs/uploads/<uuid> - non-contiguous range", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    const patch1Req = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "0-5",
      },
      body: createStream(chunk1),
    });
    await app.fetch(patch1Req);

    // Try to upload non-contiguous chunk (should start at 6, not 10)
    const chunk2 = new TextEncoder().encode("World!");
    const patch2Req = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "10-15",
      },
      body: createStream(chunk2),
    });

    const patch2Res = await app.fetch(patch2Req);
    assertEquals(patch2Res.status, 416);
    const body = await patch2Res.json();
    assertEquals(body.errors[0].code, "RANGE_NOT_SATISFIABLE");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/blobs/uploads/<uuid> - complete chunked upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload chunks via PATCH
    const chunk1 = new TextEncoder().encode("Hello ");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "0-5" },
      body: createStream(chunk1),
    }));

    const chunk2 = new TextEncoder().encode("World!");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "6-11" },
      body: createStream(chunk2),
    }));

    // Complete upload with PUT (no body, all data already uploaded)
    const completeData = new TextEncoder().encode("Hello World!");
    const expectedDigest = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";

    const putReq = new Request(`http://localhost${uploadUrl}?digest=${expectedDigest}`, {
      method: "PUT",
    });

    const putRes = await app.fetch(putReq);
    assertEquals(putRes.status, 201);
    assertEquals(putRes.headers.get("Docker-Content-Digest"), expectedDigest);
    assertEquals(putRes.headers.get("Location"), `/myrepo/blobs/${expectedDigest}`);

    // Verify blob was stored correctly
    const storage = new FilesystemStorage(testDir);
    const blobStream = await storage.getBlob(expectedDigest);
    if (blobStream) {
      const content = await readStream(blobStream);
      assertEquals(content, completeData);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/blobs/uploads/<uuid> - complete chunked upload with final chunk in PUT", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload first chunk via PATCH
    const chunk1 = new TextEncoder().encode("Hello ");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "0-5" },
      body: createStream(chunk1),
    }));

    // Complete upload with PUT including final chunk
    const finalChunk = new TextEncoder().encode("World!");
    const completeData = new TextEncoder().encode("Hello World!");
    const expectedDigest = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";

    const putReq = new Request(`http://localhost${uploadUrl}?digest=${expectedDigest}`, {
      method: "PUT",
      body: createStream(finalChunk),
    });

    const putRes = await app.fetch(putReq);
    assertEquals(putRes.status, 201);
    assertEquals(putRes.headers.get("Docker-Content-Digest"), expectedDigest);

    // Verify blob was stored correctly
    const storage = new FilesystemStorage(testDir);
    const blobStream = await storage.getBlob(expectedDigest);
    if (blobStream) {
      const content = await readStream(blobStream);
      assertEquals(content, completeData);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/blobs/uploads/<uuid> - digest mismatch on chunked upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload data via PATCH
    const chunk = new TextEncoder().encode("Hello World!");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "0-11" },
      body: createStream(chunk),
    }));

    // Try to complete with wrong digest
    const wrongDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

    const putReq = new Request(`http://localhost${uploadUrl}?digest=${wrongDigest}`, {
      method: "PUT",
    });

    const putRes = await app.fetch(putReq);
    assertEquals(putRes.status, 400);
    const body = await putRes.json();
    assertEquals(body.errors[0].code, "DIGEST_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PATCH /v2/<name>/blobs/uploads/<uuid> - upload session not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const fakeUuid = "12345678-1234-1234-1234-123456789abc";
    const chunk = new TextEncoder().encode("test");
    const patchReq = new Request(`http://localhost/myrepo/blobs/uploads/${fakeUuid}`, {
      method: "PATCH",
      body: createStream(chunk),
    });

    const patchRes = await app.fetch(patchReq);
    assertEquals(patchRes.status, 404);
    const body = await patchRes.json();
    assertEquals(body.errors[0].code, "BLOB_UPLOAD_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

// Story 013: Upload Status and Resume Tests

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - check status of empty upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    assertEquals(initiateRes.status, 202);

    const uploadUrl = initiateRes.headers.get("Location");
    const uuid = initiateRes.headers.get("Docker-Upload-UUID");

    // Check upload status (no data uploaded yet)
    const statusReq = new Request(`http://localhost${uploadUrl}`, {
      method: "GET",
    });

    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 204);
    assertEquals(statusRes.headers.get("Location"), `/myrepo/blobs/uploads/${uuid}`);
    assertEquals(statusRes.headers.get("Docker-Upload-UUID"), uuid);
    assertEquals(statusRes.headers.get("Range"), "0-0");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - check status after uploading data", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");
    const uuid = initiateRes.headers.get("Docker-Upload-UUID");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    const patch1Req = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: {
        "Content-Range": "0-5",
      },
      body: createStream(chunk1),
    });
    await app.fetch(patch1Req);

    // Check upload status
    const statusReq = new Request(`http://localhost${uploadUrl}`, {
      method: "GET",
    });

    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 204);
    assertEquals(statusRes.headers.get("Location"), `/myrepo/blobs/uploads/${uuid}`);
    assertEquals(statusRes.headers.get("Docker-Upload-UUID"), uuid);
    assertEquals(statusRes.headers.get("Range"), "0-5");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - check status after multiple chunks", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");
    const uuid = initiateRes.headers.get("Docker-Upload-UUID");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "0-5" },
      body: createStream(chunk1),
    }));

    // Upload second chunk
    const chunk2 = new TextEncoder().encode("World!");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "6-11" },
      body: createStream(chunk2),
    }));

    // Check upload status
    const statusReq = new Request(`http://localhost${uploadUrl}`, {
      method: "GET",
    });

    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 204);
    assertEquals(statusRes.headers.get("Location"), `/myrepo/blobs/uploads/${uuid}`);
    assertEquals(statusRes.headers.get("Docker-Upload-UUID"), uuid);
    assertEquals(statusRes.headers.get("Range"), "0-11");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - upload session not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const fakeUuid = "12345678-1234-1234-1234-123456789abc";
    const statusReq = new Request(`http://localhost/myrepo/blobs/uploads/${fakeUuid}`, {
      method: "GET",
    });

    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 404);
    const body = await statusRes.json();
    assertEquals(body.errors[0].code, "BLOB_UPLOAD_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - resume interrupted upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Initiate upload
    const initiateReq = new Request("http://localhost/myrepo/blobs/uploads/", {
      method: "POST",
    });
    const initiateRes = await app.fetch(initiateReq);
    const uploadUrl = initiateRes.headers.get("Location");

    // Upload first chunk
    const chunk1 = new TextEncoder().encode("Hello ");
    await app.fetch(new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "0-5" },
      body: createStream(chunk1),
    }));

    // Simulate interruption - check status to find offset
    const statusReq = new Request(`http://localhost${uploadUrl}`, {
      method: "GET",
    });
    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 204);
    const range = statusRes.headers.get("Range");
    assertEquals(range, "0-5");

    // Resume upload from offset (6)
    const chunk2 = new TextEncoder().encode("World!");
    const resumeReq = new Request(`http://localhost${uploadUrl}`, {
      method: "PATCH",
      headers: { "Content-Range": "6-11" },
      body: createStream(chunk2),
    });
    const resumeRes = await app.fetch(resumeReq);
    assertEquals(resumeRes.status, 202);
    assertEquals(resumeRes.headers.get("Range"), "0-11");

    // Complete upload
    const completeData = new TextEncoder().encode("Hello World!");
    const expectedDigest = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";

    const putReq = new Request(`http://localhost${uploadUrl}?digest=${expectedDigest}`, {
      method: "PUT",
    });
    const putRes = await app.fetch(putReq);
    assertEquals(putRes.status, 201);

    // Verify blob was stored correctly
    const storage = new FilesystemStorage(testDir);
    const blobStream = await storage.getBlob(expectedDigest);
    if (blobStream) {
      const content = await readStream(blobStream);
      assertEquals(content, completeData);
    }
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/blobs/uploads/<uuid> - invalid UUID format", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const invalidUuid = "not-a-valid-uuid";
    const statusReq = new Request(`http://localhost/myrepo/blobs/uploads/${invalidUuid}`, {
      method: "GET",
    });

    const statusRes = await app.fetch(statusReq);
    assertEquals(statusRes.status, 404);
    const body = await statusRes.json();
    assertEquals(body.errors[0].code, "BLOB_UPLOAD_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

// Story 014: Cross-Repository Blob Mount Tests

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository> - successful mount", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob in the source repository
    const blobData = new TextEncoder().encode("shared layer content");
    const digest = "sha256:6ed206c5b87fa6a726971de1eb927ab7743ff101a76f65f86ce8ba0b46a1f5ea";
    
    await storage.putBlob(digest, createStream(blobData));
    await storage.linkBlob("sourceorg/sourceimage", digest);

    // Attempt to mount the blob to a new repository
    const mountReq = new Request(
      `http://localhost/targetorg/targetimage/blobs/uploads/?mount=${digest}&from=sourceorg/sourceimage`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should return 201 Created with blob location
    assertEquals(mountRes.status, 201);
    assertEquals(mountRes.headers.get("Location"), `/targetorg/targetimage/blobs/${digest}`);
    assertEquals(mountRes.headers.get("Docker-Content-Digest"), digest);

    // Verify the layer link was created in the target repository
    const hasLink = await storage.hasLayerLink("targetorg/targetimage", digest);
    assertEquals(hasLink, true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository> - blob not found, fallback to upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Attempt to mount a non-existent blob
    const nonexistentDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const mountReq = new Request(
      `http://localhost/targetorg/targetimage/blobs/uploads/?mount=${nonexistentDigest}&from=sourceorg/sourceimage`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should fall back to normal upload initiation (202 Accepted)
    assertEquals(mountRes.status, 202);
    assertEquals(mountRes.headers.has("Docker-Upload-UUID"), true);
    assertEquals(mountRes.headers.has("Location"), true);
    assertEquals(mountRes.headers.get("Range"), "0-0");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository> - no source repository link, fallback", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob but don't link it to any repository
    const blobData = new TextEncoder().encode("orphan blob");
    const digest = "sha256:c677cc5041ae478df1c116afe26230521bf6a5735bad448289025ee883000a82";
    
    await storage.putBlob(digest, createStream(blobData));
    // Note: Not calling linkBlob, so the blob exists but has no repository link

    // Attempt to mount - should fail because source repo has no link
    const mountReq = new Request(
      `http://localhost/targetorg/targetimage/blobs/uploads/?mount=${digest}&from=sourceorg/sourceimage`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should fall back to normal upload initiation
    assertEquals(mountRes.status, 202);
    assertEquals(mountRes.headers.has("Docker-Upload-UUID"), true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository> - invalid source repository, fallback", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob in a valid repository
    const blobData = new TextEncoder().encode("test blob");
    const digest = "sha256:298d37cb0b7abbef2639ca7e5ff3f232678a9293146d610ac63f862e0da62b3b";
    
    await storage.putBlob(digest, createStream(blobData));
    await storage.linkBlob("validrepo", digest);

    // Attempt to mount with invalid source repository name (uppercase not allowed)
    const mountReq = new Request(
      `http://localhost/targetrepo/blobs/uploads/?mount=${digest}&from=INVALID-REPO`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should fall back to normal upload initiation due to invalid source repo
    assertEquals(mountRes.status, 202);
    assertEquals(mountRes.headers.has("Docker-Upload-UUID"), true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository> - invalid digest format, fallback", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    // Attempt to mount with invalid digest format
    const mountReq = new Request(
      `http://localhost/targetrepo/blobs/uploads/?mount=invalid-digest&from=sourcerepo`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should fall back to normal upload initiation
    assertEquals(mountRes.status, 202);
    assertEquals(mountRes.headers.has("Docker-Upload-UUID"), true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/?mount=<digest> - missing from parameter, normal upload", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    
    // Mount parameter provided but from parameter missing
    const mountReq = new Request(
      `http://localhost/targetrepo/blobs/uploads/?mount=${digest}`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should initiate normal upload
    assertEquals(mountRes.status, 202);
    assertEquals(mountRes.headers.has("Docker-Upload-UUID"), true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("POST /v2/<name>/blobs/uploads/ - mount across different repositories", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob in source repository
    const blobData = new TextEncoder().encode("namespaced layer");
    const digest = "sha256:483e5e9e14afafa90aa67370fe53fac1ee3c6f952af857685aa495c3841ade9d";
    
    await storage.putBlob(digest, createStream(blobData));
    await storage.linkBlob("source", digest);

    // Mount to a different repository
    const mountReq = new Request(
      `http://localhost/target/blobs/uploads/?mount=${digest}&from=source`,
      {
        method: "POST",
      }
    );

    const mountRes = await app.fetch(mountReq);

    // Should successfully mount
    assertEquals(mountRes.status, 201);
    assertEquals(mountRes.headers.get("Location"), `/target/blobs/${digest}`);
    assertEquals(mountRes.headers.get("Docker-Content-Digest"), digest);

    // Verify the layer link was created in the target repository
    const hasLink = await storage.hasLayerLink("target", digest);
    assertEquals(hasLink, true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("DELETE /v2/<name>/blobs/<digest> - successful deletion", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob and link it to a repository
    const blobData = new TextEncoder().encode("test blob for deletion");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    
    await storage.putBlob(digest, createStream(blobData));
    await storage.linkBlob("myrepo", digest);

    // Delete the blob
    const req = new Request(`http://localhost/myrepo/blobs/${digest}`, {
      method: "DELETE",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 202);

    // Verify the link was removed
    const hasLink = await storage.hasLayerLink("myrepo", digest);
    assertEquals(hasLink, false);

    // Verify the blob itself was deleted (no other references)
    const blobExists = await storage.hasBlob(digest);
    assertEquals(blobExists, false);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("DELETE /v2/<name>/blobs/<digest> - blob not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();
    const digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

    const req = new Request(`http://localhost/myrepo/blobs/${digest}`, {
      method: "DELETE",
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

Deno.test("DELETE /v2/<name>/blobs/<digest> - no link to repository", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob but don't link it to the repository
    const blobData = new TextEncoder().encode("test blob");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    
    await storage.putBlob(digest, createStream(blobData));

    // Try to delete from a repository that doesn't have a link
    const req = new Request(`http://localhost/myrepo/blobs/${digest}`, {
      method: "DELETE",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.errors[0].code, "BLOB_UNKNOWN");

    // Verify blob still exists (wasn't deleted)
    const blobExists = await storage.hasBlob(digest);
    assertEquals(blobExists, true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("DELETE /v2/<name>/blobs/<digest> - shared blob not deleted", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createBlobRoutes();

    // Setup: Create a blob and link it to multiple repositories
    const blobData = new TextEncoder().encode("shared blob");
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    
    await storage.putBlob(digest, createStream(blobData));
    await storage.linkBlob("repo1", digest);
    await storage.linkBlob("repo2", digest);

    // Delete from one repository
    const req = new Request(`http://localhost/repo1/blobs/${digest}`, {
      method: "DELETE",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 202);

    // Verify the link was removed from repo1
    const hasLink1 = await storage.hasLayerLink("repo1", digest);
    assertEquals(hasLink1, false);

    // Verify the link still exists in repo2
    const hasLink2 = await storage.hasLayerLink("repo2", digest);
    assertEquals(hasLink2, true);

    // Verify the blob itself was NOT deleted (still referenced by repo2)
    const blobExists = await storage.hasBlob(digest);
    assertEquals(blobExists, true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("DELETE /v2/<name>/blobs/<digest> - invalid digest format", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();

    const req = new Request(`http://localhost/myrepo/blobs/invalid-digest`, {
      method: "DELETE",
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

Deno.test("DELETE /v2/<name>/blobs/<digest> - invalid repository name", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createBlobRoutes();
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    const req = new Request(`http://localhost/Invalid-Repo/blobs/${digest}`, {
      method: "DELETE",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.errors[0].code, "NAME_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});
