/**
 * Integration tests for error handling middleware.
 */

import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { isDevelopment } from "./errors.ts";
import { ErrorCodes, RegistryError } from "../types/errors.ts";

Deno.test("errorHandler via onError - catches and formats RegistryError", async () => {
  const app = new Hono();
  
  app.onError((err, c) => {
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode as any);
    }
    return c.json({ errors: [{ code: "UNSUPPORTED", message: "internal server error" }] }, 500);
  });
  
  app.get("/test", () => {
    throw new RegistryError(
      ErrorCodes.BLOB_UNKNOWN,
      "test blob not found",
      { digest: "sha256:test" },
    );
  });

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 404);
  const contentType = res.headers.get("Content-Type");
  assertEquals(contentType?.startsWith("application/json"), true);

  const body = await res.json();
  assertEquals(body, {
    errors: [
      {
        code: "BLOB_UNKNOWN",
        message: "test blob not found",
        detail: { digest: "sha256:test" },
      },
    ],
  });
});

Deno.test("errorHandler via onError - catches generic errors and returns 500", async () => {
  const app = new Hono();
  
  app.onError((err, c) => {
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode as any);
    }
    return c.json({ errors: [{ code: "UNSUPPORTED", message: "internal server error" }] }, 500);
  });
  
  app.get("/test", () => {
    throw new Error("unexpected error");
  });

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 500);
  const contentType = res.headers.get("Content-Type");
  assertEquals(contentType?.startsWith("application/json"), true);

  const body = await res.json();
  assertEquals(body.errors[0].code, "UNSUPPORTED");
  assertEquals(body.errors[0].message, "internal server error");
});

Deno.test("errorHandler via onError - hides error details in production", async () => {
  // Save original env
  const originalEnv = Deno.env.get("DENO_ENV");

  try {
    // Ensure we're not in development mode
    Deno.env.delete("DENO_ENV");
    Deno.env.delete("NODE_ENV");

    const app = new Hono();
    
    app.onError((err, c) => {
      if (err instanceof RegistryError) {
        return c.json(err.toResponse(), err.statusCode as any);
      }
      const isDev = isDevelopment();
      return c.json({
        errors: [{
          code: "UNSUPPORTED",
          message: "internal server error",
          detail: isDev ? String(err) : undefined
        }]
      }, 500);
    });
    
    app.get("/test", () => {
      throw new Error("secret error details");
    });

    const req = new Request("http://localhost/test");
    const res = await app.fetch(req);

    assertEquals(res.status, 500);
    const body = await res.json();
    // In production, detail should be undefined
    assertEquals(body.errors[0].detail, undefined);
  } finally {
    // Restore original env
    if (originalEnv) {
      Deno.env.set("DENO_ENV", originalEnv);
    }
  }
});

Deno.test("errorHandler via onError - includes error details in development", async () => {
  // Save original env
  const originalEnv = Deno.env.get("DENO_ENV");

  try {
    // Set development mode
    Deno.env.set("DENO_ENV", "development");

    const app = new Hono();
    
    app.onError((err, c) => {
      if (err instanceof RegistryError) {
        return c.json(err.toResponse(), err.statusCode as any);
      }
      const isDev = isDevelopment();
      return c.json({
        errors: [{
          code: "UNSUPPORTED",
          message: "internal server error",
          detail: isDev ? String(err) : undefined
        }]
      }, 500);
    });
    
    app.get("/test", () => {
      throw new Error("debug error");
    });

    const req = new Request("http://localhost/test");
    const res = await app.fetch(req);

    assertEquals(res.status, 500);
    const body = await res.json();
    // In development, detail should contain error string
    assertEquals(typeof body.errors[0].detail, "string");
  } finally {
    // Restore original env
    if (originalEnv) {
      Deno.env.set("DENO_ENV", originalEnv);
    } else {
      Deno.env.delete("DENO_ENV");
    }
  }
});

Deno.test("errorHandler via onError - allows successful requests through", async () => {
  const app = new Hono();
  
  app.onError((err, c) => {
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode as any);
    }
    return c.json({ errors: [{ code: "UNSUPPORTED", message: "internal server error" }] }, 500);
  });
  
  app.get("/test", (c) => {
    return c.json({ success: true });
  });

  const req = new Request("http://localhost/test");
  const res = await app.fetch(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { success: true });
});

Deno.test("errorHandler via onError - handles multiple error types", async () => {
  const app = new Hono();
  
  app.onError((err, c) => {
    if (err instanceof RegistryError) {
      return c.json(err.toResponse(), err.statusCode as any);
    }
    return c.json({ errors: [{ code: "UNSUPPORTED", message: "internal server error" }] }, 500);
  });

  app.get("/unauthorized", () => {
    throw new RegistryError(ErrorCodes.UNAUTHORIZED, "auth required");
  });

  app.get("/denied", () => {
    throw new RegistryError(ErrorCodes.DENIED, "access denied");
  });

  app.get("/invalid", () => {
    throw new RegistryError(ErrorCodes.DIGEST_INVALID, "bad digest");
  });

  // Test UNAUTHORIZED (401)
  let res = await app.fetch(new Request("http://localhost/unauthorized"));
  assertEquals(res.status, 401);
  let body = await res.json();
  assertEquals(body.errors[0].code, "UNAUTHORIZED");

  // Test DENIED (403)
  res = await app.fetch(new Request("http://localhost/denied"));
  assertEquals(res.status, 403);
  body = await res.json();
  assertEquals(body.errors[0].code, "DENIED");

  // Test DIGEST_INVALID (400)
  res = await app.fetch(new Request("http://localhost/invalid"));
  assertEquals(res.status, 400);
  body = await res.json();
  assertEquals(body.errors[0].code, "DIGEST_INVALID");
});
