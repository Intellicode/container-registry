# Story 009: Manifest Download and Existence Check

## User Story

**As a** Docker/OCI client  
**I want** to download image manifests and check if they exist  
**So that** I can pull container images and verify tags

## Priority

**High** - Phase 1 MVP

## Description

Implement manifest retrieval by tag name or digest. Clients use this to get the image structure before downloading layers.

## Acceptance Criteria

- [ ] `GET /v2/<name>/manifests/<reference>` downloads manifest:
  - Reference can be tag name or digest
  - Returns `200 OK` with manifest JSON
  - Returns `Content-Type` header matching manifest media type
  - Returns `Docker-Content-Digest` header
  - Returns `404 Not Found` with `MANIFEST_UNKNOWN` if not found
- [ ] `HEAD /v2/<name>/manifests/<reference>` checks existence:
  - Returns `200 OK` if manifest exists
  - Returns `Content-Type` and `Docker-Content-Digest` headers
  - Returns `Content-Length` header
  - Returns `404 Not Found` if not found
- [ ] Content negotiation via `Accept` header:
  - Client can request specific media types
  - Returns manifest in requested format if available
  - Returns `406 Not Acceptable` if requested type not available
- [ ] Tag reference resolves to current digest
- [ ] Digest reference returns exact manifest
- [ ] Routes defined in `src/routes/manifests.ts`

## Technical Notes

- Tag lookup: read digest from `_manifests/tags/<tag>/current/link`
- Digest lookup: read from `_manifests/revisions/sha256/<digest>/`
- Content negotiation is important for multi-arch images
- Accept header may contain multiple types with quality values

## API Specification

**Download by Tag:**
```http
GET /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com
Accept: application/vnd.oci.image.manifest.v1+json

HTTP/1.1 200 OK
Content-Type: application/vnd.oci.image.manifest.v1+json
Docker-Content-Digest: sha256:abc123...
Content-Length: 1234

{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  ...
}
```

**Download by Digest:**
```http
GET /v2/myimage/manifests/sha256:abc123... HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/vnd.oci.image.manifest.v1+json
Docker-Content-Digest: sha256:abc123...

{ ... }
```

**Check Existence:**
```http
HEAD /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/vnd.oci.image.manifest.v1+json
Docker-Content-Digest: sha256:abc123...
Content-Length: 1234
```

## Non-Functional Requirements

- Manifest operations should have < 50ms latency (99th percentile)

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 005: Error Handling
- Story 008: Manifest Upload

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests cover tag and digest lookups
- Unit tests verify content negotiation
- Integration test retrieves uploaded manifest
- Performance test verifies latency requirement
