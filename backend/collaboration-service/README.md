# Colaby Collaboration Service

Real-time collaborative workspace microservice for the Colaby platform.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-time**: WebSocket (`ws` library)
- **CRDT**: Yjs (text), custom Tree-CRDT (file system), LWW per-field (whiteboard)
- **Voice**: WebRTC signaling (mesh topology)
- **Auth**: JWT + service-key for internal communication

## Architecture

```
collaboration-service/
├── src/
│   ├── config/          # Environment & database config
│   ├── controllers/     # REST endpoint handlers
│   ├── routes/          # Express route definitions
│   ├── middleware/      # Auth, access control, rate limiting, validation
│   ├── websocket/       # WebSocket server, event routing, validation
│   ├── collaboration/   # CRDT engines (code, filesystem, whiteboard, voice, presence, ordering)
│   ├── models/          # Mongoose schemas (7 collections)
│   ├── services/        # Business logic layer
│   ├── integrations/    # Project Service client
│   ├── utils/           # Logger, errors, IDs, path security
│   ├── app.js           # Express application setup
│   └── server.js        # Entry point
├── .env.example
├── package.json
└── README.md
```

## Setup

### Prerequisites

- Node.js 18+
- MongoDB running on `localhost:27017`
- Colaby Project Service running on `localhost:8084`

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `8090` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/colaby-collaboration` |
| `PROJECT_SERVICE_URL` | Project Service base URL | `http://localhost:8084` |
| `PROJECT_SERVICE_KEY` | Random service-to-service secret; configure the same value for collaboration-service and project-service | *(required)* |
| `JWT_SECRET` | JWT signing secret (shared with Auth Service) | *(required)* |
| `NODE_ENV` | Environment | `development` |
| `WORKSPACE_ROOT_DIR` | Base directory for cloned repos | `./workspaces` |

Generate `PROJECT_SERVICE_KEY` outside source control and provide it to both services through their runtime environment (or ignored local configuration). The example file intentionally leaves secrets blank. Spring service ports bind to loopback in the local configuration; deployments using separate hosts must enforce an equivalent private network boundary. The collaboration service authenticates bearer JWTs directly because browser and IDE-container clients connect to it.

### Running

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

## API Endpoints

### REST

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/workspaces/:projectId` | Get/create workspace |
| `POST` | `/api/workspaces/:projectId/initialize` | Initialize workspace |
| `POST` | `/api/workspaces/:projectId/clone` | Clone GitHub repository |
| `GET` | `/api/workspaces/:projectId/members` | Get project members |
| `GET` | `/api/workspaces/:projectId/chat` | Get chat history (paginated) |
| `POST` | `/api/workspaces/:projectId/chat` | Send chat message |
| `GET` | `/api/workspaces/:projectId/whiteboard` | Get whiteboard state |

### WebSocket

Connect to: `ws://localhost:8090/ws/workspace/:projectId?token=<JWT>`

#### Event Types

| Event | Direction | Persisted |
|---|---|---|
| `CHAT_MESSAGE` | bidirectional | ✅ MongoDB |
| `WHITEBOARD_OBJECT_CREATE` | bidirectional | ✅ MongoDB |
| `WHITEBOARD_OBJECT_UPDATE` | bidirectional | ✅ MongoDB |
| `WHITEBOARD_OBJECT_DELETE` | bidirectional | ✅ MongoDB |
| `WHITEBOARD_CURSOR_MOVE` | bidirectional | ❌ Ephemeral |
| `FILE_CREATE` | bidirectional | ✅ MongoDB |
| `FILE_DELETE` | bidirectional | ✅ MongoDB |
| `FILE_RENAME` | bidirectional | ✅ MongoDB |
| `FILE_MOVE` | bidirectional | ✅ MongoDB |
| `CODE_OPERATION` | bidirectional | ✅ MongoDB |
| `CODE_CURSOR_MOVE` | bidirectional | ❌ Ephemeral |
| `JOIN_VOICE` / `LEAVE_VOICE` | client → server | ❌ |
| `WEBRTC_OFFER` / `ANSWER` / `ICE_CANDIDATE` | relay | ❌ |
| `HEARTBEAT` | bidirectional | ❌ |

## MongoDB Collections

- `workspaces` — One per project (unique on projectId)
- `chatmessages` — Persisted chat messages
- `whiteboarddocuments` — Whiteboard object state snapshots
- `fileoperations` — File tree CRDT operations log
- `codedocuments` — Yjs encoded document states
- `collaborationevents` — Meaningful operation event log
- `snapshots` — State snapshots for recovery

## Integration

This service integrates with the Spring Boot Project Service via:

```
GET http://localhost:8084/projects/internal/{projectId}/members
X-Service-Key: <PROJECT_SERVICE_KEY>
```

It does NOT duplicate project or member management. The Project Service remains the source of truth.
