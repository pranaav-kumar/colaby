# Colaby — Backend API Documentation

> **Version**: 0.2.0 &nbsp;|&nbsp; **Base URL**: `http://localhost:8080` (API Gateway)

---

## Architecture Overview

```
┌──────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  Client  │─────▶│   API Gateway    │─────▶│   Auth Service      │
│          │      │   :8080          │      │   :8081              │
└──────────┘      │                  │      │                      │
                  │  • JWT Auth      │      │  • Signup / Login    │
                  │  • Rate Limiting │      │  • JWT Generation    │
                  │  • Circuit Break │      │  • Refresh Tokens    │
                  │  • CORS          │      │  • Feign ──────────┐ │
                  │  • X-User-Id fwd │      └────────────────────┼─┘
                  │                  │                           │
                  │                  │      ┌────────────────────▼─┐
                  │                  │─────▶│ User Details Service │
                  │                  │      │ :8082                │
                  └──────────────────┘      │                      │
                           │                │  • Profile CRUD      │
                  ┌────────▼───────┐        │  • Reads X-User-Id   │
                  │ Discovery Svc  │        │  • User creation     │
                  │ (Eureka) :8761 │        │    (via Feign)       │
                  └────────────────┘        └──────────────────────┘
```

All services register with **Eureka** for service discovery. The gateway uses `lb://` (load-balanced) URIs.

---

## 1. Auth Service — `/auth`

Handles user registration, authentication, and token lifecycle.

### 1.1 Signup

Creates a new user account and a corresponding user profile in the User Details Service (via Feign).

```
POST /auth/signup
```

**Request Body**

| Field      | Type   | Constraints         | Required |
|-----------|--------|---------------------|----------|
| `email`    | string | Valid email format   | ✅        |
| `password` | string | Minimum 8 characters | ✅        |

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response** — `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJhbmRvbS..."
}
```

| Field          | Type   | Description                                        |
|---------------|--------|----------------------------------------------------|
| `accessToken`  | string | JWT (15 min expiry). Subject claim = user UUID.     |
| `refreshToken` | string | Opaque token (configurable expiry via env variable).|

**Errors**

| Status | Condition                       |
|--------|---------------------------------|
| 400    | Invalid email format or password < 8 chars |
| 500    | Email already exists            |

**Side Effects**
- A `User` row is created in the auth service database (PostgreSQL).
- A `UserDetail` row is created in the user details service database via internal Feign call, sharing the **same UUID**.
- A `RefreshToken` row is stored in the auth service database.

---

### 1.2 Login

Authenticates an existing user with email and password.

```
POST /auth/login
```

**Request Body**

| Field      | Type   | Constraints         | Required |
|-----------|--------|---------------------|----------|
| `email`    | string | Valid email format   | ✅        |
| `password` | string | Non-blank            | ✅        |

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response** — `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJhbmRvbS..."
}
```

**Errors**

| Status | Condition              |
|--------|------------------------|
| 400    | Invalid email format or blank password |
| 500    | Invalid credentials    |

**Side Effects**
- All previous refresh tokens for this user are **deleted** (single-session enforcement).
- A new refresh token is created.

---

### 1.3 Refresh Token

Exchanges a valid refresh token for a new access token. The refresh token itself is reused (not rotated).

```
POST /auth/refresh
```

**Request Body**

| Field          | Type   | Required |
|---------------|--------|----------|
| `refreshToken` | string | ✅        |

```json
{
  "refreshToken": "dGhpcyBpcyBhIHJhbmRvbS..."
}
```

**Response** — `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...(new)",
  "refreshToken": "dGhpcyBpcyBhIHJhbmRvbS...(same)"
}
```

**Errors**

| Status | Condition                         |
|--------|-----------------------------------|
| 500    | Invalid, expired, or missing refresh token |
| 500    | User account no longer exists      |

---

### 1.4 Logout

Revokes the refresh token, effectively logging the user out.

```
POST /auth/logout
```

**Request Body**

| Field          | Type   | Required |
|---------------|--------|----------|
| `refreshToken` | string | ✅        |

