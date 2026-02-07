/**
 * Tests for shared validation utilities.
 */

import { assertEquals } from "@std/assert";
import {
  isValidUUID,
  REPOSITORY_NAME_ERROR_MESSAGE,
  validateRepositoryName,
  validateTagName,
} from "./validation.ts";

Deno.test("validateRepositoryName - accepts valid simple names", () => {
  assertEquals(validateRepositoryName("nginx"), true);
  assertEquals(validateRepositoryName("my-app"), true);
  assertEquals(validateRepositoryName("my_app"), true);
  assertEquals(validateRepositoryName("my.app"), true);
  assertEquals(validateRepositoryName("my-app123"), true);
});

Deno.test("validateRepositoryName - accepts valid nested names", () => {
  assertEquals(validateRepositoryName("myorg/myapp"), true);
  assertEquals(validateRepositoryName("my-org/my-app"), true);
  assertEquals(validateRepositoryName("org/team/app"), true);
  assertEquals(validateRepositoryName("a/b/c/d/e"), true);
});

Deno.test("validateRepositoryName - rejects invalid names", () => {
  assertEquals(validateRepositoryName(""), false);
  assertEquals(validateRepositoryName("MyApp"), false); // uppercase
  assertEquals(validateRepositoryName("-app"), false); // starts with hyphen
  assertEquals(validateRepositoryName("app-"), false); // ends with hyphen
  assertEquals(validateRepositoryName(".app"), false); // starts with dot
  assertEquals(validateRepositoryName("app..name"), false); // double separator
  assertEquals(validateRepositoryName("/app"), false); // starts with slash
  assertEquals(validateRepositoryName("app/"), false); // ends with slash
  assertEquals(validateRepositoryName("app//name"), false); // double slash
});

Deno.test("validateRepositoryName - rejects path traversal attempts", () => {
  assertEquals(validateRepositoryName(".."), false);
  assertEquals(validateRepositoryName("../app"), false);
  assertEquals(validateRepositoryName("app/.."), false);
  assertEquals(validateRepositoryName("app/../other"), false);
  assertEquals(validateRepositoryName("app\\other"), false);
  assertEquals(validateRepositoryName("app\0other"), false);
});

Deno.test("isValidUUID - accepts valid v4 UUIDs", () => {
  assertEquals(isValidUUID("550e8400-e29b-41d4-a716-446655440000"), true);
  assertEquals(isValidUUID("6ba7b810-9dad-41d9-80b4-00c04fd430c8"), true);
  assertEquals(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479"), true);
});

Deno.test("isValidUUID - rejects invalid UUIDs", () => {
  assertEquals(isValidUUID(""), false);
  assertEquals(isValidUUID("not-a-uuid"), false);
  assertEquals(isValidUUID("550e8400-e29b-11d4-a716-446655440000"), false); // v1, not v4
  assertEquals(isValidUUID("550e8400-e29b-41d4-c716-446655440000"), false); // invalid variant
  assertEquals(isValidUUID("../../../etc/passwd"), false);
  assertEquals(isValidUUID("550e8400e29b41d4a716446655440000"), false); // no dashes
});

Deno.test("validateTagName - accepts valid tags", () => {
  assertEquals(validateTagName("latest"), true);
  assertEquals(validateTagName("v1.0.0"), true);
  assertEquals(validateTagName("1.0"), true);
  assertEquals(validateTagName("my-tag"), true);
  assertEquals(validateTagName("my_tag"), true);
  assertEquals(validateTagName("my.tag"), true);
  assertEquals(validateTagName("_hidden"), true);
  assertEquals(validateTagName("a"), true);
});

Deno.test("validateTagName - rejects invalid tags", () => {
  assertEquals(validateTagName(""), false);
  assertEquals(validateTagName("-tag"), false); // starts with hyphen
  assertEquals(validateTagName(".tag"), false); // starts with dot
  assertEquals(validateTagName("tag/name"), false); // contains slash
  assertEquals(validateTagName("tag\\name"), false); // contains backslash
  assertEquals(validateTagName("tag\0name"), false); // contains null
  assertEquals(validateTagName(".."), false); // path traversal
});

Deno.test("validateTagName - rejects tags over 128 characters", () => {
  const longTag = "a".repeat(129);
  assertEquals(validateTagName(longTag), false);
  
  const maxTag = "a".repeat(128);
  assertEquals(validateTagName(maxTag), true);
});

Deno.test("REPOSITORY_NAME_ERROR_MESSAGE is defined", () => {
  assertEquals(typeof REPOSITORY_NAME_ERROR_MESSAGE, "string");
  assertEquals(REPOSITORY_NAME_ERROR_MESSAGE.length > 0, true);
});
