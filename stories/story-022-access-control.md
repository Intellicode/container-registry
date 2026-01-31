# Story 022: Repository-Level Access Control

## User Story

**As a** registry operator\
**I want** to configure fine-grained access permissions\
**So that** I can control who can read, write, or delete specific repositories

## Priority

**High** - Phase 3 Production Readiness

## Description

Implement an access control system that allows defining permissions at the
repository level. Support wildcards for managing groups of repositories.

## Acceptance Criteria

- [ ] Access control rules defined in configuration:
  ```typescript
  interface AccessRule {
    repository: string; // Pattern with wildcards: "myorg/*", "*"
    users: string[]; // Usernames or groups
    permissions: ("pull" | "push" | "delete")[];
  }
  ```
- [ ] Authorization middleware checks permissions before each operation:
  - `pull` - required for GET/HEAD on blobs and manifests
  - `push` - required for PUT/POST operations
  - `delete` - required for DELETE operations
- [ ] Wildcard patterns:
  - `*` - matches any single path segment
  - `**` - matches any number of path segments
  - Examples: `myorg/*`, `*/public`, `**`
- [ ] Default policy when no rule matches (configurable: `allow` or `deny`)
- [ ] Admin role bypasses all access checks
- [ ] Returns `403 Forbidden` with `DENIED` error when access denied
- [ ] Catalog endpoint may require special permission (`catalog:*`)

## Technical Notes

- Evaluate rules in order, first match wins
- Use glob-style pattern matching
- Cache compiled patterns for performance
- Consider supporting group membership (future)

## Configuration Example

```json
{
  "access": {
    "defaultPolicy": "deny",
    "rules": [
      {
        "repository": "public/*",
        "users": ["*"],
        "permissions": ["pull"]
      },
      {
        "repository": "myorg/*",
        "users": ["alice", "bob"],
        "permissions": ["pull", "push"]
      },
      {
        "repository": "myorg/prod/*",
        "users": ["admin"],
        "permissions": ["pull", "push", "delete"]
      }
    ]
  }
}
```

## API Specification

**Access Denied:**

```http
PUT /v2/restricted/image/manifests/latest HTTP/1.1
Host: registry.example.com
Authorization: Bearer <token>

HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "errors": [{
    "code": "DENIED",
    "message": "requested access to the resource is denied",
    "detail": {
      "repository": "restricted/image",
      "action": "push"
    }
  }]
}
```

## Dependencies

- Story 011: Basic Authentication
- Story 021: JWT Authentication
- Story 005: Error Handling

## Estimated Effort

Medium (2-3 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify pattern matching
- Unit tests verify permission checks
- Integration test verifies access control enforcement
- Default policy works correctly
