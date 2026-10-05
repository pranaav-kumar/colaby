# Security Review: colaby-pranaav

## Scope

Static source review of the main frontend, Spring services, and Node collaboration service at pinned revision.

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_da702c8ef412382769850a12560d1a94bd074e26e4e3fee7c30055ea912e298a
- Revision: a063f4105e177aed1f2b9291852a4947055ce72b
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Artifacts reviewed: backend/collaboration-service/src/middleware/authMiddleware.js, backend/collaboration-service/src/integrations/projectService/projectServiceClient.js, backend/collaboration-service/src/websocket/websocketServer.js, backend/collaboration-service/src/services/terminalServer.js, backend/collaboration-service/src/services/workspaceService.js, frontend/src/components/workspace/TheiaIDE.jsx, backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java, backend/projectservice/src/main/java/com/example/projectservice/controller/InternalProjectController.java

Limitations and exclusions:
- Production network reachability was not established.
- Nested workspaces and dependencies were not comprehensively reviewed.
- No runtime validation performed.
- Excluded backend/collaboration-service/workspaces/\*\*: Nested workspace payload repositories were not comprehensively reviewed as product source.
- Excluded backend/collaboration-service/workspaces/\*\*: Nested project workspace repositories were not comprehensively reviewed as product source.

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 6 |
| Severity mix | high: 2, medium: 4 |
| Confidence mix | high: 5, medium: 1 |
| Coverage | partial |
| Validation mode | static source review |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Colaby is a React frontend, Spring microservices behind a gateway, and a Node collaboration service. Review covers identity, project authorization, workspace files, browser messaging, internal credentials, and user-triggered resource use.

### Assets

- User identities and JWTs
- Project membership and collaborative data
- Workspace files and host process environment
- Internal service credentials
- Community comments

### Trust Boundaries

- Browser to gateway/collaboration service
- Gateway to Spring services
- Collaboration service to project service
- Collaboration service to filesystem/PTY
- Browser window to Theia integration

### Attacker Capabilities

- Authenticated user can invoke application APIs
- Attacker with direct backend port access can send service requests
- Foreign window can message an app window it opened

### Security Objectives

- Verify identity and project membership at every relevant boundary
- Constrain workspace file operations
- Authenticate Theia bridge messages
- Bound recursive comment operations

### Assumptions