```json
{
  "refreshToken": "dGhpcyBpcyBhIHJhbmRvbS..."
}
```

**Response** — `200 OK`

```
"logged out"
```

---

## 2. User Details Service — `/users`

Manages user profile information. User profiles are created automatically during signup via internal Feign call.

> **🔒 All `/users/**` endpoints require authentication** (valid JWT in `Authorization: Bearer <token>` header). The gateway validates the JWT and forwards the user's UUID as `X-User-Id` header.

### 2.1 Update Profile

Creates or updates the **authenticated user's** profile details. The `userId` is taken from the gateway's `X-User-Id` header (derived from JWT), so the client **cannot** edit another user's profile.

```
PUT /users/details
Authorization: Bearer <accessToken>
```

**Request Body**

| Field              | Type       | Description                    | Required |
|-------------------|------------|--------------------------------|----------|
| `fullName`         | string     | Full display name              | ❌        |
| `userName`         | string     | Unique username                | ❌        |
| `exp`              | integer    | Experience level               | ❌        |
| `profileUrl`       | string     | Profile picture URL            | ❌        |
| `bio`              | string     | Short biography                | ❌        |
| `githubUrl`        | string     | GitHub profile link            | ❌        |
| `skills`           | string[]   | List of skills/technologies    | ❌        |
| `linkedinUrl`      | string     | LinkedIn profile link          | ❌        |
| `portfolioUrl`     | string     | Portfolio website URL          | ❌        |
| `openToCollaborate`| boolean    | Availability for collaboration | ❌        |

> **Note**: `userId` in the request body is **ignored** — the server uses the authenticated user's UUID from the JWT.

```json
{
  "fullName": "Jane Doe",
  "userName": "janedoe",
  "exp": 3,
  "bio": "Full-stack developer passionate about open source",
  "skills": ["Java", "Spring Boot", "React", "PostgreSQL"],
  "githubUrl": "https://github.com/janedoe",
  "linkedinUrl": "https://linkedin.com/in/janedoe",
  "portfolioUrl": "https://janedoe.dev",
  "openToCollaborate": true
}
```

**Response** — `200 OK`

Returns the saved `UserDetail` object with `updatedAt` automatically set.

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "Jane Doe",
  "userName": "janedoe",
  "exp": 3,
  "profileUrl": null,
  "bio": "Full-stack developer passionate about open source",
  "githubUrl": "https://github.com/janedoe",
  "skills": ["Java", "Spring Boot", "React", "PostgreSQL"],
  "linkedinUrl": "https://linkedin.com/in/janedoe",
  "portfolioUrl": "https://janedoe.dev",
  "openToCollaborate": true,
  "createdAt": "2026-08-18T00:00:00Z",
  "updatedAt": "2026-08-18T00:05:00Z"
}
```

---

### 2.2 Get Profile by ID

Retrieves a user's profile by their UUID. Any authenticated user can view any profile.

```
GET /users/details/{id}
Authorization: Bearer <accessToken>
```

**Path Parameters**

| Parameter | Type | Description     |
|-----------|------|-----------------|
| `id`      | UUID | User identifier |

**Response** — `200 OK`

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "Jane Doe",
  "userName": "janedoe",
  "exp": 3,
  "profileUrl": null,
  "bio": "Full-stack developer passionate about open source",
  "githubUrl": "https://github.com/janedoe",
  "skills": ["Java", "Spring Boot", "React", "PostgreSQL"],
  "linkedinUrl": "https://linkedin.com/in/janedoe",
  "portfolioUrl": "https://janedoe.dev",
  "openToCollaborate": true,
  "createdAt": "2026-08-18T00:00:00Z",
  "updatedAt": "2026-08-18T00:05:00Z"
}
```

**Errors**

| Status | Condition            |
|--------|----------------------|
| 500    | User profile not found |

---

### 2.3 Get All Profiles

Returns all user profiles. Useful for browsing collaborators.

```
GET /users/allprofiles
Authorization: Bearer <accessToken>
```

**Response** — `200 OK`

