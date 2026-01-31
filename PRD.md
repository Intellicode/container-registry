# Product Requirement Document: Container Registry

## Overview

A lightweight, self-hosted Docker container registry implementing the OCI
Distribution Specification. Built with Deno and Hono for minimal dependencies,
high performance, and modern TypeScript development experience.

---

## 1. Executive Summary

### 1.1 Product Vision

A minimal, production-ready container registry that allows developers and
organizations to privately host and distribute Docker/OCI container images
without relying on external services.

### 1.2 Goals

- **Simplicity**: Single binary deployment with minimal configuration
- **Standards Compliance**: Full OCI Distribution Specification v2 support
- **Performance**: Efficient blob storage and transfer with streaming support
- **Security**: Authentication, authorization, and content verification
- **Minimal Dependencies**: Leverage Deno's built-in capabilities, Hono for
  routing

### 1.3 Non-Goals

- Kubernetes operator/integration (out of scope for v1)
- Image vulnerability scanning
- Multi-registry replication/mirroring
- Web UI for browsing images

---

## 2. Technical Architecture

### 2.1 Technology Stack

| Component      | Technology  | Rationale                                                |
| -------------- | ----------- | -------------------------------------------------------- |
| Runtime        | Deno 2.x    | Built-in TypeScript, secure by default, no node_modules  |
| Web Framework  | Hono        | Lightweight, fast, middleware support, Web Standards API |
| Storage        | File System | Simple, no external dependencies                         |
| Authentication | Built-in    | Basic Auth, Bearer Token (JWT)                           |

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Container Registry                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Hono      │  │   Auth      │  │   Rate Limiting     │  │
│  │   Router    │──│  Middleware │──│   Middleware        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │              OCI Distribution API v2                    ││
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  ││
│  │  │ Blobs   │ │Manifests│ │  Tags    │ │  Catalog    │  ││
│  │  │ Handler │ │ Handler │ │  Handler │ │  Handler    │  ││
│  │  └─────────┘ └─────────┘ └──────────┘ └─────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Storage Layer                         ││
│  │  ┌─────────────────┐  ┌──────────────────────────────┐ ││
│  │  │  Blob Store     │  │  Metadata Store              │ ││
│  │  │  (File System)  │  │  (JSON Files / SQLite opt.)  │ ││
│  │  └─────────────────┘  └──────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Directory Structure

```
container-registry/
├── deno.json              # Deno configuration and tasks
├── main.ts                # Application entry point
├── src/
│   ├── app.ts             # Hono app configuration
│   ├── config.ts          # Configuration management
│   ├── routes/
│   │   ├── v2.ts          # OCI Distribution API v2 routes
│   │   ├── blobs.ts       # Blob upload/download handlers
│   │   ├── manifests.ts   # Manifest handlers
│   │   ├── tags.ts        # Tag listing handlers
│   │   └── catalog.ts     # Repository catalog handlers
│   ├── middleware/
│   │   ├── auth.ts        # Authentication middleware
│   │   ├── errors.ts      # Error handling middleware
│   │   └── logging.ts     # Request logging middleware
│   ├── storage/
│   │   ├── interface.ts   # Storage abstraction interface
│   │   ├── filesystem.ts  # File system storage implementation
│   │   └── uploads.ts     # Chunked upload session management
│   ├── services/
│   │   ├── digest.ts      # Content digest calculation (SHA256)
│   │   └── auth.ts        # Authentication service
│   └── types/
│       ├── oci.ts         # OCI specification types
│       └── errors.ts      # Error types
├── tests/
│   ├── integration/       # Integration tests
│   └── unit/              # Unit tests
└── data/                  # Default storage directory (gitignored)
    ├── blobs/             # Content-addressable blob storage
    ├── repositories/      # Repository metadata and manifests
    └── uploads/           # In-progress upload sessions
```

---

## 3. Functional Requirements

### 3.1 OCI Distribution Specification Compliance

The registry MUST implement the OCI Distribution Specification v2 endpoints:

#### 3.1.1 Base Endpoint

| Method | Endpoint | Description                                          |
| ------ | -------- | ---------------------------------------------------- |
| GET    | `/v2/`   | API version check, returns `200 OK` if authenticated |

**Response Headers:**

- `Docker-Distribution-API-Version: registry/2.0`

#### 3.1.2 Blob Operations

