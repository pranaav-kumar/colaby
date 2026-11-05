# Colaby

Colaby is a collaborative project workspace with a React frontend, Spring Boot services, and a Go `net/http` collaboration service. PostgreSQL stores application and collaboration data; Redis supports API Gateway rate limiting; Eclipse Theia runs in on-demand Docker containers.

## Getting started

Follow [HOW_TO_SETUP.md](HOW_TO_SETUP.md) for prerequisites, local secrets, PostgreSQL and Redis startup, Spring configuration, and the exact commands to run each service after cloning.

The collaboration service has its own [API and service notes](backend/collaboration-service/README.md).
