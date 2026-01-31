# Story 020: Content-Type Negotiation

## User Story

**As a** Docker/OCI client\
**I want** the registry to respect Accept headers\
**So that** I can request manifests in my preferred format

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement proper content-type negotiation for manifest endpoints. Clients
indicate preferred manifest formats via Accept header, and the registry should
return the best match.

## Acceptance Criteria

- [ ] Manifest GET respects `Accept` header:
  - Parse Accept header with quality values (e.g., `q=0.9`)
  - Return manifest in highest-priority matching format
  - Return actual stored format if no preference or wildcard
- [ ] Supported manifest types:
  - `application/vnd.oci.image.manifest.v1+json`
  - `application/vnd.oci.image.index.v1+json`
  - `application/vnd.docker.distribution.manifest.v2+json`
  - `application/vnd.docker.distribution.manifest.list.v2+json`
- [ ] Content-Type response header matches returned format
- [ ] Manifest PUT validates Content-Type header matches body
- [ ] Returns `406 Not Acceptable` if requested type not available
- [ ] Wildcard `*/*` accepts any format

## Technical Notes

- Accept header format: `type/subtype; q=0.9, type2/subtype2`
- Quality values range from 0 to 1, default is 1
- Don't convert between formats - return 406 if stored format doesn't match
- Docker client typically sends multiple accepted types

## API Specification

**Request Specific Type:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Accept: application/vnd.oci.image.manifest.v1+json

HTTP/1.1 200 OK
Content-Type: application/vnd.oci.image.manifest.v1+json
```

**Multiple Accepted Types:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json; q=0.9

HTTP/1.1 200 OK
Content-Type: application/vnd.oci.image.manifest.v1+json
```

**Type Not Available:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Accept: application/vnd.oci.image.manifest.v1+json

HTTP/1.1 406 Not Acceptable
Content-Type: application/json

{
  "errors": [{
    "code": "MANIFEST_UNKNOWN",
    "message": "manifest not found in requested format"
  }]
}
```

## Dependencies

- Story 009: Manifest Download

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify Accept header parsing
- Unit tests verify quality value ordering
- Integration test with Docker client works correctly
