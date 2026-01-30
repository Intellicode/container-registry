# Story 026: Garbage Collection

## User Story

**As a** registry operator  
**I want** to clean up orphaned blobs  
**So that** storage space is reclaimed after image deletions

## Priority

**High** - Phase 3 Production Readiness

## Description

Implement garbage collection to identify and remove blobs that are no longer referenced by any manifest. This can run on-demand or on a schedule.

## Acceptance Criteria

- [ ] GC identifies orphaned blobs:
  - Blob not referenced by any manifest in any repository
  - Blob not part of any active upload session
- [ ] GC modes:
  - **Dry run**: Report what would be deleted without deleting
  - **Delete**: Actually remove orphaned blobs
- [ ] CLI command: `deno task gc`
  - `--dry-run` flag for safe preview
  - Output shows blobs to be/being deleted with sizes
- [ ] Scheduled GC (optional):
  - Configurable cron schedule
  - Runs automatically in background
- [ ] GC is safe during registry operation:
  - Don't delete blobs being actively uploaded
  - Use mark-and-sweep or similar safe algorithm
- [ ] Report GC results:
  - Number of blobs deleted
  - Total space reclaimed
  - Duration

## Technical Notes

- Mark phase: Find all blobs referenced by any manifest
- Sweep phase: Delete blobs not in the marked set
- Consider blob age threshold (don't delete recently uploaded)
- Lock or pause uploads during sweep (or use safe algorithm)
- Run GC during low-traffic periods

## Algorithm

```
1. Scan all manifests in all repositories
2. Build set of all referenced blobs (config + layers)
3. Scan all blobs in blob storage
4. For each blob not in referenced set:
   a. Check blob age (skip if recent)
   b. Check active uploads (skip if in progress)
   c. Delete blob
5. Report results
```

## CLI Interface

```bash
# Dry run - see what would be deleted
deno task gc --dry-run

# Output:
# Garbage Collection (dry run)
# Found 150 total blobs
# Found 120 referenced blobs
# Would delete 30 orphaned blobs
# Would reclaim 2.5 GB

# Actual deletion
deno task gc

# Output:
# Garbage Collection
# Deleted 30 orphaned blobs
# Reclaimed 2.5 GB
# Duration: 45s
```

## Configuration

```typescript
gc: {
  enabled: boolean;      // Enable scheduled GC
  schedule: string;      // Cron expression (e.g., "0 3 * * *")
  dryRun: boolean;       // Default to dry-run for safety
  minAge: number;        // Don't delete blobs newer than N seconds
}
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 019: Upload Session Cleanup

## Estimated Effort

Medium (2-3 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify GC logic
- Integration test verifies orphaned blobs are deleted
- Active uploads are not affected
- Dry run shows accurate preview
