/**
 * Integration tests for JWT Token Authentication
 * Tests the full authentication flow with Bearer tokens
 */

import { assertEquals } from "@std/assert";
import { create } from "djwt";
import { createApp } from "../src/app.ts";
import { resetConfig } from "../src/config.ts";

// Generate RSA key pair for testing
async function generateRSAKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  return keyPair;
}

// Export public key to PEM format
async function exportPublicKeyToPEM(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", publicKey);
  const exportedAsString = String.fromCharCode(...new Uint8Array(exported));
  const exportedAsBase64 = btoa(exportedAsString);
  const pemFormatted = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  return pemFormatted;
}

Deno.test("JWT Token Auth Integration Tests", async (t) => {
  // Store original env
  const originalAuthType = Deno.env.get("REGISTRY_AUTH_TYPE");
  const originalTokenRealm = Deno.env.get("REGISTRY_AUTH_TOKEN_REALM");
  const originalTokenService = Deno.env.get("REGISTRY_AUTH_TOKEN_SERVICE");
  const originalTokenIssuer = Deno.env.get("REGISTRY_AUTH_TOKEN_ISSUER");
  const originalTokenPublicKey = Deno.env.get("REGISTRY_AUTH_TOKEN_PUBLICKEY");
  
  // Track cleanup services to stop them after tests
  const cleanupServices: Array<{ stop: () => void }> = [];

  const restoreEnv = () => {
    if (originalAuthType !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TYPE", originalAuthType);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TYPE");
    }
    if (originalTokenRealm !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", originalTokenRealm);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TOKEN_REALM");
    }
    if (originalTokenService !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", originalTokenService);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TOKEN_SERVICE");
    }
    if (originalTokenIssuer !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", originalTokenIssuer);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TOKEN_ISSUER");
    }
    if (originalTokenPublicKey !== undefined) {
      Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", originalTokenPublicKey);
    } else {
      Deno.env.delete("REGISTRY_AUTH_TOKEN_PUBLICKEY");
    }
    resetConfig();
    
    // Stop all cleanup services
    for (const service of cleanupServices) {
      service.stop();
    }
  };

  try {
    await t.step(
      "token auth - rejects request without token",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);
          const response = await app.request("/v2/");

          assertEquals(response.status, 401);
          const wwwAuth = response.headers.get("WWW-Authenticate");
          assertEquals(
            wwwAuth?.startsWith('Bearer realm="https://auth.example.com/token"'),
            true,
          );
          assertEquals(wwwAuth?.includes('service="registry.example.com"'), true);

          const body = await response.json();
          assertEquals(body.errors[0].code, "UNAUTHORIZED");
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );

    await t.step(
      "token auth - accepts valid token",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          // Create a valid token
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            iss: "auth.example.com",
            sub: "testuser",
            aud: "registry.example.com",
            exp: now + 3600,
            iat: now,
            access: [
              {
                type: "repository",
                name: "myimage",
                actions: ["pull", "push"],
              },
            ],
          };

          const token = await create({ alg: "RS256", typ: "JWT" }, payload, keyPair.privateKey);

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);
          const response = await app.request("/v2/", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          assertEquals(response.status, 200);
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );

    await t.step(
      "token auth - rejects token with invalid issuer",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          // Create token with wrong issuer
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            iss: "wrong-issuer.com",
            sub: "testuser",
            aud: "registry.example.com",
            exp: now + 3600,
            iat: now,
          };

          const token = await create({ alg: "RS256", typ: "JWT" }, payload, keyPair.privateKey);

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);
          const response = await app.request("/v2/", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          assertEquals(response.status, 401);

          const body = await response.json();
          assertEquals(body.errors[0].code, "UNAUTHORIZED");
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );

    await t.step(
      "token auth - rejects expired token",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          // Create expired token
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            iss: "auth.example.com",
            sub: "testuser",
            aud: "registry.example.com",
            exp: now - 3600, // Expired 1 hour ago
            iat: now - 7200,
          };

          const token = await create({ alg: "RS256", typ: "JWT" }, payload, keyPair.privateKey);

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);
          const response = await app.request("/v2/", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          assertEquals(response.status, 401);

          const body = await response.json();
          assertEquals(body.errors[0].code, "UNAUTHORIZED");
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );

    await t.step(
      "token auth - Bearer challenge includes scope for repository access",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);
          
          // Test manifest endpoint (pull)
          const response = await app.request("/v2/myimage/manifests/latest");
          assertEquals(response.status, 401);
          
          const wwwAuth = response.headers.get("WWW-Authenticate");
          assertEquals(wwwAuth?.includes('scope="repository:myimage:pull"'), true);
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );

    await t.step(
      "token auth - protects all registry operations",
      async () => {
        const keyPair = await generateRSAKeyPair();
        const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
        const tempKeyFile = await Deno.makeTempFile({ suffix: ".pem" });
        await Deno.writeTextFile(tempKeyFile, publicKeyPEM);

        try {
          Deno.env.set("REGISTRY_AUTH_TYPE", "token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_REALM", "https://auth.example.com/token");
          Deno.env.set("REGISTRY_AUTH_TOKEN_SERVICE", "registry.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_ISSUER", "auth.example.com");
          Deno.env.set("REGISTRY_AUTH_TOKEN_PUBLICKEY", tempKeyFile);
          resetConfig();

          const { app, cleanup } = await createApp();
          cleanupServices.push(cleanup);

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

          // Test with valid token
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            iss: "auth.example.com",
            sub: "testuser",
            aud: "registry.example.com",
            exp: now + 3600,
            iat: now,
          };

          const token = await create({ alg: "RS256", typ: "JWT" }, payload, keyPair.privateKey);

          const authedResponse = await app.request("/v2/", {
            headers: { Authorization: `Bearer ${token}` },
          });
          assertEquals(authedResponse.status, 200);
        } finally {
          await Deno.remove(tempKeyFile);
        }
      },
    );
  } finally {
    restoreEnv();
  }
});
