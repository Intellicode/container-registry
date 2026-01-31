# Story 037: Horizontal Scalability Design

## User Story

**As a** platform engineer\
**I want** to run multiple registry instances\
**So that** I can scale horizontally for high availability

## Priority

**Medium** - Non-Functional Requirement

## Type

Non-Functional (Scalability)

## Description

Ensure the registry design supports horizontal scaling with multiple instances
sharing storage (e.g., NFS, object storage).

## Acceptance Criteria

- [ ] Stateless request handling:
  - No in-memory session state between requests
  - Upload state stored in shared storage
  - Any instance can handle any request
- [ ] Safe concurrent access:
  - Multiple instances can read same blobs
  - Multiple instances can upload different blobs
  - Proper locking for conflicting writes (or last-write-wins)
- [ ] Load balancer compatible:
  - Any request can go to any instance
  - No sticky sessions required
  - Health checks support load balancer probing
- [ ] Shared storage requirements documented:
  - POSIX filesystem semantics
  - Atomic rename support
  - Consistent read-after-write

## Design Considerations

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Registry   │     │  Registry   │     │  Registry   │
│  Instance 1 │     │  Instance 2 │     │  Instance 3 │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────┴──────┐
                    │   Shared    │
                    │   Storage   │
                    │  (NFS/EFS)  │
                    └─────────────┘
```

## Concurrency Handling

- **Blob uploads**: Each upload uses unique UUID, no conflicts
- **Same blob concurrent upload**: Both compute same digest, both succeed
- **Manifest update**: Last write wins (or use file locking)
- **Tag update**: Atomic file operations

## Verification Tests

```typescript
Deno.test("horizontal scaling - concurrent uploads", async () => {
  // Simulate two instances uploading same blob
  const instance1 = createRegistry({ storage: sharedPath });
  const instance2 = createRegistry({ storage: sharedPath });

  const blob = generateBlob(1024 * 1024);

  // Upload same blob from both instances
  await Promise.all([
    instance1.uploadBlob("test/image", blob),
    instance2.uploadBlob("test/image", blob),
  ]);

  // Blob should exist and be valid
  const retrieved = await instance1.getBlob("test/image", blobDigest);
  assertEquals(await computeDigest(retrieved), blobDigest);
});
```

## Documentation Required

- Shared storage requirements
- Load balancer configuration
- Kubernetes deployment example
- Known limitations

## Dependencies

- Story 003: Filesystem Storage Layer

## Estimated Effort

Design consideration (0.5 days documentation)

## Definition of Done

- Stateless design verified
- Concurrent access tests pass
- Documentation for horizontal scaling
- No instance-specific state
