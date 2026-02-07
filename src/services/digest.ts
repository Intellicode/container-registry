/**
 * Content Digest Service
 *
 * Implements OCI-compliant content digest calculation and verification
 * using SHA-256 (default) and SHA-512 algorithms for content-addressable storage.
 */

import { encodeHex } from "@std/encoding/hex";
import { crypto as stdCrypto } from "@std/crypto";

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
  const cryptoAlgorithm = algorithm === "sha256" ? "SHA-256" : "SHA-512";
  let hashBuffer: ArrayBuffer;

  if (content instanceof ReadableStream) {
    hashBuffer = await stdCrypto.subtle.digest(
      cryptoAlgorithm,
      content as ReadableStream<Uint8Array<ArrayBuffer>>,
    );
  } else if (typeof content === "string") {
    const data = new TextEncoder().encode(content);
    hashBuffer = await stdCrypto.subtle.digest(
      cryptoAlgorithm,
      data as Uint8Array<ArrayBuffer>,
    );
  } else {
    hashBuffer = await stdCrypto.subtle.digest(
      cryptoAlgorithm,
      content as Uint8Array<ArrayBuffer>,
    );
  }

  const hashHex = encodeHex(new Uint8Array(hashBuffer));
  return `${algorithm}:${hashHex}`;
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
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  const [localStream, outputStream] = ts.readable.tee();
  const cryptoAlgorithm = algorithm === "sha256" ? "SHA-256" : "SHA-512";

  const digestPromise = stdCrypto.subtle.digest(
    cryptoAlgorithm,
    localStream as ReadableStream<Uint8Array<ArrayBuffer>>,
  )
    .then((hashBuffer: ArrayBuffer) => {
      const hashHex = encodeHex(new Uint8Array(hashBuffer));
      return `${algorithm}:${hashHex}`;
    });

  return {
    stream: {
      writable: ts.writable,
      readable: outputStream,
    },
    digest: digestPromise,
  };
}
