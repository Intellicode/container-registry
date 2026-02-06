/**
 * Tests for Access Control Service
 */

import { assertEquals } from "jsr:@std/assert";
import {
  AccessControlService,
  createAccessControlService,
} from "./access-control.ts";
import type { AccessControlConfig } from "../config.ts";

Deno.test("AccessControlService - disabled access control allows all", () => {
  const config: AccessControlConfig = {
    enabled: false,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);

  assertEquals(service.checkPermission("alice", "myorg/repo", "pull"), true);
  assertEquals(service.checkPermission("alice", "myorg/repo", "push"), true);
  assertEquals(service.checkPermission("alice", "myorg/repo", "delete"), true);
});

Deno.test("AccessControlService - admin user bypasses all checks", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: ["admin"],
    rules: [],
  };

  const service = new AccessControlService(config);

  assertEquals(service.checkPermission("admin", "any/repo", "pull"), true);
  assertEquals(service.checkPermission("admin", "any/repo", "push"), true);
  assertEquals(service.checkPermission("admin", "any/repo", "delete"), true);
});

Deno.test("AccessControlService - default policy allow", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "allow",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);

  // No rules, default policy is allow
  assertEquals(service.checkPermission("alice", "any/repo", "pull"), true);
  assertEquals(service.checkPermission("alice", "any/repo", "push"), true);
});

Deno.test("AccessControlService - default policy deny", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const service = new AccessControlService(config);

  // No rules, default policy is deny
  assertEquals(service.checkPermission("alice", "any/repo", "pull"), false);
  assertEquals(service.checkPermission("alice", "any/repo", "push"), false);
});

Deno.test("AccessControlService - exact match rule", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull", "push"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // Alice has pull and push on myorg/webapp
  assertEquals(service.checkPermission("alice", "myorg/webapp", "pull"), true);
  assertEquals(service.checkPermission("alice", "myorg/webapp", "push"), true);
  assertEquals(
    service.checkPermission("alice", "myorg/webapp", "delete"),
    false,
  );

  // Bob has no access
  assertEquals(service.checkPermission("bob", "myorg/webapp", "pull"), false);

  // Different repo
  assertEquals(service.checkPermission("alice", "myorg/other", "pull"), false);
});

Deno.test("AccessControlService - wildcard user (*) allows all users", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "public/image",
        users: ["*"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // Any user can pull public/image
  assertEquals(service.checkPermission("alice", "public/image", "pull"), true);
  assertEquals(service.checkPermission("bob", "public/image", "pull"), true);
  assertEquals(
    service.checkPermission("anyone", "public/image", "pull"),
    true,
  );

  // But cannot push
  assertEquals(service.checkPermission("alice", "public/image", "push"), false);
});

Deno.test("AccessControlService - single star pattern matches single path segment", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/*",
        users: ["alice"],
        permissions: ["pull", "push"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // Matches single segment after myorg/
  assertEquals(service.checkPermission("alice", "myorg/webapp", "pull"), true);
  assertEquals(service.checkPermission("alice", "myorg/api", "pull"), true);

  // Does NOT match multiple segments
  assertEquals(
    service.checkPermission("alice", "myorg/team/webapp", "pull"),
    false,
  );

  // Does not match different org
  assertEquals(
    service.checkPermission("alice", "otherorg/webapp", "pull"),
    false,
  );
});

Deno.test("AccessControlService - double star pattern matches multiple segments", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/**",
        users: ["alice"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // Matches any number of segments
  assertEquals(service.checkPermission("alice", "myorg/webapp", "pull"), true);
  assertEquals(
    service.checkPermission("alice", "myorg/team/webapp", "pull"),
    true,
  );
  assertEquals(
    service.checkPermission("alice", "myorg/team/project/image", "pull"),
    true,
  );

  // Does not match different org
  assertEquals(
    service.checkPermission("alice", "otherorg/webapp", "pull"),
    false,
  );
});

Deno.test("AccessControlService - pattern */public matches any org's public repo", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "*/public",
        users: ["*"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);

  assertEquals(service.checkPermission("alice", "myorg/public", "pull"), true);
  assertEquals(
    service.checkPermission("bob", "yourorg/public", "pull"),
    true,
  );

  // Does not match other repo names
  assertEquals(
    service.checkPermission("alice", "myorg/private", "pull"),
    false,
  );

  // Does not match nested paths
  assertEquals(
    service.checkPermission("alice", "myorg/team/public", "pull"),
    false,
  );
});

Deno.test("AccessControlService - first matching rule wins", () => {
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
      {
        repository: "myorg/webapp",
        users: ["alice"],
        permissions: ["pull", "push", "delete"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // First rule matches myorg/webapp and only grants pull
  assertEquals(service.checkPermission("alice", "myorg/webapp", "pull"), true);
  assertEquals(service.checkPermission("alice", "myorg/webapp", "push"), false);
  assertEquals(
    service.checkPermission("alice", "myorg/webapp", "delete"),
    false,
  );
});

Deno.test("AccessControlService - multiple users in rule", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "myorg/webapp",
        users: ["alice", "bob", "charlie"],
        permissions: ["pull", "push"],
      },
    ],
  };

  const service = new AccessControlService(config);

  assertEquals(service.checkPermission("alice", "myorg/webapp", "pull"), true);
  assertEquals(service.checkPermission("bob", "myorg/webapp", "pull"), true);
  assertEquals(
    service.checkPermission("charlie", "myorg/webapp", "pull"),
    true,
  );
  assertEquals(service.checkPermission("dave", "myorg/webapp", "pull"), false);
});

Deno.test("AccessControlService - special case ** matches everything", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [
      {
        repository: "**",
        users: ["*"],
        permissions: ["pull"],
      },
    ],
  };

  const service = new AccessControlService(config);

  // Matches any repository
  assertEquals(service.checkPermission("alice", "anything", "pull"), true);
  assertEquals(service.checkPermission("bob", "myorg/webapp", "pull"), true);
  assertEquals(
    service.checkPermission("charlie", "a/b/c/d/e", "pull"),
    true,
  );
});

Deno.test("AccessControlService - createAccessControlService factory", () => {
  const config: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "allow",
    adminUsers: ["admin"],
    rules: [],
  };

  const service = createAccessControlService(config);

  assertEquals(service.isEnabled(), true);
  assertEquals(service.getConfig(), config);
});

Deno.test("AccessControlService - isEnabled returns correct value", () => {
  const enabledConfig: AccessControlConfig = {
    enabled: true,
    defaultPolicy: "deny",
    adminUsers: [],
    rules: [],
  };

  const disabledConfig: AccessControlConfig = {
    enabled: false,
    defaultPolicy: "allow",
    adminUsers: [],
    rules: [],
  };

  assertEquals(new AccessControlService(enabledConfig).isEnabled(), true);
  assertEquals(new AccessControlService(disabledConfig).isEnabled(), false);
});
