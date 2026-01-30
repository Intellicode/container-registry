# Story 001: Project Setup and Foundation

## User Story

**As a** developer setting up the container registry project  
**I want** a properly configured Deno/Hono project structure  
**So that** I have a solid foundation for implementing the registry features

## Priority

**High** - Phase 1 MVP (Blocking)

## Description

Initialize the container registry project with Deno 2.x and Hono framework. Set up the directory structure, configuration files, and basic application entry point as defined in the PRD architecture.

## Acceptance Criteria

- [ ] `deno.json` is created with proper configuration:
  - TypeScript compiler options
  - Import maps for dependencies (Hono)
  - Task definitions for `start`, `dev`, `test`
- [ ] Directory structure is created:
  ```
  container-registry/
  ├── deno.json
  ├── main.ts
  ├── src/
  │   ├── app.ts
  │   ├── config.ts
  │   ├── routes/
  │   ├── middleware/
  │   ├── storage/
  │   ├── services/
  │   └── types/
  ├── tests/
  │   ├── integration/
  │   └── unit/
  └── data/
  ```
- [ ] `main.ts` entry point starts the Hono server
- [ ] `src/app.ts` configures the Hono application
- [ ] `src/config.ts` loads configuration from environment variables with defaults
- [ ] Basic type definitions are created in `src/types/`
- [ ] `.gitignore` excludes `data/` directory
- [ ] Server starts successfully with `deno task start`
- [ ] Server listens on configurable host/port (default: 0.0.0.0:5000)

## Technical Notes

- Use Deno 2.x features (native TypeScript, no node_modules)
- Hono version should be latest stable from deno.land/x or JSR
- Configuration should support `REGISTRY_HOST` and `REGISTRY_PORT` environment variables
- Startup time should be under 2 seconds (NFR reference)

## Dependencies

None - this is the first story

## Estimated Effort

Small (1-2 days)

## Definition of Done

- All acceptance criteria met
- Code passes `deno lint` and `deno fmt --check`
- Server starts and responds to HTTP requests
- Basic test verifies server startup