| Method | Endpoint                                               | Description           |
| ------ | ------------------------------------------------------ | --------------------- |
| HEAD   | `/v2/<name>/blobs/<digest>`                            | Check blob existence  |
| GET    | `/v2/<name>/blobs/<digest>`                            | Retrieve blob content |
| DELETE | `/v2/<name>/blobs/<digest>`                            | Delete blob           |
| POST   | `/v2/<name>/blobs/uploads/`                            | Initiate blob upload  |
| GET    | `/v2/<name>/blobs/uploads/<uuid>`                      | Get upload status     |
| PATCH  | `/v2/<name>/blobs/uploads/<uuid>`                      | Upload blob chunk     |
| PUT    | `/v2/<name>/blobs/uploads/<uuid>?digest=<digest>`      | Complete blob upload  |
| DELETE | `/v2/<name>/blobs/uploads/<uuid>`                      | Cancel upload         |
| POST   | `/v2/<name>/blobs/uploads/?mount=<digest>&from=<repo>` | Cross-repo blob mount |

**Blob Upload Methods:**

1. **Monolithic Upload**: Single PUT with entire blob
2. **Chunked Upload**: Multiple PATCH requests followed by PUT
3. **Cross-Repository Mount**: Reference existing blob from another repository

#### 3.1.3 Manifest Operations

| Method | Endpoint                           | Description              |
| ------ | ---------------------------------- | ------------------------ |
| HEAD   | `/v2/<name>/manifests/<reference>` | Check manifest existence |
| GET    | `/v2/<name>/manifests/<reference>` | Retrieve manifest        |
| PUT    | `/v2/<name>/manifests/<reference>` | Upload manifest          |
| DELETE | `/v2/<name>/manifests/<reference>` | Delete manifest          |

**Reference Types:**

- Tag name (e.g., `latest`, `v1.0.0`)
- Digest (e.g., `sha256:abc123...`)

**Supported Manifest Types:**

- `application/vnd.oci.image.manifest.v1+json`
- `application/vnd.oci.image.index.v1+json`
- `application/vnd.docker.distribution.manifest.v2+json`
- `application/vnd.docker.distribution.manifest.list.v2+json`

#### 3.1.4 Tag Operations

| Method | Endpoint               | Description          |
| ------ | ---------------------- | -------------------- |
| GET    | `/v2/<name>/tags/list` | List repository tags |

**Query Parameters:**

- `n`: Maximum number of results
- `last`: Last tag from previous page (pagination)

#### 3.1.5 Catalog Operations

| Method | Endpoint       | Description           |
| ------ | -------------- | --------------------- |
| GET    | `/v2/_catalog` | List all repositories |

**Query Parameters:**

- `n`: Maximum number of results
- `last`: Last repository from previous page (pagination)

### 3.2 Content Verification

#### 3.2.1 Digest Verification

- All blobs MUST be stored by their content digest
- Supported digest algorithms: `sha256` (required), `sha512` (optional)
- On upload completion, the server MUST verify the provided digest matches
  computed digest
- Digest format: `<algorithm>:<hex-encoded-hash>`

#### 3.2.2 Manifest Verification

- Manifest JSON MUST be valid according to OCI specification
- All referenced blobs MUST exist in the registry
- Config blob MUST exist for image manifests
- Layer blobs MUST exist for image manifests

### 3.3 Storage Requirements

#### 3.3.1 Blob Storage

```
data/blobs/
└── sha256/
    └── ab/
        └── abcdef1234567890...  # Full digest as filename
```

- Content-addressable storage using digest
- Two-level directory structure to prevent filesystem limitations
- Deduplication: identical content stored once regardless of repository

#### 3.3.2 Repository Storage

```
data/repositories/
└── <namespace>/
    └── <name>/
        ├── _manifests/
        │   ├── tags/
        │   │   └── <tag>/
        │   │       └── current/
        │   │           └── link  # Contains digest reference
        │   └── revisions/
        │       └── sha256/
        │           └── <digest>/
        │               └── link  # Contains digest reference
        └── _layers/
            └── sha256/
                └── <digest>/
                    └── link      # Contains digest reference
```

#### 3.3.3 Upload Session Storage

```
data/uploads/
└── <uuid>/
    ├── data           # Partial upload data
    ├── startedat      # Upload start timestamp
    └── hashstate      # Incremental hash state for resume
```

