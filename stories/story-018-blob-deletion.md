# Story 018: Blob Deletion

## User Story

**As a** registry operator\
**I want** to delete blobs\
**So that** I can free up storage space from orphaned or unwanted content

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement blob deletion endpoint. While typically blobs are cleaned up by
garbage collection, the API should support explicit deletion.

## Acceptance Criteria

- [ ] `DELETE /v2/<name>/blobs/<digest>` deletes blob:
  - Returns `202 Accepted` on success
  - Returns `404 Not Found` with `BLOB_UNKNOWN` if not found
  - Removes blob from repository's layer links
  - Does NOT remove blob from global blob store if other repos reference it
- [ ] Only removes blob entirely if no other repositories reference it
- [ ] Authorization: requires delete permission on repository
- [ ] Invalid digest format returns `DIGEST_INVALID` error
- [ ] Routes defined in `src/routes/blobs.ts`

## Technical Notes

- Blob storage is content-addressable and shared across repositories
- Deletion only removes the repository's link to the blob
- Actual blob file deletion requires checking all repository references
- This could be deferred to garbage collection for safety
- Reference counting or scanning may be needed

## API Specification

**Delete Blob:**

```http
DELETE /v2/myimage/blobs/sha256:abc123... HTTP/1.1
Host: registry.example.com

HTTP/1.1 202 Accepted
```

**Blob Not Found:**

```http
DELETE /v2/myimage/blobs/sha256:notfound... HTTP/1.1
Host: registry.example.com

HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "errors": [{
    "code": "BLOB_UNKNOWN",
    "message": "blob unknown to registry"
  }]
}
```

## Implementation Options

1. **Safe (Recommended)**: Only remove repository link, let GC clean orphaned
   blobs
2. **Immediate**: Check all repos for references before deleting actual blob

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 007: Blob Download
- Story 005: Error Handling

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify deletion behavior
- Integration test deletes blob
- Shared blobs are not accidentally deleted
- Authorization is enforced
