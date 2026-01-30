# Story 030: CLI Htpasswd Tool

## User Story

**As a** registry administrator  
**I want** a CLI tool to manage user credentials  
**So that** I can create and update htpasswd entries for basic authentication

## Priority

**Medium** - Phase 4 Operations

## Description

Create a CLI tool to generate bcrypt-hashed password entries compatible with the registry's basic authentication system.

## Acceptance Criteria

- [ ] `deno task htpasswd <username>` generates password entry:
  - Prompts for password securely (no echo)
  - Outputs bcrypt-hashed entry: `username:$2y$10$...`
  - Can append to existing htpasswd file with `-f <file>` flag
- [ ] Options:
  - `-f <file>` - Output to file (append or create)
  - `-n` - Output to stdout only (default)
  - `-c` - Create new file (truncate if exists)
  - `-D` - Delete user from file
  - `-v` - Verify password for user
- [ ] Password requirements:
  - Minimum length (configurable, default 8)
  - Interactive confirmation (enter twice)
- [ ] Implementation in `src/cli/htpasswd.ts`

## Technical Notes

- Use bcrypt with cost factor 10 (standard)
- Handle existing file safely (don't corrupt on error)
- Password prompt should use TTY for security
- Consider reading password from stdin for automation

## CLI Examples

```bash
# Generate entry to stdout
deno task htpasswd alice
# Enter password: ********
# Confirm password: ********
# alice:$2y$10$abc123...

# Add to htpasswd file
deno task htpasswd -f /etc/registry/htpasswd alice
# Enter password: ********
# Adding user alice to /etc/registry/htpasswd

# Create new file
deno task htpasswd -c -f /etc/registry/htpasswd alice
# Enter password: ********
# Creating /etc/registry/htpasswd with user alice

# Delete user
deno task htpasswd -D -f /etc/registry/htpasswd olduser
# Deleted user olduser from /etc/registry/htpasswd

# Verify password
deno task htpasswd -v -f /etc/registry/htpasswd alice
# Enter password: ********
# Password verified

# Piped password (for automation)
echo -n "password" | deno task htpasswd -n alice
```

## Dependencies

- Story 011: Basic Authentication

## Estimated Effort

Small (1 day)

## Definition of Done

- All acceptance criteria met
- Password hashing matches what auth module expects
- Interactive mode works correctly
- File operations are atomic
- Error messages are clear
