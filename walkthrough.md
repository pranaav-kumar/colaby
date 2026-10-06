# Colaby API — Postman Walkthrough

> **Base URL**: `http://localhost:8080` (API Gateway)
> All authenticated requests require the header:
> `Authorization: Bearer <accessToken>`

---

## 0. Postman Setup

Before you start, create a **Postman Collection Variable** called `token` — you'll update it after login and reuse it everywhere.

In each authenticated request, set the **Authorization** tab to:
- Type: `Bearer Token`
- Token: `{{token}}`

---

## Phase 1 — Authentication (Auth Service)

These endpoints are **public** — no token needed.

---

### 1.1 Sign Up

Creates a new user account. Automatically creates a blank user profile in the user details service.

```
POST http://localhost:8080/auth/signup
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "pranaav@example.com",
  "password": "mypassword123"
}
```

**Validation rules:**
- `email` must be a valid email address
- `password` must be at least 8 characters

**Response `200 OK`:**
```json
{
    "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2MDdiMjNlYS0wOTRlLTQ2YTQtYTE5ZC04MDQ3Y2ZkYWY0NmQiLCJpYXQiOjE3ODgzMzc4NTgsImV4cCI6MTc4ODMzODc1OH0.ZbNm-Tgab80lvYpHNQYkpOkSJbXWZKbyZouBKIdIQOs",
    "refreshToken": "jQol_aBVwynmgOkB1V55boToGCirJteyLDIPUU5TEKaZXlb8KXL9XMpfJyRqREgJiV8bywVBOoFcAbRKH_0C8Q"
}
```

> ✅ **Copy the `accessToken`** and save it as the `token` collection variable.

---

### 1.2 Login

```
POST http://localhost:8080/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "pranaav@example.com",
  "password": "mypassword123"
}
```

**Response `200 OK`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "a3f9e8c2-1234-..."
}
```

> ✅ Update `{{token}}` with the new `accessToken`.
> 📌 Save the `refreshToken` — you'll need it to refresh sessions.

---

### 1.3 Refresh Access Token

Use this when the access token expires (typically short-lived).

```
POST http://localhost:8080/auth/refresh
Content-Type: application/json
```

**Request Body:**
```json
{
  "refreshToken": "a3f9e8c2-1234-..."
}
```

**Response `200 OK`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...<new token>",
  "refreshToken": "a3f9e8c2-1234-..."
}
```

---

### 1.4 Logout

Invalidates the refresh token on the server.

```
POST http://localhost:8080/auth/logout
Content-Type: application/json
```

**Request Body:**
```json
{
  "refreshToken": "a3f9e8c2-1234-..."
}
```

**Response `200 OK`:**
```json
{
  "message": "logged out"
}
```

---

## Phase 2 — User Profile (User Details Service)

These endpoints **require the Bearer token**.
The gateway extracts the user ID from the JWT and injects it as `X-User-Id` — you never send it manually.

---

### 2.1 Set / Update Profile

Creates or updates your profile details.

```
PUT http://localhost:8080/users/details
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "fullName": "Pranaav Kumar",
  "userName": "pranaav_dev",
  "bio": "Full-stack dev who loves Spring Boot",
  "githubUrl": "https://github.com/pranaav",
  "linkedinUrl": "https://linkedin.com/in/pranaav",
  "portfolioUrl": "https://pranaav.dev",
  "profileUrl": "https://cdn.example.com/avatar.jpg",
  "openToCollaborate": true,
  "skills": ["Java", "Spring Boot", "React", "PostgreSQL"]
}
```

**Response `200 OK`** — returns the saved `UserDetail` object.

---

### 2.2 Get Your Profile (by ID)

