# Story 038: Performance Benchmarks and Targets

## User Story

**As a** registry operator\
**I want** the registry to meet specific performance targets\
**So that** it can handle production workloads efficiently

## Priority

**Medium** - Non-Functional Requirement

## Type

Non-Functional (Performance)

## Description

Implement benchmarks to verify the registry meets the performance targets
defined in the PRD.

## Performance Targets (from PRD)

| Metric                   | Target                           |
| ------------------------ | -------------------------------- |
| Concurrent uploads       | 100+ simultaneous                |
| Blob download throughput | Limited by disk/network I/O      |
| Manifest operations      | < 50ms latency (99th percentile) |
| Startup time             | < 2 seconds                      |
| Memory (idle)            | < 50MB                           |
| P99 manifest latency     | < 100ms                          |

## Acceptance Criteria

- [ ] Benchmark suite for all performance targets
- [ ] Startup time measured and validated
- [ ] Concurrent upload test with 100+ clients
- [ ] Manifest latency benchmarks
- [ ] Memory profiling under load
- [ ] Throughput measurement for blob transfers
- [ ] CI integration for performance regression detection

## Benchmark Suite

```typescript
// benchmarks/startup.ts
Deno.bench("registry startup time", async () => {
  const start = performance.now();
  const registry = await startRegistry();
  const duration = performance.now() - start;
  assert(duration < 2000, `Startup took ${duration}ms, expected < 2000ms`);
  await registry.stop();
});

// benchmarks/manifest-latency.ts
Deno.bench("manifest GET latency", async () => {
  // Pre-push a test image
  const start = performance.now();
  await fetch(`${registryUrl}/v2/test/manifests/latest`);
  const duration = performance.now() - start;
  assert(duration < 50, `Manifest GET took ${duration}ms, expected < 50ms`);
});

// benchmarks/concurrent-uploads.ts
Deno.bench("100 concurrent uploads", async () => {
  const uploads = Array.from(
    { length: 100 },
    (_, i) => uploadBlob(`test/image-${i}`, generate1MBBlob()),
  );
  await Promise.all(uploads);
});
```

## deno.json Tasks

```json
{
  "tasks": {
    "bench": "deno bench --allow-all benchmarks/",
    "bench:startup": "deno bench --allow-all benchmarks/startup.ts",
    "bench:latency": "deno bench --allow-all benchmarks/latency.ts",
    "bench:concurrent": "deno bench --allow-all benchmarks/concurrent.ts"
  }
}
```

## Reporting

Generate benchmark reports with:

- Median, P95, P99 latencies
- Throughput (requests/second, MB/second)
- Memory usage over time
- Comparison with baseline

## Dependencies

- Story 001: Project Setup
- Story 006-009: Core blob and manifest operations

## Estimated Effort

Medium (2 days)

## Definition of Done

- All performance targets have benchmarks
- All benchmarks pass on CI
- Performance baseline established
- Regression detection in CI
