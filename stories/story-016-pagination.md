# Story 016: Pagination for List Operations

## User Story

**As a** Docker/OCI client  
**I want** paginated results for tag and catalog listings  
**So that** I can handle repositories with many tags without overwhelming memory

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Add pagination support to tag listing and catalog endpoints using the `n` (limit) and `last` (cursor) query parameters as defined in the OCI spec.

## Acceptance Criteria

- [ ] Tag listing pagination (`GET /v2/<name>/tags/list`):
  - `n` parameter limits number of results
  - `last` parameter specifies starting point (exclusive)
  - Returns `Link` header with next page URL when more results exist
  - Results are sorted alphabetically
- [ ] Catalog pagination (`GET /v2/_catalog`):
  - Same `n` and `last` parameters
  - Returns `Link` header for next page
  - Results are sorted alphabetically
- [ ] Link header format: `</v2/...?n=10&last=value>; rel="next"`
- [ ] Default limit when `n` not specified (configurable, e.g., 100)
- [ ] Maximum limit to prevent abuse (configurable, e.g., 1000)

## Technical Notes

- `last` is the last item from the previous page (not an index)
- Sorting must be consistent for pagination to work correctly
- Use lexicographic sorting for predictable behavior
- Link header follows RFC 5988 Web Linking

## API Specification

**First Page:**
```http
GET /v2/myimage/tags/list?n=10 HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json
Link: </v2/myimage/tags/list?n=10&last=v1.9>; rel="next"

{
  "name": "myimage",
  "tags": ["v1.0", "v1.1", "v1.2", "v1.3", "v1.4", "v1.5", "v1.6", "v1.7", "v1.8", "v1.9"]
}
```

**Next Page:**
```http
GET /v2/myimage/tags/list?n=10&last=v1.9 HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "name": "myimage",
  "tags": ["v2.0", "v2.1"]
}
```

**Catalog Pagination:**
```http
GET /v2/_catalog?n=5 HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Link: </v2/_catalog?n=5&last=image-e>; rel="next"

{
  "repositories": ["image-a", "image-b", "image-c", "image-d", "image-e"]
}
```

## Dependencies

- Story 010: Tag Listing
- Story 015: Catalog Endpoint

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify pagination logic
- Tests verify Link header format
- Integration test paginates through large result set
- Edge cases handled (empty results, last page)
