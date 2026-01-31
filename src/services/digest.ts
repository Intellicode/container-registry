/**
 * Content Digest Service
 * 
 * Implements OCI-compliant content digest calculation and verification
 * using SHA-256 algorithm for content-addressable storage.
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
 * @returns OCI-formatted digest string (e.g., "sha256:abc123...")
 */
export async function calculateDigest(
  content: ReadableStream<Uint8Array> | Uint8Array | string,
): Promise<string> {
  let data: Uint8Array<ArrayBuffer>;

  if (content instanceof ReadableStream) {
    // Streaming digest computation without buffering entire content
    data = await streamToUint8Array(content);
  } else if (typeof content === "string") {
    // Convert string to Uint8Array
    data = new TextEncoder().encode(content);
  } else {
    // Already Uint8Array - but ensure it's a proper ArrayBuffer-backed one
    const buffer = new ArrayBuffer(content.length);
    data = new Uint8Array(buffer);
    data.set(content);
  }

  // Use Web Crypto API for SHA-256 hashing
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hashHex}`;
}

/**
 * Convert ReadableStream to Uint8Array efficiently
 * 
 * @param stream - Input stream
 * @returns Complete content as Uint8Array
 */
async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
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
  if (!SUPPORTED_ALGORITHMS.includes(algorithm as typeof SUPPORTED_ALGORITHMS[number])) {
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
  // First validate the expected digest format
  if (!isValidDigest(expectedDigest)) {
    return false;
  }

  // Calculate actual digest
  const actualDigest = await calculateDigest(content);

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
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create a TransformStream that calculates digest while passing through data
 * Useful for streaming scenarios where you need both the data and its digest
 * 
 * @returns Object containing the transform stream and a promise for the digest
 */
export function createDigestStream(): {
  stream: TransformStream<Uint8Array, Uint8Array>;
  digest: Promise<string>;
} {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let resolveDigest: (digest: string) => void;

  const digestPromise = new Promise<string>((resolve) => {
    resolveDigest = resolve;
  });

  const stream = new TransformStream<Uint8Array, Uint8Array>({
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

      // Calculate digest
      const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      resolveDigest(`sha256:${hashHex}`);
    },
  });

  return { stream, digest: digestPromise };
}
