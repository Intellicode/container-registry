# Story 012: Chunked Blob Upload

## User Story

**As a** Docker/OCI client\
**I want** to upload large blobs in multiple chunks\
**So that** I can handle unreliable networks and upload very large layers

## Priority

**High** - Phase 2 OCI Compliance

## Description

Implement chunked/streaming blob uploads where clients can send data in multiple
PATCH requests before completing with PUT. This is essential for large layers
and resumable uploads.

## Acceptance Criteria

- [ ] `PATCH /v2/<name>/blobs/uploads/<uuid>` accepts chunk:
  - Appends data to upload session
  - Returns `202 Accepted`
  - Returns `Location` header with upload URL
  - Returns `Range: 0-<offset>` header indicating bytes received
  - Returns `Docker-Upload-UUID` header
- [ ] Multiple PATCH requests can be sent sequentially
- [ ] `Content-Range` header support:
  - Format: `<start>-<end>` (e.g., `0-1023`)
  - Validates range is contiguous with previous data
  - Returns `416 Range Not Satisfiable` if invalid range
- [ ] `PUT /v2/<name>/blobs/uploads/<uuid>?digest=<digest>` completes chunked
      upload:
  - Can include final chunk in body
  - Verifies total content digest
  - Returns `201 Created` on success
- [ ] Upload session tracking in `src/storage/uploads.ts`:
  - Tracks bytes received
  - Stores incremental hash state for resume
  - Stores upload start timestamp
- [ ] Upload session storage:
  ```
  data/uploads/<uuid>/
  ├── data           # Partial upload data
  ├── startedat      # Upload start timestamp  
  └── hashstate      # Incremental hash state
  ```

## Technical Notes

- Use `Content-Length` to know expected chunk size
- Append chunks to temp file in upload directory
- Maintain running SHA-256 hash state for efficiency
- `Content-Range` parsing: `bytes <start>-<end>/<total>` or
  `bytes <start>-<end>`

## API Specification

**First Chunk:**

```http
PATCH /v2/myimage/blobs/uploads/uuid HTTP/1.1
Host: registry.example.com
Content-Type: application/octet-stream
Content-Length: 10240
Content-Range: 0-10239

<chunk data>

HTTP/1.1 202 Accepted
Location: /v2/myimage/blobs/uploads/uuid
Range: 0-10239
Docker-Upload-UUID: uuid
```

**Subsequent Chunk:**

```http
PATCH /v2/myimage/blobs/uploads/uuid HTTP/1.1
Content-Range: 10240-20479

<chunk data>

HTTP/1.1 202 Accepted
Range: 0-20479
```

**Complete Upload:**

```http
PUT /v2/myimage/blobs/uploads/uuid?digest=sha256:abc... HTTP/1.1
Content-Length: 5000

<final chunk>

HTTP/1.1 201 Created
Location: /v2/myimage/blobs/sha256:abc...
Docker-Content-Digest: sha256:abc...
```

## Dependencies

- Story 006: Monolithic Blob Upload
- Story 003: Filesystem Storage Layer
- Story 004: Content Digest Service

## Estimated Effort

Medium (2-3 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify chunk handling
- Integration test uploads multi-GB blob in chunks
- Range validation works correctly
- Digest verification works across chunks
