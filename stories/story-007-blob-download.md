# Story 007: Blob Download and Existence Check

## User Story

**As a** Docker/OCI client\
**I want** to download blobs and check if they exist\
**So that** I can pull container image layers and optimize uploads

## Priority

**High** - Phase 1 MVP

## Description

Implement blob retrieval and existence checking. Clients use HEAD to check if a
blob exists (to skip uploading duplicates) and GET to download blob content.

## Acceptance Criteria

- [ ] `HEAD /v2/<name>/blobs/<digest>` checks blob existence:
  - Returns `200 OK` if blob exists and is linked to repository
  - Returns `Content-Length` header with blob size
  - Returns `Docker-Content-Digest` header
  - Returns `404 Not Found` with `BLOB_UNKNOWN` error if not found
- [ ] `GET /v2/<name>/blobs/<digest>` downloads blob:
  - Returns `200 OK` with blob content
  - Returns `Content-Length` header
  - Returns `Content-Type: application/octet-stream`
  - Returns `Docker-Content-Digest` header
  - Streams content (doesn't buffer entire blob)
  - Returns `404 Not Found` with `BLOB_UNKNOWN` error if not found
- [ ] Supports `Range` header for partial content (optional but recommended):
  - Returns `206 Partial Content` for range requests
  - Returns `Content-Range` header
- [ ] Invalid digest format returns `DIGEST_INVALID` error
- [ ] Routes defined in `src/routes/blobs.ts`

## Technical Notes

- Blob lookup: check if blob exists in `data/blobs/sha256/<prefix>/<digest>`
- Also verify repository has link to blob (or allow cross-repo access based on
  policy)
- Use Deno's file streaming for efficient large blob transfer
- For Range support, use `Deno.seek()` to start at offset

## API Specification

**Check Existence:**

```http
HEAD /v2/myimage/blobs/sha256:abc123... HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Length: 12345
Docker-Content-Digest: sha256:abc123...
```

**Download Blob:**

```http
GET /v2/myimage/blobs/sha256:abc123... HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Length: 12345
Content-Type: application/octet-stream
Docker-Content-Digest: sha256:abc123...

<blob data>
```

**Range Request (Optional):**

```http
GET /v2/myimage/blobs/sha256:abc123... HTTP/1.1
Host: registry.example.com
Range: bytes=0-1023

HTTP/1.1 206 Partial Content
Content-Length: 1024
Content-Range: bytes 0-1023/12345
Docker-Content-Digest: sha256:abc123...

<partial blob data>
```

## Non-Functional Requirements

- Download throughput should be limited only by disk/network I/O
- Must support concurrent downloads
- Memory usage should not scale with blob size (streaming)

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 004: Content Digest Service
- Story 005: Error Handling

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests cover success and error cases
- Integration test downloads a blob successfully
- Performance test verifies streaming (large blob doesn't spike memory)
