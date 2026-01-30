# Story 017: Manifest Deletion

## User Story

**As a** registry operator  
**I want** to delete image manifests  
**So that** I can remove old or unwanted images from the registry

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement manifest deletion by digest. Tags can be removed by deleting the manifest they reference. This is necessary for image lifecycle management.

## Acceptance Criteria

- [ ] `DELETE /v2/<name>/manifests/<reference>` deletes manifest:
  - Reference must be a digest (not tag name per OCI spec)
  - Returns `202 Accepted` on success
  - Returns `404 Not Found` with `MANIFEST_UNKNOWN` if not found
  - Returns `400 Bad Request` if reference is a tag (not digest)
- [ ] Deletion removes:
  - Manifest from revisions: `_manifests/revisions/sha256/<digest>/`
  - All tags pointing to this digest: `_manifests/tags/<tag>/current/link`
- [ ] Layer links are NOT removed (garbage collection handles orphaned blobs)
- [ ] Authorization: requires delete permission on repository
- [ ] Routes defined in `src/routes/manifests.ts`

## Technical Notes

- OCI spec requires deletion by digest, not tag
- To "delete a tag", client must resolve tag to digest, then delete digest
- Manifest deletion may orphan blobs - separate GC process cleans these
- Consider soft-delete for safety (mark deleted, GC removes later)

## API Specification

**Delete Manifest:**
```http
DELETE /v2/myimage/manifests/sha256:abc123... HTTP/1.1
Host: registry.example.com

HTTP/1.1 202 Accepted
```

**Manifest Not Found:**
```http
DELETE /v2/myimage/manifests/sha256:notfound... HTTP/1.1
Host: registry.example.com

HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "errors": [{
    "code": "MANIFEST_UNKNOWN",
    "message": "manifest unknown to registry"
  }]
}
```

**Invalid Reference (Tag):**
```http
DELETE /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com

HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "errors": [{
    "code": "UNSUPPORTED",
    "message": "deletion by tag is not supported, use digest"
  }]
}
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 008: Manifest Upload
- Story 005: Error Handling

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify deletion behavior
- Integration test deletes manifest and verifies tags removed
- Authorization is enforced
- Orphaned blobs are left for GC
