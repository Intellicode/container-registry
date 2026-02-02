/**
 * Tests for Authentication Middleware
 */

import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { createAuthMiddleware } from "./auth.ts";
import { AuthService } from "../services/auth.ts";
import type { AuthConfig } from "../config.ts";

Deno.test("createAuthMiddleware - allows requests when auth type is none", async () => {
  const authConfig: AuthConfig = {
    type: "none",
    realm: "Registry",
  };

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { success: true });
});

Deno.test("createAuthMiddleware - returns 401 when auth required but no header provided", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const authService = new AuthService();
  authService.parseHtpasswd(`testuser:$2y$10$dummyhash`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="Registry"');

  const body = await res.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "authentication required");
});

Deno.test("createAuthMiddleware - returns 401 for malformed auth header", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const authService = new AuthService();
  authService.parseHtpasswd(`testuser:$2y$10$dummyhash`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test", {
    headers: {
      Authorization: "Basic invalid!base64",
    },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="Registry"');

  const body = await res.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "malformed authorization header");
});

Deno.test("createAuthMiddleware - returns 401 for invalid credentials", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const password = "correctpassword";
  const hash = await bcrypt.hash(password);

  const authService = new AuthService();
  authService.parseHtpasswd(`testuser:${hash}`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test", {
    headers: {
      Authorization: "Basic " + btoa("testuser:wrongpassword"),
    },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="Registry"');

  const body = await res.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "invalid credentials");
});

Deno.test("createAuthMiddleware - allows request with valid credentials", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const password = "correctpassword";
  const hash = await bcrypt.hash(password);

  const authService = new AuthService();
  authService.parseHtpasswd(`testuser:${hash}`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test", {
    headers: {
      Authorization: "Basic " + btoa("testuser:correctpassword"),
    },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { success: true });
});

Deno.test("createAuthMiddleware - escapes special characters in realm", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: 'Test "Registry" \\Server\\',
  };

  const authService = new AuthService();
  authService.parseHtpasswd(`testuser:$2y$10$dummyhash`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  // Quotes and backslashes should be escaped
  assertEquals(
    res.headers.get("WWW-Authenticate"),
    'Basic realm="Test \\"Registry\\" \\\\Server\\\\"',
  );
});

Deno.test("createAuthMiddleware - returns 401 when auth service not provided for basic auth", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const app = new Hono();
  // Don't provide auth service - this is a misconfiguration
  app.use("*", createAuthMiddleware(authConfig));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test", {
    headers: {
      Authorization: "Basic " + btoa("testuser:password"),
    },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="Registry"');
});

Deno.test("createAuthMiddleware - returns 401 for unknown user", async () => {
  const authConfig: AuthConfig = {
    type: "basic",
    realm: "Registry",
  };

  const password = "password";
  const hash = await bcrypt.hash(password);

  const authService = new AuthService();
  authService.parseHtpasswd(`knownuser:${hash}`);

  const app = new Hono();
  app.use("*", createAuthMiddleware(authConfig, authService));
  app.get("/test", (c) => c.json({ success: true }));

  const req = new Request("http://localhost/test", {
    headers: {
      Authorization: "Basic " + btoa("unknownuser:password"),
    },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 401);
  assertEquals(res.headers.get("WWW-Authenticate"), 'Basic realm="Registry"');

  const body = await res.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");
  assertEquals(body.errors[0].message, "invalid credentials");
});