First get your user ID from the JWT (decode it at [jwt.io](https://jwt.io)), then:

```
GET http://localhost:8080/users/details/{userId}
Authorization: Bearer {{token}}
```

Replace `{userId}` with your UUID from the token's `sub` claim.

---

### 2.3 Get All Profiles

```
GET http://localhost:8080/users/allprofiles
Authorization: Bearer {{token}}
```

---

## Phase 3 — Communities

All requests require `Authorization: Bearer {{token}}`.

---

### 3.1 Create a Community

```
POST http://localhost:8080/communities
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "java-devs",
  "description": "A community for Java developers to share knowledge and ask questions."
}
```

**Response `201 Created`:**
```json
{
    "id": "0e528a56-16fe-4cf7-9682-a67df22e442e",
    "name": "java-devs",
    "description": "A community for Java developers to share knowledge and ask questions.",
    "createdBy": "your-user-uuid",
    "createdAt": "2026-09-02T08:37:40.077576900Z",
    "memberCount": 1,
    "isMember": true
}
```

> 📌 **Save the `id`** — you'll use it as `{communityId}` in subsequent requests.

**Error cases:**
- `409 Conflict` — community name already taken
- `400 Bad Request` — blank name

---

### 3.2 List All Communities

```
GET http://localhost:8080/communities
Authorization: Bearer {{token}}
```

Returns an array of communities with `memberCount` and `isMember` (relative to you).

---

### 3.3 Get a Single Community

```
GET http://localhost:8080/communities/{communityId}
Authorization: Bearer {{token}}
```

---

### 3.4 Join a Community

```
POST http://localhost:8080/communities/{communityId}/join
Authorization: Bearer {{token}}
```

No request body needed.

**Response `200 OK`** — empty body.

**Error cases:**
- `409 Conflict` — already a member
- `404 Not Found` — community doesn't exist

---

### 3.5 Leave a Community

```
DELETE http://localhost:8080/communities/{communityId}/leave
Authorization: Bearer {{token}}
```

**Response `204 No Content`**.

---

### 3.6 Get Posts in a Community

```
GET http://localhost:8080/communities/{communityId}/posts
Authorization: Bearer {{token}}
```

Returns posts newest-first with vote counts and your vote status.

---

## Phase 4 — Posts

---

### 4.1 Create a Post

You must be a **member** of the community to post.

```
POST http://localhost:8080/posts/communities/{communityId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "What is your favorite Spring Boot feature in 2026?",
  "body": "I've been loving the new declarative HTTP clients. What about you?"
}
```

**Response `201 Created`:**
```json
{
  "id": "p1a2b3c4-...",
  "communityId": "c1a2b3c4-...",
  "communityName": "java-devs",
  "authorId": "your-user-uuid",
  "title": "What is your favorite Spring Boot feature in 2026?",
  "body": "I've been loving the new declarative HTTP clients...",
  "upvotes": 0,
  "downvotes": 0,
  "commentCount": 0,
  "userVote": null,
  "createdAt": "2026-09-02T07:05:00Z",
  "updatedAt": "2026-09-02T07:05:00Z"
}
```

> 📌 **Save the `id`** as `{postId}`.

**Error cases:**
- `403 Forbidden` — not a member of the community
- `400 Bad Request` — blank title

---

### 4.2 Get a Single Post

```
GET http://localhost:8080/posts/{postId}
Authorization: Bearer {{token}}
```

---

### 4.3 My Posts (all posts you've created)

```
GET http://localhost:8080/posts/my
Authorization: Bearer {{token}}
```

Returns all posts authored by the current user, newest first.

---

### 4.4 Delete Your Post

Only the post author can delete it.

```
DELETE http://localhost:8080/posts/{postId}
Authorization: Bearer {{token}}
```

**Response `204 No Content`**.

Automatically deletes all comments and votes on that post.

**Error cases:**
- `403 Forbidden` — trying to delete someone else's post
- `404 Not Found` — post doesn't exist

---

## Phase 5 — Comments

---

### 5.1 Add a Top-Level Comment

```
POST http://localhost:8080/comments/posts/{postId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "body": "Spring Security is my favourite! The new Lambda DSL is so clean.",
  "parentCommentId": null
}
```

**Response `201 Created`:**
```json
{
  "id": "cm1a2b3c-...",
  "postId": "p1a2b3c4-...",
  "authorId": "your-user-uuid",
  "parentCommentId": null,
  "body": "Spring Security is my favourite!...",
  "upvotes": 0,
  "downvotes": 0,
  "userVote": null,
  "createdAt": "2026-09-02T07:10:00Z",
  "replies": []
}
```

> 📌 **Save the `id`** as `{commentId}`.

---

### 5.2 Reply to a Comment (Nested Reply)

Set `parentCommentId` to an existing comment's ID.

```
POST http://localhost:8080/comments/posts/{postId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "body": "Agreed! Especially the method security annotations.",
  "parentCommentId": "cm1a2b3c-..."
}
```

---

### 5.3 Get All Comments for a Post

Returns a **nested tree** — top-level comments with their `replies[]` populated recursively.

```
GET http://localhost:8080/comments/posts/{postId}
Authorization: Bearer {{token}}
```

**Response example:**
```json
[
  {
    "id": "cm1a2b3c-...",
    "body": "Spring Security is my favourite!",
    "upvotes": 2,
    "downvotes": 0,
    "userVote": "UP",
    "replies": [
      {
        "id": "cm2b3c4d-...",
        "body": "Agreed! Especially the method security annotations.",
        "upvotes": 1,
        "downvotes": 0,
        "userVote": null,
        "replies": []
      }
    ]
  }
]
```

---

### 5.4 Delete Your Comment

Deletes the comment **and all its nested replies**.

```
DELETE http://localhost:8080/comments/{commentId}
Authorization: Bearer {{token}}
```

**Response `204 No Content`**.

---

## Phase 6 — Votes

Voting is **idempotent / togglable**:
- Send same vote again → **removes** your vote (toggle off)
- Send opposite vote → **switches** your vote
- Send first vote → **adds** your vote

Returns the updated vote counts.

---

### 6.1 Vote on a Post

```
POST http://localhost:8080/votes/posts/{postId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body (upvote):**
```json
{
  "voteType": "UP"
}
```

**Request Body (downvote):**
```json
{
  "voteType": "DOWN"
}
```

**Response `200 OK`:**
```json
{
  "upvotes": 1,
  "downvotes": 0
}
```

> Call it again with `"UP"` → vote is removed → `{ "upvotes": 0, "downvotes": 0 }`

---

### 6.2 Vote on a Comment

```
POST http://localhost:8080/votes/comments/{commentId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Request Body:**
```json
{
  "voteType": "UP"
}
```

**Response `200 OK`:**
```json
{
  "upvotes": 1,
  "downvotes": 0
}
```

---

## Full End-to-End Test Sequence

Run these in order in Postman to verify the whole flow:

| # | Method | URL | Notes |
|---|---|---|---|
| 1 | `POST` | `/auth/signup` | Register → save token |
| 2 | `PUT` | `/users/details` | Fill in profile |
| 3 | `POST` | `/communities` | Create `java-devs` → save `communityId` |
| 4 | `GET` | `/communities` | Verify you see it with `memberCount: 1` |
| 5 | `POST` | `/posts/communities/{communityId}` | Create post → save `postId` |
| 6 | `GET` | `/communities/{communityId}/posts` | Verify post appears |
| 7 | `POST` | `/votes/posts/{postId}` body: `UP` | Upvote → `{"upvotes":1}` |
| 8 | `POST` | `/votes/posts/{postId}` body: `UP` | Toggle off → `{"upvotes":0}` |
| 9 | `POST` | `/comments/posts/{postId}` | Add top-level comment → save `commentId` |
| 10 | `POST` | `/comments/posts/{postId}` with `parentCommentId` | Add nested reply |
| 11 | `GET` | `/comments/posts/{postId}` | Verify tree structure |
| 12 | `POST` | `/votes/comments/{commentId}` body: `UP` | Upvote comment |
| 13 | `GET` | `/posts/my` | Verify "My Posts" shows your post |
| 14 | `DELETE` | `/communities/{communityId}/leave` | Leave community |
| 15 | `POST` | `/communities/{communityId}/join` | Rejoin |
| 16 | `DELETE` | `/posts/{postId}` | Delete post (cascades comments + votes) |
| 17 | `POST` | `/auth/logout` | Invalidate refresh token |

---

## Error Reference

| HTTP Status | Meaning |
|---|---|
| `400 Bad Request` | Invalid input (blank name, invalid email, etc.) |
| `401 Unauthorized` | Missing or expired JWT token |
| `403 Forbidden` | Action not allowed (not the author, not a member) |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | Duplicate (community name taken, already a member) |

---

## Architecture Notes

```
Frontend / Postman
       │
       ▼
  API Gateway :8080
  ├─ Validates JWT → injects X-User-Id header
  ├─ Rate limiting via Redis (IP for /auth, User UUID for authenticated routes)
  └─ Routes requests to the backend services
       │
       ├──► Auth Service :8081        (signup, login, refresh, logout)
       ├──► User Details Service :8082 (profile CRUD)
       └──► Community Service :8083   (communities, posts, comments, votes)
                    │
                    ▼
            PostgreSQL (colaby-community DB)
```

The gateway validates JWTs for protected Spring-service routes and injects `X-User-Id`. The collaboration service separately validates bearer JWTs and project membership. Postman REST requests in this walkthrough use port `8080`; the collaboration WebSocket uses port `8090` directly.


---

## Updated Architecture (with Project Service & Profile Service)

```
Frontend / Postman
       |
       v
  API Gateway :8080
  |- Validates JWT -> injects X-User-Id header
  |- Rate limiting via Redis (IP for /auth, User UUID for authenticated routes)
  +- Routes requests to backend services
       |
       +---> Auth Service :8081          (signup, login, refresh, logout)
       +---> User Details Service :8082  (profile CRUD)
       +---> Community Service :8083     (communities, posts, comments, votes)
       +---> Project Service :8084       (projects, invitations, tasks, docs)
       +---> Profile Service :8085       (friends system)
       +---> Collaboration Service :8090 (project workspaces, chat, whiteboards, files, code editing, voice)
```

> **Note:** Profile Service registers as `PROFILESERVICE` in Eureka. The gateway routes `/profiles/**` → `lb://PROFILESERVICE`.
> The collaboration service is addressed directly by the gateway at `http://localhost:8090`; its HTTP API is exposed under `/collaboration`.

The collaboration service also verifies the JWT and project membership itself. The gateway forwards its HTTP requests under `/collaboration/**`; its WebSocket connection is made directly to port `8090`.

---

---

# Phase 7 - Projects (Project Service)

> All project endpoints require: Authorization: Bearer {{token}}
> The gateway injects X-User-Id automatically - never send it manually.

---

## Roles

| Role | How you get it | Permissions |
|---|---|---|
| Creator | You called POST /projects | Edit project, assign tasks, invite users, accept/decline join requests, write docs, delete project |
| Member | Creator accepted your request or invite | View project, view all tasks, update your own task progress, view docs |
| Non-member | Not yet in project | Browse project list, send a join request |

---

### 7.1 Create a Project

Creator fills in all details. They are automatically added as the first member with role CREATOR.

```
POST http://localhost:8080/projects
Authorization: Bearer {{token}}
Content-Type: application/json
```

Request Body:
```json
{
  "name": "Colaby Backend",
  "description": "A collaborative platform for developers",
  "githubRepoUrl": "https://github.com/pranaav/colaby",
  "techStack": "Java, Spring Boot, PostgreSQL, React"
}
```

Validation:
- name: required, cannot be blank
- all other fields: optional

Response 201 Created:
```json
{
  "id": "a1b2c3d4-1234-5678-abcd-ef1234567890",
  "name": "Colaby Backend",
  "description": "A collaborative platform for developers",
  "githubRepoUrl": "https://github.com/pranaav/colaby",
  "techStack": "Java, Spring Boot, PostgreSQL, React",
  "status": "ACTIVE",
  "createdBy": "your-user-uuid",
  "createdByUserName": "alice_dev",
  "createdByFullName": "Alice Dev",
  "createdAt": "2026-09-06T16:30:00Z",
  "updatedAt": "2026-09-06T16:30:00Z",
  "memberCount": 1,
  "isMember": true
}
```

Save the "id" as {projectId}.

Error cases:
- 400 Bad Request: blank project name
- 409 Conflict: a project with that name already exists

---

### 7.2 List All Projects

```
GET http://localhost:8080/projects
Authorization: Bearer {{token}}
```

Returns all projects with memberCount and isMember relative to you.

---

### 7.3 Get a Single Project

```
GET http://localhost:8080/projects/{projectId}
Authorization: Bearer {{token}}
```

Error cases:
- 404 Not Found: project does not exist

---

### 7.4 My Projects

Returns only projects where you are a member (any role).

```
GET http://localhost:8080/projects/my
Authorization: Bearer {{token}}
```

---

### 7.5 Update Project Details (Creator only)

All fields are optional - send only what you want to change.

```
PUT http://localhost:8080/projects/{projectId}
Authorization: Bearer {{token}}
Content-Type: application/json
```

Request Body (all fields optional):
```json
{
  "name": "Colaby Platform",
  "description": "Updated description",
  "githubRepoUrl": "https://github.com/pranaav/colaby-v2",
  "techStack": "Java, Spring Boot, PostgreSQL, React, Redis",
  "status": "COMPLETED"
}
```

Valid status values: ACTIVE | COMPLETED | ARCHIVED

Error cases:
- 403 Forbidden: not the creator
- 409 Conflict: new name already taken

---

### 7.6 Delete Project (Creator only)

```
DELETE http://localhost:8080/projects/{projectId}
Authorization: Bearer {{token}}
```

Response 204 No Content.

---

### 7.7 Get Project Members (Members only)

```
GET http://localhost:8080/projects/{projectId}/members
Authorization: Bearer {{token}}
```

Response 200 OK:
```json
[
  {
    "userId": "creator-uuid",
    "userName": "alice_dev",
    "fullName": "Alice Dev",
    "role": "CREATOR",
    "joinedAt": "2026-09-06T16:30:00Z"
  },
  {
    "userId": "member-uuid",
    "userName": "bob_builder",
    "fullName": "Bob Builder",
    "role": "MEMBER",
    "joinedAt": "2026-09-06T17:00:00Z"
  }
]
```

---

---

# Phase 8 - Invitations & Join Requests

Two separate flows, one shared /invitations resource:

| Flow | Who initiates | Who resolves | type value |
|---|---|---|---|
| User wants to join | Non-member | Creator | JOIN_REQUEST |
| Creator invites user | Creator | Invited user | INVITE |

---

### 8.1 Request to Join a Project (Non-member)

```
POST http://localhost:8080/projects/{projectId}/invitations/request
Authorization: Bearer {{token}}
```

No request body needed.

Response 201 Created:
```json
{
  "id": "inv-uuid-1234",
  "projectId": "a1b2c3d4-...dock",
  "projectName": "Colaby Backend",
  "targetUserId": "your-user-uuid",
  "targetUserName": "alice_dev",
  "targetUserFullName": "Alice Dev",
  "initiatedBy": "your-user-uuid",
  "initiatedByUserName": "alice_dev",
  "initiatedByFullName": "Alice Dev",
  "type": "JOIN_REQUEST",
  "status": "PENDING",
  "createdAt": "2026-09-06T16:35:00Z",
  "resolvedAt": null
}
```

Save the "id" as {invitationId}.

Error cases:
- 409 Conflict: already a member
- 409 Conflict: already have a pending join request

---

### 8.2 Invite a User (Creator only)

```
POST http://localhost:8080/projects/{projectId}/invitations/invite/{targetUserId}
Authorization: Bearer {{token}}
```

No request body. {targetUserId} is the UUID of the user to invite.

Response 201 Created - same shape, type: "INVITE".

Error cases:
- 403 Forbidden: not the creator
- 409 Conflict: that user is already a member
- 409 Conflict: that user already has a pending invite

---

### 8.3 View Pending Invitations for a Project (Creator only)

Returns both JOIN_REQUEST and INVITE type pending entries.

```
GET http://localhost:8080/projects/{projectId}/invitations
Authorization: Bearer {{token}}
```

---

### 8.4 View Your Pending Invitations (Auth user)

Returns INVITE type invitations where you are the target.

```
GET http://localhost:8080/projects/invitations/my
Authorization: Bearer {{token}}
```

---

### 8.5 Accept an Invitation

Who calls this depends on invitation type:
- INVITE -> the invited user accepts
- JOIN_REQUEST -> the project creator accepts

```
POST http://localhost:8080/projects/invitations/{invitationId}/accept
Authorization: Bearer {{token}}
```

Response 200 OK:
```json
{
  "id": "inv-uuid-...",
  "status": "ACCEPTED",
  "resolvedAt": "2026-09-06T17:00:00Z"
}
```

The accepted user is automatically added to the project as a MEMBER.

Error cases:
- 403 Forbidden: wrong actor for the invitation type
- 409 Conflict: invitation already resolved
- 404 Not Found: invitation does not exist

---

### 8.6 Decline an Invitation

Same authorization rules as Accept. User is NOT added.

```
POST http://localhost:8080/projects/invitations/{invitationId}/decline
Authorization: Bearer {{token}}
```

Response 200 OK - same shape, status: "DECLINED".

---

---

# Phase 9 - Tasks

Creator assigns tasks. Only the assignee can update their own progress.

---

### 9.1 Assign a Task (Creator only)

The assignedTo user MUST already be a project member.

```
POST http://localhost:8080/projects/{projectId}/tasks
Authorization: Bearer {{token}}
Content-Type: application/json
```

Request Body:
```json
{
  "assignedTo": "member-user-uuid",
  "title": "Implement JWT refresh flow",
  "description": "Use opaque tokens stored in Redis with 7-day TTL"
}
```

Validation:
- assignedTo: required
- title: required, cannot be blank
- description: optional

Response 201 Created:
```json
{
  "id": "task-uuid-...",
  "projectId": "a1b2c3d4-...",
  "projectName": "Colaby Backend",
  "assignedTo": "member-user-uuid",
  "assignedToUserName": "bob_builder",
  "assignedToFullName": "Bob Builder",
  "assignedBy": "creator-uuid",
  "assignedByUserName": "alice_dev",
  "assignedByFullName": "Alice Dev",
  "title": "Implement JWT refresh flow",
  "description": "Use opaque tokens stored in Redis with 7-day TTL",
  "progressPercent": 0,
  "progressNote": null,
  "status": "PENDING",
  "createdAt": "2026-09-06T16:40:00Z",
  "updatedAt": "2026-09-06T16:40:00Z"
}
```

Save the "id" as {taskId}.

Error cases:
- 403 Forbidden: not the project creator
- 403 Forbidden: assignedTo user is not yet a project member
- 400 Bad Request: blank title or missing assignedTo

---

### 9.2 Team Progress - All Tasks (Members only)

Returns every task in the project. This is the team progress dashboard.

```
GET http://localhost:8080/projects/{projectId}/tasks
Authorization: Bearer {{token}}
```

---

### 9.3 My Assigned Tasks (Members only)

Returns only the tasks assigned to you.

```
GET http://localhost:8080/projects/{projectId}/tasks/my
Authorization: Bearer {{token}}
```

---

### 9.4 Update Task Progress (Assignee only)

Updates numerical progress (0-100) and an optional descriptive note in one call.
Progress updates derive status automatically:

| progressPercent | status auto-set to |
|---|---|
| 0 | PENDING |
| 1 to 99 | ONGOING |
| 100 | DONE |

Tasks are initially created with status `PENDING`. You can also move a task between Kanban statuses with `PATCH /projects/{projectId}/tasks/{taskId}/status`; the assignee or project creator may do this. Moving to `DONE` sets progress to 100; moving to `PENDING` resets progress to 0.

```json
{
  "status": "ONGOING"
}
```

Valid status values are `PENDING`, `ONGOING`, and `DONE`.

```
PATCH http://localhost:8080/projects/{projectId}/tasks/{taskId}/progress
Authorization: Bearer {{token}}
Content-Type: application/json
```

Request Body:
```json
{
  "progressPercent": 65,
  "progressNote": "Token storage in Redis done. Working on the /refresh endpoint now."
}
```

Validation:
- progressPercent: required, must be 0 to 100
- progressNote: optional

Response 200 OK:
```json
{
  "id": "task-uuid-...",
  "projectId": "a1b2c3d4-...",
  "projectName": "Colaby Backend",
  "assignedTo": "member-user-uuid",
  "assignedToUserName": "bob_builder",
  "assignedToFullName": "Bob Builder",
  "assignedBy": "creator-uuid",
  "assignedByUserName": "alice_dev",
  "assignedByFullName": "Alice Dev",
  "progressPercent": 65,
  "progressNote": "Token storage in Redis done. Working on the /refresh endpoint now.",
  "status": "ONGOING",
  "updatedAt": "2026-09-06T17:30:00Z"
}
```

Error cases:
- 403 Forbidden: you are not the task assignee
- 400 Bad Request: progressPercent outside 0-100

---

### 9.5 Delete a Task (Creator only)

```
DELETE http://localhost:8080/projects/{projectId}/tasks/{taskId}
Authorization: Bearer {{token}}
```

Response 204 No Content.

---

---

# Phase 10 - Project Documentation

One documentation entry per project. Creator WRITES; members READ ONLY.

---

### 10.1 Write / Update Documentation (Creator only)

Upsert semantics - creates if none exists, replaces content if it does.
Content can be Markdown, plain text, or any string.

```
PUT http://localhost:8080/projects/{projectId}/docs
Authorization: Bearer {{token}}
Content-Type: application/json
```

Request Body:
```json
{
  "content": "# Colaby Backend\n\n## Getting Started\n\n1. Clone the repo\n2. Set DB_URL, DB_USERNAME, DB_PASSWORD\n3. Run: ./mvnw spring-boot:run\n\n## Architecture\nMicroservices with Spring Cloud Gateway, Eureka, Redis.\n\n## Branching\nmain -> production, dev -> integration."
}
```

Response 200 OK:
```json
{
  "id": "doc-uuid-...",
  "projectId": "a1b2c3d4-...",
  "content": "# Colaby Backend\n\n## Getting Started...",
  "lastEditedBy": "creator-uuid",
  "updatedAt": "2026-09-06T18:00:00Z"
}
```

Error cases:
- 403 Forbidden: not the project creator

---

### 10.2 View Documentation (Members only)

```
GET http://localhost:8080/projects/{projectId}/docs
Authorization: Bearer {{token}}
```

Note: If no documentation has been written yet, returns content: "" - never throws 404.

Error cases:
- 403 Forbidden: not a project member

---

---

# Full End-to-End Test Sequence (Projects)

Use 3 separate user accounts: User A (creator), User B and C (joiners).

| # | Method | URL | Actor | Notes |
|---|---|---|---|---|
| 1 | POST | /auth/signup | User A | Register -> save token A |
| 2 | POST | /auth/signup | User B | Register -> save token B |
| 3 | POST | /auth/signup | User C | Register -> save token C |
| 4 | POST | /projects | A | Create project -> save projectId |
| 5 | GET | /projects/{projectId} | A | Verify memberCount: 1, status: ACTIVE |
| 6 | POST | /projects/{projectId}/invitations/request | B | Request to join -> save invId1 |
| 7 | GET | /projects/{projectId}/invitations | A | See pending JOIN_REQUEST from B |
| 8 | POST | /projects/invitations/{invId1}/accept | A | Accept -> B joins as MEMBER |
| 9 | GET | /projects/{projectId}/members | A | Verify B is now listed |
| 10 | POST | /projects/{projectId}/invitations/invite/{userCId} | A | Invite C -> save invId2 |
| 11 | GET | /projects/invitations/my | C | See pending INVITE from A |
| 12 | POST | /projects/invitations/{invId2}/accept | C | Accept -> C joins as MEMBER |
| 13 | POST | /projects/{projectId}/tasks body: assignedTo=B | A | Assign task to B -> save taskId |
| 14 | POST | /projects/{projectId}/tasks body: assignedTo=C | A | Assign task to C |
| 15 | GET | /projects/{projectId}/tasks/my | B | See own assigned tasks |
| 16 | PATCH | /projects/{projectId}/tasks/{taskId}/progress | B | Update: 65%, add descriptive note |
| 17 | GET | /projects/{projectId}/tasks | A | Team dashboard - all tasks visible |
| 18 | PUT | /projects/{projectId}/docs | A | Write project documentation |
| 19 | GET | /projects/{projectId}/docs | B | View docs (read-only for members) |
| 20 | PUT | /projects/{projectId} body: status=COMPLETED | A | Mark project completed |
| 21 | GET | /projects/my | B | Verify project appears in member list |

---

## Project Service - Error Reference

| HTTP Status | Meaning |
|---|---|
| 400 Bad Request | Missing required field, blank name, or progressPercent outside 0-100 |
| 403 Forbidden | Wrong role - non-creator assigning tasks, non-assignee updating progress, non-member viewing docs, wrong actor resolving invitation |
| 404 Not Found | Project, invitation, or task does not exist |
| 409 Conflict | Project name taken, already a member, duplicate pending request/invite, invitation already resolved |

---

## Project Service - Database Schema (auto-generated by Hibernate)

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY,
    name            VARCHAR NOT NULL,
    description     TEXT,
    github_repo_url VARCHAR,
    tech_stack      VARCHAR,
    status          VARCHAR NOT NULL,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL
);

CREATE TABLE project_members (
    user_id    UUID NOT NULL,
    project_id UUID NOT NULL,
    role       VARCHAR NOT NULL,
    joined_at  TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, project_id)
);

