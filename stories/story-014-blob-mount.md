# Story 014: Cross-Repository Blob Mount

## User Story

**As a** Docker/OCI client\
**I want** to mount an existing blob from another repository\
**So that** I can avoid re-uploading identical layers when pushing to different
repos

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement blob mounting that allows clients to reference an existing blob from
another repository without re-uploading the data. This is a major optimization
for organizations with many similar images.

## Acceptance Criteria

- [ ] `POST /v2/<name>/blobs/uploads/?mount=<digest>&from=<repository>` mounts
      blob:
  - If blob exists in source repository and user has access:
    - Returns `201 Created`
    - Returns `Location: /v2/<name>/blobs/<digest>`
    - Returns `Docker-Content-Digest` header
    - Creates layer link in target repository
  - If blob doesn't exist or access denied:
    - Falls back to normal upload initiation
    - Returns `202 Accepted` with upload URL
- [ ] Authorization check: user must have pull access to source repository
- [ ] Only creates link, doesn't copy blob data (deduplication)
- [ ] Works across namespaced repositories (e.g., `org1/image` to `org2/image`)

## Technical Notes

- This is purely a metadata operation - no blob data is copied
- Creates symlink/link file in target repo's `_layers/` directory
- The blob storage is already content-addressable and deduplicated
- Must verify blob actually exists in source repo (not just in global blob
  store)

## API Specification

**Successful Mount:**

```http
POST /v2/myorg/newimage/blobs/uploads/?mount=sha256:abc...&from=myorg/baseimage HTTP/1.1
Host: registry.example.com

HTTP/1.1 201 Created
Location: /v2/myorg/newimage/blobs/sha256:abc...
Docker-Content-Digest: sha256:abc...
```

**Fallback to Upload (blob not found):**

```http
POST /v2/myorg/newimage/blobs/uploads/?mount=sha256:missing...&from=myorg/baseimage HTTP/1.1
Host: registry.example.com

HTTP/1.1 202 Accepted
Location: /v2/myorg/newimage/blobs/uploads/uuid-here
Docker-Upload-UUID: uuid-here
Range: 0-0
```

## Dependencies

- Story 006: Monolithic Blob Upload
- Story 003: Filesystem Storage Layer

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify mount success and fallback
- Integration test mounts blob across repositories
- No data duplication occurs
- Authorization is checked