```json
[
  {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "fullName": "Jane Doe",
    "userName": "janedoe",
    ...
  },
  {
    "userId": "660f9511-f3ab-52e5-b827-557766551111",
    "fullName": "John Smith",
    "userName": "jsmith",
    ...
  }
]
```

---

### 2.4 Create User (Internal)

**⚠️ Internal endpoint** — Called by the Auth Service via Feign client during signup. Not intended for direct client use.

```
POST /users/internal/createUser
```

**Request Body**

| Field    | Type | Required |
|----------|------|----------|
| `userId` | UUID | ✅        |

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response** — `200 OK` (void)

---

## 3. Authentication & Authorization

### How It Works

```
Client → Gateway (validates JWT) → adds X-User-Id header → Downstream Service
```

1. **Public routes** (`/auth/**`, `/fallback/**`) — no JWT required
2. **Protected routes** (everything else) — gateway validates JWT, extracts userId, forwards as `X-User-Id` header
3. **Downstream services** read `X-User-Id` header — no JWT logic needed in individual services
4. **Invalid/missing JWT** → gateway returns `401 Unauthorized`

### JWT Access Token

- **Algorithm**: HMAC-SHA (symmetric key from `SECRETKEY` env variable)
- **Expiry**: 15 minutes
- **Subject claim**: User UUID (string representation)
- **Validated at**: API Gateway (not at individual services)
- **Usage**: Send in the `Authorization` header as a Bearer token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### Refresh Token

- **Format**: Base64url-encoded random bytes (64 bytes)
- **Expiry**: Configurable via `REFRESH_TOKEN_EXPIRY` env variable (milliseconds)
- **Storage**: Stored in `refresh_token` table in auth service database
- **Behavior on login**: Previous refresh tokens for the user are deleted

### X-User-Id Header

