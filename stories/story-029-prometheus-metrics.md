# Story 029: Prometheus Metrics Endpoint

## User Story

**As a** DevOps engineer  
**I want** Prometheus-compatible metrics  
**So that** I can monitor registry performance and set up alerts

## Priority

**Medium** - Phase 4 Operations

## Description

Implement a Prometheus-compatible metrics endpoint that exposes registry performance and operational metrics.

## Acceptance Criteria

- [ ] `GET /metrics` returns Prometheus format metrics
- [ ] Required metrics:
  - `registry_http_requests_total` - Counter by method, path pattern, status
  - `registry_http_request_duration_seconds` - Histogram of request latency
  - `registry_blob_upload_bytes_total` - Counter of bytes uploaded
  - `registry_blob_download_bytes_total` - Counter of bytes downloaded
  - `registry_storage_bytes` - Gauge of total storage used
  - `registry_active_uploads` - Gauge of in-progress uploads
  - `registry_repositories_total` - Gauge of repository count
- [ ] Metrics endpoint can be optionally disabled
- [ ] Metrics endpoint can require authentication (configurable)
- [ ] Labels follow Prometheus best practices

## Technical Notes

- Use text exposition format (Prometheus standard)
- Consider using a Deno Prometheus client library
- Path patterns should be normalized (e.g., `/v2/<name>/blobs/<digest>`)
- Don't expose sensitive information in labels

## Metric Examples

```prometheus
# HELP registry_http_requests_total Total number of HTTP requests
# TYPE registry_http_requests_total counter
registry_http_requests_total{method="GET",path="/v2/{name}/manifests/{reference}",status="200"} 1234
registry_http_requests_total{method="PUT",path="/v2/{name}/manifests/{reference}",status="201"} 567

# HELP registry_http_request_duration_seconds HTTP request latency
# TYPE registry_http_request_duration_seconds histogram
registry_http_request_duration_seconds_bucket{method="GET",path="/v2/{name}/manifests/{reference}",le="0.01"} 500
registry_http_request_duration_seconds_bucket{method="GET",path="/v2/{name}/manifests/{reference}",le="0.05"} 900
registry_http_request_duration_seconds_bucket{method="GET",path="/v2/{name}/manifests/{reference}",le="+Inf"} 1234

# HELP registry_storage_bytes Total storage used in bytes
# TYPE registry_storage_bytes gauge
registry_storage_bytes 10737418240

# HELP registry_blob_upload_bytes_total Total bytes uploaded
# TYPE registry_blob_upload_bytes_total counter
registry_blob_upload_bytes_total 53687091200

# HELP registry_active_uploads Number of in-progress uploads
# TYPE registry_active_uploads gauge
registry_active_uploads 5
```

## Configuration

```typescript
metrics: {
  enabled: boolean;        // Default: false
  path: string;            // Default: "/metrics"
  requireAuth: boolean;    // Default: false
}
```

## API Specification

```http
GET /metrics HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: text/plain; version=0.0.4

# HELP registry_http_requests_total ...
```

## Dependencies

- Story 001: Project Setup
- Story 024: Structured Logging

## Estimated Effort

Medium (2 days)

## Definition of Done

- All acceptance criteria met
- Metrics are correctly formatted
- Prometheus can scrape the endpoint
- Storage calculation is accurate
- Histograms have appropriate buckets
