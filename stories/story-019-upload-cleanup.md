# Story 019: Upload Session Cancellation and Cleanup

## User Story

**As a** registry operator\
**I want** upload sessions to be cancellable and auto-expire\
**So that** abandoned uploads don't consume disk space indefinitely

## Priority

**Medium** - Phase 2 OCI Compliance

## Description

Implement upload cancellation endpoint and automatic cleanup of expired upload
sessions.

## Acceptance Criteria

- [ ] `DELETE /v2/<name>/blobs/uploads/<uuid>` cancels upload:
  - Returns `204 No Content` on success
  - Returns `404 Not Found` with `BLOB_UPLOAD_UNKNOWN` if not found
  - Removes upload session directory and data
- [ ] Upload session timeout:
  - Configurable timeout (default: 1 hour / 3600 seconds)
  - `startedat` timestamp stored with session
  - Environment variable: `REGISTRY_UPLOAD_TIMEOUT`
- [ ] Background cleanup process:
  - Runs periodically (configurable interval)
  - Removes sessions older than timeout
  - Logs cleaned sessions
- [ ] Upload session storage includes timestamp:
  ```
  data/uploads/<uuid>/startedat  # ISO timestamp
  ```

## Technical Notes

- Use `setInterval` or Deno cron for background cleanup
- Cleanup should be atomic (don't partially delete)
- Consider cleanup on startup for sessions from previous runs
- Log cleanup activity for monitoring

## API Specification

**Cancel Upload:**

```http
DELETE /v2/myimage/blobs/uploads/uuid HTTP/1.1
Host: registry.example.com

HTTP/1.1 204 No Content
```

**Upload Not Found:**

```http
DELETE /v2/myimage/blobs/uploads/unknown-uuid HTTP/1.1
Host: registry.example.com

HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "errors": [{
    "code": "BLOB_UPLOAD_UNKNOWN",
    "message": "upload session not found"
  }]
}
```

## Configuration

```typescript
storage: {
  uploadTimeout: 3600,  // seconds, default 1 hour
  cleanupInterval: 300, // seconds, default 5 minutes
}
```

## Dependencies

- Story 006: Monolithic Blob Upload
- Story 012: Chunked Blob Upload

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify cancellation
- Integration test verifies expired sessions are cleaned
- Background cleanup runs without errors
- Cleanup is logged
