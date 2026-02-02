/**
 * Integration tests for Basic Authentication
 * Tests the full authentication flow with htpasswd file
 */

import { assertEquals } from "@std/assert";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { createApp } from "../src/app.ts";
import { resetConfig } from "../src/config.ts";

Deno.test("Basic Auth Integration Tests", async (t) => {
  // Store original env
  const originalAuthType = Deno.env.get("REGISTRY_AUTH_TYPE");
  const originalAuthHtpasswd = Deno.env.get("REGISTRY_AUTH_HTPASSWD");

  const restoreEnv = () => {
    if (originalAuthType !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TYPE", originalAuthType);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TYPE");
    }
    if (originalAuthHtpasswd !== undefined) {
      Deno.env.set("REGISTRY_AUTH_HTPASSWD", originalAuthHtpasswd);
    } else {
      Deno.env.delete("REGISTRY_AUTH_HTPASSWD");
    }
    resetConfig();
  };

  try {
    await t.step(
      "docker login - rejects request without credentials",
      async () => {
        // Create temp htpasswd file
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash = await bcrypt.hash("testpass");
        await Deno.writeTextFile(tempFile, `testuser:${hash}\n`);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();
          const response = await app.request("/v2/");

          assertEquals(response.status, 401);
          assertEquals(
            response.headers.get("WWW-Authenticate"),
            'Basic realm="Registry"',
          );

          const body = await response.json();
          assertEquals(body.errors[0].code, "UNAUTHORIZED");
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );

    await t.step(
      "docker login - accepts valid credentials",
      async () => {
        // Create temp htpasswd file
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash = await bcrypt.hash("testpass");
        await Deno.writeTextFile(tempFile, `testuser:${hash}\n`);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();
          const response = await app.request("/v2/", {
            headers: {
              Authorization: "Basic " + btoa("testuser:testpass"),
            },
          });

          assertEquals(response.status, 200);
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );

    await t.step(
      "docker login - rejects invalid password",
      async () => {
        // Create temp htpasswd file
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash = await bcrypt.hash("correctpass");
        await Deno.writeTextFile(tempFile, `testuser:${hash}\n`);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();
          const response = await app.request("/v2/", {
            headers: {
              Authorization: "Basic " + btoa("testuser:wrongpass"),
            },
          });

          assertEquals(response.status, 401);
          assertEquals(
            response.headers.get("WWW-Authenticate"),
            'Basic realm="Registry"',
          );

          const body = await response.json();
          assertEquals(body.errors[0].code, "UNAUTHORIZED");
          assertEquals(body.errors[0].message, "invalid credentials");
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );

    await t.step(
      "docker login - rejects unknown user",
      async () => {
        // Create temp htpasswd file
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash = await bcrypt.hash("password");
        await Deno.writeTextFile(tempFile, `alice:${hash}\n`);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();
          const response = await app.request("/v2/", {
            headers: {
              Authorization: "Basic " + btoa("bob:password"),
            },
          });

          assertEquals(response.status, 401);

          const body = await response.json();
          assertEquals(body.errors[0].message, "invalid credentials");
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );

    await t.step(
      "docker login - supports multiple users",
      async () => {
        // Create temp htpasswd file with multiple users
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash1 = await bcrypt.hash("pass1");
        const hash2 = await bcrypt.hash("pass2");
        const hash3 = await bcrypt.hash("pass3");
        await Deno.writeTextFile(
          tempFile,
          `alice:${hash1}\nbob:${hash2}\ncharlie:${hash3}\n`,
        );

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();

          // Test alice
          let response = await app.request("/v2/", {
            headers: { Authorization: "Basic " + btoa("alice:pass1") },
          });
          assertEquals(response.status, 200);

          // Test bob
          response = await app.request("/v2/", {
            headers: { Authorization: "Basic " + btoa("bob:pass2") },
          });
          assertEquals(response.status, 200);

          // Test charlie
          response = await app.request("/v2/", {
            headers: { Authorization: "Basic " + btoa("charlie:pass3") },
          });
          assertEquals(response.status, 200);

          // Test wrong password for alice
          response = await app.request("/v2/", {
            headers: { Authorization: "Basic " + btoa("alice:wrongpass") },
          });
          assertEquals(response.status, 401);
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );

    await t.step(
      "docker push/pull - auth protects all registry operations",
      async () => {
        // Create temp htpasswd file
        const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
        const hash = await bcrypt.hash("password");
        await Deno.writeTextFile(tempFile, `user:${hash}\n`);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
          Deno.env.set("REGISTRY_AUTH_HTPASSWD", tempFile);
          resetConfig();

          const app = await createApp();

          // Test various endpoints without auth - should all return 401
          const endpoints = [
            "/v2/",
            "/v2/test/blobs/sha256:abc123",
            "/v2/test/manifests/latest",
            "/v2/test/tags/list",
          ];

          for (const endpoint of endpoints) {
            const response = await app.request(endpoint);
            assertEquals(
              response.status,
              401,
              `Expected 401 for ${endpoint}`,
            );
          }

          // Test with valid auth - /v2/ should work
          const authedResponse = await app.request("/v2/", {
            headers: { Authorization: "Basic " + btoa("user:password") },
          });
          assertEquals(authedResponse.status, 200);
        } finally {
          await Deno.remove(tempFile);
        }
      },
    );
  } finally {
    restoreEnv();
  }
});
