# Monorepo

Basic monorepo containing a Next.js frontend, an Express REST API, a Bun WebSocket server, and PostgreSQL via Prisma.

## Structure

```text
apps/
  api/      Express REST API (port 8080)
  web/      Next.js application (port 3000)
  ws/       Bun WebSocket server (port 8081)
packages/
  db/       Prisma schema and client
```

## Running Locally

Start the containers:
```bash
docker compose up -d
```

Sync the database schema:
```bash
docker compose exec api bunx prisma@5 db push --schema packages/db/prisma/schema.prisma
```

## Verification

### 1. Check Container Status
```bash
docker compose ps
```
All 4 containers (`api`, `web`, `ws`, `postgres`) should show `Up`.

### 2. Check API Health
```bash
curl http://localhost:8080/health
```
Expected response:
```json
{"status":"ok","database":"connected"}
```

### 3. Check WebSocket Server
Health check:
```bash
curl http://localhost:8081/health
```
Expected response:
```json
{"status":"ok","service":"ws"}
```

Test WebSocket connection via browser DevTools console:
```javascript
const ws = new WebSocket("ws://localhost:8081");
ws.onopen = () => ws.send("ping");
ws.onmessage = (e) => console.log(e.data);
```
Expected output:
```text
echo: ping
```

### 4. Create and Fetch Users via API
Create user:
```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'
```

List users:
```bash
curl http://localhost:8080/api/users
```

### 5. Frontend Interface
Open `http://localhost:3000` in a browser.

## AWS Target Architecture

- Database: Amazon RDS PostgreSQL
- API: AWS ECS Fargate via `Dockerfile.api`
- WS: AWS ECS Fargate via `Dockerfile.ws`
- Frontend: AWS ECS Fargate via `Dockerfile.web`
- Ingress: Application Load Balancer (ALB) routing `/api/*` to the API service, `/ws` (or port 8081) to the WebSocket service, and `/*` to the Web service
