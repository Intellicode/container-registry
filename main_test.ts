import { assertEquals } from "@std/assert";
import { createApp } from "./src/app.ts";
import { resetConfig } from "./src/config.ts";

Deno.test("V2 Endpoint Tests", async (t) => {
  // Store original env to restore later
  const originalAuthEnabled = Deno.env.get("REGISTRY_AUTH_ENABLED");
  const originalAuthRealm = Deno.env.get("REGISTRY_AUTH_REALM");

  const restoreEnv = () => {
    if (originalAuthEnabled !== undefined) {
      Deno.env.set("REGISTRY_AUTH_ENABLED", originalAuthEnabled);
    } else {
      Deno.env.delete("REGISTRY_AUTH_ENABLED");
    }
    if (originalAuthRealm !== undefined) {
      Deno.env.set("REGISTRY_AUTH_REALM", originalAuthRealm);
    } else {
      Deno.env.delete("REGISTRY_AUTH_REALM");
    }
    resetConfig();
  };

  try {
    await t.step(
      "GET /v2/ returns 200 OK when auth is disabled",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/");

        assertEquals(response.status, 200);
      },
    );

    await t.step(
      "GET /v2 (no trailing slash) returns 200 OK when auth is disabled",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2");

        assertEquals(response.status, 200);
      },
    );

    await t.step(
      "GET /v2/ returns Docker-Distribution-API-Version header",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/");

        assertEquals(
          response.headers.get("Docker-Distribution-API-Version"),
          "registry/2.0",
        );
      },
    );

    await t.step("GET /v2/ returns empty JSON object", async () => {
      Deno.env.set("REGISTRY_AUTH_ENABLED", "false");
      resetConfig();

      const app = createApp();
      const response = await app.request("/v2/");
      const body = await response.json();

      assertEquals(body, {});
    });

    await t.step(
      "GET /v2/ returns 401 when auth is enabled and no credentials provided",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "true");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/");

        assertEquals(response.status, 401);
      },
    );

    await t.step(
      "GET /v2/ includes WWW-Authenticate header when returning 401",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "true");
        Deno.env.set("REGISTRY_AUTH_REALM", "Registry");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/");

        assertEquals(response.status, 401);
        assertEquals(
          response.headers.get("WWW-Authenticate"),
          'Basic realm="Registry"',
        );
      },
    );

    await t.step(
      "GET /v2/ returns OCI error format when unauthorized",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "true");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/");
        const body = await response.json();

        assertEquals(response.status, 401);
        assertEquals(body, {
          errors: [
            {
              code: "UNAUTHORIZED",
              message: "authentication required",
            },
          ],
        });
      },
    );

    await t.step(
      "GET /v2/ with auth header passes when auth is enabled",
      async () => {
        Deno.env.set("REGISTRY_AUTH_ENABLED", "true");
        resetConfig();

        const app = createApp();
        const response = await app.request("/v2/", {
          headers: {
            Authorization: "Basic dXNlcjpwYXNz", // user:pass in base64
          },
        });

        assertEquals(response.status, 200);
      },
    );

    await t.step("GET /v2/ uses custom realm from config", async () => {
      Deno.env.set("REGISTRY_AUTH_ENABLED", "true");
      Deno.env.set("REGISTRY_AUTH_REALM", "MyCustomRealm");
      resetConfig();

      const app = createApp();
      const response = await app.request("/v2/");

      assertEquals(response.status, 401);
      assertEquals(
        response.headers.get("WWW-Authenticate"),
        'Basic realm="MyCustomRealm"',
      );
    });
  } finally {
    restoreEnv();
  }
});