- Production network isolation is unknown
- Static review only
- Nested workspace repositories not comprehensively reviewed as product source

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Workspace file API can access paths outside project workspace](#finding-1) | high | high | inline below |
| [UUID users bypass membership checks for collaboration and terminal access](#finding-2) | high | high | inline below |
| [Unbounded comment nesting can exhaust retrieval resources](#finding-3) | medium | medium | inline below |
| [Theia bridge applies edit messages without checking sender](#finding-4) | medium | high | inline below |
| [Services trust caller-supplied identity headers when reached directly](#finding-5) | medium | high | inline below |
| [Internal project endpoint uses a checked-in fixed service credential](#finding-6) | medium | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Workspace file API can access paths outside project workspace

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Request path reaches fs read/write operations without containment validation. |
| Category | path-traversal |
| CWE | CWE-22 |
| Affected lines | backend/collaboration-service/src/controllers/workspaceController.js:88-110, backend/collaboration-service/src/services/workspaceService.js:217-225, backend/collaboration-service/src/services/workspaceService.js:294-318, backend/collaboration-service/src/utils/pathSecurity.js:65-72 |

#### Summary

Project members control file paths passed to workspaceService. Read and write sinks strip at most one leading slash and join the path to repoPath without using the existing containment sanitizer, allowing traversal to service-account-accessible files outside the workspace.

#### Root Cause

Caller-controlled path is not constrained to canonical workspace root.

**Disk read** — `backend/collaboration-service/src/services/workspaceService.js:218-223`

Traversal segments remain and escape repoPath.

```javascript
const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
const diskPath = path.join(workspace.repoPath, cleanPath);
return fs.readFileSync(diskPath, 'utf8');
```

**Disk write** — `backend/collaboration-service/src/services/workspaceService.js:296-312`

Unvalidated path reaches disk write.

```javascript
const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
const diskPath = path.join(workspace.repoPath, cleanPath);
fs.writeFileSync(diskPath, content, 'utf8');
```

#### Validation

Both disk sinks join untrusted paths without calling sanitizePath.

Validation method: Static source trace from authenticated file routes to filesystem operations.

**Disk read** — `backend/collaboration-service/src/services/workspaceService.js:218-223`

Traversal segments remain and escape repoPath.

```javascript
const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
const diskPath = path.join(workspace.repoPath, cleanPath);
return fs.readFileSync(diskPath, 'utf8');
```

**Disk write** — `backend/collaboration-service/src/services/workspaceService.js:296-312`

Unvalidated path reaches disk write.

```javascript
const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
const diskPath = path.join(workspace.repoPath, cleanPath);
fs.writeFileSync(diskPath, content, 'utf8');
```

Limitations:
- Reachable files depend on process permissions; no runtime exploit was run.

#### Dataflow

controller -\> workspaceService -\> path.join -\> fs read/write

#### Reachability

Authenticated project member controls path value.

#### Severity

**High** — Can disclose or overwrite files available to the collaboration-service account.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Read or overwrite service-account-accessible files outside project root.

**Likelihood assessment:** high

#### Remediation

Canonicalize and contain every path under workspace root before filesystem access; reject traversal and symlink escapes.

<a id="finding-2"></a>

### [2] UUID users bypass membership checks for collaboration and terminal access

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | The UUID shortcut is called by both collaboration and terminal socket admission. |
| Category | authorization |
| CWE | CWE-862 |
| Affected lines | backend/collaboration-service/src/integrations/projectService/projectServiceClient.js:90-98, backend/collaboration-service/src/websocket/websocketServer.js:101-120, backend/collaboration-service/src/services/terminalServer.js:76-87, backend/collaboration-service/src/services/terminalServer.js:109-129 |

#### Summary

isProjectMember accepts UUID-shaped IDs without querying project membership. JWT subjects are UUIDs, so any authenticated user can join an arbitrary project's WebSocket; the same helper gates PTY access, which spawns a host shell in that workspace.

#### Root Cause

Format-based identity shortcut substitutes for project membership authorization.

**UUID-shaped IDs accepted as members** — `backend/collaboration-service/src/integrations/projectService/projectServiceClient.js:90-98`

UUID users bypass membership lookup.

```javascript
if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) || targetId.startsWith('user_')) return true;
const members = await getProjectMembers(projectId);
```

**JWT subject reaches flawed membership check** — `backend/collaboration-service/src/websocket/websocketServer.js:101-120`

Signed UUID subject triggers unconditional acceptance.

```javascript
const decoded = jwt.verify(token, JWT_SECRET);
const userId = String(decoded.sub || decoded.userId || decoded.id).toLowerCase();
const isMember = await projectServiceClient.isProjectMember(projectId, userId);
```

**PTY uses same helper** — `backend/collaboration-service/src/services/terminalServer.js:76-83`

The same membership bypass gates terminal access.

```javascript
const isMember = await projectServiceClient.isProjectMember(projectId, userId);
if (!isMember) { /* reject */ }
```

#### Validation

WebSocket and PTY both pass JWT subject to helper that accepts all UUID-shaped identities.

Validation method: Static source trace from JWT verification to socket admission.

**UUID-shaped IDs accepted as members** — `backend/collaboration-service/src/integrations/projectService/projectServiceClient.js:90-98`

UUID users bypass membership lookup.

```javascript
if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) || targetId.startsWith('user_')) return true;
const members = await getProjectMembers(projectId);
```

**JWT subject reaches flawed membership check** — `backend/collaboration-service/src/websocket/websocketServer.js:101-120`

Signed UUID subject triggers unconditional acceptance.

```javascript
const decoded = jwt.verify(token, JWT_SECRET);
const userId = String(decoded.sub || decoded.userId || decoded.id).toLowerCase();
const isMember = await projectServiceClient.isProjectMember(projectId, userId);
```

**PTY uses same helper** — `backend/collaboration-service/src/services/terminalServer.js:76-83`

The same membership bypass gates terminal access.

```javascript
const isMember = await projectServiceClient.isProjectMember(projectId, userId);
if (!isMember) { /* reject */ }
```

#### Dataflow

JWT UUID -\> socket -\> membership shortcut -\> project room/host PTY

#### Reachability

Socket path skips HTTP project-membership middleware.

#### Severity

**High** — Nonmembers can access project collaboration state and obtain a shell running as the collaboration service account.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Unauthorized collaboration access and host shell in workspace.

**Likelihood assessment:** high

#### Remediation

Remove UUID shortcut; require authoritative membership for both socket paths and bind terminal tokens to user and project.

<a id="finding-3"></a>

### [3] Unbounded comment nesting can exhaust retrieval resources

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | medium |
| Confidence rationale | Unbounded recursive traversal is source-confirmed; runtime threshold not tested. |
| Category | denial-of-service |
| CWE | CWE-674 |
| Affected lines | backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:45-55, backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:64-73, backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:89-105 |

#### Summary

Comment creation accepts any existing parent without a depth limit. Retrieval and deletion recursively traverse replies, and retrieval returns the full tree. A user can persist deep chains that cause excessive database work, memory use, or stack exhaustion when read or deleted.

#### Root Cause

Comment nesting is unbounded while service traversals are recursive.

**Parent check has no depth cap** — `backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:45-55`

Any existing comment can be a parent.

```java
if (request.parentCommentId() != null && !commentRepository.existsById(request.parentCommentId())) throw new ResourceNotFoundException("Parent comment not found");
comment.setParentCommentId(request.parentCommentId());
```

**Reply traversal recurses** — `backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:89-105`

User-controlled depth drives recursive operations.

```java
for (Comment reply : replies) deleteCommentAndReplies(reply);
...
.map(r -> toResponseWithReplies(r, userId))
```

#### Validation

Only parent existence is checked; retrieval and deletion recurse without depth cap.

Validation method: Static trace of create/list/delete operations.

**Parent check has no depth cap** — `backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:45-55`

Any existing comment can be a parent.

```java
if (request.parentCommentId() != null && !commentRepository.existsById(request.parentCommentId())) throw new ResourceNotFoundException("Parent comment not found");
comment.setParentCommentId(request.parentCommentId());
```

**Reply traversal recurses** — `backend/communityservice/src/main/java/com/example/communityservice/service/CommentService.java:89-105`

User-controlled depth drives recursive operations.

```java
for (Comment reply : replies) deleteCommentAndReplies(reply);
...
.map(r -> toResponseWithReplies(r, userId))
```

Limitations:
- No runtime resource threshold or rate behavior tested.

#### Dataflow

parentCommentId -\> nested rows -\> recursive retrieval/deletion

#### Reachability

Authenticated comment author on an existing post.

#### Severity

**Medium** — Persisted nested data affects later readers/moderators; practical threshold depends on runtime.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Resource exhaustion or stack failure for affected post.

**Likelihood assessment:** medium

#### Remediation

Enforce maximum depth and same-post parent checks; paginate and cap response size; use bounded iterative traversal.

<a id="finding-4"></a>

### [4] Theia bridge applies edit messages without checking sender

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Message handler checks type and payload only before mutating Yjs. |
| Category | cross-site-messaging |
| CWE | CWE-346 |
| Affected lines | frontend/src/components/workspace/TheiaIDE.jsx:401-446, frontend/src/components/workspace/TheiaIDE.jsx:499-500 |

#### Summary

A global window listener accepts COLABY_THEIA_EDIT and applies attacker-controlled file content or operations to Yjs, which is broadcast through the authenticated collaboration socket. It does not validate event.origin or event.source.

#### Root Cause

Bridge trusts a client-controlled type field rather than authenticating frame and origin.

**Global message listener applies edits** — `frontend/src/components/workspace/TheiaIDE.jsx:401-446`

No sender or origin check precedes Yjs mutation.

```javascript
const handleTheiaBridgeMessage = (event) => {
  const data = event.data;
  if (!data || !wsConnectionRef.current?.sendMessage) return;
  if (data.type === 'COLABY_THEIA_EDIT') {
    const canonical = normalizeFilePath(data.filePath);
    const entry = getOrCreateYDoc(canonical);
    doc.transact(() => { /* apply data.content or operation */ }, 'monaco-local');
  }
};
```

**Window message listener** — `frontend/src/components/workspace/TheiaIDE.jsx:499-500`

Listener receives cross-window messages.

```javascript
window.addEventListener('message', handleTheiaBridgeMessage);
```

#### Validation

Handler applies edit payloads without event.origin/source comparison.

Validation method: Static review of message handler.

**Global message listener applies edits** — `frontend/src/components/workspace/TheiaIDE.jsx:401-446`

No sender or origin check precedes Yjs mutation.

```javascript
const handleTheiaBridgeMessage = (event) => {
  const data = event.data;
  if (!data || !wsConnectionRef.current?.sendMessage) return;
  if (data.type === 'COLABY_THEIA_EDIT') {
    const canonical = normalizeFilePath(data.filePath);
    const entry = getOrCreateYDoc(canonical);
    doc.transact(() => { /* apply data.content or operation */ }, 'monaco-local');
  }
};
```

**Window message listener** — `frontend/src/components/workspace/TheiaIDE.jsx:499-500`

Listener receives cross-window messages.

```javascript
window.addEventListener('message', handleTheiaBridgeMessage);
```

#### Dataflow

postMessage -\> bridge -\> Yjs -\> collaboration broadcast

#### Reachability

Victim has active IDE and attacker has Window reference.

#### Severity

**Medium** — Requires an authenticated victim with the IDE active and an attacker-controlled Window reference; allows persistent project edits.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Project source tampering via victim session.

**Likelihood assessment:** medium

#### Remediation

Accept messages only from expected iframe and origin; validate message schema and file path.

<a id="finding-5"></a>

### [5] Services trust caller-supplied identity headers when reached directly

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Header trust is explicit in source; production network reachability is unknown. |
| Category | authentication |
| CWE | CWE-290 |
| Affected lines | backend/collaboration-service/src/middleware/authMiddleware.js:8-14, backend/projectservice/src/main/java/com/example/projectservice/controller/ProjectController.java:36-62, backend/apigateway/src/main/java/com/example/apigateway/filter/JwtAuthGlobalFilter.java:42-59 |

#### Summary

Collaboration middleware accepts X-User-Id/X-UserId without JWT verification, and Spring controllers use X-User-Id as caller identity. The gateway validates JWTs, but direct service-port access bypasses it; repository configuration does not establish network isolation.

#### Root Cause

Identity headers are treated as authentication proof absent cryptographic or enforced service-boundary checks.

**Node middleware trusts supplied identity** — `backend/collaboration-service/src/middleware/authMiddleware.js:8-14`

Identity header bypasses JWT verification.

```javascript
const headerUserId = req.headers['x-user-id'] || req.headers['x-userid'];
if (headerUserId) { req.userId = String(headerUserId).toLowerCase(); return next(); }
```

**Spring service uses header as identity** — `backend/projectservice/src/main/java/com/example/projectservice/controller/ProjectController.java:36-62`

Header value is used for project operations.

```java
@RequestHeader("X-User-Id") String userIdHeader,
UUID userId = UUID.fromString(userIdHeader);
```

#### Validation

Gateway validates JWT; direct service code trusts header. Network boundary is unknown.

Validation method: Static comparison of gateway JWT validation and backend identity use.

**Node middleware trusts supplied identity** — `backend/collaboration-service/src/middleware/authMiddleware.js:8-14`

Identity header bypasses JWT verification.

```javascript
const headerUserId = req.headers['x-user-id'] || req.headers['x-userid'];
if (headerUserId) { req.userId = String(headerUserId).toLowerCase(); return next(); }
```

**Spring service uses header as identity** — `backend/projectservice/src/main/java/com/example/projectservice/controller/ProjectController.java:36-62`

Header value is used for project operations.

```java
@RequestHeader("X-User-Id") String userIdHeader,
UUID userId = UUID.fromString(userIdHeader);
```

Limitations:
- Exploitability depends on deployment network access.

#### Dataflow

direct service request -\> trusted identity header -\> authorization logic

#### Reachability

Conditional on direct backend port access.

#### Severity

**Medium** — Direct port access is a deployment precondition not verified here; if reachable, permits identity spoofing and authorization bypass.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Impersonation on reachable service.

**Likelihood assessment:** medium

#### Remediation

Authenticate service requests independently, strip incoming identity headers before setting verified values, and restrict backend ports to trusted callers.

<a id="finding-6"></a>

### [6] Internal project endpoint uses a checked-in fixed service credential

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Controller compares header with fixed constant and returns member data; example configuration repeats it. |
| Category | hardcoded-credentials |
| CWE | CWE-798 |
| Affected lines | backend/projectservice/src/main/java/com/example/projectservice/controller/InternalProjectController.java:21-47, backend/collaboration-service/.env.example:4 |

#### Summary

Internal endpoint checks X-Service-Key against a fixed source value also present in collaboration-service example config. Anyone with project-service port access and the source-visible value can retrieve project membership lists.

#### Root Cause

Fixed source-visible credential protects internal endpoint.

**Fixed key check; secret redacted** — `backend/projectservice/src/main/java/com/example/projectservice/controller/InternalProjectController.java:21-47`

Fixed key gates the members endpoint. Secret intentionally redacted.

```java
private static final String SERVICE_KEY = "[redacted checked-in value]";
...
if (!SERVICE_KEY.equals(serviceKey)) return ResponseEntity.status(403).build();
return ResponseEntity.ok(projectService.getMembersInternal(projectId));
```

**Committed example repeats key; redacted** — `backend/collaboration-service/.env.example:4`

Secret intentionally redacted.

```dotenv
PROJECT_SERVICE_KEY=[redacted checked-in value]
```

#### Validation

Fixed key gates project membership retrieval and is duplicated in committed example config.

Validation method: Static review of endpoint guard and service example configuration.

**Fixed key check; secret redacted** — `backend/projectservice/src/main/java/com/example/projectservice/controller/InternalProjectController.java:21-47`

Fixed key gates the members endpoint. Secret intentionally redacted.

```java
private static final String SERVICE_KEY = "[redacted checked-in value]";
...
if (!SERVICE_KEY.equals(serviceKey)) return ResponseEntity.status(403).build();
return ResponseEntity.ok(projectService.getMembersInternal(projectId));
```

**Committed example repeats key; redacted** — `backend/collaboration-service/.env.example:4`

Secret intentionally redacted.

```dotenv
PROJECT_SERVICE_KEY=[redacted checked-in value]
```

Limitations:
- Production network policy and key rotation not inspected.

#### Dataflow

fixed key -\> X-Service-Key -\> controller -\> member list

#### Reachability

Conditional on direct project-service access.

#### Severity

**Medium** — Endpoint is described as internal and not gateway-routed; impact depends on direct port exposure.

Additional runtime or deployment evidence could raise or lower this severity.

**Impact assessment:** Project membership disclosure.

**Likelihood assessment:** medium

#### Remediation

Remove and rotate committed key, load a unique secret from secret manager, and restrict endpoint to authenticated service-to-service callers.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| API identity and project authorization | not recorded | Reported | No additional canonical notes were recorded. |
| Collaboration and terminal authorization | not recorded | Reported | No additional canonical notes were recorded. |
| Workspace file access | not recorded | Reported | No additional canonical notes were recorded. |
| Theia message bridge | not recorded | Reported | No additional canonical notes were recorded. |
| Comment nesting and retrieval | not recorded | Reported | No additional canonical notes were recorded. |
| Internal service key | not recorded | Reported | No additional canonical notes were recorded. |
| Nested workspace repositories and dependencies | not recorded | Needs follow-up | No additional canonical notes were recorded. |
| Internal service key and endpoint | not recorded | Reported | No additional canonical notes were recorded. |
| Nested workspace repositories and vendored dependencies | not recorded | Needs follow-up | No additional canonical notes were recorded. |

## Open Questions And Follow Up

- Same containment sinks and remediation as the path traversal finding; not separate.
  - Follow-up prompt: Review deferred unit workspace-symlink-escape and close its stated proof gap.
- Cannot establish production network reachability from checked-in repository.
  - Follow-up prompt: Review deferred unit runtime-service-network-boundaries and close its stated proof gap.
- Awaiting parent source validation.
  - Follow-up prompt: Review deferred unit baseline-collab-header-trust and close its stated proof gap.
