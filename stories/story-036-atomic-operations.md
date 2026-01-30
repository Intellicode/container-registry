# Story 036: Atomic Operations and Data Integrity

## User Story

**As a** registry operator  
**I want** atomic write operations  
**So that** interrupted operations don't corrupt data

## Priority

**High** - Non-Functional Requirement

## Type

Non-Functional (Reliability)

## Description

Ensure all write operations are atomic to prevent data corruption from crashes, network failures, or interrupted requests.

## Acceptance Criteria

- [ ] Blob uploads are atomic:
  - Write to temp file first
  - Verify digest before rename
  - Rename to final location (atomic on same filesystem)
  - Failed uploads leave no partial files
- [ ] Manifest uploads are atomic:
  - Validate all referenced blobs exist first
  - Write manifest atomically
  - Update tag pointer atomically
- [ ] Upload cancellation cleans up completely
- [ ] Server crash during upload doesn't corrupt storage
- [ ] Concurrent writes to same resource are safe

## Implementation Patterns

```typescript
// Atomic file write pattern
async function atomicWriteFile(path: string, data: Uint8Array): Promise<void> {
  const tempPath = `${path}.tmp.${crypto.randomUUID()}`;
  try {
    await Deno.writeFile(tempPath, data);
    await Deno.rename(tempPath, path);  // Atomic on POSIX
  } catch (error) {
    // Clean up temp file on failure
    try {
      await Deno.remove(tempPath);
    } catch { /* ignore cleanup errors */ }
    throw error;
  }
}

// Atomic blob upload pattern
async function completeUpload(uploadId: string, digest: string): Promise<void> {
  const uploadPath = `uploads/${uploadId}/data`;
  const computedDigest = await computeDigest(uploadPath);
  
  if (computedDigest !== digest) {
    await cleanupUpload(uploadId);
    throw new DigestMismatchError();
  }
  
  const blobPath = getBlobPath(digest);
  await Deno.rename(uploadPath, blobPath);  // Atomic
  await cleanupUpload(uploadId);
}
```

## Verification Tests

```typescript
Deno.test("atomic upload - crash simulation", async () => {
  // Start upload
  const uploadId = await initiateUpload("test/image");
  
  // Write partial data
  await uploadChunk(uploadId, partialData);
  
  // Simulate crash (don't call completeUpload)
  
  // Verify: no blob exists, upload can be cleaned
  assertEquals(await blobExists(expectedDigest), false);
  
  // Cleanup should succeed
  await cleanupExpiredUploads();
  assertEquals(await uploadExists(uploadId), false);
});
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 006: Blob Upload
- Story 008: Manifest Upload

## Estimated Effort

Embedded in other stories (verification: 0.5 days)

## Definition of Done

- All write operations use atomic patterns
- Crash tests verify no corruption
- Concurrent access tests pass
- No orphaned temp files after failures