- Upload sessions expire after configurable timeout (default: 1 hour)
- Background cleanup of expired sessions

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric                   | Target                           |
| ------------------------ | -------------------------------- |
| Concurrent uploads       | 100+ simultaneous                |
| Blob download throughput | Limited by disk/network I/O      |
| Manifest operations      | < 50ms latency (99th percentile) |
| Startup time             | < 2 seconds                      |

### 4.2 Scalability

- **Horizontal**: Stateless design allows multiple instances with shared storage
- **Vertical**: Efficient memory usage, streaming for large blobs
- **Storage**: No practical limit on number of repositories or images

### 4.3 Reliability

- **Atomicity**: Uploads are atomic - partial uploads don't corrupt storage
- **Consistency**: Manifest validation ensures referential integrity
- **Graceful shutdown**: Complete in-flight requests before exit

### 4.4 Security

#### 4.4.1 Authentication Methods

1. **Anonymous Access** (configurable)
   - Read-only or disabled by default

2. **Basic Authentication**
   - Username/password via `Authorization: Basic <base64>`
   - Credentials stored in config file (bcrypt hashed)

3. **Bearer Token (JWT)**
   - Token-based authentication for CI/CD integration
   - Configurable token expiration
   - Support for Docker credential helpers

#### 4.4.2 Authorization

- **Repository-level permissions**: read, write, delete
- **Admin role**: full access including catalog
- **Configurable access control list (ACL)**

```typescript
interface AccessControl {
  // Pattern supports wildcards: "myorg/*", "*/public"
  repository: string;
  users: string[];
  permissions: ("pull" | "push" | "delete")[];
}
```

#### 4.4.3 Transport Security

- HTTPS required for production (TLS 1.2+)
- HTTP allowed only for localhost development
- Support for custom TLS certificates

### 4.5 Observability

#### 4.5.1 Logging

- Structured JSON logging to stdout
- Configurable log levels: debug, info, warn, error
- Request/response logging with timing

#### 4.5.2 Metrics (Optional)

- Prometheus-compatible `/metrics` endpoint
- Key metrics:
  - `registry_http_requests_total` (by method, path, status)
  - `registry_blob_upload_bytes_total`
  - `registry_blob_download_bytes_total`
  - `registry_storage_bytes` (total storage used)

#### 4.5.3 Health Checks

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check (storage accessible)

---

## 5. Configuration

### 5.1 Configuration Sources (Priority Order)

1. Command-line arguments
2. Environment variables
3. Configuration file (`config.json` or `config.yaml`)
4. Default values

### 5.2 Configuration Options

```typescript
interface RegistryConfig {
  // Server settings
  server: {
    host: string; // Default: "0.0.0.0"
    port: number; // Default: 15000
    tls?: {
      cert: string; // Path to TLS certificate
      key: string; // Path to TLS private key
    };
  };

  // Storage settings
  storage: {
    rootDirectory: string; // Default: "./data"
    maxUploadSize: number; // Default: 0 (unlimited)
    uploadTimeout: number; // Default: 3600 (seconds)
  };

  // Authentication settings
  auth: {
    type: "none" | "basic" | "token";

    // For basic auth
    htpasswd?: string; // Path to htpasswd file

    // For token auth
    token?: {
      realm: string; // Token service URL
      service: string; // Service name
      issuer: string; // Token issuer
      publicKey: string; // Path to public key for verification
    };
  };

  // Access control
  access?: {
    defaultPolicy: "allow" | "deny";
    rules: AccessRule[];
  };

  // Logging
  log: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "pretty";
  };

  // Garbage collection
  gc?: {
    enabled: boolean;
    schedule: string; // Cron expression
    dryRun: boolean;
  };
}
```

### 5.3 Environment Variables

| Variable                | Description       | Default   |
| ----------------------- | ----------------- | --------- |
| `REGISTRY_HOST`         | Listen host       | `0.0.0.0` |
| `REGISTRY_PORT`         | Listen port       | `15000`   |
| `REGISTRY_STORAGE_PATH` | Storage directory | `./data`  |
| `REGISTRY_LOG_LEVEL`    | Log level         | `info`    |
| `REGISTRY_AUTH_TYPE`    | Auth type         | `none`    |
| `REGISTRY_TLS_CERT`     | TLS cert path     | -         |
| `REGISTRY_TLS_KEY`      | TLS key path      | -         |

