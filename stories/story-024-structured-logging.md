# Story 024: Structured Logging

## User Story

**As a** registry operator  
**I want** structured JSON logs with request tracing  
**So that** I can monitor the registry and troubleshoot issues

## Priority

**High** - Phase 3 Production Readiness

## Description

Implement structured logging middleware that outputs JSON-formatted logs suitable for log aggregation systems. Include request/response details and timing information.

## Acceptance Criteria

- [ ] Logging middleware in `src/middleware/logging.ts`
- [ ] Structured JSON output to stdout:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "level": "info",
    "message": "request completed",
    "method": "GET",
    "path": "/v2/myimage/manifests/latest",
    "status": 200,
    "duration_ms": 45,
    "user": "alice",
    "client_ip": "192.168.1.100",
    "user_agent": "docker/24.0.0",
    "request_id": "abc123"
  }
  ```
- [ ] Configurable log levels: `debug`, `info`, `warn`, `error`
- [ ] Log format options: `json` (default), `pretty` (human-readable for dev)
- [ ] Request ID generation and propagation (for tracing)
- [ ] Environment variables:
  - `REGISTRY_LOG_LEVEL` (default: `info`)
  - `REGISTRY_LOG_FORMAT` (default: `json`)
- [ ] Log events:
  - Request start (debug)
  - Request complete (info)
  - Authentication success/failure (info/warn)
  - Errors (error)
  - Blob upload/download (info)

## Technical Notes

- Use a logging library or simple custom implementation
- Request ID in response header: `X-Request-ID`
- Mask sensitive data (passwords, tokens) in logs
- Consider log rotation (external concern - leave to operators)

## Log Examples

**Request Completed:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "request completed",
  "method": "PUT",
  "path": "/v2/myimage/blobs/uploads/uuid",
  "status": 201,
  "duration_ms": 1234,
  "bytes_received": 10485760,
  "user": "ci-bot",
  "request_id": "req-123"
}
```

**Authentication Failure:**
```json
{
  "timestamp": "2024-01-15T10:30:05.000Z",
  "level": "warn",
  "message": "authentication failed",
  "method": "GET",
  "path": "/v2/",
  "reason": "invalid credentials",
  "client_ip": "10.0.0.50",
  "request_id": "req-124"
}
```

**Pretty Format (Development):**
```
2024-01-15T10:30:00.000Z INFO  [req-123] GET /v2/myimage/manifests/latest 200 45ms
```

## Configuration

```typescript
log: {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "pretty";
}
```

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify log formatting
- Logs are parseable by common tools (jq)
- Sensitive data is not logged
- Request IDs are consistent across request lifecycle
