# Story 035: Streaming and Memory Efficiency

## User Story

**As a** registry operator\
**I want** efficient memory usage for large blobs\
**So that** the registry can handle multi-gigabyte images without running out of
memory

## Priority

**High** - Non-Functional Requirement

## Type

Non-Functional (Performance)

## Description

Ensure all blob operations use streaming to prevent memory exhaustion when
handling large container images.

## Acceptance Criteria

- [ ] Blob uploads stream directly to disk (no full buffering)
- [ ] Blob downloads stream from disk (no full buffering)
- [ ] Digest calculation uses streaming/incremental hashing
- [ ] Memory usage stays constant regardless of blob size
- [ ] Concurrent operations don't multiply memory usage
- [ ] Idle memory usage < 50MB (as per PRD)

## Technical Requirements

- Use `ReadableStream` and `WritableStream` throughout
- Use `TransformStream` for digest computation during upload
- Use Deno's native file streaming APIs
- Avoid `Uint8Array` buffers for entire blobs
- Set appropriate chunk sizes (e.g., 64KB-1MB)

## Performance Targets

| Metric                              | Target  |
| ----------------------------------- | ------- |
| Memory (idle)                       | < 50MB  |
| Memory (100 concurrent 1GB uploads) | < 500MB |
| Memory (single 10GB blob)           | < 100MB |

## Verification Tests

```typescript
Deno.test("memory efficiency - large blob upload", async () => {
  const initialMemory = Deno.memoryUsage().heapUsed;

  // Upload 1GB blob
  await uploadBlob(createLargeStream(1024 * 1024 * 1024));

  const finalMemory = Deno.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;

  // Should not increase by more than 50MB
  assert(memoryIncrease < 50 * 1024 * 1024);
});
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 006: Blob Upload
- Story 007: Blob Download

## Estimated Effort

Embedded in other stories (verification: 0.5 days)

## Definition of Done

- Memory stays constant for large blobs
- Performance tests verify streaming behavior
- Profiling confirms no memory leaks
- Concurrent operations are memory-efficient
