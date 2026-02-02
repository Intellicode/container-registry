import { assertEquals, assertExists } from "@std/assert";
import { createCatalogRoutes } from "./catalog.ts";
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

Deno.test("GET /v2/_catalog - list repositories successfully", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createCatalogRoutes();

    // Create test blobs (config and layer)
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create manifests for multiple repositories
    const repos = ["alpine", "myorg/backend", "myorg/frontend"];
    for (const repo of repos) {
      const manifest = createTestManifest();
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const manifestDigest = await calculateDigest(manifestBytes);
      await storage.putManifest(repo, "latest", manifestBytes, manifestDigest);
    }

    // List repositories
    const req = new Request("http://localhost/_catalog");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    const contentType = res.headers.get("Content-Type");
    assertEquals(contentType?.includes("application/json"), true);

    const body = await res.json();
    assertExists(body.repositories);
    assertEquals(body.repositories.length, 3);
    // Repositories should be sorted alphabetically
    assertEquals(body.repositories, ["alpine", "myorg/backend", "myorg/frontend"]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/_catalog - empty registry returns empty array", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();
    const app = createCatalogRoutes();

    // List repositories in empty registry
    const req = new Request("http://localhost/_catalog");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    const contentType = res.headers.get("Content-Type");
    assertEquals(contentType?.includes("application/json"), true);

    const body = await res.json();
    assertEquals(body.repositories, []);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/_catalog - includes nested/namespaced repositories", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createCatalogRoutes();

    // Create test blobs
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create manifests with different nesting levels
    const repos = ["image1", "org/image2", "org/team/image3"];
    for (const repo of repos) {
      const manifest = createTestManifest();
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const manifestDigest = await calculateDigest(manifestBytes);
      await storage.putManifest(repo, "latest", manifestBytes, manifestDigest);
    }

    // List repositories
    const req = new Request("http://localhost/_catalog");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    
    const body = await res.json();
    assertEquals(body.repositories.length, 3);
    // All nested repositories should be included and sorted
    assertEquals(body.repositories, ["image1", "org/image2", "org/team/image3"]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

Deno.test("GET /v2/_catalog - repositories are sorted alphabetically", async () => {
  const testDir = await createTestDir();
  
  try {
    // Configure storage
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
    resetConfig();

    const storage = new FilesystemStorage(testDir);
    const app = createCatalogRoutes();

    // Create test blobs
    const configBlob = new TextEncoder().encode(JSON.stringify({ architecture: "amd64" }));
    const configDigest = "sha256:b5b2b2c507a0944348e0303114d8d93aaaa081732b86451d9bce1f432a537bc7";
    await storage.putBlob(configDigest, createStream(configBlob));

    const layerBlob = new TextEncoder().encode("layer data");
    const layerDigest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    await storage.putBlob(layerDigest, createStream(layerBlob));

    // Create repositories in non-alphabetical order
    const repos = ["zebra", "alpine", "myorg/tools/builder", "myorg/backend", "centos"];
    
    for (const repo of repos) {
      const manifest = createTestManifest();
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const manifestDigest = await calculateDigest(manifestBytes);
      await storage.putManifest(repo, "latest", manifestBytes, manifestDigest);
    }

    // List repositories
    const req = new Request("http://localhost/_catalog");
    const res = await app.fetch(req);

    assertEquals(res.status, 200);
    
    const body = await res.json();
    assertEquals(body.repositories.length, 5);
    // Verify repositories are sorted alphabetically
    assertEquals(body.repositories, [
      "alpine",
      "centos",
      "myorg/backend",
      "myorg/tools/builder",
      "zebra",
    ]);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});
