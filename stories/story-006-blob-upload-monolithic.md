# Story 006: Monolithic Blob Upload

## User Story

**As a** Docker/OCI client  
**I want** to upload blobs to the registry in a single request  
**So that** I can push container image layers efficiently

## Priority

**High** - Phase 1 MVP

## Description

Implement the blob upload flow for monolithic (single-request) uploads. This is the simplest upload method and sufficient for most use cases. The flow consists of: initiate upload -> complete upload with content.

## Acceptance Criteria

- [ ] `POST /v2/<name>/blobs/uploads/` initiates upload session:
  - Returns `202 Accepted`
  - Returns `Location` header with upload URL: `/v2/<name>/blobs/uploads/<uuid>`
  - Returns `Docker-Upload-UUID` header
  - Returns `Range: 0-0` header
- [ ] `PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest>` completes upload:
  - Accepts blob content in request body
  - Verifies computed digest matches provided digest
  - Stores blob in content-addressable storage
  - Creates repository layer link
  - Returns `201 Created`
  - Returns `Location` header: `/v2/<name>/blobs/<digest>`
  - Returns `Docker-Content-Digest` header
- [ ] Upload session stored in `data/uploads/<uuid>/`
- [ ] Invalid digest returns `DIGEST_INVALID` error
- [ ] Non-existent upload UUID returns `BLOB_UPLOAD_UNKNOWN` error
- [ ] Invalid repository name returns `NAME_INVALID` error
- [ ] Routes defined in `src/routes/blobs.ts`
- [ ] Supports repository names with namespaces (e.g., `myorg/myimage`)

## Technical Notes

- UUID generation: use `crypto.randomUUID()`
- Stream blob directly to temp file, compute digest while streaming
- Only move to final location after digest verification
- Repository name validation regex: `[a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*`

## API Specification

**Initiate Upload:**
```http
POST /v2/myimage/blobs/uploads/ HTTP/1.1
Host: registry.example.com

HTTP/1.1 202 Accepted
Location: /v2/myimage/blobs/uploads/uuid-here
Docker-Upload-UUID: uuid-here
Range: 0-0
```

**Complete Upload:**
```http
PUT /v2/myimage/blobs/uploads/uuid-here?digest=sha256:abc123... HTTP/1.1
Host: registry.example.com
Content-Type: application/octet-stream
Content-Length: 1234

<blob data>

HTTP/1.1 201 Created
Location: /v2/myimage/blobs/sha256:abc123...
Docker-Content-Digest: sha256:abc123...
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 004: Content Digest Service
- Story 005: Error Handling

## Estimated Effort

Medium (2 days)

## Definition of Done

- All acceptance criteria met
- Unit tests cover happy path and error cases
- Integration test with curl verifies full flow
- Can upload a real Docker image layer
