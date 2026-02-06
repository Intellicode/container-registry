/**
 * Tests for Authorization Middleware
 */

import { assertEquals } from "jsr:@std/assert";
import { Hono } from "hono";
import { createAuthorizationMiddleware } from "./authorization.ts";
import { AccessControlService } from "../services/access-control.ts";
import type { AccessControlConfig } from "../config.ts";

Deno.test("Authorization Middleware - disabled access control allows all", async () => {
  const config: AccessControlConfig = {
    enabled: false,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest");
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - allows base endpoint without auth", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/v2/", (c) => c.text("ok"));

  const res = await app.request("/v2/");
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - denies access when no permission", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest");
  assertEquals(res.status, 403);

  const body = await res.json();
  assertEquals(body.errors[0].code, "DENIED");
  assertEquals(body.errors[0].detail.repository, "myorg/webapp");
  assertEquals(body.errors[0].detail.action, "pull");
});

Deno.test("Authorization Middleware - allows access with basic auth", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest", {
    headers: {
      "Authorization": "Basic " + btoa("alice:password"),
    },
  });
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - extracts username from JWT token payload", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["bob"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  // Simulate JWT auth middleware setting token payload
  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "bob", iat: 123456 });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest");
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - GET manifest requires pull permission", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["push"], // Only push, no pull
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest");
  assertEquals(res.status, 403);
});

Deno.test("Authorization Middleware - PUT manifest requires push permission", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull"], // Only pull, no push
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.put("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest", {
    method: "PUT",
  });
  assertEquals(res.status, 403);
});

Deno.test("Authorization Middleware - DELETE manifest requires delete permission", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull", "push"], // No delete
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.delete("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/manifests/latest", {
    method: "DELETE",
  });
  assertEquals(res.status, 403);
});

Deno.test("Authorization Middleware - blob operations follow same rules", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/webapp/blobs/sha256:abc123");
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - wildcard patterns work", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/*",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  // Should match myorg/*
  const res1 = await app.request("/v2/myorg/webapp/manifests/latest");
  assertEquals(res1.status, 200);

  const res2 = await app.request("/v2/myorg/api/manifests/latest");
  assertEquals(res2.status, 200);

  // Should not match different org
  const res3 = await app.request("/v2/otherorg/webapp/manifests/latest");
  assertEquals(res3.status, 403);
});

Deno.test("Authorization Middleware - admin user bypasses checks", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: ["admin"],
    rules: [],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "admin" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));
  app.put("/*", (c) => c.text("ok"));
  app.delete("/*", (c) => c.text("ok"));

  // Admin can do everything
  const res1 = await app.request("/v2/any/repo/manifests/latest");
  assertEquals(res1.status, 200);

  const res2 = await app.request("/v2/any/repo/manifests/latest", {
    method: "PUT",
  });
  assertEquals(res2.status, 200);

  const res3 = await app.request("/v2/any/repo/manifests/latest", {
    method: "DELETE",
  });
  assertEquals(res3.status, 200);
});

Deno.test("Authorization Middleware - catalog endpoint uses _catalog repository", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "_catalog",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/v2/_catalog", (c) => c.text("ok"));

  const res = await app.request("/v2/_catalog");
  assertEquals(res.status, 200);
});

Deno.test("Authorization Middleware - nested repository paths work", async () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/team/webapp",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);
  const app = new Hono();

  app.use("*", async (c, next) => {
    // @ts-ignore: set token payload
    c.set("tokenPayload", { sub: "alice" });
    await next();
  });

  app.use("*", createAuthorizationMiddleware(service));
  app.get("/*", (c) => c.text("ok"));

  const res = await app.request("/v2/myorg/team/webapp/manifests/latest");
  assertEquals(res.status, 200);
});
