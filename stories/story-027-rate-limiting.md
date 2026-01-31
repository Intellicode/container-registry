# Story 027: Rate Limiting

## User Story

**As a** registry operator\
**I want** to rate limit API requests\
**So that** the registry is protected from abuse and resource exhaustion

## Priority

**Medium** - Phase 3 Production Readiness

## Description

Implement rate limiting middleware to protect the registry from excessive
requests. Support different limits for different operation types.

## Acceptance Criteria

- [ ] Rate limiting middleware in `src/middleware/ratelimit.ts`
- [ ] Configurable limits:
  - Requests per second/minute per IP
  - Requests per second/minute per user
  - Different limits for read vs write operations
- [ ] Returns `429 Too Many Requests` when limit exceeded:
  - Include `Retry-After` header
  - Return `TOOMANYREQUESTS` error code
- [ ] Rate limit headers in responses:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Unix timestamp when limit resets
- [ ] Configurable via environment/config file
- [ ] Option to disable rate limiting

## Technical Notes

- Use token bucket or sliding window algorithm
- In-memory storage for single instance
- Consider Redis for distributed deployments (future)
- Exempt health check endpoints from rate limiting

## Configuration

```typescript
rateLimit: {
  enabled: boolean;
  
  // Per-IP limits
  ip: {
    requests: number;      // e.g., 100
    window: number;        // seconds, e.g., 60
  };
  
  // Per-user limits (authenticated)
  user: {
    requests: number;
    window: number;
  };
  
  // Separate limits for writes
  write: {
    requests: number;
    window: number;
  };
  
  // Whitelist IPs (e.g., CI servers)
  whitelist?: string[];
}
```

## API Specification

**Rate Limited Response:**

```http
GET /v2/myimage/manifests/latest HTTP/1.1
Host: registry.example.com

HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705312200

{
  "errors": [{
    "code": "TOOMANYREQUESTS",
    "message": "rate limit exceeded, retry after 30 seconds"
  }]
}
```

**Normal Response with Headers:**

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312200
```

## Non-Functional Requirements

- 100+ concurrent uploads should be supported (as per PRD)
- Rate limiting should not significantly impact latency

## Dependencies

- Story 001: Project Setup
- Story 005: Error Handling

## Estimated Effort

Medium (1-2 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify rate limiting logic
- Integration test verifies 429 responses
- Headers are correctly set
- Whitelisted IPs bypass limits
