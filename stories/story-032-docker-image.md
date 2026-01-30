# Story 032: Docker Image Build

## User Story

**As a** DevOps engineer  
**I want** an official Docker image for the registry  
**So that** I can easily deploy it in containerized environments

## Priority

**Medium** - Phase 4 Operations

## Description

Create a Dockerfile and build process to produce an optimized container image for the registry.

## Acceptance Criteria

- [ ] Dockerfile in project root
- [ ] Multi-stage build for minimal image size
- [ ] Based on official Deno image
- [ ] Image includes:
  - Compiled application
  - Default configuration
  - Health check configured
- [ ] Configurable via environment variables
- [ ] Non-root user for security
- [ ] Volume mount points:
  - `/data` - Storage directory
  - `/etc/registry` - Configuration files
- [ ] Exposed ports documented
- [ ] Labels for metadata (version, maintainer, etc.)

## Dockerfile

```dockerfile
FROM denoland/deno:2.0.0 AS builder

WORKDIR /app
COPY . .

# Cache dependencies
RUN deno cache main.ts

# Create non-root user
RUN adduser --disabled-password --gecos "" registry

FROM denoland/deno:2.0.0

WORKDIR /app

# Copy from builder
COPY --from=builder /app .
COPY --from=builder /etc/passwd /etc/passwd

# Create data directory
RUN mkdir -p /data && chown registry:registry /data

USER registry

EXPOSE 15000

VOLUME ["/data", "/etc/registry"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD deno run --allow-net health-check.ts || exit 1

ENTRYPOINT ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env"]
CMD ["main.ts"]
```

## Docker Compose Example

```yaml
version: "3.8"
services:
  registry:
    image: container-registry:latest
    ports:
      - "15000:15000"
    volumes:
      - registry-data:/data
      - ./config.json:/etc/registry/config.json:ro
    environment:
      - REGISTRY_LOG_LEVEL=info
    restart: unless-stopped

volumes:
  registry-data:
```

## Build Commands

```bash
# Build image
docker build -t container-registry:latest .

# Build with version tag
docker build -t container-registry:1.0.0 .

# Run container
docker run -d -p 15000:15000 -v registry-data:/data container-registry:latest
```

## Dependencies

- Story 001: Project Setup
- Story 025: Health Check Endpoints

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Image builds successfully
- Container runs and serves requests
- Health check works
- Non-root user verified
- Image size is reasonable (< 200MB)
