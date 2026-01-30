# Story 010: Tag Listing

## User Story

**As a** Docker/OCI client  
**I want** to list all tags for a repository  
**So that** I can see what image versions are available

## Priority

**High** - Phase 1 MVP

## Description

Implement the tag listing endpoint that returns all tags for a given repository. This is used by clients to discover available image versions.

## Acceptance Criteria

- [ ] `GET /v2/<name>/tags/list` returns tags:
  - Returns `200 OK` with JSON response
  - Response format:
    ```json
    {
      "name": "repository/name",
      "tags": ["latest", "v1.0", "v1.1"]
    }
    ```
  - Tags are sorted alphabetically
  - Returns empty array if repository exists but has no tags
  - Returns `404 Not Found` with `NAME_UNKNOWN` if repository doesn't exist
- [ ] Routes defined in `src/routes/tags.ts`
- [ ] Content-Type is `application/json`

## Technical Notes

- Read tags from `data/repositories/<name>/_manifests/tags/` directory
- Each subdirectory name is a tag
- Only return tags that have a valid `current/link` file

## API Specification

**List Tags:**
```http
GET /v2/myimage/tags/list HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "name": "myimage",
  "tags": ["latest", "v1.0", "v1.1", "v2.0"]
}
```

**Empty Repository:**
```http
GET /v2/myimage/tags/list HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "name": "myimage",
  "tags": []
}
```

**Unknown Repository:**
```http
GET /v2/unknown/tags/list HTTP/1.1
Host: registry.example.com

HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "errors": [{
    "code": "NAME_UNKNOWN",
    "message": "repository name not known to registry",
    "detail": { "name": "unknown" }
  }]
}
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 005: Error Handling

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests cover success and error cases
- Integration test verifies tag listing after push
- Tags are correctly sorted
