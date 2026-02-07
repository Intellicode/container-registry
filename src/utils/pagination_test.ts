/**
 * Tests for pagination utilities.
 */

import { assertEquals } from "@std/assert";
import { resetConfig } from "../config.ts";
import {
  applyPagination,
  buildPaginationLink,
  parsePaginationParams,
} from "./pagination.ts";

// Reset config before tests to ensure clean state
Deno.test({
  name: "parsePaginationParams - uses default limit when n is not provided",
  fn: () => {
    resetConfig();
    const params = parsePaginationParams(undefined, undefined);
    assertEquals(params.limit, 100); // default from config
    assertEquals(params.last, undefined);
  },
});

Deno.test("parsePaginationParams - parses valid n parameter", () => {
  resetConfig();
  const params = parsePaginationParams("50", undefined);
  assertEquals(params.limit, 50);
});

Deno.test("parsePaginationParams - uses default for invalid n parameter", () => {
  resetConfig();
  assertEquals(parsePaginationParams("-1", undefined).limit, 100);
  assertEquals(parsePaginationParams("0", undefined).limit, 100);
  assertEquals(parsePaginationParams("abc", undefined).limit, 100);
  assertEquals(parsePaginationParams("", undefined).limit, 100);
});

Deno.test("parsePaginationParams - enforces max limit", () => {
  resetConfig();
  const params = parsePaginationParams("5000", undefined);
  assertEquals(params.limit, 1000); // max from config
});

Deno.test("parsePaginationParams - includes last parameter", () => {
  resetConfig();
  const params = parsePaginationParams("10", "myrepo");
  assertEquals(params.limit, 10);
  assertEquals(params.last, "myrepo");
});

Deno.test("buildPaginationLink - builds correct link format", () => {
  const link = buildPaginationLink("/v2/_catalog", 10, "myrepo");
  assertEquals(link, "</v2/_catalog?n=10&last=myrepo>; rel=\"next\"");
});

Deno.test("buildPaginationLink - URL encodes last parameter", () => {
  const link = buildPaginationLink("/v2/test/tags/list", 10, "v1.0.0");
  assertEquals(link, "</v2/test/tags/list?n=10&last=v1.0.0>; rel=\"next\"");
  
  const linkWithSpecial = buildPaginationLink("/v2/_catalog", 10, "org/repo");
  assertEquals(linkWithSpecial, "</v2/_catalog?n=10&last=org%2Frepo>; rel=\"next\"");
});

Deno.test("applyPagination - returns all items when fewer than limit", () => {
  const result = applyPagination(["a", "b", "c"], 10);
  assertEquals(result.items, ["a", "b", "c"]);
  assertEquals(result.hasMore, false);
});

Deno.test("applyPagination - returns all items when equal to limit", () => {
  const result = applyPagination(["a", "b", "c"], 3);
  assertEquals(result.items, ["a", "b", "c"]);
  assertEquals(result.hasMore, false);
});

Deno.test("applyPagination - trims and indicates more when over limit", () => {
  // When we fetch limit + 1, we have more items
  const result = applyPagination(["a", "b", "c", "d"], 3);
  assertEquals(result.items, ["a", "b", "c"]);
  assertEquals(result.hasMore, true);
});

Deno.test("applyPagination - handles empty array", () => {
  const result = applyPagination([], 10);
  assertEquals(result.items, []);
  assertEquals(result.hasMore, false);
});
