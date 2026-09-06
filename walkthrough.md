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
a2257a86-86e0-40a2-9dd2-6e9973bde626
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
    "name": "python-devs",
    "description": "A community for Python developers to share knowledge and ask questions.",
    "createdBy": "a2257a86-86e0-40a2-9dd2-6e9973bde626",
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
  ├─ Rate limiting via Redis (IP for /auth, User UUID for rest)
  └─ Circuit breaker per route
       │
       ├──► Auth Service :8081        (signup, login, refresh, logout)
       ├──► User Details Service :8082 (profile CRUD)
       └──► Community Service :8083   (communities, posts, comments, votes)
                    │
                    ▼
            PostgreSQL (colaby-community DB)
```

The **community service never validates the JWT itself** — it simply reads the `X-User-Id` header that the gateway has already verified and injected. This is why all your Postman requests go to port `8080` only.


---

## Updated Architecture (with Project Service)

```
Frontend / Postman
       |
       v
  API Gateway :8080
  |- Validates JWT -> injects X-User-Id header
  |- Rate limiting via Redis (IP for /auth, User UUID for rest)
  +- Circuit breaker per route
       |
       +---> Auth Service :8081          (signup, login, refresh, logout)
       +---> User Details Service :8082  (profile CRUD)
       +---> Community Service :8083     (communities, posts, comments, votes)
       +---> Project Service :8084       (projects, invitations, tasks, docs)
```

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
    "id": { "userId": "creator-uuid", "projectId": "a1b2c3d4-..." },
    "role": "CREATOR",
    "joinedAt": "2026-09-06T16:30:00Z"
  },
  {
    "id": { "userId": "member-uuid", "projectId": "a1b2c3d4-..." },
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
  "projectId": "a1b2c3d4-...",
  "targetUserId": "your-user-uuid",
  "initiatedBy": "your-user-uuid",
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
  "assignedTo": "member-user-uuid",
  "assignedBy": "creator-uuid",
  "title": "Implement JWT refresh flow",
  "description": "Use opaque tokens stored in Redis with 7-day TTL",
  "progressPercent": 0,
  "progressNote": null,
  "status": "TODO",
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
Status is auto-derived - never set it manually:

| progressPercent | status auto-set to |
|---|---|
| 0 | TODO |
| 1 to 99 | IN_PROGRESS |
| 100 | DONE |

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
  "progressPercent": 65,
  "progressNote": "Token storage in Redis done. Working on the /refresh endpoint now.",
  "status": "IN_PROGRESS",
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
    status          VARCHAR NOT NULL DEFAULT 'ACTIVE',
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
    progress_percent INT NOT NULL DEFAULT 0,
    progress_note    TEXT,
    status           VARCHAR NOT NULL DEFAULT 'TODO',
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
