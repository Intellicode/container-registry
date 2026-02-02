/**
 * Tests for Authentication Service
 */

import { assertEquals, assertRejects } from "@std/assert";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { AuthService, createAuthService } from "./auth.ts";

Deno.test("AuthService.parseBasicAuth - parses valid Basic auth header", () => {
  const authHeader = "Basic " + btoa("testuser:testpass");
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, { username: "testuser", password: "testpass" });
});

Deno.test("AuthService.parseBasicAuth - handles password with colon", () => {
  const authHeader = "Basic " + btoa("user:pass:word:123");
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, { username: "user", password: "pass:word:123" });
});

Deno.test("AuthService.parseBasicAuth - returns null for missing Basic prefix", () => {
  const authHeader = btoa("testuser:testpass");
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, null);
});

Deno.test("AuthService.parseBasicAuth - returns null for invalid base64", () => {
  const authHeader = "Basic invalid!@#base64";
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, null);
});

Deno.test("AuthService.parseBasicAuth - returns null for missing colon separator", () => {
  const authHeader = "Basic " + btoa("usernamewithoutpassword");
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, null);
});

Deno.test("AuthService.parseBasicAuth - returns null for empty username", () => {
  const authHeader = "Basic " + btoa(":password");
  const result = AuthService.parseBasicAuth(authHeader);

  assertEquals(result, null);
});

Deno.test("AuthService.parseHtpasswd - parses valid htpasswd content", () => {
  const service = new AuthService();
  const htpasswd = `alice:$2y$10$YixC7pXV.hOt7xLJX1VDe.pFmZJ7XBXpj5/Kt/hVqP7c8Z8Z8Z8Z8
bob:$2y$10$anotherhashanotherhashanotherhashanotherhashanotherhashanoth`;

  service.parseHtpasswd(htpasswd);

  assertEquals(service.getCredentialCount(), 2);
});

Deno.test("AuthService.parseHtpasswd - skips empty lines and comments", () => {
  const service = new AuthService();
  const htpasswd = `# This is a comment
alice:$2y$10$YixC7pXV.hOt7xLJX1VDe.pFmZJ7XBXpj5/Kt/hVqP7c8Z8Z8Z8Z8

# Another comment
bob:$2y$10$anotherhashanotherhashanotherhashanotherhashanotherhashanoth
  `;

  service.parseHtpasswd(htpasswd);

  assertEquals(service.getCredentialCount(), 2);
});

Deno.test("AuthService.parseHtpasswd - skips malformed lines", () => {
  const service = new AuthService();
  const htpasswd = `alice:$2y$10$YixC7pXV.hOt7xLJX1VDe.pFmZJ7XBXpj5/Kt/hVqP7c8Z8Z8Z8Z8
malformedline
bob:$2y$10$anotherhashanotherhashanotherhashanotherhashanotherhashanoth`;

  service.parseHtpasswd(htpasswd);

  assertEquals(service.getCredentialCount(), 2);
});

Deno.test("AuthService.parseHtpasswd - skips non-bcrypt hashes", () => {
  const service = new AuthService();
  const htpasswd = `alice:$2y$10$YixC7pXV.hOt7xLJX1VDe.pFmZJ7XBXpj5/Kt/hVqP7c8Z8Z8Z8Z8
bob:plaintextpassword
charlie:$1$oldhash`;

  service.parseHtpasswd(htpasswd);

  // Only alice should be loaded
  assertEquals(service.getCredentialCount(), 1);
});

Deno.test("AuthService.parseHtpasswd - supports $2a$ and $2b$ prefixes", () => {
  const service = new AuthService();
  const htpasswd = `alice:$2a$10$YixC7pXV.hOt7xLJX1VDe.pFmZJ7XBXpj5/Kt/hVqP7c8Z8Z8Z8Z8
bob:$2b$10$anotherhashanotherhashanotherhashanotherhashanotherhashanoth
charlie:$2y$10$yetanotherhashanotherhashanotherhashanotherhashanotherhas`;

  service.parseHtpasswd(htpasswd);

  assertEquals(service.getCredentialCount(), 3);
});

Deno.test("AuthService.validateCredentials - validates correct credentials", async () => {
  const service = new AuthService();
  const password = "testpassword";
  const hash = await bcrypt.hash(password);

  service.parseHtpasswd(`testuser:${hash}`);

  const result = await service.validateCredentials("testuser", password);
  assertEquals(result, true);
});

Deno.test("AuthService.validateCredentials - rejects incorrect password", async () => {
  const service = new AuthService();
  const password = "testpassword";
  const hash = await bcrypt.hash(password);

  service.parseHtpasswd(`testuser:${hash}`);

  const result = await service.validateCredentials("testuser", "wrongpassword");
  assertEquals(result, false);
});

Deno.test("AuthService.validateCredentials - rejects unknown user", async () => {
  const service = new AuthService();
  const password = "testpassword";
  const hash = await bcrypt.hash(password);

  service.parseHtpasswd(`testuser:${hash}`);

  const result = await service.validateCredentials("unknownuser", password);
  assertEquals(result, false);
});

Deno.test("AuthService.loadHtpasswdFile - loads file from disk", async () => {
  // Create a temporary htpasswd file
  const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
  const password = "testpassword";
  const hash = await bcrypt.hash(password);
  await Deno.writeTextFile(tempFile, `testuser:${hash}\n`);

  try {
    const service = new AuthService(tempFile);
    await service.loadHtpasswdFile();

    assertEquals(service.getCredentialCount(), 1);

    const result = await service.validateCredentials("testuser", password);
    assertEquals(result, true);
  } finally {
    // Clean up
    await Deno.remove(tempFile);
  }
});

Deno.test("AuthService.loadHtpasswdFile - throws error when path not configured", async () => {
  const service = new AuthService();

  await assertRejects(
    async () => await service.loadHtpasswdFile(),
    Error,
    "htpasswd file path not configured",
  );
});

Deno.test("AuthService.loadHtpasswdFile - throws error for non-existent file", async () => {
  const service = new AuthService("/nonexistent/path/to/htpasswd");

  await assertRejects(
    async () => await service.loadHtpasswdFile(),
    Error,
    "Failed to load htpasswd file",
  );
});

Deno.test("createAuthService - creates and initializes service with file", async () => {
  // Create a temporary htpasswd file
  const tempFile = await Deno.makeTempFile({ suffix: ".htpasswd" });
  const password = "testpassword";
  const hash = await bcrypt.hash(password);
  await Deno.writeTextFile(tempFile, `testuser:${hash}\n`);

  try {
    const service = await createAuthService(tempFile);

    assertEquals(service.getCredentialCount(), 1);

    const result = await service.validateCredentials("testuser", password);
    assertEquals(result, true);
  } finally {
    // Clean up
    await Deno.remove(tempFile);
  }
});

Deno.test("createAuthService - creates service without loading file when path not provided", async () => {
  const service = await createAuthService();

  assertEquals(service.getCredentialCount(), 0);
});