CREATE TABLE project_invitations (
    id             UUID PRIMARY KEY,
    project_id     UUID NOT NULL,
    target_user_id UUID NOT NULL,
    initiated_by   UUID NOT NULL,
    type           VARCHAR NOT NULL,
    status         VARCHAR NOT NULL,
    created_at     TIMESTAMP NOT NULL,
    resolved_at    TIMESTAMP
);

CREATE TABLE project_tasks (
    id               UUID PRIMARY KEY,
    project_id       UUID NOT NULL,
    assigned_to      UUID NOT NULL,
    assigned_by      UUID NOT NULL,
    title            VARCHAR NOT NULL,
    description      TEXT,
    progress_percent INT NOT NULL,
    progress_note    TEXT,
    status           VARCHAR NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    updated_at       TIMESTAMP NOT NULL
);

CREATE TABLE project_docs (
    id             UUID PRIMARY KEY,
    project_id     UUID NOT NULL UNIQUE,
    content        TEXT,
    last_edited_by UUID NOT NULL,
    updated_at     TIMESTAMP NOT NULL
);
```

---

---

# Phase 11 - Friends System (Profile Service)

> All endpoints require: `Authorization: Bearer {{token}}`
> The gateway injects `X-User-Id` automatically — never send it manually.
> Base path: `/profiles/friends`

A friend relationship is **mutual and explicit** — User A must send a request, and User B must actively accept it before they appear in each other's friend list.

---

## Request Lifecycle

```
User A  --[POST /request/{B}]-->  PENDING
                                    |
                    User B accepts  |  User B rejects
                                    |
                              ACCEPTED          REJECTED
                                    |
                     Two Friendship rows inserted:
                       (A → B) and (B → A)
