/**
 * Tests for health check endpoints.
 */

import { assertEquals, assertLess } from "@std/assert";
import { createHealthRoutes } from "./health.ts";
import { createApp } from "../app.ts";
import { resetConfig } from "../config.ts";

const TEST_STORAGE_DIR = "/tmp/registry-health-test";

async function setupTestDir(): Promise<void> {
  try {
    await Deno.mkdir(TEST_STORAGE_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

async function cleanupTestDir(): Promise<void> {
  try {
    await Deno.remove(TEST_STORAGE_DIR, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

Deno.test("Health Routes", async (t) => {
  await setupTestDir();

  try {
    await t.step("GET /health returns 200 with healthy status", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      const startTime = performance.now();
      const res = await app.request("/");
      const duration = performance.now() - startTime;
      
      assertEquals(res.status, 200);
      
      const body = await res.json();
      assertEquals(body.status, "healthy");
      
      // Liveness check should be fast (< 10ms requirement)
      assertLess(duration, 50); // Allow some margin for test overhead
    });

    await t.step("GET /health/ready returns 200 when storage is accessible", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      const startTime = performance.now();
      const res = await app.request("/ready");
      const duration = performance.now() - startTime;
      
      assertEquals(res.status, 200);
      
      const body = await res.json();
      assertEquals(body.status, "ready");
      assertEquals(body.checks.storage, "ok");
      
      // Readiness check should complete within 100ms
      assertLess(duration, 200); // Allow some margin for test overhead
    });

    await t.step("GET /health/ready returns 503 when storage directory doesn't exist", async () => {
      const app = createHealthRoutes({ storageRootDirectory: "/nonexistent/path/that/doesnt/exist" });
      
      const res = await app.request("/ready");
      
      assertEquals(res.status, 503);
      
      const body = await res.json();
      assertEquals(body.status, "not ready");
      assertEquals(body.checks.storage, "error: storage directory not found");
    });

    await t.step("GET /health/ready returns 503 when storage is not writable", async () => {
      // Create a read-only directory
      const readOnlyDir = "/tmp/registry-health-readonly";
      try {
        await Deno.mkdir(readOnlyDir, { recursive: true });
        await Deno.chmod(readOnlyDir, 0o444); // Read-only
        
        const app = createHealthRoutes({ storageRootDirectory: readOnlyDir });
        
        const res = await app.request("/ready");
        
        assertEquals(res.status, 503);
        
        const body = await res.json();
        assertEquals(body.status, "not ready");
        // Error message should indicate permission issue
        assertEquals(body.checks.storage.startsWith("error:"), true);
      } finally {
        // Restore permissions and cleanup
        try {
          await Deno.chmod(readOnlyDir, 0o755);
          await Deno.remove(readOnlyDir, { recursive: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    await t.step("GET /health returns correct Content-Type", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      const res = await app.request("/");
      
      const contentType = res.headers.get("Content-Type");
      assertEquals(contentType?.includes("application/json"), true);
    });

    await t.step("GET /health/ready returns correct Content-Type", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      const res = await app.request("/ready");
      
      const contentType = res.headers.get("Content-Type");
      assertEquals(contentType?.includes("application/json"), true);
    });

  } finally {
    await cleanupTestDir();
  }
});

Deno.test("Health Routes - Response Time Requirements", async (t) => {
  await setupTestDir();

  try {
    await t.step("Liveness check (/health) is fast", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      // Run multiple times to get average
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        await app.request("/");
        times.push(performance.now() - startTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      // Average should be well under 10ms
      assertLess(avgTime, 10);
    });

    await t.step("Readiness check (/health/ready) completes within requirements", async () => {
      const app = createHealthRoutes({ storageRootDirectory: TEST_STORAGE_DIR });
      
      // Run multiple times to get average
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await app.request("/ready");
        times.push(performance.now() - startTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      // Average should be under 100ms
      assertLess(avgTime, 100);
    });

  } finally {
    await cleanupTestDir();
  }
});

Deno.test("Health Routes - Integration with App", async (t) => {
  await setupTestDir();

  // Store original env vars
  const originalAuthType = Deno.env.get("REGISTRY_AUTH_TYPE");
  const originalStoragePath = Deno.env.get("REGISTRY_STORAGE_PATH");
  
  try {
    await t.step("Health endpoints work without auth when auth is enabled", async () => {
      // Set up config with basic auth enabled (no htpasswd file, so auth will fail)
      resetConfig();
      Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
      Deno.env.set("REGISTRY_STORAGE_PATH", TEST_STORAGE_DIR);
      
      // Note: We're not providing htpasswd file, so v2 endpoints would fail
      // but health endpoints should still work
      
      const { app, cleanup } = await createApp();
      
      try {
        // Health endpoint should work without credentials
        const healthRes = await app.request("/health");
        assertEquals(healthRes.status, 200);
        const healthBody = await healthRes.json();
        assertEquals(healthBody.status, "healthy");
        
        // Readiness endpoint should work without credentials
        const readyRes = await app.request("/health/ready");
        assertEquals(readyRes.status, 200);
        const readyBody = await readyRes.json();
        assertEquals(readyBody.status, "ready");
        
        // v2 endpoint should require auth
        const v2Res = await app.request("/v2/");
        assertEquals(v2Res.status, 401);
      } finally {
        cleanup.stop();
      }
    });

    await t.step("Health endpoints are accessible in the full app", async () => {
      resetConfig();
      Deno.env.set("REGISTRY_AUTH_TYPE", "none");
      Deno.env.set("REGISTRY_STORAGE_PATH", TEST_STORAGE_DIR);
      
      const { app, cleanup } = await createApp();
      
      try {
        const healthRes = await app.request("/health");
        assertEquals(healthRes.status, 200);
        
        const readyRes = await app.request("/health/ready");
        assertEquals(readyRes.status, 200);
      } finally {
        cleanup.stop();
      }
    });

  } finally {
    // Restore original env vars
    if (originalAuthType) {
      Deno.env.set("REGISTRY_AUTH_TYPE", originalAuthType);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TYPE");
    }
    if (originalStoragePath) {
      Deno.env.set("REGISTRY_STORAGE_PATH", originalStoragePath);
    } else {
      Deno.env.delete("REGISTRY_STORAGE_PATH");
    }
    resetConfig();
    await cleanupTestDir();
  }
});
