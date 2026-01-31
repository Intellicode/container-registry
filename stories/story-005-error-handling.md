# Story 005: OCI-Compliant Error Handling

## User Story

**As a** Docker/OCI client\
**I want** to receive standardized error responses\
**So that** I can properly handle and display errors to users

## Priority

**High** - Phase 1 MVP (Blocking)

## Description

Implement error handling middleware and utilities that return errors in the OCI
Distribution Specification format. All API errors must follow this standard
format for client compatibility.

## Acceptance Criteria

- [ ] Error types defined in `src/types/errors.ts`:
  ```typescript
  type ErrorCode =
    | "BLOB_UNKNOWN"
    | "BLOB_UPLOAD_INVALID"
    | "BLOB_UPLOAD_UNKNOWN"
    | "DIGEST_INVALID"
    | "MANIFEST_BLOB_UNKNOWN"
    | "MANIFEST_INVALID"
    | "MANIFEST_UNKNOWN"
    | "NAME_INVALID"
    | "NAME_UNKNOWN"
    | "SIZE_INVALID"
    | "UNAUTHORIZED"
    | "DENIED"
    | "UNSUPPORTED"
    | "TOOMANYREQUESTS";
  ```
- [ ] Error response format:
  ```json
  {
    "errors": [{
      "code": "ERROR_CODE",
      "message": "Human readable message",
      "detail": {}
    }]
  }
  ```
- [ ] Error middleware in `src/middleware/errors.ts` catches unhandled errors
- [ ] Helper functions to create OCI errors:
  ```typescript
  function ociError(
    code: ErrorCode,
    message: string,
    detail?: unknown,
  ): Response;
  function blobUnknown(digest: string): Response;
  function manifestUnknown(reference: string): Response;
  // ... etc
  ```
- [ ] HTTP status codes match OCI spec:
  | Code                  | Status |
  | --------------------- | ------ |
  | BLOB_UNKNOWN          | 404    |
  | BLOB_UPLOAD_INVALID   | 400    |
  | BLOB_UPLOAD_UNKNOWN   | 404    |
  | DIGEST_INVALID        | 400    |
  | MANIFEST_BLOB_UNKNOWN | 404    |
  | MANIFEST_INVALID      | 400    |
  | MANIFEST_UNKNOWN      | 404    |
  | NAME_INVALID          | 400    |
  | NAME_UNKNOWN          | 404    |
  | SIZE_INVALID          | 400    |
  | UNAUTHORIZED          | 401    |
  | DENIED                | 403    |
  | UNSUPPORTED           | 415    |
  | TOOMANYREQUESTS       | 429    |
- [ ] Content-Type header is `application/json`
- [ ] Unhandled exceptions return 500 with generic error (no stack traces in
      production)

## Technical Notes

- Use Hono's error handling middleware pattern
- Consider using custom Error classes that extend Error
- Log detailed error info server-side, return sanitized response to client

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Unit tests verify all error codes produce correct responses
- Integration test verifies error middleware catches exceptions
- No stack traces leak in production mode
