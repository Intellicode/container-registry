# Story 013: Upload Session Status and Resume

## User Story

**As a** Docker/OCI client  
**I want** to check upload status and resume interrupted uploads  
**So that** I don't have to restart large uploads from scratch after network failures

## Priority

**High** - Phase 2 OCI Compliance

## Description

Implement upload session status checking so clients can query how much data has been received and resume from that point.

## Acceptance Criteria

- [ ] `GET /v2/<name>/blobs/uploads/<uuid>` returns upload status:
  - Returns `204 No Content`
  - Returns `Location` header with upload URL
  - Returns `Range: 0-<offset>` header with bytes received
  - Returns `Docker-Upload-UUID` header
  - Returns `404 Not Found` with `BLOB_UPLOAD_UNKNOWN` if session doesn't exist
- [ ] Client can resume upload by:
  1. GET status to find current offset
  2. PATCH with remaining data starting at offset
  3. PUT to complete
- [ ] Upload session persists across server restarts
- [ ] Hash state is saved incrementally for resume:
  - Stored in `data/uploads/<uuid>/hashstate`
  - Can restore SHA-256 computation state

## Technical Notes

- Hash state serialization: Deno's Web Crypto doesn't support serializing hash state
- Alternative: Store chunks separately and recompute on resume, or use a library that supports incremental hashing with state export
- Consider storing chunk boundaries for verification

## API Specification

**Check Status:**
```http
GET /v2/myimage/blobs/uploads/uuid HTTP/1.1
Host: registry.example.com

HTTP/1.1 204 No Content
Location: /v2/myimage/blobs/uploads/uuid
Range: 0-10239
Docker-Upload-UUID: uuid
```

**Resume Upload:**
```http
PATCH /v2/myimage/blobs/uploads/uuid HTTP/1.1
Content-Range: 10240-20479

<remaining data>

HTTP/1.1 202 Accepted
Range: 0-20479
```

## Dependencies

- Story 012: Chunked Blob Upload

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify status response
- Integration test simulates interrupted upload and resume
- Upload survives server restart
