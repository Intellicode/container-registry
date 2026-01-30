# Story 004: Content Digest Service

## User Story

**As a** registry  
**I want** to calculate and verify content digests  
**So that** I can ensure blob integrity and implement content-addressable storage

## Priority

**High** - Phase 1 MVP (Blocking)

## Description

Implement a digest calculation service that computes SHA-256 hashes for content verification. This service is used during blob uploads to verify content integrity and generate content-addressable storage keys.

## Acceptance Criteria

- [ ] Digest service implemented in `src/services/digest.ts`
- [ ] Supports SHA-256 algorithm (required by OCI spec)
- [ ] Can compute digest from:
  - `ReadableStream`
  - `Uint8Array`
  - `string`
- [ ] Digest format follows OCI spec: `sha256:<64-char-hex>`
- [ ] Provides digest parsing/validation:
  ```typescript
  interface ParsedDigest {
    algorithm: "sha256" | "sha512";
    hash: string;
  }
  
  function parseDigest(digest: string): ParsedDigest | null;
  function isValidDigest(digest: string): boolean;
  ```
- [ ] Streaming digest computation (doesn't buffer entire content)
- [ ] Digest verification function:
  ```typescript
  function verifyDigest(content: ReadableStream, expectedDigest: string): Promise<boolean>;
  ```

## Technical Notes

- Use Web Crypto API (`crypto.subtle.digest`) available in Deno
- For streaming, use incremental hashing with TransformStream
- Digest comparison should be constant-time to prevent timing attacks

## API

```typescript
// Calculate digest from stream
const digest = await calculateDigest(stream); 
// Returns: "sha256:abc123..."

// Parse and validate digest string
const parsed = parseDigest("sha256:abc123...");
// Returns: { algorithm: "sha256", hash: "abc123..." }

// Verify content matches digest
const isValid = await verifyDigest(stream, "sha256:abc123...");
// Returns: true/false
```

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests cover all functions
- Tests verify correct SHA-256 computation against known test vectors
- Tests verify streaming works for large content
- Performance test confirms streaming doesn't buffer
