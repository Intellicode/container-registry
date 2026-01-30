# Story 015: Catalog Endpoint

## User Story

**As a** registry user  
**I want** to list all repositories in the registry  
**So that** I can discover what images are available

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement the catalog endpoint that returns a list of all repositories in the registry. This enables discovery and tooling integration.

## Acceptance Criteria

- [ ] `GET /v2/_catalog` returns repository list:
  - Returns `200 OK` with JSON response
  - Response format:
    ```json
    {
      "repositories": ["image1", "org/image2", "org/team/image3"]
    }
    ```
  - Repositories are sorted alphabetically
  - Includes nested/namespaced repositories
- [ ] Authorization: May require admin role or specific permission
- [ ] Returns empty array if no repositories exist
- [ ] Routes defined in `src/routes/catalog.ts`
- [ ] Content-Type is `application/json`

## Technical Notes

- Scan `data/repositories/` directory recursively
- Repository exists if it has at least one manifest
- Consider caching for large registries
- Catalog access may be restricted (sensitive information)

## API Specification

**List Repositories:**
```http
GET /v2/_catalog HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "repositories": [
    "alpine",
    "myorg/backend",
    "myorg/frontend",
    "myorg/tools/builder"
  ]
}
```

**Empty Registry:**
```http
GET /v2/_catalog HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "repositories": []
}
```

## Dependencies

- Story 003: Filesystem Storage Layer
- Story 005: Error Handling

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify response format
- Integration test lists repositories after push
- Nested repositories are handled correctly