- **Set by**: API Gateway (after JWT validation)
- **Format**: UUID string (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Read by**: Downstream services to identify the authenticated user
- **Trust model**: Services trust the header because only the gateway is publicly accessible

---

## 4. API Gateway

**Port**: `8080`

### Route Mapping

| Route Pattern | Target Service       | Auth Required | Service Name         |
|---------------|----------------------|---------------|----------------------|
| `/auth/**`    | Auth Service (:8081) | ❌ Public      | `AUTHSERVICE`        |
| `/users/**`   | User Details (:8082) | ✅ JWT         | `USERDETAILSSERVICE` |
| `/fallback/**`| Gateway itself       | ❌ Public      | —                    |

### Resilience Features

| Feature          | Configuration                                    |
|-----------------|--------------------------------------------------|
| **JWT Auth**      | Validates JWT, forwards `X-User-Id` header to downstream |
| **Rate Limiting** | **User UUID Key Resolver** for protected routes (`/users/**`), **IP Key Resolver** for unauthenticated routes (`/auth/**`). 10 req/sec sustained, 20 req burst via Redis Token Bucket. |
| **Circuit Breaker** | Resilience4j — per-service circuit breakers with fallback endpoints |
| **Timeouts**     | Connect: 3s, Response: 5s                        |
| **Actuators**    | Available at `/actuator/health` across all microservices |

### CORS Configuration

| Setting          | Value                                |
|-----------------|--------------------------------------|
| Allowed Origins  | `http://localhost:3000`              |
| Allowed Methods  | GET, POST, PUT, DELETE, PATCH, OPTIONS |
| Allowed Headers  | `*`                                  |
| Credentials      | `true`                               |

### Fallback Endpoints

When a downstream service is unavailable, the gateway returns `503 Service Unavailable`:

| Fallback Path        | Message                                                          |
|---------------------|------------------------------------------------------------------|
| `/fallback/auth`     | "Auth service is temporarily unavailable. Please try again shortly." |
| `/fallback/users`    | "User details service is temporarily unavailable. Please try again shortly." |
| `/fallback/profiles` | "Profile service is temporarily unavailable. Please try again shortly." |

---

## 5. Environment Variables

### API Gateway

| Variable   | Description                              | Example                            |
|-----------|------------------------------------------|------------------------------------|
| `SECRETKEY` | HMAC signing key for JWTs (min 32 bytes) — **must match auth service** | `my-super-secret-key-that-is-long` |

### Auth Service

| Variable              | Description                              | Example                            |
|----------------------|------------------------------------------|------------------------------------|
| `DB_URL`              | PostgreSQL JDBC connection URL           | `jdbc:postgresql://localhost:5432/authdb` |
| `DB_USERNAME`         | Database username                        | `postgres`                         |
| `DB_PASSWORD`         | Database password                        | `password`                         |
| `SECRETKEY`           | HMAC signing key for JWTs (min 32 bytes) | `my-super-secret-key-that-is-long` |
| `REFRESH_TOKEN_EXPIRY`| Refresh token TTL in milliseconds        | `604800000` (7 days)               |

### User Details Service

| Variable      | Description                    | Example                                  |
|--------------|--------------------------------|------------------------------------------|
| `DB_URL`      | PostgreSQL JDBC connection URL | `jdbc:postgresql://localhost:5432/userdb` |
| `DB_USERNAME` | Database username              | `postgres`                               |
| `DB_PASSWORD` | Database password              | `password`                               |

---

## 6. Service Ports

| Service            | Port  |
|-------------------|-------|
| API Gateway        | 8080  |
| Auth Service       | 8081  |
| User Details Service | 8082 |
| Discovery (Eureka) | 8761  |
| Redis              | 6379  |

---

## 7. Database Schema

### Auth Service Database

**Table: `users`**

| Column     | Type         | Constraints          |
|-----------|-------------|----------------------|
| `id`       | UUID         | Primary Key, auto-generated |
| `email`    | VARCHAR      | NOT NULL, UNIQUE     |
| `password` | VARCHAR      | NOT NULL (BCrypt hashed) |

**Table: `refresh_token`**

| Column       | Type      | Constraints                |
|-------------|-----------|----------------------------|
| `id`         | UUID      | Primary Key, auto-generated |
| `user_id`    | UUID      | NOT NULL                   |
| `token`      | VARCHAR   | NOT NULL, UNIQUE           |
| `expiry_date`| TIMESTAMP | NOT NULL                   |

### User Details Service Database

**Table: `user_detail`**

| Column              | Type      | Constraints |
|--------------------|-----------|-------------|
| `user_id`           | UUID      | Primary Key (same as auth service `users.id`) |
| `full_name`         | VARCHAR   |             |
| `user_name`         | VARCHAR   |             |
| `exp`               | INTEGER   |             |
| `profile_url`       | VARCHAR   |             |
| `bio`               | VARCHAR   |             |
| `github_url`        | VARCHAR   |             |
| `linkedin_url`      | VARCHAR   |             |
| `portfolio_url`     | VARCHAR   |             |
| `open_to_collaborate`| BOOLEAN  |             |
| `created_at`        | TIMESTAMP |             |
| `updated_at`        | TIMESTAMP |             |

**Table: `user_detail_skills`** (JPA `@ElementCollection`)

| Column             | Type    | Constraints                              |
|-------------------|---------|------------------------------------------|
| `user_detail_user_id` | UUID | FK → `user_detail.user_id`              |
| `skills`            | VARCHAR |                                          |

---

## 8. Typical User Flow

```
1. POST /auth/signup              → Get accessToken + refreshToken (no auth needed)
                                   → UserDetail created automatically (Feign)

2. PUT /users/details             → Fill in profile (requires Bearer token)
   Authorization: Bearer <token>     userId set from JWT automatically

3. POST /auth/login               → Re-authenticate, get new tokens (no auth needed)

4. GET /users/details/{id}        → View a user's profile (requires Bearer token)
   Authorization: Bearer <token>

5. GET /users/allprofiles         → Browse all collaborators (requires Bearer token)
   Authorization: Bearer <token>

6. POST /auth/refresh             → Get a new access token (no auth needed)

7. POST /auth/logout              → Revoke refresh token (no auth needed)
```
