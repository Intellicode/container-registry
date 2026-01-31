/**
 * Content Digest Service
 *
 * Implements OCI-compliant content digest calculation and verification
 * using SHA-256 (default) and SHA-512 algorithms for content-addressable storage.
 */

/**
 * Parsed digest structure following OCI spec
 */
export interface ParsedDigest {
  algorithm: "sha256" | "sha512";
  hash: string;
}

/**
 * Supported hash algorithms
 */
const SUPPORTED_ALGORITHMS = ["sha256", "sha512"] as const;

/**
 * Calculate digest from various input types
 *
 * @param content - Content to hash (ReadableStream, Uint8Array, or string)
 * @param algorithm - Hash algorithm to use (defaults to "sha256")
 * @returns OCI-formatted digest string (e.g., "sha256:abc123...")
 */
export async function calculateDigest(
  content: ReadableStream<Uint8Array> | Uint8Array | string,
  algorithm: "sha256" | "sha512" = "sha256",
): Promise<string> {
  let data: Uint8Array;

  if (content instanceof ReadableStream) {
    // Note: Buffers stream content in memory. Web Crypto API requires full data upfront.
    // For true streaming with large files, consider incremental hash implementations.
    data = await streamToUint8Array(content);
  } else if (typeof content === "string") {
    // Convert string to Uint8Array
    data = new TextEncoder().encode(content);
  } else {
    // Ensure Uint8Array is backed by ArrayBuffer (not SharedArrayBuffer) for Web Crypto API
    data = new Uint8Array(content);
  }

  // Use Web Crypto API for hashing
  const cryptoAlgorithm = algorithm === "sha256" ? "SHA-256" : "SHA-512";
  const hashBuffer = await crypto.subtle.digest(
    cryptoAlgorithm,
    data as BufferSource,
  );
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${algorithm}:${hashHex}`;
}

/**
 * Convert ReadableStream to Uint8Array efficiently
 *
 * @param stream - Input stream
 * @returns Complete content as Uint8Array
 */
async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Copy the chunk to ensure it's backed by ArrayBuffer
      chunks.push(new Uint8Array(value));
      totalLength += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  // Combine all chunks into single Uint8Array with proper ArrayBuffer
  const buffer = new ArrayBuffer(totalLength);
  const result = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Parse and validate a digest string
 *
 * @param digest - Digest string to parse (e.g., "sha256:abc123...")
 * @returns Parsed digest object or null if invalid
 */
export function parseDigest(digest: string): ParsedDigest | null {
  if (!digest || typeof digest !== "string") {
    return null;
  }

  const parts = digest.split(":");
  if (parts.length !== 2) {
    return null;
  }

  const [algorithm, hash] = parts;

  // Validate algorithm
  if (
    !SUPPORTED_ALGORITHMS.includes(
      algorithm as typeof SUPPORTED_ALGORITHMS[number],
    )
  ) {
    return null;
  }

  // Validate hash format
  const expectedLength = algorithm === "sha256" ? 64 : 128;
  if (hash.length !== expectedLength || !/^[a-f0-9]+$/.test(hash)) {
    return null;
  }

  return {
    algorithm: algorithm as "sha256" | "sha512",
    hash,
  };
}

/**
 * Validate if a digest string is well-formed
 *
 * @param digest - Digest string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDigest(digest: string): boolean {
  return parseDigest(digest) !== null;
}

/**
 * Verify that content matches expected digest
 * Uses constant-time comparison to prevent timing attacks
 *
 * @param content - Content to verify
 * @param expectedDigest - Expected digest string
 * @returns true if content matches digest, false otherwise
 */
export async function verifyDigest(
  content: ReadableStream<Uint8Array> | Uint8Array | string,
  expectedDigest: string,
): Promise<boolean> {
  // Parse and validate the expected digest format
  const parsed = parseDigest(expectedDigest);
  if (!parsed) {
    return false;
  }

  // Calculate actual digest using the same algorithm as the expected digest
  const actualDigest = await calculateDigest(content, parsed.algorithm);

  // Constant-time comparison to prevent timing attacks
  return constantTimeEqual(actualDigest, expectedDigest);
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
function constantTimeEqual(a: string, b: string): boolean {
  // Always compare the maximum length to avoid timing leak from early return
  const len = Math.max(a.length, b.length);

  let result = 0;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }

  return result === 0 && a.length === b.length;
}

/**
 * Create a TransformStream that calculates digest while passing through data
 * Note: Buffers all chunks in memory before calculating digest in flush().
 * Memory usage is proportional to total content size.
 *
 * @param algorithm - Hash algorithm to use (defaults to "sha256")
 * @returns Object containing the transform stream and a promise for the digest
 */
export function createDigestStream(
  algorithm: "sha256" | "sha512" = "sha256",
): {
  stream: TransformStream<Uint8Array, Uint8Array>;
  digest: Promise<string>;
} {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let resolveDigest: (digest: string) => void;

  const digestPromise = new Promise<string>((resolve) => {
    resolveDigest = resolve;
  });

  const stream = new TransformStream({
    transform(chunk, controller) {
      // Store chunk for digest calculation
      chunks.push(new Uint8Array(chunk));
      totalLength += chunk.length;
      // Pass through unchanged
      controller.enqueue(chunk);
    },
    async flush() {
      // Calculate digest when stream completes
      const buffer = new ArrayBuffer(totalLength);
      const combined = new Uint8Array(buffer);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Calculate digest using specified algorithm
      const cryptoAlgorithm = algorithm === "sha256" ? "SHA-256" : "SHA-512";
      const hashBuffer = await crypto.subtle.digest(cryptoAlgorithm, combined);
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      resolveDigest(`${algorithm}:${hashHex}`);
    },
  });

  return { stream, digest: digestPromise };
}