```

---

### 11.1 Send a Friend Request

```
POST http://localhost:8080/profiles/friends/request/{receiverId}
Authorization: Bearer {{token}}
```

No request body needed. `{receiverId}` is the UUID of the user you want to add.

**Response `201 Created`:**
```json
{
  "id": "fr-uuid-1234",
  "senderId": "your-user-uuid",
  "senderUsername": "alice_dev",
  "senderFullName": "Alice Dev",
  "receiverId": "target-user-uuid",
  "receiverUsername": "bob_builder",
  "receiverFullName": "Bob Builder",
  "status": "PENDING",
  "createdAt": "2026-09-07T13:45:00Z",
  "resolvedAt": null
}
```

> 📌 **Save the `id`** as `{requestId}` — the receiver will need it to accept or reject.

**Error cases:**
- `400 Bad Request` — you cannot send a request to yourself
- `409 Conflict` — a request already exists between these users (in either direction)
- `409 Conflict` — you are already friends

---

### 11.2 Accept a Friend Request

Only the **receiver** of the request can accept it.

```
PUT http://localhost:8080/profiles/friends/request/{requestId}/accept
Authorization: Bearer {{token}}
```

**Response `200 OK`:**
```json
{
  "id": "fr-uuid-1234",
  "senderId": "user-a-uuid",
  "senderUsername": "alice_dev",
  "senderFullName": "Alice Dev",
  "receiverId": "your-user-uuid",
  "receiverUsername": "bob_builder",
  "receiverFullName": "Bob Builder",
  "status": "ACCEPTED",
  "createdAt": "2026-09-07T13:45:00Z",
  "resolvedAt": "2026-09-07T13:50:00Z"
}
```

Both users are now in each other's friend list.

**Error cases:**
- `403 Forbidden` — you are not the receiver of this request
- `409 Conflict` — request is not in PENDING state (already accepted or rejected)
- `404 Not Found` — request does not exist

---

### 11.3 Reject a Friend Request

Only the **receiver** of the request can reject it.

```
PUT http://localhost:8080/profiles/friends/request/{requestId}/reject
Authorization: Bearer {{token}}
```

**Response `200 OK`:**
```json
{
  "id": "fr-uuid-1234",
  "senderId": "user-a-uuid",
  "senderUsername": "alice_dev",
  "senderFullName": "Alice Dev",
  "receiverId": "your-user-uuid",
  "receiverUsername": "bob_builder",
  "receiverFullName": "Bob Builder",
  "status": "REJECTED",
  "createdAt": "2026-09-07T13:45:00Z",
  "resolvedAt": "2026-09-07T13:52:00Z"
}
```

**Error cases:**
- `403 Forbidden` — you are not the receiver of this request
- `409 Conflict` — request is not in PENDING state
- `404 Not Found` — request does not exist

---

### 11.4 View Incoming Pending Requests (Your Inbox)

Returns all friend requests sent **to you** that are still `PENDING`.

```
GET http://localhost:8080/profiles/friends/requests/incoming
Authorization: Bearer {{token}}
```

**Response `200 OK`:**
```json
[
  {
    "id": "fr-uuid-1234",
    "senderId": "user-a-uuid",
    "senderUsername": "alice_dev",
    "senderFullName": "Alice Dev",
    "receiverId": "your-user-uuid",
    "receiverUsername": "bob_builder",
    "receiverFullName": "Bob Builder",
    "status": "PENDING",
    "createdAt": "2026-09-07T13:45:00Z",
    "resolvedAt": null
  }
]
```

---

### 11.5 View Sent Pending Requests (Your Outbox)

Returns all friend requests you sent that are still `PENDING`.

```
GET http://localhost:8080/profiles/friends/requests/sent
Authorization: Bearer {{token}}
```

**Response `200 OK`** — same shape as incoming list.

---

### 11.6 List My Friends

Returns all users who have accepted a friend request with you.

```
GET http://localhost:8080/profiles/friends
Authorization: Bearer {{token}}
```

**Response `200 OK`:**
```json
[
  {
    "friendId": "user-b-uuid",
    "since": "2026-09-07T13:50:00Z"
  },
  {
    "friendId": "user-c-uuid",
    "since": "2026-09-07T14:05:00Z"
  }
]
```

> To get full profile details for each friend, call `GET /users/details/{friendId}` (User Details Service) for each `friendId`.

---

---

## Full End-to-End Test Sequence (Friends System)

Use 3 separate user accounts: User A, User B, User C.

| # | Method | URL | Actor | Notes |
|---|---|---|---|---|
| 1 | `POST` | `/auth/signup` | User A | Register → save token A |
| 2 | `POST` | `/auth/signup` | User B | Register → save token B |
| 3 | `POST` | `/auth/signup` | User C | Register → save token C |
| 4 | `POST` | `/profiles/friends/request/{userBId}` | A | A sends request to B → save `requestId` |
| 5 | `GET` | `/profiles/friends/requests/sent` | A | Verify request appears in A's outbox |
| 6 | `GET` | `/profiles/friends/requests/incoming` | B | Verify request appears in B's inbox |
| 7 | `PUT` | `/profiles/friends/request/{requestId}/accept` | B | B accepts → status: ACCEPTED |
| 8 | `GET` | `/profiles/friends` | A | A's friend list contains B |
| 9 | `GET` | `/profiles/friends` | B | B's friend list contains A |
| 10 | `POST` | `/profiles/friends/request/{userBId}` | A | Duplicate request → expect `409` |
| 11 | `POST` | `/profiles/friends/request/{userCId}` | A | A sends request to C → save `requestId2` |
| 12 | `PUT` | `/profiles/friends/request/{requestId2}/reject` | C | C rejects → status: REJECTED |
| 13 | `GET` | `/profiles/friends` | A | C does NOT appear in A's friends |
| 14 | `PUT` | `/profiles/friends/request/{requestId}/accept` | A | A tries to accept own sent request → `403` |
| 15 | `GET` | `/users/details/{friendId}` | A | Enrich friend list with full profile data |

---

## Profile Service — Error Reference

| HTTP Status | Meaning |
|---|---|
| `400 Bad Request` | Cannot send a request to yourself |
| `403 Forbidden` | Only the receiver can accept or reject a request |
| `404 Not Found` | Friend request ID does not exist |
| `409 Conflict` | Duplicate request, already friends, or request already resolved |

---

## Profile Service — Database Schema (auto-generated by Hibernate)

```sql
CREATE TABLE friend_requests (
    id          UUID PRIMARY KEY,
    sender_id   UUID NOT NULL,
    receiver_id UUID NOT NULL,
    status      VARCHAR NOT NULL,        -- PENDING | ACCEPTED | REJECTED
    created_at  TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    UNIQUE (sender_id, receiver_id)      -- prevents duplicate requests
);

