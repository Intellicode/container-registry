# Story 031: CLI Configuration Validator

## User Story

**As a** registry administrator  
**I want** to validate my configuration file  
**So that** I can catch errors before starting the registry

## Priority

**Low** - Phase 4 Operations

## Description

Create a CLI tool to validate registry configuration files and report any errors or warnings.

## Acceptance Criteria

- [ ] `deno task validate-config <path>` validates configuration:
  - Checks JSON/YAML syntax
  - Validates against configuration schema
  - Checks file paths exist (certificates, htpasswd, etc.)
  - Reports all errors and warnings
  - Returns exit code 0 on success, 1 on error
- [ ] Validation checks:
  - Required fields present
  - Type validation
  - Port number in valid range
  - TLS cert/key files exist and are readable
  - Htpasswd file exists (if basic auth enabled)
  - Log level is valid
  - Storage path is writable
- [ ] Clear error messages with line numbers (for YAML/JSON errors)
- [ ] Implementation in `src/cli/validate.ts`

## CLI Examples

```bash
# Validate config file
deno task validate-config /etc/registry/config.json

# Success output
# Configuration valid!
# 
# Summary:
#   Server: 0.0.0.0:5000
#   Storage: /data
#   Auth: basic
#   TLS: enabled

# Error output
# Configuration errors:
#   - server.port: must be between 1 and 65535 (got: 70000)
#   - auth.htpasswd: file not found: /etc/registry/htpasswd
#   - storage.rootDirectory: directory not writable: /readonly
# 
# Configuration invalid (3 errors)
```

## Validation Schema

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary?: ConfigSummary;
}

interface ValidationError {
  path: string;      // e.g., "server.port"
  message: string;
  value?: unknown;
}
```

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- All configuration options are validated
- File existence checks work
- Clear, actionable error messages
- Exit codes are correct
