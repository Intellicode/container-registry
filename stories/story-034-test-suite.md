# Story 034: Comprehensive Test Suite

## User Story

**As a** developer  
**I want** a comprehensive test suite  
**So that** I can confidently make changes without breaking functionality

## Priority

**High** - Phase 4 Operations

## Description

Implement unit tests, integration tests, and conformance tests to ensure registry quality and OCI compliance.

## Acceptance Criteria

- [ ] Unit tests for all core modules:
  - Storage layer operations
  - Digest calculation and verification
  - Manifest parsing and validation
  - Authentication/authorization logic
  - Configuration parsing
  - Error handling
- [ ] Integration tests:
  - Full push/pull workflow with Docker CLI
  - Authentication flows
  - Concurrent upload handling
  - Large blob uploads (chunked)
  - Error handling scenarios
- [ ] OCI Conformance tests:
  - Run official OCI distribution-spec conformance tests
  - Document any deviations
- [ ] Test infrastructure:
  - `deno task test` runs all tests
  - `deno task test:unit` runs unit tests only
  - `deno task test:integration` runs integration tests
  - `deno task test:coverage` generates coverage report
- [ ] Coverage target: > 80%

## Test Structure

```
tests/
├── unit/
│   ├── storage/
│   │   ├── filesystem.test.ts
│   │   └── uploads.test.ts
│   ├── services/
│   │   ├── digest.test.ts
│   │   └── auth.test.ts
│   ├── middleware/
│   │   ├── auth.test.ts
│   │   └── errors.test.ts
│   └── routes/
│       ├── blobs.test.ts
│       ├── manifests.test.ts
│       └── catalog.test.ts
├── integration/
│   ├── push-pull.test.ts
│   ├── auth.test.ts
│   ├── concurrent.test.ts
│   └── large-blobs.test.ts
└── conformance/
    └── oci-distribution.test.ts
```

## deno.json Tasks

```json
{
  "tasks": {
    "test": "deno test --allow-all tests/",
    "test:unit": "deno test --allow-all tests/unit/",
    "test:integration": "deno test --allow-all tests/integration/",
    "test:coverage": "deno test --allow-all --coverage=coverage/ tests/ && deno coverage coverage/"
  }
}
```

## Integration Test Example

```typescript
Deno.test("push and pull image workflow", async () => {
  // Start test registry
  const registry = await startTestRegistry();
  
  try {
    // Push image using Docker CLI
    await exec("docker", ["push", "localhost:5000/test:latest"]);
    
    // Pull image
    await exec("docker", ["pull", "localhost:5000/test:latest"]);
    
    // Verify image exists
    const result = await exec("docker", ["images", "localhost:5000/test:latest"]);
    assertStringContains(result, "latest");
  } finally {
    await registry.stop();
  }
});
```

## Dependencies

- All previous stories (tests verify functionality)

## Estimated Effort

Large (5+ days)

## Definition of Done

- All acceptance criteria met
- All tests pass
- Coverage > 80%
- OCI conformance tests pass
- CI runs tests on every PR
