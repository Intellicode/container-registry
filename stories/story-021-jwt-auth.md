# Story 021: Token-Based Authentication (JWT)

## User Story

**As a** CI/CD system\
**I want** to authenticate using JWT tokens\
**So that** I can integrate with existing identity providers and automate image
operations

## Priority

**High** - Phase 3 Production Readiness

## Description

Implement Bearer token authentication using JWT for integration with external
token services and Docker credential helpers. This enables enterprise SSO and
automated workflows.

## Acceptance Criteria

- [ ] `401 Unauthorized` response includes Bearer challenge:
  ```
  WWW-Authenticate: Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:myimage:pull"
  ```
- [ ] Token authentication flow:
  1. Client requests protected resource
  2. Registry returns 401 with Bearer challenge
  3. Client obtains token from token service
  4. Client retries with `Authorization: Bearer <token>`
- [ ] JWT validation:
  - Verify signature using configured public key
  - Verify `iss` (issuer) claim
  - Verify `aud` (audience) claim matches service
  - Verify token not expired (`exp` claim)
  - Extract `access` claim for permissions
- [ ] Token payload format (Docker token spec):
  ```json
  {
    "iss": "token-issuer",
    "sub": "username",
    "aud": "registry.example.com",
    "exp": 1234567890,
    "iat": 1234567800,
    "access": [
      {
        "type": "repository",
        "name": "myimage",
        "actions": ["pull", "push"]
      }
    ]
  }
  ```
- [ ] Configurable via environment:
  - `REGISTRY_AUTH_TYPE=token`
  - `REGISTRY_AUTH_TOKEN_REALM`
  - `REGISTRY_AUTH_TOKEN_SERVICE`
  - `REGISTRY_AUTH_TOKEN_ISSUER`
  - `REGISTRY_AUTH_TOKEN_PUBLICKEY`
- [ ] Support RS256 and ES256 algorithms

## Technical Notes

- Use a JWT library (e.g., `djwt` for Deno)
- Public key can be PEM file or JWKS URL
- Token service is external - registry only validates tokens
- Scope format: `repository:<name>:<action>` or `registry:catalog:*`

## API Specification

**Unauthenticated Request:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:myimage:pull"
```

**Authenticated Request:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

HTTP/1.1 200 OK
```

## Configuration

```typescript
auth: {
  type: "token";
  token: {
    realm: "https://auth.example.com/token";
    service: "registry.example.com";
    issuer: "auth.example.com";
    publicKey: "/etc/registry/token.pub"; // or JWKS URL
  }
}
```

## Dependencies

- Story 011: Basic Authentication
- Story 005: Error Handling

## Estimated Effort

Large (3-4 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify JWT validation
- Integration test with mock token service
- Invalid/expired tokens are rejected
- Docker login flow works