CREATE TABLE friendships (
    id        UUID PRIMARY KEY,
    user_id   UUID NOT NULL,
    friend_id UUID NOT NULL,
    since     TIMESTAMP NOT NULL,
    UNIQUE (user_id, friend_id)          -- two symmetric rows per accepted pair
);
```

---

---

# Phase 12 - Username & Project Name Enrichment (All Services)

> **Problem solved:** Every backend response that referenced another user or project was previously returning only a raw UUID (e.g. `senderId`, `createdBy`, `assignedTo`). This phase enriches all affected DTOs to include human-readable `userName`, `fullName`, and `projectName` fields alongside the existing IDs — so the frontend never needs to display or resolve UUIDs.

---

## Architecture

Each service that references user IDs now makes an internal HTTP call to `userdetailsservice` (port 8082) using Spring's built-in `RestClient` to resolve a UUID → `userName` + `fullName`. If the user has no profile yet, or the service is temporarily unavailable, the username fields fall back gracefully to `null`.

```
profileservice / projectservice
         │
         │  GET /users/details/{uuid}   (internal, bypasses gateway)
         ▼
  userdetailsservice:8082
         │
         └─ returns { userId, userName, fullName, ... }
```

---

## New Files Created

### profileservice

| File | Purpose |
|---|---|
| `dto/UserInfo.java` | Minimal record: `userId`, `userName`, `fullName` |
| `client/UserLookupClient.java` | `RestClient`-based internal caller to `userdetailsservice` |

### projectservice

| File | Purpose |
|---|---|
| `dto/UserInfo.java` | Same minimal record |
| `client/UserLookupClient.java` | Same `RestClient`-based caller |
| `dto/MemberResponse.java` | Replaces raw `ProjectMember` entity in the `/members` endpoint |

---

## DTOs Modified

### profileservice

#### `FriendRequestResponse`
```java
// Before
UUID senderId, UUID receiverId

