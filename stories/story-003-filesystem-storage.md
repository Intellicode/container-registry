# Story 003: Filesystem Storage Layer

## User Story

**As a** registry operator  
**I want** blobs and metadata stored on the local filesystem  
**So that** I can run a simple, self-contained registry without external dependencies

## Priority

**High** - Phase 1 MVP (Blocking)

## Description

Implement the filesystem-based storage layer that provides content-addressable blob storage and repository metadata management. This is the foundation for all blob and manifest operations.

## Acceptance Criteria

- [ ] Storage interface defined in `src/storage/interface.ts`:
  ```typescript
  interface StorageDriver {
    // Blob operations
    hasBlob(digest: string): Promise<boolean>;
    getBlob(digest: string): Promise<ReadableStream | null>;
    getBlobSize(digest: string): Promise<number | null>;
    putBlob(digest: string, stream: ReadableStream): Promise<void>;
    deleteBlob(digest: string): Promise<boolean>;
    
    // Repository layer links
    linkBlob(repository: string, digest: string): Promise<void>;
    unlinkBlob(repository: string, digest: string): Promise<void>;
    
    // Manifest operations
    getManifest(repository: string, reference: string): Promise<{content: Uint8Array, digest: string} | null>;
    putManifest(repository: string, reference: string, content: Uint8Array, digest: string): Promise<void>;
    deleteManifest(repository: string, reference: string): Promise<boolean>;
    
    // Tag operations
    listTags(repository: string): Promise<string[]>;
    
    // Repository operations
    listRepositories(): Promise<string[]>;
  }
  ```
- [ ] Filesystem implementation in `src/storage/filesystem.ts`
- [ ] Blob storage uses two-level directory structure:
  ```
  data/blobs/sha256/ab/abcdef1234...
  ```
- [ ] Repository metadata structure:
  ```
  data/repositories/<name>/_manifests/tags/<tag>/current/link
  data/repositories/<name>/_manifests/revisions/sha256/<digest>/link
  data/repositories/<name>/_layers/sha256/<digest>/link
  ```
- [ ] Storage root directory is configurable via `REGISTRY_STORAGE_PATH`
- [ ] Directories are created automatically if they don't exist
- [ ] Blob writes are atomic (write to temp, then rename)
- [ ] Supports nested repository names (e.g., `myorg/myimage`)

## Technical Notes

- Use Deno's built-in `Deno.open()`, `Deno.readDir()`, etc.
- Streaming is critical for large blobs - never load entire blob into memory
- Two-level directory structure prevents filesystem inode limits
- Link files contain just the digest string (e.g., `sha256:abc123...`)
- Atomic writes prevent corruption from interrupted uploads

## Non-Functional Requirements

- Blob operations should stream data (not buffer entire blob)
- Handle concurrent read/write operations safely
- Storage should have no practical limit on number of blobs

## Dependencies

- Story 001: Project Setup

## Estimated Effort

Medium (2-3 days)

## Definition of Done

- All acceptance criteria met
- Unit tests cover all interface methods
- Tests verify atomic write behavior
- Tests verify streaming (large file handling)
- Storage operations work with concurrent access
