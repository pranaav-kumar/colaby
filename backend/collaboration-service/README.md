# Colaby Collaboration Service

The collaboration service is implemented in Go with `net/http`, Gorilla WebSocket, and PostgreSQL. It authenticates user JWTs itself and checks project membership through the Spring Project Service before serving a workspace or opening its WebSocket.

## Local setup

Requirements: Go 1.25 or newer, PostgreSQL, Git, and Docker for the optional Theia IDE containers. Redis is used by the API Gateway for rate limiting, not by this service.

Copy `.env.example` to `.env`, set `DATABASE_URL`, `JWT_SECRET`, and `PROJECT_SERVICE_KEY`, and use the same JWT and project service keys in the Spring local configuration. Start the service from this directory:

```sh
go run .
```

At startup, the service applies the idempotent SQL in `migrations/001_init.sql`. PostgreSQL stores workspace metadata, chat, whiteboard snapshots, file operations, editor snapshots, collaboration events, and recovery snapshots. Workspace files remain on disk under `WORKSPACE_ROOT_DIR` (by default `~/.local/share/colaby/workspaces`). MongoDB is no longer used.

## HTTP API

The API is available both directly under `/api/workspaces` and through the gateway prefix `/collaboration/api/workspaces`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service and PostgreSQL health |
| `GET` | `/api/workspaces/:projectId` | Workspace metadata and repository URL |
| `POST` | `/api/workspaces/:projectId/initialize` | Create a scratch workspace |
| `POST` | `/api/workspaces/:projectId/clone` | Clone its Git repository |
| `GET` | `/api/workspaces/:projectId/tree` | Read the workspace tree |
| `GET` / `POST` | `/api/workspaces/:projectId/file` | Read or save file content |
| `POST` | `/api/workspaces/:projectId/files/operation` | Create, move, rename, or delete files/folders |
| `GET` / `POST` | `/api/workspaces/:projectId/chat` | Read or send chat messages |
| `GET` / `DELETE` | `/api/workspaces/:projectId/whiteboard` | Read or clear the whiteboard |
| `GET` | `/api/workspaces/:projectId/members` | Read project membership |
| `GET` / `POST` | `/api/workspaces/:projectId/theia...` | Start, inspect, or stop the Theia container |
| `POST` | `/api/workspaces/:projectId/terminal/exec` | Run a command in the workspace |
| `GET` | `/api/workspaces/:projectId/terminal-token` | Issue a project-scoped terminal token |

## WebSockets

Workspace collaboration connects to `ws://localhost:8090/ws/workspace/:projectId?token=<JWT>`. It supports chat, whiteboard operations and cursors, filesystem operations, code updates and sync, presence, heartbeats, voice state, and WebRTC signaling. Terminal PTYs connect to `/terminal-pty?projectId=:projectId&token=<JWT>`.

Yjs update bytes are treated as opaque by the Go server, persisted in order, and replayed to joining peers. PostgreSQL also stores each editor's latest text snapshot for documents without an update history. The browser applies and merges Yjs updates; the server does not interpret CRDT internals.

The IDE section starts Theia when a project member opens it. The start endpoint returns `starting` immediately while Docker pulls the image (on first use) and boots the container; the client polls for `ready` or `error`. Docker must be available to the collaboration service process, either through Docker socket permissions or passwordless `sudo` access.

## Data note

The prior MongoDB service was not running in the local environment, so this setup creates a fresh PostgreSQL collaboration schema. Existing MongoDB data is not imported automatically. Preserve and export any MongoDB workspace data separately before removing that database if it contains information you need.
