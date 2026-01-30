# Story 028: Graceful Shutdown

## User Story

**As a** registry operator  
**I want** the registry to shut down gracefully  
**So that** in-flight requests complete and no data is corrupted

## Priority

**Medium** - Phase 3 Production Readiness

## Description

Implement graceful shutdown handling that completes active requests and uploads before stopping the server.

## Acceptance Criteria

- [ ] Handle shutdown signals: `SIGTERM`, `SIGINT`
- [ ] On shutdown signal:
  1. Stop accepting new connections
  2. Wait for active requests to complete (with timeout)
  3. Complete or checkpoint active uploads
  4. Close storage connections
  5. Exit cleanly
- [ ] Configurable shutdown timeout (default: 30 seconds)
- [ ] Force shutdown after timeout (with warning)
- [ ] Log shutdown events:
  - Shutdown signal received
  - Waiting for N active requests
  - Shutdown complete
- [ ] Health endpoint returns 503 during shutdown (for load balancer)

## Technical Notes

- Use Deno's signal handling: `Deno.addSignalListener`
- Track active requests with a counter/set
- Consider using AbortController for request cancellation
- Upload sessions can be resumed after restart

## Implementation

```typescript
// Pseudo-code
let shuttingDown = false;
let activeRequests = 0;

Deno.addSignalListener("SIGTERM", async () => {
  console.log("Shutdown signal received");
  shuttingDown = true;
  
  // Stop accepting new connections
  server.close();
  
  // Wait for active requests
  const timeout = setTimeout(() => {
    console.warn("Shutdown timeout, forcing exit");
    Deno.exit(1);
  }, 30000);
  
  while (activeRequests > 0) {
    console.log(`Waiting for ${activeRequests} active requests`);
    await delay(1000);
  }
  
  clearTimeout(timeout);
  console.log("Shutdown complete");
  Deno.exit(0);
});
```

## Configuration

```typescript
server: {
  shutdownTimeout: 30000;  // milliseconds
}
```

## Dependencies

- Story 001: Project Setup
- Story 025: Health Check Endpoints

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Unit tests verify shutdown sequence
- Integration test verifies in-flight request completion
- Health endpoint behavior changes during shutdown
- Timeout triggers forced exit
