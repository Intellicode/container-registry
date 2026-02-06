/**
 * Tests for Token Service (JWT authentication)
 */

import { assertEquals, assertExists } from "@std/assert";
import { TokenService } from "./token.ts";
import type { TokenAuthConfig } from "../config.ts";
import { create } from "djwt";

// Generate RSA key pair for testing
async function generateRSAKeyPair(): Promise<
  { publicKey: CryptoKey; privateKey: CryptoKey }
> {
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
  const pemFormatted = `-----BEGIN PUBLIC KEY-----\n${
    exportedAsBase64.match(/.{1,64}/g)?.join("\n")
  }\n-----END PUBLIC KEY-----`;
  return pemFormatted;
}

// Write public key to temporary file
async function writeTempPublicKey(pem: string): Promise<string> {
  const tempDir = await Deno.makeTempDir();
  const keyPath = `${tempDir}/public.pem`;
  await Deno.writeTextFile(keyPath, pem);
  return keyPath;
}

Deno.test("TokenService - parseBearerToken", () => {
  const token =
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";

  // Valid Bearer token
  const result = TokenService.parseBearerToken(`Bearer ${token}`);
  assertEquals(result, token);

  // Missing Bearer prefix
  assertEquals(TokenService.parseBearerToken(token), null);

  // Wrong prefix
  assertEquals(TokenService.parseBearerToken("Basic abc123"), null);

  // Empty token
  assertEquals(TokenService.parseBearerToken("Bearer "), null);
  assertEquals(TokenService.parseBearerToken("Bearer"), null);
});

Deno.test("TokenService - validateToken with valid token", async () => {
  const keyPair = await generateRSAKeyPair();
  const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
  const keyPath = await writeTempPublicKey(publicKeyPEM);

  try {
    const config: TokenAuthConfig = {
      realm: "https://auth.example.com/token",
      service: "registry.example.com",
      issuer: "auth.example.com",
      publicKey: keyPath,
    };

    const service = new TokenService(config);
    await service.initialize();

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

    const token = await create(
      { alg: "RS256", typ: "JWT" },
      payload,
      keyPair.privateKey,
    );

    // Validate the token
    const result = await service.validateToken(token);
    assertEquals(result.valid, true);
    assertExists(result.payload);
    assertEquals(result.payload?.iss, "auth.example.com");
    assertEquals(result.payload?.sub, "testuser");
  } finally {
    await Deno.remove(keyPath);
    await Deno.remove(keyPath.replace("/public.pem", ""));
  }
});

Deno.test("TokenService - validateToken with invalid issuer", async () => {
  const keyPair = await generateRSAKeyPair();
  const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
  const keyPath = await writeTempPublicKey(publicKeyPEM);

  try {
    const config: TokenAuthConfig = {
      realm: "https://auth.example.com/token",
      service: "registry.example.com",
      issuer: "auth.example.com",
      publicKey: keyPath,
    };

    const service = new TokenService(config);
    await service.initialize();

    // Create token with wrong issuer
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "wrong-issuer.com",
      sub: "testuser",
      aud: "registry.example.com",
      exp: now + 3600,
      iat: now,
    };

    const token = await create(
      { alg: "RS256", typ: "JWT" },
      payload,
      keyPair.privateKey,
    );

    // Validate the token
    const result = await service.validateToken(token);
    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error?.includes("Invalid issuer"), true);
  } finally {
    await Deno.remove(keyPath);
    await Deno.remove(keyPath.replace("/public.pem", ""));
  }
});

Deno.test("TokenService - validateToken with invalid audience", async () => {
  const keyPair = await generateRSAKeyPair();
  const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
  const keyPath = await writeTempPublicKey(publicKeyPEM);

  try {
    const config: TokenAuthConfig = {
      realm: "https://auth.example.com/token",
      service: "registry.example.com",
      issuer: "auth.example.com",
      publicKey: keyPath,
    };

    const service = new TokenService(config);
    await service.initialize();

    // Create token with wrong audience
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "auth.example.com",
      sub: "testuser",
      aud: "wrong-service.com",
      exp: now + 3600,
      iat: now,
    };

    const token = await create(
      { alg: "RS256", typ: "JWT" },
      payload,
      keyPair.privateKey,
    );

    // Validate the token
    const result = await service.validateToken(token);
    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error?.includes("Invalid audience"), true);
  } finally {
    await Deno.remove(keyPath);
    await Deno.remove(keyPath.replace("/public.pem", ""));
  }
});

Deno.test("TokenService - validateToken with expired token", async () => {
  const keyPair = await generateRSAKeyPair();
  const publicKeyPEM = await exportPublicKeyToPEM(keyPair.publicKey);
  const keyPath = await writeTempPublicKey(publicKeyPEM);

  try {
    const config: TokenAuthConfig = {
      realm: "https://auth.example.com/token",
      service: "registry.example.com",
      issuer: "auth.example.com",
      publicKey: keyPath,
    };

    const service = new TokenService(config);
    await service.initialize();

    // Create expired token
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "auth.example.com",
      sub: "testuser",
      aud: "registry.example.com",
      exp: now - 3600, // Expired 1 hour ago
      iat: now - 7200,
    };

    const token = await create(
      { alg: "RS256", typ: "JWT" },
      payload,
      keyPair.privateKey,
    );

    // Validate the token
    const result = await service.validateToken(token);
    assertEquals(result.valid, false);
    assertExists(result.error);
    assertEquals(result.error?.includes("expired"), true);
  } finally {
    await Deno.remove(keyPath);
    await Deno.remove(keyPath.replace("/public.pem", ""));
  }
});

Deno.test("TokenService - hasAccess", () => {
  const payload = {
    iss: "auth.example.com",
    sub: "testuser",
    aud: "registry.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    access: [
      {
        type: "repository",
        name: "myimage",
        actions: ["pull", "push"],
      },
      {
        type: "repository",
        name: "other",
        actions: ["pull"],
      },
    ],
  };

  // Has access to pull and push myimage
  assertEquals(TokenService.hasAccess(payload, "myimage", "pull"), true);
  assertEquals(TokenService.hasAccess(payload, "myimage", "push"), true);

  // Has access to pull other
  assertEquals(TokenService.hasAccess(payload, "other", "pull"), true);

  // Does not have access to push other
  assertEquals(TokenService.hasAccess(payload, "other", "push"), false);

  // Does not have access to nonexistent repo
  assertEquals(TokenService.hasAccess(payload, "nonexistent", "pull"), false);

  // No payload
  assertEquals(TokenService.hasAccess(undefined, "myimage", "pull"), false);
});

Deno.test("TokenService - generateChallenge", () => {
  const realm = "https://auth.example.com/token";
  const service = "registry.example.com";

  // Without scope
  const challenge1 = TokenService.generateChallenge(realm, service);
  assertEquals(
    challenge1,
    'Bearer realm="https://auth.example.com/token",service="registry.example.com"',
  );

  // With scope
  const scope = "repository:myimage:pull";
  const challenge2 = TokenService.generateChallenge(realm, service, scope);
  assertEquals(
    challenge2,
    'Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:myimage:pull"',
  );

  // Escapes quotes in realm
  const challenge3 = TokenService.generateChallenge(
    'realm"with"quotes',
    service,
  );
  assertEquals(
    challenge3,
    'Bearer realm="realm\\"with\\"quotes",service="registry.example.com"',
  );
});