// After — new fields added
UUID senderId,
String senderUsername,
String senderFullName,
UUID receiverId,
String receiverUsername,
String receiverFullName,
```

#### `FriendSummary`
```java
// Before
UUID friendId, Instant since

// After
UUID friendId,
String userName,
String fullName,
Instant since
```

### projectservice

#### `ProjectResponse`
```java
// New fields added alongside existing createdBy UUID
UUID createdBy,
String createdByUserName,
String createdByFullName,
```

#### `ProjectInvitationResponse`
```java
// New fields added
UUID projectId,
String projectName,
UUID targetUserId,
String targetUserName,
String targetUserFullName,
UUID initiatedBy,
String initiatedByUserName,
String initiatedByFullName,
```

#### `TaskResponse`
```java
// New fields added
UUID projectId,
String projectName,
UUID assignedTo,
String assignedToUserName,
String assignedToFullName,
UUID assignedBy,
String assignedByUserName,
String assignedByFullName,
```

#### `MemberResponse` (new DTO — replaces raw `ProjectMember` entity)
```java
UUID userId,
String userName,
String fullName,
String role,
Instant joinedAt
```

---

## Services Modified

### profileservice — `FriendService`
- Injected `UserLookupClient`
- `toResponse(FriendRequest)` resolves sender and receiver UUIDs → populates `senderUsername`, `senderFullName`, `receiverUsername`, `receiverFullName`
- `getFriends(UUID)` resolves each `friendId` → populates `userName`, `fullName` in `FriendSummary`

### projectservice — `ProjectService`
- Injected `UserLookupClient`
- `toResponse(Project, UUID)` resolves `createdBy` UUID → populates `createdByUserName`, `createdByFullName`
- `getMembers(UUID, UUID)` returns `List<MemberResponse>` (was `List<ProjectMember>`) — each entry includes `userName`, `fullName`, `role`, `joinedAt`

### projectservice — `InvitationService`
- Injected `UserLookupClient`
- `toResponse(ProjectInvitation)` resolves `targetUserId` and `initiatedBy` UUIDs, fetches project name via `projectService.findProjectOrThrow()`
- Populates: `projectName`, `targetUserName`, `targetUserFullName`, `initiatedByUserName`, `initiatedByFullName`

### projectservice — `TaskService`
- Injected `UserLookupClient`
- `toResponse(ProjectTask)` resolves `assignedTo` and `assignedBy` UUIDs, fetches project name via `projectService.findProjectOrThrow()`
- Populates: `projectName`, `assignedToUserName`, `assignedToFullName`, `assignedByUserName`, `assignedByFullName`

---

## Controller Modified

### `ProjectController`
- `getMembers()` return type changed from `List<ProjectMember>` (raw JPA entity) → `List<MemberResponse>` (enriched DTO)

---

## Configuration Changes

### `profileservice/application.properties`
```properties
# Internal service URLs
userdetailsservice.base-url=http://localhost:8082
```

### `projectservice/application.properties`
```properties
# Internal service URLs
userdetailsservice.base-url=http://localhost:8082
```

---

## Enriched Response Examples

### Friend Request (send / accept / reject / list)
```json
{
  "id": "fr-uuid",
  "senderId": "user-a-uuid",
  "senderUsername": "alice_dev",
  "senderFullName": "Alice Dev",
  "receiverId": "user-b-uuid",
  "receiverUsername": "bob_builder",
  "receiverFullName": "Bob Builder",
  "status": "PENDING",
  "createdAt": "2026-09-07T21:20:40Z",
  "resolvedAt": null
}
```

### Friends List (`GET /profiles/friends`)
```json
[
  {
    "friendId": "user-b-uuid",
    "userName": "bob_builder",
    "fullName": "Bob Builder",
    "since": "2026-09-07T21:20:54Z"
  }
]
```

### Project Response (`POST /projects`, `GET /projects`, `GET /projects/my`)
```json
{
  "id": "project-uuid",
  "name": "My Project",
  "createdBy": "user-a-uuid",
  "createdByUserName": "alice_dev",
  "createdByFullName": "Alice Dev",
  "memberCount": 2,
  "isMember": true
}
```

### Project Members (`GET /projects/{projectId}/members`)
```json
[
  {
    "userId": "user-a-uuid",
    "userName": "alice_dev",
    "fullName": "Alice Dev",
    "role": "CREATOR",
    "joinedAt": "2026-09-07T21:21:28Z"
  },
  {
    "userId": "user-b-uuid",
    "userName": "bob_builder",
    "fullName": "Bob Builder",
    "role": "MEMBER",
    "joinedAt": "2026-09-07T21:22:09Z"
  }
]
```

### Project Invitation (all invitation endpoints)
```json
{
  "id": "invite-uuid",
  "projectId": "project-uuid",
  "projectName": "My Project",
  "targetUserId": "user-b-uuid",
  "targetUserName": "bob_builder",
  "targetUserFullName": "Bob Builder",
  "initiatedBy": "user-a-uuid",
  "initiatedByUserName": "alice_dev",
  "initiatedByFullName": "Alice Dev",
  "type": "INVITE",
  "status": "PENDING",
  "createdAt": "2026-09-07T21:21:48Z",
  "resolvedAt": null
}
```

### Task Response (all task endpoints)
```json
{
  "id": "task-uuid",
  "projectId": "project-uuid",
  "projectName": "My Project",
  "assignedTo": "user-b-uuid",
  "assignedToUserName": "bob_builder",
  "assignedToFullName": "Bob Builder",
  "assignedBy": "user-a-uuid",
  "assignedByUserName": "alice_dev",
  "assignedByFullName": "Alice Dev",
  "title": "Build the dashboard",
  "progressPercent": 50,
  "progressNote": "Dashboard skeleton done",
  "status": "ONGOING",
  "createdAt": "2026-09-07T21:22:34Z",
  "updatedAt": "2026-09-07T21:23:18Z"
}
```

---

## Graceful Fallback Behaviour

If a user has never completed their profile setup (`userName` is `null`), or `userdetailsservice` is temporarily unreachable, all username/fullName fields return `null` — no error is thrown. The frontend should handle this:

```js
// Safe display pattern
const displayName = member.userName ?? `User (${member.userId.slice(0, 8)}...)`;
```

---

# Phase 13 - Real-Time Collaboration Workspaces

The collaboration service provides each project with a shared workspace for files, chat, whiteboards, collaborative code editing, voice signaling, and an IDE/terminal. It runs as a separate Node.js service on port `8090`; project membership is checked against Project Service. Create a project and join it (Phases 7-8) before making these requests.

## Setup

Start MongoDB, Project Service, and the collaboration service. Configure the collaboration service using `backend/collaboration-service/.env.example`: set `MONGODB_URI`, `PROJECT_SERVICE_URL`, `PROJECT_SERVICE_KEY`, and `JWT_SECRET`. `PROJECT_SERVICE_KEY` must match the key configured in Project Service, and `JWT_SECRET` must match Auth Service. The default collaboration-service port is `8090`.

From `backend/collaboration-service`, install the Node dependencies and start the service:

```sh
npm install
npm start
```

REST calls through the gateway use this base path:

```
http://localhost:8080/collaboration/api/workspaces/{projectId}
```

Include `Authorization: Bearer {{token}}` on workspace requests. The service verifies the JWT itself and verifies project membership; the gateway's `X-User-Id` header alone is not sufficient. Direct service calls use `http://localhost:8090/api/workspaces/{projectId}`.

