# Colaby local setup

This guide starts the application after a fresh clone. PostgreSQL and Redis run in Docker Compose; the Spring Boot services, Go collaboration service, and Vite frontend run locally. The Go service starts Eclipse Theia containers on demand.

## Requirements

- Docker Engine with the Compose plugin
- Java 21
- Go 1.25+
- Node.js 20.19+ or 22.12+
- Git and OpenSSL

## 1. Configure local secrets

From the repository root:

```sh
cp .env.example .env
```

Generate two different values and replace the placeholders in `.env`:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Keep `.env` private; it is ignored by Git. Use the same `JWT_SECRET` and `PROJECT_SERVICE_KEY` values in the services as described below.

## 2. Start PostgreSQL and Redis

```sh
docker compose up -d
docker compose ps
```

Compose keeps data in named volumes. To stop the containers without removing data, run `docker compose down`. Do not use `docker compose down -v` unless you intend to erase the local databases.

If PostgreSQL or Redis is already running on ports 5432 or 6379, stop the existing service or change the host-side port in `compose.yaml` and update the matching connection settings below.

## 3. Configure Spring Boot services

Each Spring service reads an ignored `application-local.properties` from its `src/main/resources` directory. Create these files for `authservice`, `userdetailsservice`, `projectservice`, `profileservice`, and `communityservice`:

```text
backend/<service>/src/main/resources/application-local.properties
```

Put these values in each file, replacing the password and secret placeholders with the values from `.env`:

```properties
DB_URL=jdbc:postgresql://localhost:5432/colaby
DB_USERNAME=colaby
DB_PASSWORD=<POSTGRES_PASSWORD from .env>
```

Add these service-specific values as well:

- `authservice`: `SECRETKEY=<JWT_SECRET from .env>`
- `projectservice`: `project-service.key=<PROJECT_SERVICE_KEY from .env>`

The other three services need only the database properties. All Spring services can share this local database; Hibernate creates and updates their tables on startup. Eureka discovery does not need a database.

## 4. Configure the Go collaboration service

```sh
cp backend/collaboration-service/.env.example backend/collaboration-service/.env
```

Edit `backend/collaboration-service/.env` and set:

```dotenv
DATABASE_URL=postgres://colaby:<POSTGRES_PASSWORD>@localhost:5432/colaby?sslmode=disable
PROJECT_SERVICE_KEY=<PROJECT_SERVICE_KEY from root .env>
JWT_SECRET=<JWT_SECRET from root .env>
```

Keep `PROJECT_SERVICE_URL=http://localhost:8084` and `PORT=8090` for local development. The Go service creates its PostgreSQL tables automatically at startup. It stores workspace folders under `~/.local/share/colaby/workspaces` unless `WORKSPACE_ROOT_DIR` is changed. Docker must be available to this process for Theia IDE containers.

## 5. Install frontend dependencies

```sh
cd frontend
npm ci
cd ..
```

The Vite development server uses `http://localhost:3000`; the frontend API client targets the local API Gateway.

## 6. Start the services

After completing steps 1–5, the repository includes a script that starts all services and waits for them to become reachable:

```sh
chmod +x run-colaby.sh
./run-colaby.sh
```

It starts/reuses PostgreSQL and Redis via Docker, then launches Eureka, the Spring Boot services, Go collaboration service, API Gateway, and frontend. Logs are written to `.run/logs/` and process IDs to `.run/pids/`.

Use these commands to manage the processes later:

```sh
./run-colaby.sh --status
./run-colaby.sh --stop
```

`--stop` stops application processes but leaves the PostgreSQL and Redis containers running. Run `docker compose down` to stop the containers.

To start services manually in separate terminals instead, use the commands below.

Open a terminal for each command and leave it running. Start in this order so service discovery and service-to-service calls are ready:

```sh
cd backend/discoveryservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/userdetailsservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/projectservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/authservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/communityservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/profileservice && bash ./mvnw spring-boot:run
```

```sh
cd backend/collaboration-service && go run .
```

```sh
cd frontend && npm run dev
```

The application is at `http://localhost:3000`. The API Gateway is at `http://localhost:8080`; collaboration is also reachable directly at `http://localhost:8090/health`.

## Services and local ports

| Service | Port |
|---|---:|
| Frontend (Vite) | 3000 |
| API Gateway | 8080 |
| Auth | 8081 |
| User details | 8082 |
| Community | 8083 |
| Project | 8084 |
| Profile | 8085 |
| Eureka discovery | 8761 |
| Go collaboration | 8090 |
| Theia IDE containers | 9100–9199 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Troubleshooting

- Check dependencies with `docker compose ps` and `curl http://localhost:8090/health`.
- Ensure all five Spring `application-local.properties` files have the same database URL, username, and password. Ensure the auth signing secret and collaboration `JWT_SECRET` match exactly.
- Ensure `project-service.key` and collaboration `PROJECT_SERVICE_KEY` match exactly.
- If a port is occupied, stop the process using it or change the port in the relevant service configuration and update dependent URLs.
- The first IDE launch downloads the Theia image and can take a few minutes. The collaboration service needs permission to use Docker and write to the workspace root.
- The collaboration service is Go; there is no `npm install` step or Node server in `backend/collaboration-service`.
