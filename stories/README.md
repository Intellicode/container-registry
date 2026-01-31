# Container Registry User Stories

This directory contains user stories derived from the [PRD](../PRD.md) for the
Container Registry project.

## Story Index

### Phase 1: Core Registry (MVP)

These stories deliver the minimum viable product - basic push/pull functionality
with Docker CLI.

| Story                                      | Title                                 | Priority | Effort |
| ------------------------------------------ | ------------------------------------- | -------- | ------ |
| [001](story-001-project-setup.md)          | Project Setup and Foundation          | High     | Small  |
| [002](story-002-base-endpoint.md)          | Base API Version Endpoint             | High     | Small  |
| [003](story-003-filesystem-storage.md)     | Filesystem Storage Layer              | High     | Medium |
| [004](story-004-digest-service.md)         | Content Digest Service                | High     | Small  |
| [005](story-005-error-handling.md)         | OCI-Compliant Error Handling          | High     | Small  |
| [006](story-006-blob-upload-monolithic.md) | Monolithic Blob Upload                | High     | Medium |
| [007](story-007-blob-download.md)          | Blob Download and Existence Check     | High     | Small  |
| [008](story-008-manifest-upload.md)        | Manifest Upload                       | High     | Medium |
| [009](story-009-manifest-download.md)      | Manifest Download and Existence Check | High     | Small  |
| [010](story-010-tag-listing.md)            | Tag Listing                           | High     | Small  |
| [011](story-011-basic-auth.md)             | Basic Authentication                  | High     | Medium |

**Milestone**: Push and pull images with Docker CLI

### Phase 2: Full OCI Compliance

These stories complete the OCI Distribution Specification implementation.

| Story                                   | Title                                   | Priority | Effort |
| --------------------------------------- | --------------------------------------- | -------- | ------ |
| [012](story-012-chunked-upload.md)      | Chunked Blob Upload                     | High     | Medium |
| [013](story-013-upload-resume.md)       | Upload Session Status and Resume        | High     | Small  |
| [014](story-014-blob-mount.md)          | Cross-Repository Blob Mount             | Medium   | Small  |
| [015](story-015-catalog.md)             | Catalog Endpoint                        | Medium   | Small  |
| [016](story-016-pagination.md)          | Pagination for List Operations          | Medium   | Small  |
| [017](story-017-manifest-deletion.md)   | Manifest Deletion                       | Medium   | Small  |
| [018](story-018-blob-deletion.md)       | Blob Deletion                           | Medium   | Small  |
| [019](story-019-upload-cleanup.md)      | Upload Session Cancellation and Cleanup | Medium   | Small  |
| [020](story-020-content-negotiation.md) | Content-Type Negotiation                | Medium   | Small  |

**Milestone**: Pass OCI conformance tests

### Phase 3: Production Readiness

These stories add enterprise features for production deployments.

| Story                                  | Title                            | Priority | Effort |
| -------------------------------------- | -------------------------------- | -------- | ------ |
| [021](story-021-jwt-auth.md)           | Token-Based Authentication (JWT) | High     | Large  |
| [022](story-022-access-control.md)     | Repository-Level Access Control  | High     | Medium |
| [023](story-023-tls-support.md)        | TLS/HTTPS Support                | High     | Small  |
| [024](story-024-structured-logging.md) | Structured Logging               | High     | Small  |
| [025](story-025-health-checks.md)      | Health Check Endpoints           | High     | Small  |
| [026](story-026-garbage-collection.md) | Garbage Collection               | High     | Medium |
| [027](story-027-rate-limiting.md)      | Rate Limiting                    | Medium   | Medium |
| [028](story-028-graceful-shutdown.md)  | Graceful Shutdown                | Medium   | Small  |

**Milestone**: Production deployment ready

### Phase 4: Operations & Polish

These stories add operational tooling and polish for v1.0 release.

| Story                                   | Title                       | Priority | Effort |
| --------------------------------------- | --------------------------- | -------- | ------ |
| [029](story-029-prometheus-metrics.md)  | Prometheus Metrics Endpoint | Medium   | Medium |
| [030](story-030-htpasswd-cli.md)        | CLI Htpasswd Tool           | Medium   | Small  |
| [031](story-031-validate-config-cli.md) | CLI Configuration Validator | Low      | Small  |
| [032](story-032-docker-image.md)        | Docker Image Build          | Medium   | Small  |
| [033](story-033-binary-compilation.md)  | Single Binary Compilation   | Medium   | Small  |
| [034](story-034-test-suite.md)          | Comprehensive Test Suite    | High     | Large  |

**Milestone**: v1.0 release

### Non-Functional Requirements

These stories capture cross-cutting quality requirements.

| Story                                      | Title                                | Priority | Type        |
| ------------------------------------------ | ------------------------------------ | -------- | ----------- |
| [035](story-035-streaming-efficiency.md)   | Streaming and Memory Efficiency      | High     | Performance |
| [036](story-036-atomic-operations.md)      | Atomic Operations and Data Integrity | High     | Reliability |
| [037](story-037-horizontal-scalability.md) | Horizontal Scalability Design        | Medium   | Scalability |
| [038](story-038-performance-benchmarks.md) | Performance Benchmarks and Targets   | Medium   | Performance |

## Story Template

Each story follows this structure:

- **User Story**: As a [role], I want [feature], so that [benefit]
- **Priority**: High / Medium / Low
- **Description**: Detailed explanation
- **Acceptance Criteria**: Checklist of requirements
- **Technical Notes**: Implementation guidance
- **API Specification**: Request/response examples
- **Dependencies**: Other stories that must be completed first
- **Estimated Effort**: Small (0.5-1 day) / Medium (2-3 days) / Large (4+ days)
- **Definition of Done**: Completion checklist

## Suggested Implementation Order

1. **Sprint 1** (MVP Foundation):
   - Stories 001-005 (setup, base endpoint, storage, digest, errors)

2. **Sprint 2** (MVP Blob/Manifest):
   - Stories 006-011 (blob upload/download, manifest upload/download, tags,
     basic auth)

3. **Sprint 3** (OCI Compliance):
   - Stories 012-016 (chunked upload, resume, mount, catalog, pagination)

4. **Sprint 4** (OCI Compliance + Cleanup):
   - Stories 017-020 (deletion, cleanup, content negotiation)

5. **Sprint 5** (Production Security):
   - Stories 021-023 (JWT auth, ACL, TLS)

6. **Sprint 6** (Production Operations):
   - Stories 024-028 (logging, health, GC, rate limiting, shutdown)

7. **Sprint 7** (Polish):
   - Stories 029-034 (metrics, CLI tools, packaging, tests)

8. **Ongoing** (NFRs):
   - Stories 035-038 (verification and benchmarking throughout)

## Success Metrics

| Metric                   | Target                 |
| ------------------------ | ---------------------- |
| OCI Conformance          | 100% pass              |
| Docker CLI compatibility | Full push/pull support |
| Unit test coverage       | > 80%                  |
| Memory usage (idle)      | < 50MB                 |
| Cold start time          | < 2s                   |
| P99 manifest latency     | < 100ms                |
