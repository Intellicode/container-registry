import { assertEquals, assertExists } from "@std/assert";
import { createManifestRoutes } from "./manifests.ts";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { resetConfig } from "../config.ts";
import { ManifestMediaTypes } from "../types/oci.ts";

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

// Sample OCI manifest for testing
const createTestManifest = () => ({
  schemaVersion: 2,
  mediaType: ManifestMediaTypes.OCI_MANIFEST,
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json",
    digest: "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7",
    size: 7023,
  },
  layers: [
    {
      mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
      digest: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      size: 32654,
    },
    {
      mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
      digest: "sha256:6dbb9cc54074106d46d4ccb330f2a40a682d49dda5f4844962b0b48f8e3e4e12",
      size: 16724,
    },
  ],
});

// Sample Docker manifest for testing
const createDockerManifest = () => ({
  schemaVersion: 2,
  mediaType: ManifestMediaTypes.DOCKER_MANIFEST_V2,
  config: {
    mediaType: "application/vnd.docker.container.image.v1+json",
    digest: "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7",
    size: 7023,
  },
  layers: [
    {
      mediaType: "application/vnd.docker.image.rootfs.diff.tar.gzip",
      digest: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      size: 32654,
    },
  ],
});

// Sample OCI index for testing
const createTestIndex = () => ({
  schemaVersion: 2,
  mediaType: ManifestMediaTypes.OCI_INDEX,
  manifests: [
    {
      mediaType: ManifestMediaTypes.OCI_MANIFEST,
      digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      size: 1234,
      platform: {
        architecture: "amd64",
        os: "linux",
      },
    },
    {
      mediaType: ManifestMediaTypes.OCI_MANIFEST,
      digest: "sha256:38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da",
      size: 1235,
      platform: {
        architecture: "arm64",
        os: "linux",
      },
    },
  ],
});

