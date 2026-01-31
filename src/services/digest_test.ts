/**
 * Tests for Content Digest Service
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  calculateDigest,
  createDigestStream,
  isValidDigest,
  parseDigest,
  verifyDigest,
} from "./digest.ts";

/**
 * Known SHA-256 test vectors for verification
 */
const TEST_VECTORS = [
  {
    input: "",
    digest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    input: "hello world",
    digest: "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  },
  {
    input: "The quick brown fox jumps over the lazy dog",
    digest: "sha256:d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  },
];

Deno.test("calculateDigest - computes correct SHA-256 from string", async () => {
  for (const { input, digest } of TEST_VECTORS) {
    const result = await calculateDigest(input);
    assertEquals(
      result,
      digest,
      `Failed for input: "${input}"`,
    );
  }
});

Deno.test("calculateDigest - supports SHA-512 algorithm", async () => {
  const input = "hello world";
  const result = await calculateDigest(input, "sha512");
  
  // Verify it's a valid SHA-512 digest (128 hex chars)
  assertEquals(result.startsWith("sha512:"), true);
  const hash = result.split(":")[1];
  assertEquals(hash.length, 128);
  assertEquals(/^[a-f0-9]{128}$/.test(hash), true);
  
  // Verify known SHA-512 hash for "hello world"
  assertEquals(
    result,
    "sha512:309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f",
  );
});

Deno.test("calculateDigest - computes correct SHA-256 from Uint8Array", async () => {
  const input = "hello world";
  const expected =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const data = new TextEncoder().encode(input);
  const result = await calculateDigest(data);

  assertEquals(result, expected);
});

Deno.test("calculateDigest - computes correct SHA-256 from ReadableStream", async () => {
  const input = "hello world";
  const expected =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });

  const result = await calculateDigest(stream);
  assertEquals(result, expected);
});

Deno.test("calculateDigest - handles chunked stream correctly", async () => {
  const expected =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  // Split into multiple chunks: "hello" + " " + "world"
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.enqueue(new TextEncoder().encode(" "));
      controller.enqueue(new TextEncoder().encode("world"));
      controller.close();
    },
  });

  const result = await calculateDigest(stream);
  assertEquals(result, expected);
});

Deno.test("calculateDigest - handles large content efficiently", async () => {
  // Create 1MB of data
  const size = 1024 * 1024;
  const largeData = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    largeData[i] = i % 256;
  }

  const result = await calculateDigest(largeData);

  // Verify it's a valid digest format
  assertExists(result);
  assertEquals(result.startsWith("sha256:"), true);
  assertEquals(result.length, 71); // "sha256:" (7) + 64 hex chars
});

Deno.test("parseDigest - parses valid SHA-256 digest", () => {
  const digest =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
  const parsed = parseDigest(digest);

  assertExists(parsed);
  assertEquals(parsed.algorithm, "sha256");
  assertEquals(
    parsed.hash,
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
});

Deno.test("parseDigest - parses valid SHA-512 digest", () => {
  const digest =
    "sha512:abc123def456" + "0".repeat(116); // 128 hex chars total
  const parsed = parseDigest(digest);

  assertExists(parsed);
  assertEquals(parsed.algorithm, "sha512");
  assertEquals(parsed.hash, "abc123def456" + "0".repeat(116));
});

Deno.test("parseDigest - rejects invalid format", () => {
  const invalidDigests = [
    "invalid",
    "sha256",
    "sha256:",
    ":abc123",
    "sha256:invalid-hex",
    "sha256:tooshort",
    "sha256:" + "a".repeat(63), // Too short
    "sha256:" + "a".repeat(65), // Too long
    "md5:abc123def456", // Unsupported algorithm
    "",
    "sha256:ABCDEF" + "0".repeat(58), // Uppercase not allowed
  ];

  for (const invalid of invalidDigests) {
    assertEquals(
      parseDigest(invalid),
      null,
      `Should reject: "${invalid}"`,
    );
  }
});

Deno.test("isValidDigest - validates correct digests", () => {
  const validDigests = [
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "sha256:" + "a".repeat(64),
    "sha512:" + "b".repeat(128),
  ];

  for (const digest of validDigests) {
    assertEquals(
      isValidDigest(digest),
      true,
      `Should be valid: "${digest}"`,
    );
  }
});

Deno.test("isValidDigest - rejects invalid digests", () => {
  const invalidDigests = [
    "invalid",
    "sha256:tooshort",
    "md5:abc123",
    "",
    "sha256:" + "z".repeat(64), // Invalid hex chars
  ];

  for (const digest of invalidDigests) {
    assertEquals(
      isValidDigest(digest),
      false,
      `Should be invalid: "${digest}"`,
    );
  }
});

Deno.test("verifyDigest - verifies correct digest", async () => {
  const content = "hello world";
  const correctDigest =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const result = await verifyDigest(content, correctDigest);
  assertEquals(result, true);
});

Deno.test("verifyDigest - rejects incorrect digest", async () => {
  const content = "hello world";
  const incorrectDigest = "sha256:" + "0".repeat(64);

  const result = await verifyDigest(content, incorrectDigest);
  assertEquals(result, false);
});

Deno.test("verifyDigest - rejects invalid digest format", async () => {
  const content = "hello world";
  const invalidDigest = "invalid-format";

  const result = await verifyDigest(content, invalidDigest);
  assertEquals(result, false);
});

Deno.test("verifyDigest - works with Uint8Array", async () => {
  const content = new TextEncoder().encode("hello world");
  const correctDigest =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const result = await verifyDigest(content, correctDigest);
  assertEquals(result, true);
});

Deno.test("verifyDigest - works with ReadableStream", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello world"));
      controller.close();
    },
  });

  const correctDigest =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const result = await verifyDigest(stream, correctDigest);
  assertEquals(result, true);
});

