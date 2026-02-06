# AGENTS.md - AI Agent Guidelines for Container Registry

This is a Deno TypeScript project implementing a Docker container registry
following the OCI Distribution Specification.

## Build, Test, and Run Commands

### Running the Server

```bash
deno task start       # Production mode
deno task dev         # Development mode with file watching
```

### Running Tests

```bash
# Run all tests
deno test --allow-net --allow-read --allow-write --allow-env

# Run a single test file
deno test --allow-net --allow-read --allow-write --allow-env src/routes/blobs_test.ts

# Run tests matching a pattern
deno test --allow-net --allow-read --allow-write --allow-env --filter "blob exists"

# Run tests with specific options (useful for flaky file handle tests)
deno test --allow-net --allow-read --allow-write --allow-env src/routes/blobs_test.ts --no-check
```

### Type Checking and Linting

```bash
deno check                       # Type check entry point
deno lint                        # Run linter
deno fmt                         # Format code
deno fmt --check                 # Check formatting without changes
```

## Project Structure

```
container-registry/
├── main.ts                      # Entry point
├── deno.json                    # Deno config with tasks and dependencies
├── src/
│   ├── app.ts                   # Hono app configuration
│   ├── config.ts                # Environment-based configuration
│   ├── types/
│   │   ├── errors.ts            # OCI error types and RegistryError class
│   │   └── oci.ts               # OCI spec type definitions
│   ├── routes/
│   │   ├── v2.ts                # Main v2 API router
│   │   ├── blobs.ts             # Blob upload/download routes
│   │   ├── manifests.ts         # Manifest operations
│   │   ├── tags.ts              # Tag listing
│   │   └── catalog.ts           # Repository catalog
│   ├── services/
│   │   ├── auth.ts              # Basic auth with htpasswd
│   │   ├── token.ts             # JWT token auth
│   │   ├── digest.ts            # SHA256 digest computation
│   │   ├── access-control.ts    # Permission checks
│   │   └── upload-cleanup.ts    # Stale upload cleanup
│   ├── storage/
│   │   ├── interface.ts         # StorageDriver interface
│   │   └── filesystem.ts        # Filesystem storage implementation
│   ├── middleware/
│   │   ├── auth.ts              # Authentication middleware
│   │   ├── authorization.ts     # Authorization middleware
│   │   └── errors.ts            # Error handling utilities
│   └── utils/
│       └── errors.ts            # OCI error response helpers
└── tests/                       # Integration tests
```

### File and Module Naming

- Use kebab-case for file names: `upload-cleanup.ts`, `access-control.ts`
- Test files use `_test.ts` suffix: `blobs_test.ts`, `auth_test.ts`
- One main export per file, named after the file

### Function and Variable Naming

- Functions: `camelCase` - `validateCredentials()`, `createBlobRoutes()`
- Constants: `PascalCase` for const objects - `ErrorCodes`, `ManifestMediaTypes`
- Interfaces: `PascalCase` - `StorageDriver`, `AuthConfig`
- Types: `PascalCase` - `ErrorCode`, `ManifestMediaType`

### Documentation Style

Use JSDoc for all public functions and classes:

```typescript
/**
 * Validates repository name according to OCI distribution spec.
 * Format: [a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*
 * @param name - Repository name to validate
 * @returns true if valid, false otherwise
 */
function validateRepositoryName(name: string): boolean { ... }
```

### Error Handling

Use the OCI-compliant error system:

```typescript
// Throw RegistryError for application errors (caught by error handler)
import { ErrorCodes, RegistryError } from "./types/errors.ts";
throw new RegistryError(ErrorCodes.BLOB_UNKNOWN, `blob ${digest} not found`);

// Return error responses directly from route handlers
import { blobUnknown, digestInvalid, nameInvalid } from "../utils/errors.ts";
return blobUnknown(digest);
return digestInvalid(digest, "invalid digest format");
```

Available error helpers: `blobUnknown`, `blobUploadUnknown`, `digestInvalid`,
`manifestUnknown`, `manifestInvalid`, `nameInvalid`, `nameUnknown`,
`unauthorized`, `denied`

### Route Handler Pattern

```typescript
export function createBlobRoutes(): Hono {
  const blobs = new Hono({ strict: false });
  const config = getConfig();

  blobs.get("/:name{.+}/blobs/:digest", async (c: Context) => {
    const name = c.req.param("name");
    const digest = c.req.param("digest");

    // Validate inputs first
    if (!validateRepositoryName(name)) {
      return nameInvalid(name, "reason here");
    }

    // Business logic...
    return c.body(stream, 200);
  });

  return blobs;
}
```

### Test Pattern

```typescript
Deno.test("description of test case", async () => {
  const testDir = await createTestDir();

  try {
    Deno.env.set("REGISTRY_STORAGE_PATH", testDir);
    resetConfig();  // Reset global config to pick up env changes

    // Test logic here
    assertEquals(res.status, 200);
  } finally {
    resetConfig();
    await cleanupTestDir(testDir);
  }
});

// For tests with file handle issues, use:
Deno.test({
  name: "test name",
  sanitizeResources: false,
  fn: async () => { ... }
});
```

### Async/Await Patterns

- Always use async/await, never raw Promises
- Handle file cleanup in finally blocks
- Cancel streams before returning errors to prevent file handle leaks

```typescript
const stream = await storage.getBlob(digest);
if (!stream) {
  return blobUnknown(digest);
}

// On error path, cancel stream first
if (someError) {
  await stream.cancel();
  return errorResponse();
}
```

### Class vs Factory Pattern

- Use factory functions for services that need async initialization:
  ```typescript
  export async function createAuthService(path?: string): Promise<AuthService>;
  ```
- Use classes for storage drivers and services with state:
  ```typescript
  export class FilesystemStorage implements StorageDriver
  ```

### Path Safety

Always validate and sanitize paths to prevent path traversal:

```typescript
// Validate repository names match OCI spec
if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(component)) {
  throw new Error(`Invalid repository component: ${component}`);
}

// Validate UUIDs for upload sessions
if (!isValidUUID(uuid)) {
  return blobUploadUnknown(uuid);
}

// Verify resolved paths stay within root directory
const resolved = resolve(path);
if (!resolved.startsWith(this.rootPath + "/")) {
  throw new Error(`Path traversal detected: ${path}`);
}
```

## Key Implementation Notes

- The registry implements OCI Distribution Specification
- Uses Hono framework with `strict: false` to allow both `/v2` and `/v2/`
- All responses include `Docker-Distribution-API-Version: registry/2.0` header
- Blobs are stored content-addressably in `blobs/<algorithm>/<prefix>/<hash>`
- Repository metadata lives in `repositories/<name>/_layers/` and `_manifests/`
- Config loaded from environment variables with `REGISTRY_` prefix