Deno.test("PUT /v2/<name>/manifests/<tag> - upload manifest successfully", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs referenced by the manifest
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const app = createManifestRoutes();
    const manifestJson = JSON.stringify(manifest);

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_MANIFEST,
      },
      body: manifestJson,
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 201);
    assertExists(res.headers.get("Location"));
    assertExists(res.headers.get("Docker-Content-Digest"));

    const digest = res.headers.get("Docker-Content-Digest");
    assertEquals(digest?.startsWith("sha256:"), true);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - missing blob", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const manifest = createTestManifest();
    const app = createManifestRoutes();
    const manifestJson = JSON.stringify(manifest);

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_MANIFEST,
      },
      body: manifestJson,
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.errors[0].code, "MANIFEST_BLOB_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - invalid JSON", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createManifestRoutes();

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_MANIFEST,
      },
      body: "invalid json{",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.errors[0].code, "MANIFEST_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - unsupported media type", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createManifestRoutes();
    const manifest = createTestManifest();

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.unsupported.manifest+json",
      },
      body: JSON.stringify(manifest),
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 415);
    const body = await res.json();
    assertEquals(body.errors[0].code, "UNSUPPORTED");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - missing Content-Type", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createManifestRoutes();
    const manifest = createTestManifest();

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "PUT",
      body: JSON.stringify(manifest),
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 415);
    const body = await res.json();
    assertEquals(body.errors[0].code, "UNSUPPORTED");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - Docker manifest type", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createDockerManifest();

    // Pre-create the blobs
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const app = createManifestRoutes();
    const manifestJson = JSON.stringify(manifest);

    const req = new Request("http://localhost/myrepo/manifests/latest", {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.DOCKER_MANIFEST_V2,
      },
      body: manifestJson,
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 201);
    assertExists(res.headers.get("Docker-Content-Digest"));
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<digest> - upload by digest", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const app = createManifestRoutes();
    const manifestJson = JSON.stringify(manifest);

    // Calculate the expected digest
    const encoder = new TextEncoder();
    const data = encoder.encode(manifestJson);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const digest = `sha256:${hashHex}`;

    const req = new Request(`http://localhost/myrepo/manifests/${digest}`, {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_MANIFEST,
      },
      body: manifestJson,
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 201);
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<digest> - digest mismatch", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const app = createManifestRoutes();
    const manifestJson = JSON.stringify(manifest);

    // Use a wrong digest
    const wrongDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

    const req = new Request(`http://localhost/myrepo/manifests/${wrongDigest}`, {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_MANIFEST,
      },
      body: manifestJson,
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

Deno.test("GET /v2/<name>/manifests/<tag> - retrieve manifest", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs and manifest
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const manifestJson = JSON.stringify(manifest);
    const encoder = new TextEncoder();
    const content = encoder.encode(manifestJson);

    // Calculate digest
    const hashBuffer = await crypto.subtle.digest("SHA-256", content);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const digest = `sha256:${hashHex}`;

    await storage.putManifest("myrepo", "v1.0", content, digest);

    const app = createManifestRoutes();

    const req = new Request("http://localhost/myrepo/manifests/v1.0");

    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), ManifestMediaTypes.OCI_MANIFEST);
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);

    const retrievedManifest = await res.json();
    assertEquals(retrievedManifest.schemaVersion, 2);
    assertEquals(retrievedManifest.mediaType, ManifestMediaTypes.OCI_MANIFEST);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/manifests/<tag> - not found", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createManifestRoutes();

    const req = new Request("http://localhost/myrepo/manifests/nonexistent");

    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.errors[0].code, "MANIFEST_UNKNOWN");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("HEAD /v2/<name>/manifests/<tag> - check manifest exists", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs and manifest
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const manifestJson = JSON.stringify(manifest);
    const encoder = new TextEncoder();
    const content = encoder.encode(manifestJson);

    // Calculate digest
    const hashBuffer = await crypto.subtle.digest("SHA-256", content);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const digest = `sha256:${hashHex}`;

    await storage.putManifest("myrepo", "v1.0", content, digest);

    const app = createManifestRoutes();

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "HEAD",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), ManifestMediaTypes.OCI_MANIFEST);
    assertEquals(res.headers.get("Docker-Content-Digest"), digest);
    assertExists(res.headers.get("Content-Length"));
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("DELETE /v2/<name>/manifests/<tag> - delete manifest", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const manifest = createTestManifest();

    // Pre-create the blobs and manifest
    for (const layer of manifest.layers) {
      const data = new TextEncoder().encode("layer data");
      await storage.putBlob(layer.digest, createStream(data));
    }
    const configData = new TextEncoder().encode("config data");
    await storage.putBlob(manifest.config.digest, createStream(configData));

    const manifestJson = JSON.stringify(manifest);
    const encoder = new TextEncoder();
    const content = encoder.encode(manifestJson);

    // Calculate digest
    const hashBuffer = await crypto.subtle.digest("SHA-256", content);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const digest = `sha256:${hashHex}`;

    await storage.putManifest("myrepo", "v1.0", content, digest);

    const app = createManifestRoutes();

    const req = new Request("http://localhost/myrepo/manifests/v1.0", {
      method: "DELETE",
    });

    const res = await app.fetch(req);

    assertEquals(res.status, 202);

    // Verify manifest is deleted
    const getResult = await storage.getManifest("myrepo", "v1.0");
    assertEquals(getResult, null);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("PUT /v2/<name>/manifests/<tag> - OCI index", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();

    const app = createManifestRoutes();
    const index = createTestIndex();
    const indexJson = JSON.stringify(index);

    const req = new Request("http://localhost/myrepo/manifests/multiarch", {
      method: "PUT",
      headers: {
        "Content-Type": ManifestMediaTypes.OCI_INDEX,
      },
      body: indexJson,
    });

    const res = await app.fetch(req);

    // Should succeed even without the referenced manifests existing
    // This matches Docker registry behavior for manifest lists
    assertEquals(res.status, 201);
    assertExists(res.headers.get("Docker-Content-Digest"));
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});
