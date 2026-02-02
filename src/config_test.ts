import { assertEquals, assertNotEquals } from "@std/assert";
import { getConfig, loadConfig, resetConfig } from "./config.ts";

Deno.test("config: defaults are correct", () => {
  resetConfig();
  // Ensure environment is clean for this test
  const originalHost = Deno.env.get("REGISTRY_HOST");
  const originalPort = Deno.env.get("REGISTRY_PORT");
  const originalStorage = Deno.env.get("REGISTRY_STORAGE_PATH");
  const originalLevel = Deno.env.get("REGISTRY_LOG_LEVEL");

  Deno.env.delete("REGISTRY_HOST");
  Deno.env.delete("REGISTRY_PORT");
  Deno.env.delete("REGISTRY_STORAGE_PATH");
  Deno.env.delete("REGISTRY_LOG_LEVEL");

  try {
    const config = loadConfig();
    assertEquals(config.server.host, "0.0.0.0");
    assertEquals(config.server.port, 15000);
    assertEquals(config.storage.rootDirectory, "./data");
    assertEquals(config.log.level, "info");
  } finally {
    // Restore environment
    if (originalHost) Deno.env.set("REGISTRY_HOST", originalHost);
    if (originalPort) Deno.env.set("REGISTRY_PORT", originalPort);
    if (originalStorage) Deno.env.set("REGISTRY_STORAGE_PATH", originalStorage);
    if (originalLevel) Deno.env.set("REGISTRY_LOG_LEVEL", originalLevel);
  }
});

Deno.test("config: environment variables override defaults", () => {
  resetConfig();
  Deno.env.set("REGISTRY_HOST", "127.0.0.1");
  Deno.env.set("REGISTRY_PORT", "8080");
  Deno.env.set("REGISTRY_STORAGE_PATH", "/tmp/registry");
  Deno.env.set("REGISTRY_LOG_LEVEL", "debug");

  try {
    const config = loadConfig();
    assertEquals(config.server.host, "127.0.0.1");
    assertEquals(config.server.port, 8080);
    assertEquals(config.storage.rootDirectory, "/tmp/registry");
    assertEquals(config.log.level, "debug");
  } finally {
    Deno.env.delete("REGISTRY_HOST");
    Deno.env.delete("REGISTRY_PORT");
    Deno.env.delete("REGISTRY_STORAGE_PATH");
    Deno.env.delete("REGISTRY_LOG_LEVEL");
  }
});

Deno.test("config: port validation", () => {
  resetConfig();
  // Test invalid number
  Deno.env.set("REGISTRY_PORT", "abc");
  let config = loadConfig();
  assertEquals(config.server.port, 15000);

  // Test negative number
  Deno.env.set("REGISTRY_PORT", "-1");
  config = loadConfig();
  assertEquals(config.server.port, 15000);

  // Test number > 65535
  Deno.env.set("REGISTRY_PORT", "70000");
  config = loadConfig();
  assertEquals(config.server.port, 15000);

  Deno.env.delete("REGISTRY_PORT");
});

Deno.test("config: log level parsing", () => {
  resetConfig();

  // Test valid levels
  Deno.env.set("REGISTRY_LOG_LEVEL", "debug");
  assertEquals(loadConfig().log.level, "debug");

  Deno.env.set("REGISTRY_LOG_LEVEL", "info");
  assertEquals(loadConfig().log.level, "info");

  Deno.env.set("REGISTRY_LOG_LEVEL", "warn");
  assertEquals(loadConfig().log.level, "warn");

  Deno.env.set("REGISTRY_LOG_LEVEL", "error");
  assertEquals(loadConfig().log.level, "error");

  // Test case insensitivity
  Deno.env.set("REGISTRY_LOG_LEVEL", "DEBUG");
  assertEquals(loadConfig().log.level, "debug");

  // Test invalid level (defaults to info)
  Deno.env.set("REGISTRY_LOG_LEVEL", "invalid");
  assertEquals(loadConfig().log.level, "info");

  Deno.env.delete("REGISTRY_LOG_LEVEL");
});

Deno.test("config: singleton pattern", () => {
  resetConfig();
  const config1 = getConfig();
  const config2 = getConfig();

  assertEquals(config1, config2);

  resetConfig();
  const config3 = getConfig();
  // Objects are strictly different references, even if content is identical
  assertNotEquals(config1 === config3, true);
});

Deno.test("config: auth parsing", () => {
  resetConfig();

  // Test basic
  Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
  assertEquals(loadConfig().auth.type, "basic");

  // Test BASIC (case insensitive)
  Deno.env.set("REGISTRY_AUTH_TYPE", "BASIC");
  assertEquals(loadConfig().auth.type, "basic");

  // Test none
  Deno.env.set("REGISTRY_AUTH_TYPE", "none");
  assertEquals(loadConfig().auth.type, "none");

  // Test default (should be none)
  Deno.env.delete("REGISTRY_AUTH_TYPE");
  assertEquals(loadConfig().auth.type, "none");

  // Test htpasswd path
  Deno.env.set("REGISTRY_AUTH_TYPE", "basic");
  Deno.env.set("REGISTRY_AUTH_HTPASSWD", "/etc/registry/htpasswd");
  assertEquals(loadConfig().auth.htpasswd, "/etc/registry/htpasswd");

  Deno.env.delete("REGISTRY_AUTH_TYPE");
  Deno.env.delete("REGISTRY_AUTH_HTPASSWD");
});
