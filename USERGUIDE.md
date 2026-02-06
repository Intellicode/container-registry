# Container Registry User Guide

This guide explains how to use the OCI-compliant container registry, including
authentication, pushing/pulling images, and configuration.

## Table of Contents

- [Quick Start](#quick-start)
- [Running the Registry](#running-the-registry)
- [Configuration](#configuration)
- [Authentication](#authentication)
  - [No Authentication](#no-authentication)
  - [Basic Authentication](#basic-authentication)
  - [Token (JWT) Authentication](#token-jwt-authentication)
- [Access Control](#access-control)
- [Docker Operations](#docker-operations)
  - [Logging In](#logging-in)
  - [Pushing Images](#pushing-images)
  - [Pulling Images](#pulling-images)
  - [Listing Tags](#listing-tags)
  - [Deleting Images](#deleting-images)
- [Storage](#storage)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Start the registry with no authentication
deno task start

# Push an image
docker tag myimage:latest localhost:15000/myimage:latest
docker push localhost:15000/myimage:latest

# Pull an image
docker pull localhost:15000/myimage:latest
```

---

## Running the Registry

### Prerequisites

- [Deno](https://deno.land/) 1.40 or later

### Starting the Server

```bash
# Production mode
deno task start

# Development mode (with hot reload)
deno task dev
```

The registry starts on `http://0.0.0.0:15000` by default.

### Running Tests

```bash
deno task test
```

---

## Configuration

All configuration is done via environment variables.

### Server Configuration

| Variable             | Description                                  | Default   |
| -------------------- | -------------------------------------------- | --------- |
| `REGISTRY_HOST`      | Listen address                               | `0.0.0.0` |
| `REGISTRY_PORT`      | Listen port                                  | `15000`   |
| `REGISTRY_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info`    |

### Storage Configuration

| Variable                           | Description                                     | Default         |
| ---------------------------------- | ----------------------------------------------- | --------------- |
| `REGISTRY_STORAGE_PATH`            | Root directory for blob storage                 | `./data`        |
| `REGISTRY_UPLOAD_TIMEOUT`          | Upload session timeout in seconds               | `3600` (1 hour) |
| `REGISTRY_UPLOAD_CLEANUP_INTERVAL` | Cleanup interval for expired uploads in seconds | `300` (5 min)   |

### Authentication Configuration

| Variable                 | Description                                    | Default    |
| ------------------------ | ---------------------------------------------- | ---------- |
| `REGISTRY_AUTH_TYPE`     | Authentication type (`none`, `basic`, `token`) | `none`     |
| `REGISTRY_AUTH_REALM`    | Authentication realm name                      | `Registry` |
| `REGISTRY_AUTH_HTPASSWD` | Path to htpasswd file (for basic auth)         | -          |

### Token Authentication Configuration

| Variable                        | Description                       | Default  |
| ------------------------------- | --------------------------------- | -------- |
| `REGISTRY_AUTH_TOKEN_REALM`     | Token service URL                 | Required |
| `REGISTRY_AUTH_TOKEN_SERVICE`   | Service name for token validation | Required |
| `REGISTRY_AUTH_TOKEN_ISSUER`    | Expected token issuer             | Required |
| `REGISTRY_AUTH_TOKEN_PUBLICKEY` | Path to public key PEM file       | Required |

### Access Control Configuration

| Variable                          | Description                        | Default |
| --------------------------------- | ---------------------------------- | ------- |
| `REGISTRY_ACCESS_CONTROL_ENABLED` | Enable access control              | `false` |
| `REGISTRY_ACCESS_CONTROL_CONFIG`  | Path to access control config JSON | -       |

### Pagination Configuration

| Variable                            | Description       | Default |
| ----------------------------------- | ----------------- | ------- |
| `REGISTRY_PAGINATION_DEFAULT_LIMIT` | Default page size | `100`   |
| `REGISTRY_PAGINATION_MAX_LIMIT`     | Maximum page size | `1000`  |

### Example: Running with Basic Auth

```bash
REGISTRY_AUTH_TYPE=basic \
REGISTRY_AUTH_HTPASSWD=./htpasswd \
deno task start
```

---

## Authentication

### No Authentication

By default, the registry runs without authentication. All operations are
allowed.

```bash
REGISTRY_AUTH_TYPE=none deno task start
```

### Basic Authentication

Basic authentication uses an htpasswd file with bcrypt-hashed passwords.

#### Creating an htpasswd File

Use Apache's `htpasswd` utility with the `-B` flag for bcrypt:

```bash
# Create a new htpasswd file with a user
htpasswd -Bbc ./htpasswd myuser mypassword

# Add another user to existing file
htpasswd -Bb ./htpasswd anotheruser anotherpassword
```

The file format is:

```
username:$2y$10$...bcrypt_hash...
```

**Important:** Only bcrypt hashes are supported (must start with `$2y$`, `$2a$`,
or `$2b$`).

#### Enabling Basic Auth

```bash
REGISTRY_AUTH_TYPE=basic \
REGISTRY_AUTH_HTPASSWD=./htpasswd \
REGISTRY_AUTH_REALM="My Registry" \
deno task start
```

#### Docker Login with Basic Auth

```bash
docker login localhost:15000
# Enter username and password when prompted
```

### Token (JWT) Authentication

Token authentication uses JWT tokens signed with RSA or ECDSA keys. This is
compatible with Docker's token-based authentication flow.

#### Setting Up Token Auth

1. Generate an RSA key pair:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

2. Configure the registry:

```bash
REGISTRY_AUTH_TYPE=token \
REGISTRY_AUTH_TOKEN_REALM="https://auth.example.com/token" \
REGISTRY_AUTH_TOKEN_SERVICE="my-registry" \
REGISTRY_AUTH_TOKEN_ISSUER="auth.example.com" \
REGISTRY_AUTH_TOKEN_PUBLICKEY=./public.pem \
deno task start
```

3. Set up an external token service that issues JWTs with this payload
   structure:

```json
{
  "iss": "auth.example.com",
  "sub": "username",
  "aud": "my-registry",
  "exp": 1234567890,
  "iat": 1234567800,
  "access": [
    {
      "type": "repository",
      "name": "myimage",
      "actions": ["pull", "push"]
    }
  ]
}
```

---

## Access Control

Access control provides fine-grained permissions for repository operations.

### Enabling Access Control

```bash
REGISTRY_ACCESS_CONTROL_ENABLED=true \
REGISTRY_ACCESS_CONTROL_CONFIG=./access-control.json \
deno task start
```

### Access Control Configuration File

Create an `access-control.json` file:

```json
{
  "defaultPolicy": "deny",
  "adminUsers": ["admin"],
  "rules": [
    {
      "repository": "public/**",
      "users": ["*"],
      "permissions": ["pull"]
    },
    {
      "repository": "team-a/*",
      "users": ["alice", "bob"],
      "permissions": ["pull", "push"]
    },
    {
      "repository": "production/**",
      "users": ["deployer"],
      "permissions": ["pull", "push", "delete"]
    }
  ]
}
```

### Configuration Options

- **defaultPolicy**: `"allow"` or `"deny"` - action when no rule matches
- **adminUsers**: List of usernames that bypass all access checks
- **rules**: Ordered list of access rules (first match wins)

### Rule Structure

| Field         | Description                                         |
| ------------- | --------------------------------------------------- |
| `repository`  | Repository pattern to match                         |
| `users`       | List of usernames (`"*"` = all authenticated users) |
| `permissions` | List of allowed actions: `pull`, `push`, `delete`   |

### Pattern Matching

- `*` - matches a single path segment (e.g., `team-*` matches `team-a`,
  `team-b`)
- `**` - matches any number of path segments (e.g., `org/**` matches `org/app`,
  `org/team/app`)

### Permission Mapping

| Permission | Allowed Operations              |
| ---------- | ------------------------------- |
| `pull`     | GET/HEAD blobs, manifests, tags |
| `push`     | PUT/POST/PATCH blobs, manifests |
| `delete`   | DELETE blobs, manifests         |

---

## Docker Operations

### Logging In

```bash
# With basic auth
docker login localhost:15000
Username: myuser
Password: ****

# Verify login
docker login localhost:15000
# Should show: Login Succeeded
```

### Pushing Images

```bash
# Tag your image for the registry
docker tag myimage:latest localhost:15000/myimage:latest

# Push the image
docker push localhost:15000/myimage:latest

# Push to a namespace
docker tag myimage:latest localhost:15000/myorg/myimage:v1.0.0
docker push localhost:15000/myorg/myimage:v1.0.0
```

### Pulling Images

```bash
# Pull an image
docker pull localhost:15000/myimage:latest

# Pull a specific version
docker pull localhost:15000/myorg/myimage:v1.0.0
```

### Listing Tags

Use the registry API directly:

```bash
# List all tags for an image
curl http://localhost:15000/v2/myimage/tags/list

# With authentication
curl -u myuser:mypassword http://localhost:15000/v2/myimage/tags/list

# Paginated results
curl "http://localhost:15000/v2/myimage/tags/list?n=10"
```

### Listing Repositories

```bash
# List all repositories (catalog)
curl http://localhost:15000/v2/_catalog

# With pagination
curl "http://localhost:15000/v2/_catalog?n=50&last=lastRepo"
```

### Deleting Images

Images must be deleted by digest, not by tag:

```bash
# Get the digest for a tag
DIGEST=$(curl -I -H "Accept: application/vnd.oci.image.manifest.v1+json" \
  http://localhost:15000/v2/myimage/manifests/latest 2>/dev/null | \
  grep -i docker-content-digest | awk '{print $2}' | tr -d '\r')

# Delete the manifest
curl -X DELETE "http://localhost:15000/v2/myimage/manifests/$DIGEST"
```

**Note:** Deleting a manifest removes all tags pointing to it. Blobs are only
deleted when no other manifests reference them.

---

## Storage

### Directory Structure

The registry stores data in a content-addressable filesystem:

```
data/
├── blobs/sha256/          # Content-addressable blob storage
│   └── ab/abcdef.../      # Two-level directory structure
├── repositories/          # Repository metadata
│   └── myimage/
│       ├── _manifests/    # Manifest data and tags
│       └── _layers/       # Layer links
└── uploads/               # In-progress uploads
```

### Storage Features

- **Content Deduplication**: Identical layers are stored once
- **Atomic Writes**: Uses temp files with rename for consistency
- **Automatic Cleanup**: Expired upload sessions are cleaned periodically
- **Reference Counting**: Blobs are only deleted when unreferenced

---

## API Reference

### Base Endpoint

| Method | Path   | Description                        |
| ------ | ------ | ---------------------------------- |
| GET    | `/v2/` | API version check (returns 200 OK) |

### Blob Operations

| Method | Path                                              | Description          |
| ------ | ------------------------------------------------- | -------------------- |
| HEAD   | `/v2/<name>/blobs/<digest>`                       | Check blob existence |
| GET    | `/v2/<name>/blobs/<digest>`                       | Download blob        |
| DELETE | `/v2/<name>/blobs/<digest>`                       | Delete blob          |
| POST   | `/v2/<name>/blobs/uploads/`                       | Start upload         |
| GET    | `/v2/<name>/blobs/uploads/<uuid>`                 | Get upload status    |
| PATCH  | `/v2/<name>/blobs/uploads/<uuid>`                 | Upload chunk         |
| PUT    | `/v2/<name>/blobs/uploads/<uuid>?digest=<digest>` | Complete upload      |
| DELETE | `/v2/<name>/blobs/uploads/<uuid>`                 | Cancel upload        |

### Manifest Operations

| Method | Path                            | Description              |
| ------ | ------------------------------- | ------------------------ |
| HEAD   | `/v2/<name>/manifests/<ref>`    | Check manifest existence |
| GET    | `/v2/<name>/manifests/<ref>`    | Download manifest        |
| PUT    | `/v2/<name>/manifests/<ref>`    | Upload manifest          |
| DELETE | `/v2/<name>/manifests/<digest>` | Delete manifest          |

### Tag & Catalog Operations

| Method | Path                   | Description       |
| ------ | ---------------------- | ----------------- |
| GET    | `/v2/<name>/tags/list` | List tags         |
| GET    | `/v2/_catalog`         | List repositories |

### Supported Media Types

- `application/vnd.oci.image.manifest.v1+json`
- `application/vnd.oci.image.index.v1+json`
- `application/vnd.docker.distribution.manifest.v2+json`
- `application/vnd.docker.distribution.manifest.list.v2+json`

---

## Troubleshooting

### "unauthorized: authentication required"

- Ensure you've logged in with `docker login`
- Check that your htpasswd file contains valid bcrypt hashes
- Verify `REGISTRY_AUTH_HTPASSWD` points to the correct file

### "denied: access forbidden"

- Access control is enabled and you don't have permission
- Check your access control rules
- Verify your username is in the allowed users list

### "manifest unknown"

- The image or tag doesn't exist
- Ensure you've pushed the image first
- Check for typos in the image name or tag

### "blob unknown"

- A layer referenced by the manifest is missing
- Try re-pushing the image

### Docker push fails with "server gave HTTP response to HTTPS client"

Configure Docker to allow insecure registries:

1. Edit `/etc/docker/daemon.json`:

```json
{
  "insecure-registries": ["localhost:15000"]
}
```

2. Restart Docker:

```bash
sudo systemctl restart docker
```

### Uploads timing out

Increase the upload timeout:

```bash
REGISTRY_UPLOAD_TIMEOUT=7200 deno task start  # 2 hours
```

### Storage growing too large

- Delete unused images and their manifests
- Expired upload sessions are cleaned automatically
- Consider implementing garbage collection for orphaned blobs

---

## Security Recommendations

1. **Always use authentication in production** - Set `REGISTRY_AUTH_TYPE` to
   `basic` or `token`
2. **Use HTTPS** - Deploy behind a reverse proxy with TLS (nginx, Traefik, etc.)
3. **Enable access control** - Restrict who can push/pull/delete images
4. **Secure the storage directory** - Ensure proper filesystem permissions
5. **Rotate credentials regularly** - Update htpasswd entries periodically
6. **Monitor access logs** - Enable debug logging to track operations
