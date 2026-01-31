# Story 002: Base API Version Endpoint

## User Story

**As a** Docker/OCI client\
**I want** to check the API version at `/v2/`\
**So that** I can verify the registry supports the OCI Distribution
Specification v2

## Priority

**High** - Phase 1 MVP (Blocking)

## Description

Implement the OCI Distribution Specification base endpoint that clients use to
verify API compatibility and authentication status. This is the first endpoint
hit by `docker login` and all registry operations.

## Acceptance Criteria

- [ ] `GET /v2/` returns `200 OK` for authenticated/anonymous requests (based on
      config)
- [ ] Response includes header: `Docker-Distribution-API-Version: registry/2.0`
- [ ] Response body is empty or `{}`
- [ ] Returns `401 Unauthorized` when authentication is required but not
      provided
- [ ] `401` response includes `WWW-Authenticate` header with realm information
- [ ] Route is defined in `src/routes/v2.ts`
- [ ] Endpoint handles both trailing slash and non-trailing slash (`/v2` and
      `/v2/`)

## Technical Notes

- This endpoint is critical for Docker CLI compatibility
- The `WWW-Authenticate` header format for Basic auth:
  ```
  WWW-Authenticate: Basic realm="Registry"
  ```
- For token auth (future):
  ```
  WWW-Authenticate: Bearer realm="https://auth.example.com/token",service="registry"
  ```

## API Specification

**Request:**

```http
GET /v2/ HTTP/1.1
Host: registry.example.com
Authorization: Basic <credentials>  # if auth enabled
```

**Response (Success):**

```http
HTTP/1.1 200 OK
Docker-Distribution-API-Version: registry/2.0
Content-Length: 0
```

**Response (Unauthorized):**

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="Registry"
Content-Type: application/json

{
  "errors": [{
    "code": "UNAUTHORIZED",
    "message": "authentication required"
  }]
}
```

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests cover success and unauthorized cases
- `docker login localhost:15000` successfully authenticates (with auth disabled)
- Integration test verifies endpoint behavior
