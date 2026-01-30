# Story 008: Manifest Upload

## User Story

**As a** Docker/OCI client  
**I want** to upload image manifests  
**So that** I can complete the image push and make it available for pulling

## Priority

**High** - Phase 1 MVP

## Description

Implement manifest upload functionality. Manifests describe the image structure including config and layer references. The registry must validate manifests and verify all referenced blobs exist.

## Acceptance Criteria

- [ ] `PUT /v2/<name>/manifests/<reference>` uploads manifest:
  - Accepts JSON manifest in request body
  - Reference can be tag name (e.g., `latest`) or digest
  - Returns `201 Created` on success
  - Returns `Location` header: `/v2/<name>/manifests/<digest>`
  - Returns `Docker-Content-Digest` header with manifest digest
- [ ] Manifest validation:
  - JSON is valid and parseable
  - Required fields present based on media type
  - All referenced blobs (config + layers) exist in registry
  - Returns `MANIFEST_INVALID` if validation fails
  - Returns `MANIFEST_BLOB_UNKNOWN` if referenced blob missing
- [ ] Supported media types:
  - `application/vnd.oci.image.manifest.v1+json`
  - `application/vnd.docker.distribution.manifest.v2+json`
  - `application/vnd.oci.image.index.v1+json` (manifest list)
  - `application/vnd.docker.distribution.manifest.list.v2+json`
- [ ] Content-Type header must match manifest type
- [ ] Manifest stored by digest in revisions
- [ ] Tag reference creates/updates tag link
- [ ] OCI types defined in `src/types/oci.ts`
- [ ] Routes defined in `src/routes/manifests.ts`

## Technical Notes

- Manifest digest is SHA-256 of the raw JSON bytes
- Store manifest content as-is (preserve formatting for digest consistency)
- Tag is a mutable pointer to a manifest digest
- Manifest list/index contains references to platform-specific manifests

## API Specification

**Upload Manifest by Tag:**
```http
PUT /v2/myimage/manifests/v1.0 HTTP/1.1
Host: registry.example.com
Content-Type: application/vnd.oci.image.manifest.v1+json

{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "sha256:config...",
    "size": 1234
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "digest": "sha256:layer1...",
      "size": 5678
    }
  ]
}

HTTP/1.1 201 Created
Location: /v2/myimage/manifests/sha256:manifest...
Docker-Content-Digest: sha256:manifest...
```

**Error - Missing Blob:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "errors": [{
    "code": "MANIFEST_BLOB_UNKNOWN",
    "message": "blob unknown to registry",
    "detail": { "digest": "sha256:missing..." }
  }]
}
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 004: Content Digest Service
- Story 005: Error Handling
- Story 006: Blob Upload (blobs must exist before manifest)

## Estimated Effort

Medium (2 days)

## Definition of Done

- All acceptance criteria met
- Unit tests cover validation logic
- Unit tests verify all supported media types
- Integration test uploads complete manifest
- Validates referenced blobs exist
