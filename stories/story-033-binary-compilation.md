# Story 033: Single Binary Compilation

## User Story

**As a** system administrator\
**I want** to deploy the registry as a single binary\
**So that** I can run it without Deno installed and simplify deployment

## Priority

**Medium** - Phase 4 Operations

## Description

Use Deno's compile feature to produce standalone executables for multiple
platforms.

## Acceptance Criteria

- [ ] Compile command produces single executable
- [ ] Supported platforms:
  - Linux x86_64
  - Linux aarch64 (ARM64)
  - macOS x86_64
  - macOS aarch64 (Apple Silicon)
  - Windows x86_64
- [ ] Binary includes all required permissions
- [ ] Binary starts without Deno runtime
- [ ] Deno task for compilation: `deno task compile`
- [ ] CI/CD workflow to build releases (optional)

## Compilation Commands

```bash
# Compile for current platform
deno task compile

# Equivalent to:
deno compile \
  --allow-net \
  --allow-read \
  --allow-write \
  --allow-env \
  --output registry \
  main.ts

# Cross-compile for specific targets
deno compile --target x86_64-unknown-linux-gnu --output registry-linux-amd64 main.ts
deno compile --target aarch64-unknown-linux-gnu --output registry-linux-arm64 main.ts
deno compile --target x86_64-apple-darwin --output registry-darwin-amd64 main.ts
deno compile --target aarch64-apple-darwin --output registry-darwin-arm64 main.ts
deno compile --target x86_64-pc-windows-msvc --output registry-windows-amd64.exe main.ts
```

## deno.json Tasks

```json
{
  "tasks": {
    "compile": "deno compile --allow-net --allow-read --allow-write --allow-env --output registry main.ts",
    "compile:all": "deno task compile:linux-amd64 && deno task compile:linux-arm64 && deno task compile:darwin-amd64 && deno task compile:darwin-arm64",
    "compile:linux-amd64": "deno compile --target x86_64-unknown-linux-gnu --output dist/registry-linux-amd64 main.ts",
    "compile:linux-arm64": "deno compile --target aarch64-unknown-linux-gnu --output dist/registry-linux-arm64 main.ts",
    "compile:darwin-amd64": "deno compile --target x86_64-apple-darwin --output dist/registry-darwin-amd64 main.ts",
    "compile:darwin-arm64": "deno compile --target aarch64-apple-darwin --output dist/registry-darwin-arm64 main.ts"
  }
}
```

## Usage

```bash
# Compile
deno task compile

# Run binary
./registry --config /etc/registry/config.json

# Or with environment variables
REGISTRY_PORT=15000 REGISTRY_STORAGE_PATH=/data ./registry
```

## Non-Functional Requirements

- Startup time < 2 seconds (as per PRD)
- Binary size should be reasonable (< 100MB)

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Small (0.5 days)

## Definition of Done

- All acceptance criteria met
- Binary runs without Deno installed
- All platforms compile successfully
- Binary size is acceptable
- Startup time meets requirement
