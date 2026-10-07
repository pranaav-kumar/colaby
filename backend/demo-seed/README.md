# Colaby demo data

The local Colaby services are populated with fictional demo accounts and realistic, connected activity. From the repository root, run:

```bash
node backend/demo-seed/seed.mjs
```

The script uses the local gateway at `http://localhost:8080`. Set `COLABY_API_URL` to use another Colaby API and `DEMO_USER_PASSWORD` to choose the shared password for demo accounts. The defaults are `http://localhost:8080` and `ColabyDemo2026!`.

Sign in to the frontend with:

- Email: `maya@colaby.demo`
- Password: `ColabyDemo2026!`

The seed creates or refreshes 12 fictional profiles, 8 communities, 64 discussions with 192 comments and votes, and 6 projects with 32 memberships, 30 tasks, project docs, events, folders, and notes. It uses stable account names and checks existing community and project records so it can be rerun after a successful seed.