---

## 6. API Error Responses

All errors follow the OCI Distribution Specification error format:

```typescript
interface ErrorResponse {
  errors: Array<{
    code: string; // Machine-readable error code
    message: string; // Human-readable message
    detail?: unknown; // Additional context
  }>;
}
```

### 6.1 Error Codes

| Code                    | HTTP Status | Description                      |
| ----------------------- | ----------- | -------------------------------- |
| `BLOB_UNKNOWN`          | 404         | Blob does not exist              |
| `BLOB_UPLOAD_INVALID`   | 400         | Blob upload invalid              |
| `BLOB_UPLOAD_UNKNOWN`   | 404         | Upload session not found         |
| `DIGEST_INVALID`        | 400         | Provided digest invalid          |
| `MANIFEST_BLOB_UNKNOWN` | 404         | Manifest references unknown blob |
| `MANIFEST_INVALID`      | 400         | Manifest invalid                 |
| `MANIFEST_UNKNOWN`      | 404         | Manifest not found               |
| `NAME_INVALID`          | 400         | Invalid repository name          |
| `NAME_UNKNOWN`          | 404         | Repository not found             |
| `SIZE_INVALID`          | 400         | Content length mismatch          |
| `UNAUTHORIZED`          | 401         | Authentication required          |
| `DENIED`                | 403         | Access denied                    |
| `UNSUPPORTED`           | 415         | Unsupported operation            |
| `TOOMANYREQUESTS`       | 429         | Rate limit exceeded              |

---

## 7. CLI Interface

### 7.1 Commands

```bash
# Start the registry server
deno task start

# Start with custom config
deno task start --config ./my-config.json

# Run garbage collection
deno task gc

# Generate htpasswd entry
deno task htpasswd <username>

# Validate configuration
deno task validate-config ./config.json

# Run tests
deno task test
```

### 7.2 Deno Tasks (deno.json)

```json
{
  "tasks": {
    "start": "deno run --allow-net --allow-read --allow-write main.ts",
    "dev": "deno run --watch --allow-net --allow-read --allow-write main.ts",
    "test": "deno test --allow-net --allow-read --allow-write",
    "gc": "deno run --allow-read --allow-write src/cli/gc.ts",
    "htpasswd": "deno run src/cli/htpasswd.ts"
  }
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Storage layer operations
- Digest calculation and verification
- Manifest parsing and validation
- Authentication/authorization logic
- Configuration parsing

### 8.2 Integration Tests

- Full push/pull workflow with Docker CLI
- Authentication flows
- Concurrent upload handling
- Large blob uploads (chunked)
- Error handling scenarios

### 8.3 Conformance Tests

- OCI Distribution Specification conformance test suite
- Docker registry API compatibility tests

### 8.4 Test Commands

```bash
# Run all tests
deno task test

# Run with coverage
deno task test --coverage=coverage/

# Integration tests (requires Docker)
deno task test:integration
```

---

## 9. Deployment

### 9.1 Standalone Binary

```bash
# Compile to single executable
deno compile --allow-net --allow-read --allow-write \
  --output registry main.ts

# Run
./registry --config /etc/registry/config.json
```

### 9.2 Docker Deployment

```dockerfile
FROM denoland/deno:2.0.0

WORKDIR /app
COPY . .

RUN deno cache main.ts

EXPOSE 15000
VOLUME ["/data"]

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "main.ts"]
```

### 9.3 Systemd Service

```ini
[Unit]
Description=Container Registry
After=network.target

[Service]
Type=simple
User=registry
ExecStart=/usr/local/bin/registry --config /etc/registry/config.json
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## 10. Implementation Phases

### Phase 1: Core Registry (MVP)

- [ ] Project setup (Deno, Hono, directory structure)
- [ ] Base `/v2/` endpoint
- [ ] Blob upload (monolithic)
- [ ] Blob download
- [ ] Manifest upload/download
- [ ] Tag listing
- [ ] File system storage
- [ ] Basic authentication
- [ ] Error handling

**Milestone**: Push and pull images with Docker CLI

### Phase 2: Full OCI Compliance

- [ ] Chunked blob uploads
- [ ] Cross-repository blob mount
- [ ] Upload session resume
- [ ] Catalog endpoint
- [ ] Pagination for list operations
- [ ] Manifest deletion
- [ ] Blob deletion
- [ ] Content-Type negotiation