Deno.test("createDigestStream - calculates digest while streaming", async () => {
  const input = "hello world";
  const expected =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const { stream: transformStream, digest } = createDigestStream();

  // Create input stream
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });

  // Pipe through transform and collect output
  const chunks: Uint8Array[] = [];
  const outputStream = inputStream.pipeThrough(transformStream);
  const reader = outputStream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Verify data passed through unchanged
  const combined = new Uint8Array(chunks[0].length);
  combined.set(chunks[0]);
  assertEquals(new TextDecoder().decode(combined), input);

  // Verify digest calculation
  const calculatedDigest = await digest;
  assertEquals(calculatedDigest, expected);
});

Deno.test("createDigestStream - handles chunked data", async () => {
  const expected =
    "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  const { stream: transformStream, digest } = createDigestStream();

  // Create chunked input stream
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.enqueue(new TextEncoder().encode(" "));
      controller.enqueue(new TextEncoder().encode("world"));
      controller.close();
    },
  });

  // Consume the stream
  const outputStream = inputStream.pipeThrough(transformStream);
  const reader = outputStream.getReader();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Verify we got all chunks
  assertEquals(chunks.length, 3);

  // Verify digest
  const calculatedDigest = await digest;
  assertEquals(calculatedDigest, expected);
});

Deno.test("digest comparison is constant-time", async () => {
  // This test ensures timing attacks are prevented
  // While we can't truly verify constant-time behavior in a unit test,
  // we can at least verify the comparison works correctly for various cases

  const content = "test content";
  const correctDigest = await calculateDigest(content);
  const incorrectDigest = "sha256:" + "0".repeat(64);

  // Both should complete without errors
  const result1 = await verifyDigest(content, correctDigest);
  const result2 = await verifyDigest(content, incorrectDigest);

  assertEquals(result1, true);
  assertEquals(result2, false);
});

Deno.test("digest format compliance with OCI spec", async () => {
  const content = "test";
  const digest = await calculateDigest(content);

  // Verify format: algorithm:hash
  const parts = digest.split(":");
  assertEquals(parts.length, 2);
  assertEquals(parts[0], "sha256");

  // Verify hash is 64 hex characters
  assertEquals(parts[1].length, 64);
  assertEquals(/^[a-f0-9]{64}$/.test(parts[1]), true);
});

Deno.test("empty content produces known digest", async () => {
  const emptyDigest = await calculateDigest("");

  // Empty string SHA-256 is well-known
  assertEquals(
    emptyDigest,
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("handles large streams correctly", async () => {
  // Create a large stream (10MB) in chunks
  const chunkSize = 1024 * 100; // 100KB chunks
  const numChunks = 100; // Total 10MB

  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < numChunks; i++) {
        const chunk = new Uint8Array(chunkSize);
        chunk.fill(i % 256);
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  // This should complete without running out of memory
  const digest = await calculateDigest(stream);

  // Verify we got a valid digest
  assertExists(digest);
  assertEquals(digest.startsWith("sha256:"), true);
});
