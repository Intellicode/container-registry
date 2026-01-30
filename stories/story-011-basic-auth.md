# Story 011: Basic Authentication

## User Story

**As a** registry operator  
**I want** to require username/password authentication  
**So that** I can control access to my private registry

## Priority

**High** - Phase 1 MVP

## Description

Implement HTTP Basic Authentication for the registry. Credentials are validated against an htpasswd-style file with bcrypt-hashed passwords.

## Acceptance Criteria

- [ ] Authentication middleware in `src/middleware/auth.ts`
- [ ] Configurable via `REGISTRY_AUTH_TYPE=basic` environment variable
- [ ] Credentials file path configurable via config or environment
- [ ] Supports htpasswd format with bcrypt hashing:
  ```
  username:$2y$10$hash...
  ```
- [ ] `401 Unauthorized` returned when:
  - No `Authorization` header provided
  - Invalid credentials
  - Malformed Basic auth header
- [ ] `401` response includes `WWW-Authenticate: Basic realm="Registry"` header
- [ ] Successful auth allows request to proceed
- [ ] Auth service in `src/services/auth.ts`
- [ ] Anonymous access mode when `REGISTRY_AUTH_TYPE=none`
- [ ] Auth can be disabled for development/testing

## Technical Notes

- Basic auth header format: `Authorization: Basic <base64(username:password)>`
- Use bcrypt for password verification (Deno standard library or deno.land/x)
- Cache parsed htpasswd file in memory (reload on file change optional)
- Consider rate limiting failed auth attempts (future story)

## Configuration

```typescript
// config.ts
auth: {
  type: "none" | "basic";
  htpasswd?: string;  // path to htpasswd file
}

// Environment variables
REGISTRY_AUTH_TYPE=basic
REGISTRY_AUTH_HTPASSWD=/etc/registry/htpasswd
```

## API Specification

**Unauthenticated Request:**
```http
GET /v2/ HTTP/1.1
Host: registry.example.com

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

**Authenticated Request:**
```http
GET /v2/ HTTP/1.1
Host: registry.example.com
Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=

HTTP/1.1 200 OK
Docker-Distribution-API-Version: registry/2.0
```

## Non-Functional Requirements

- Credentials stored with bcrypt (not plaintext)
- HTTP allowed only for localhost (TLS required for production - separate story)

## Dependencies

- Story 001: Project Setup
- Story 002: Base Endpoint
- Story 005: Error Handling

## Estimated Effort

Medium (1-2 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify auth logic
- Integration test with `docker login` succeeds
- Invalid credentials are rejected
- Htpasswd file parsing works correctly
