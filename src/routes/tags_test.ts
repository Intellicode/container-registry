import { assertEquals, assertExists } from "@std/assert";
import { createTagRoutes } from "./tags.ts";
import { FilesystemStorage } from "../storage/filesystem.ts";
import { resetConfig } from "../config.ts";
import { ManifestMediaTypes } from "../types/oci.ts";
import { calculateDigest } from "../services/digest.ts";

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
  ],
});

Deno.test("GET /v2/<name>/tags/list - list tags successfully", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createTagRoutes();

    // Create test blobs (config and layer)
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create and upload manifests with different tags
    const manifest1 = createTestManifest();
    const manifest1Bytes = new TextEncoder().encode(JSON.stringify(manifest1));
    const manifest1Digest = await calculateDigest(manifest1Bytes);
    await storage.putManifest("myimage", "latest", manifest1Bytes, manifest1Digest);

    const manifest2 = createTestManifest();
    const manifest2Bytes = new TextEncoder().encode(JSON.stringify(manifest2));
    const manifest2Digest = await calculateDigest(manifest2Bytes);
    await storage.putManifest("myimage", "v1.0", manifest2Bytes, manifest2Digest);

    const manifest3 = createTestManifest();
    const manifest3Bytes = new TextEncoder().encode(JSON.stringify(manifest3));
    const manifest3Digest = await calculateDigest(manifest3Bytes);
    await storage.putManifest("myimage", "v2.0", manifest3Bytes, manifest3Digest);

    // List tags
    const req = new Request("http://localhost/myimage/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    const contentType = res.headers.get("Content-Type");
    assertEquals(contentType?.includes("application/json"), true);

    const body = await res.json();
    assertEquals(body.name, "myimage");
    assertExists(body.tags);
    assertEquals(body.tags.length, 3);
    // Tags should be sorted alphabetically
    assertEquals(body.tags, ["latest", "v1.0", "v2.0"]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/tags/list - empty repository returns empty tags array", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();
    const app = createTagRoutes();

    // Create repository directory but don't add any tags
    const repoPath = `${testDir}/repositories/emptyrepo/_manifests/tags`;
    await Deno.mkdir(repoPath, { recursive: true });

    // List tags
    const req = new Request("http://localhost/emptyrepo/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    const contentType = res.headers.get("Content-Type");
    assertEquals(contentType?.includes("application/json"), true);

    const body = await res.json();
    assertEquals(body.name, "emptyrepo");
    assertEquals(body.tags, []);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/tags/list - unknown repository returns 404", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const app = createTagRoutes();

    // List tags for non-existent repository
    const req = new Request("http://localhost/unknown/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 404);
    assertEquals(res.headers.get("Content-Type"), "application/json");

    const body = await res.json();
    assertExists(body.errors);
    assertEquals(body.errors.length, 1);
    assertEquals(body.errors[0].code, "NAME_UNKNOWN");
    assertEquals(body.errors[0].detail.name, "unknown");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/tags/list - invalid repository name returns 400", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const app = createTagRoutes();

    // Test with invalid repository name (uppercase not allowed)
    const req = new Request("http://localhost/InvalidName/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 400);
    assertEquals(res.headers.get("Content-Type"), "application/json");

    const body = await res.json();
    assertExists(body.errors);
    assertEquals(body.errors.length, 1);
    assertEquals(body.errors[0].code, "NAME_INVALID");
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/tags/list - nested repository name works", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createTagRoutes();

    // Create test blobs
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create manifest with nested repository name
    const manifest = createTestManifest();
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const manifestDigest = await calculateDigest(manifestBytes);
    await storage.putManifest("myorg/myimage", "v1.0", manifestBytes, manifestDigest);

    // List tags
    const req = new Request("http://localhost/myorg/myimage/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    
    const body = await res.json();
    assertEquals(body.name, "myorg/myimage");
    assertEquals(body.tags, ["v1.0"]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/<name>/tags/list - tags are sorted alphabetically", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createTagRoutes();

    // Create test blobs
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create manifests with tags in non-alphabetical order
    const tags = ["zebra", "alpha", "v2.0", "v1.0", "latest", "beta"];
    
    for (const tag of tags) {
      const manifest = createTestManifest();
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const manifestDigest = await calculateDigest(manifestBytes);
      await storage.putManifest("sorttest", tag, manifestBytes, manifestDigest);
    }

    // List tags
    const req = new Request("http://localhost/sorttest/tags/list");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    
    const body = await res.json();
    assertEquals(body.name, "sorttest");
    // Verify tags are sorted alphabetically
    assertEquals(body.tags, ["alpha", "beta", "latest", "v1.0", "v2.0", "zebra"]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});
