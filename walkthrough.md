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