### 13.1 Get or Create a Workspace

Returns the workspace record and repository URL. This endpoint creates the workspace record if one does not exist yet.

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}
Authorization: Bearer {{token}}
```

The response is wrapped in `{ "success": true, "data": ... }`.

### 13.2 Initialize an Empty Workspace

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/initialize/empty
Authorization: Bearer {{token}}
```

No body is required. The service creates an empty workspace when it is not already initialized. The equivalent routes `/initialize` and `/initialize/empty` are both available.

### 13.3 Clone the Project Repository

The project must have a GitHub repository URL configured, or provide `repoUrl` in the body. `token` is an optional Git credential for private repositories.

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/initialize/clone
Authorization: Bearer {{token}}
Content-Type: application/json
```

```json
{
  "token": "github-access-token"
}
```

To supply a repository URL explicitly:

```json
{
  "repoUrl": "https://github.com/example/repository.git",
  "token": "github-access-token"
}
```

The alias `POST /clone` is also available. If no repository URL can be found, the service returns `400` with code `NO_REPO_URL`.

### 13.4 Browse and Read Files

Get the file tree:

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}/tree
Authorization: Bearer {{token}}
```

Read a file (URL-encode the path):

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}/file?path=src%2FApp.jsx
Authorization: Bearer {{token}}
```

### 13.5 Save a File

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/file
Authorization: Bearer {{token}}
Content-Type: application/json
```

