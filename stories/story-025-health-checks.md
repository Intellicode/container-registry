# Story 025: Health Check Endpoints

## User Story

**As a** DevOps engineer  
**I want** health check endpoints  
**So that** I can monitor registry health and integrate with orchestrators

## Priority

**High** - Phase 3 Production Readiness

## Description

Implement health check endpoints for liveness and readiness probes. These are essential for Kubernetes deployments and load balancer health checks.

## Acceptance Criteria

- [ ] `GET /health` - Basic liveness check:
  - Returns `200 OK` if server is running
  - Response body: `{"status": "healthy"}`
  - Fast response (no heavy checks)
- [ ] `GET /health/ready` - Readiness check:
  - Returns `200 OK` if ready to serve traffic
  - Verifies storage is accessible
  - Response includes component status:
    ```json
    {
      "status": "ready",
      "checks": {
        "storage": "ok"
      }
    }
    ```
  - Returns `503 Service Unavailable` if not ready
- [ ] Health endpoints do not require authentication
- [ ] Response time requirements:
  - `/health` < 10ms
  - `/health/ready` < 100ms

## Technical Notes

- Liveness: Is the process alive and responding?
- Readiness: Can the service handle requests?
- Storage check: Verify can read/write to storage directory
- Don't cache health results - check every time

## API Specification

**Liveness (Healthy):**
```http
GET /health HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy"
}
```

**Readiness (Ready):**
```http
GET /health/ready HTTP/1.1
Host: registry.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ready",
  "checks": {
    "storage": "ok"
  }
}
```

**Readiness (Not Ready):**
```http
GET /health/ready HTTP/1.1
Host: registry.example.com

HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "status": "not ready",
  "checks": {
    "storage": "error: permission denied"
  }
}
```

## Kubernetes Example

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Dependencies

- Story 001: Project Setup
- Story 003: Filesystem Storage Layer

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify both endpoints
- Storage unavailable returns 503
- Response times meet requirements
- No authentication required
