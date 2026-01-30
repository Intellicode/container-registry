# Story 023: TLS/HTTPS Support

## User Story

**As a** registry operator  
**I want** to enable HTTPS with custom certificates  
**So that** all communication is encrypted and secure for production use

## Priority

**High** - Phase 3 Production Readiness

## Description

Add TLS support to the registry server for secure HTTPS connections. Support custom certificates and automatic HTTPS-only enforcement.

## Acceptance Criteria

- [ ] TLS configuration options:
  - Certificate file path
  - Private key file path
  - Optional: CA certificate for client verification
- [ ] Server starts with HTTPS when TLS configured
- [ ] Supports TLS 1.2 and TLS 1.3
- [ ] HTTP-to-HTTPS redirect option
- [ ] Localhost exemption: HTTP allowed without TLS on 127.0.0.1/localhost
- [ ] Clear error message if certificate files not found or invalid
- [ ] Environment variables:
  - `REGISTRY_TLS_CERT`
  - `REGISTRY_TLS_KEY`
- [ ] Configurable listen port (default 443 for HTTPS, 5000 for HTTP)

## Technical Notes

- Use Deno's built-in TLS support via `Deno.listenTls()`
- Validate certificate/key pair on startup
- Consider Let's Encrypt integration (future enhancement)
- Docker requires HTTPS for non-localhost registries (or explicit insecure config)

## Configuration

```typescript
server: {
  host: "0.0.0.0";
  port: 443;
  tls: {
    cert: "/etc/registry/server.crt";
    key: "/etc/registry/server.key";
    // Optional: client certificate verification
    ca?: "/etc/registry/ca.crt";
  };
}
```

## Usage Examples

**Start with TLS:**
```bash
REGISTRY_TLS_CERT=/path/to/cert.pem \
REGISTRY_TLS_KEY=/path/to/key.pem \
deno task start
```

**Config File:**
```json
{
  "server": {
    "port": 443,
    "tls": {
      "cert": "/etc/registry/server.crt",
      "key": "/etc/registry/server.key"
    }
  }
}
```

## Non-Functional Requirements

- TLS 1.2+ required (no older protocols)
- Strong cipher suites only
- Certificate validation on startup

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Server starts successfully with TLS
- Docker can push/pull over HTTPS
- Invalid certificate paths produce clear errors
- Localhost HTTP exemption works