```json
{
  "path": "src/App.jsx",
  "content": "export default function App() { return <main>Hi</main>; }"
}
```

### 13.6 Apply a File or Folder Operation

Operations can also be broadcast to connected collaborators over WebSocket. Accepted operation types include `FILE_CREATE`, `FILE_DELETE`, `FILE_RENAME`, `FILE_MOVE`, `FOLDER_CREATE`, `FOLDER_DELETE`, `FOLDER_RENAME`, and `FOLDER_MOVE`.

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/files/operation
Authorization: Bearer {{token}}
Content-Type: application/json
```

Operation payload requirements depend on the selected operation; see the WebSocket examples below for the event format.

### 13.7 Project Members

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}/members
Authorization: Bearer {{token}}
```

Returns the Project Service member list in the standard success/data response wrapper.

### 13.8 Workspace Chat

Get paginated history (optional `before` cursor and `limit`):

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}/chat?limit=50
Authorization: Bearer {{token}}
```

Send a message:

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/chat
Authorization: Bearer {{token}}
Content-Type: application/json
```

```json
{
  "content": "I pushed the initial implementation."
}
```

### 13.9 Whiteboard State

```
GET http://localhost:8080/collaboration/api/workspaces/{projectId}/whiteboard
Authorization: Bearer {{token}}
```

Clear the whiteboard:

```
DELETE http://localhost:8080/collaboration/api/workspaces/{projectId}/whiteboard
Authorization: Bearer {{token}}
```

### 13.10 Start and Stop the IDE Container

Start Eclipse Theia for the project's workspace:

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/theia/start
Authorization: Bearer {{token}}
```

Check its state with `GET /collaboration/api/workspaces/{projectId}/theia`; stop it with `POST /collaboration/api/workspaces/{projectId}/theia/stop`. Starting Theia requires Docker to be available to the collaboration service.

### 13.11 Execute a Terminal Command

```
POST http://localhost:8080/collaboration/api/workspaces/{projectId}/terminal/exec
Authorization: Bearer {{token}}
Content-Type: application/json
```

```json
{
  "command": "pwd"
}
```

### 13.12 Real-Time WebSocket Connection

The WebSocket endpoint is served directly by the collaboration service:

```
ws://localhost:8090/ws/workspace/{projectId}?token={{token}}
```

Connect with a valid JWT for a project member. The server responds with `CONNECTION_ACK` and the currently online user IDs. Send JSON messages with a `type` and `payload`; the server sets `userId` and `projectId` from the authenticated connection, so client-supplied identity values are not trusted.

Example chat event:

```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "content": "Hello, team!"
  }
}
```

Example file-create event:

```json
{
  "type": "FILE_CREATE",
  "payload": {
    "path": "src/new-file.js",
    "content": "// Start here"
  }
}
```

Other event types include `WHITEBOARD_OBJECT_CREATE`, `WHITEBOARD_OBJECT_UPDATE`, `WHITEBOARD_OBJECT_DELETE`, `WHITEBOARD_CURSOR_MOVE`, `CODE_OPERATION`, `CODE_CURSOR_MOVE`, `JOIN_VOICE`, `LEAVE_VOICE`, `WEBRTC_OFFER`, `WEBRTC_ANSWER`, `WEBRTC_ICE_CANDIDATE`, and `HEARTBEAT`. Payload fields vary by event; consult `backend/collaboration-service/src/websocket/eventValidator.js` for the required fields. Chat, file operations, code document updates, and whiteboard changes are persisted; cursor movements, presence, voice signaling, and heartbeats are transient.

---

## Compile Verification

Verified on 2026-10-06 from each service directory:

```
profileservice  →  bash ./mvnw -q compile   exit code: 0  ✅
projectservice  →  bash ./mvnw -q compile   exit code: 0  ✅
```

Invoke the wrapper through `bash` in this checkout because `mvnw` does not have its executable bit set.

> **Note:** After making these changes while services are already running, **restart both `profileservice` and `projectservice`** for the enriched responses to take effect.