**Milestone**: Pass OCI conformance tests

### Phase 3: Production Readiness

- [ ] Token-based authentication (JWT)
- [ ] Repository-level access control
- [ ] TLS support
- [ ] Structured logging
- [ ] Health check endpoints
- [ ] Garbage collection
- [ ] Upload timeout/cleanup
- [ ] Rate limiting

**Milestone**: Production deployment ready

### Phase 4: Operations & Polish

- [ ] Prometheus metrics
- [ ] CLI tools (htpasswd, gc, validate)
- [ ] Comprehensive documentation
- [ ] Docker image
- [ ] Compile to single binary
- [ ] Performance optimization

**Milestone**: v1.0 release

---

## 11. Success Metrics

| Metric                   | Target                 |
| ------------------------ | ---------------------- |
| OCI Conformance          | 100% pass              |
| Docker CLI compatibility | Full push/pull support |
| Unit test coverage       | > 80%                  |
| Memory usage (idle)      | < 50MB                 |
| Cold start time          | < 2s                   |
| P99 manifest latency     | < 100ms                |

---

## 12. References

- [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/main/spec.md)
- [OCI Image Format Specification](https://github.com/opencontainers/image-spec/blob/main/spec.md)
- [Docker Registry HTTP API V2](https://docs.docker.com/registry/spec/api/)
- [Deno Documentation](https://deno.land/manual)
- [Hono Documentation](https://hono.dev/)

---

## Appendix A: Example Workflows

### A.1 Push Image Workflow

```
Client                                    Registry
   |                                          |
   |  POST /v2/myimage/blobs/uploads/         |
   |----------------------------------------->|
   |  202 Accepted                            |
   |  Location: /v2/myimage/blobs/uploads/uuid|
   |<-----------------------------------------|
   |                                          |
   |  PATCH /v2/myimage/blobs/uploads/uuid    |
   |  [layer data]                            |
   |----------------------------------------->|
   |  202 Accepted                            |
   |<-----------------------------------------|
   |                                          |
   |  PUT /v2/myimage/blobs/uploads/uuid      |
   |      ?digest=sha256:abc...               |
   |----------------------------------------->|
   |  201 Created                             |
   |<-----------------------------------------|
   |                                          |
   |  PUT /v2/myimage/manifests/v1.0          |
   |  [manifest JSON]                         |
   |----------------------------------------->|
   |  201 Created                             |
   |<-----------------------------------------|
```

### A.2 Pull Image Workflow

```
Client                                    Registry
   |                                          |
   |  GET /v2/myimage/manifests/v1.0          |
   |----------------------------------------->|
   |  200 OK                                  |
   |  [manifest JSON]                         |
   |<-----------------------------------------|
   |                                          |
   |  GET /v2/myimage/blobs/sha256:config...  |
   |----------------------------------------->|
   |  200 OK                                  |
   |  [config blob]                           |
   |<-----------------------------------------|
   |                                          |
   |  GET /v2/myimage/blobs/sha256:layer1...  |
   |----------------------------------------->|
   |  200 OK                                  |
   |  [layer blob]                            |
   |<-----------------------------------------|
```

---

## Appendix B: Content Types

### B.1 Manifest Media Types

| Type                 | Media Type                                                  |
| -------------------- | ----------------------------------------------------------- |
| OCI Image Manifest   | `application/vnd.oci.image.manifest.v1+json`                |
| OCI Image Index      | `application/vnd.oci.image.index.v1+json`                   |
| Docker Manifest V2   | `application/vnd.docker.distribution.manifest.v2+json`      |
| Docker Manifest List | `application/vnd.docker.distribution.manifest.list.v2+json` |

### B.2 Blob Media Types

| Type             | Media Type                                          |
| ---------------- | --------------------------------------------------- |
| OCI Layer (gzip) | `application/vnd.oci.image.layer.v1.tar+gzip`       |
| OCI Layer (zstd) | `application/vnd.oci.image.layer.v1.tar+zstd`       |
| OCI Config       | `application/vnd.oci.image.config.v1+json`          |
| Docker Layer     | `application/vnd.docker.image.rootfs.diff.tar.gzip` |
| Docker Config    | `application/vnd.docker.container.image.v1+json`    |
