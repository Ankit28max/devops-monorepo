
# AWS EC2 Deployment and CI/CD Setup Guide

Complete reference for deploying this monorepo to an AWS EC2 instance with Docker Compose, Nginx reverse proxy, SSL/TLS, and automated GitHub Actions CI/CD.

---

## 1. Architecture Overview

```text
               +--------------------------------------------------------+
               |                  AWS EC2 Virtual Machine               |
               |                                                        |
               |   Ports 80 / 443                                       |
Internet ----->|        |                                               |
(Clients)      |        v                                               |
               |   [ Nginx Reverse Proxy & SSL (Certbot) ]              |
               |        |                 |               |             |
               |        | /               | /api/*        | /ws         |
               |        v                 v               v             |
               |   [ Web Container ] [ API Container ] [ WS Container ] |
               |     (Next.js :3000)   (Express :8080)   (Bun :8081)    |
               |                              |               |         |
               |                              +-------+-------+         |
               |                                      v                 |
               |                           [ Postgres Container ]       |
               |                                 (Port 5432)            |
               +--------------------------------------------------------+
```

---

## 2. Server Provisioning on AWS

### 2.1 Launch Instance
1. Go to **AWS Console** > **EC2** > **Instances** > **Launch Instances**.
2. **Name**: `monorepo-prod`
3. **AMI**: Ubuntu Server 24.04 LTS (64-bit x86).
4. **Instance Type**:
   - Minimum: `t3.small` (2 vCPU, 2 GB RAM).
   - If using `t3.micro` (free tier, 1 GB RAM), you **must** configure swap memory (detailed in section 3.2).
5. **Key Pair**: Create or select an existing `.pem` key pair (e.g., `monorepo-key.pem`).
6. **Storage**: 20 GB to 30 GB gp3 root volume.

### 2.2 Security Group Rules
Configure the following **Inbound Rules**:

| Type | Port Range | Source | Description |
|------|------------|--------|-------------|
| SSH | 22 | My IP | Administrative SSH access |
| HTTP | 80 | 0.0.0.0/0 | Nginx HTTP / ACME SSL challenge |
| HTTPS | 443 | 0.0.0.0/0 | Secure web traffic |
| Custom TCP | 3000 | 0.0.0.0/0 | Next.js direct port (optional fallback) |
| Custom TCP | 8080 | 0.0.0.0/0 | Express API port (optional fallback) |
| Custom TCP | 8081 | 0.0.0.0/0 | WebSocket port (optional fallback) |

### 2.3 Elastic IP (Recommended)
By default, EC2 changes public IP addresses upon stop/start cycles.
1. Navigate to **EC2** > **Network & Security** > **Elastic IPs**.
2. Click **Allocate Elastic IP address** > **Allocate**.
3. Select the IP > **Actions** > **Associate Elastic IP address**.
4. Choose your `monorepo-prod` instance and click **Associate**.

---

## 3. Server Initialization

### 3.1 Connect to EC2
Set local file permissions and connect:
```bash
chmod 400 /path/to/monorepo-key.pem
ssh -i /path/to/monorepo-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

### 3.2 Configure Swap Space (Crucial for 1GB - 2GB RAM instances)
Prevents out-of-memory kills during Docker builds and database initialization:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.3 Install Docker Engine & Docker Compose
The most reliable method on Ubuntu is the official Docker automated installation script:

```bash
# 1. Download and run official Docker installer
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Add current user to docker group (run docker without sudo)
sudo usermod -aG docker $USER
newgrp docker

# 3. Clean up installation script
rm get-docker.sh
```

*(Alternative: Ubuntu's native repository)*
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
newgrp docker
```

Verify installation:
```bash
docker --version
docker compose version
```

---

## 4. Manual Deployment & First Run

### 4.1 Clone Repository
```bash
git clone https://github.com/Ankit28max/devops-monorepo.git /home/ubuntu/devops-monorepo
cd /home/ubuntu/devops-monorepo
```

### 4.2 Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
nano .env
```

Set secure credentials:
```env
POSTGRES_PASSWORD=generate_a_random_strong_password
DATABASE_URL=postgresql://postgres:generate_a_random_strong_password@postgres:5432/postgres
```

In `docker-compose.yaml`, update client-facing environment variables:
```yaml
      NEXT_PUBLIC_API_URL: http://<YOUR_EC2_IP_OR_DOMAIN>:8080
      NEXT_PUBLIC_WS_URL: ws://<YOUR_EC2_IP_OR_DOMAIN>:8081
```
*(If using the Nginx reverse proxy from section 5, these can point directly to `http://<YOUR_DOMAIN>/api` and `ws://<YOUR_DOMAIN>/ws`)*.

### 4.3 Build and Launch Containers
```bash
docker compose up -d --build
```

### 4.4 Push Database Schema
Run Prisma database sync inside the running API container:
```bash
docker compose exec api bunx prisma@5 db push --schema packages/db/prisma/schema.prisma
```

### 4.5 Verify Services
```bash
docker compose ps
```
Confirm all 4 services (`api`, `web`, `ws`, `postgres`) are in status `Up`.

Test local health endpoints:
```bash
curl http://localhost:8080/health
curl http://localhost:8081/health
curl -I http://localhost:3000
```

---

## 5. Nginx Reverse Proxy and SSL (Production)

Running services directly on ports 3000, 8080, and 8081 is unsafe for production. Use Nginx to handle SSL termination and unified routing on ports 80 and 443.

### 5.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 5.2 Configure Nginx Site
Edit the default configuration:
```bash
sudo nano /etc/nginx/sites-available/default
```

Paste the configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com; # Replace with your domain or EC2 IP

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # REST API (Express)
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Server (Bun)
    location /ws {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Grafana Observability Dashboard
    location /grafana/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Validate and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5.3 Enable HTTPS with Certbot (Let's Encrypt)
Ensure your domain has an `A` record pointing to the EC2 Elastic IP, then run:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Certbot automatically provisions TLS certificates and configures automatic renewal cron jobs.

---

## 6. Setting Up Continuous Deployment (CI/CD)

Whenever changes are merged to the `main` branch, GitHub Actions will automatically connect to your EC2 instance via SSH, pull latest code, rebuild images, and apply migrations.

### 6.1 Generate SSH Deployment Key
On your local machine or EC2 instance:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key
```

Add the **public key** (`~/.ssh/github_deploy_key.pub`) to `~/.ssh/authorized_keys` on your EC2 instance:
```bash
cat ~/.ssh/github_deploy_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 6.2 Configure GitHub Repository Secrets
Navigate to your GitHub repository > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

Add the following 3 secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `EC2_HOST` | `54.xxx.xxx.xxx` | Public IP or Elastic IP of the EC2 instance |
| `EC2_USER` | `ubuntu` | Default Ubuntu SSH username |
| `EC2_SSH_KEY` | *(Full contents of `~/.ssh/github_deploy_key`)* | Private key (starting with `-----BEGIN OPENSSH PRIVATE KEY-----`) |

---

## 7. CI/CD Workflow File

The workflow is stored at `.github/workflows/deploy.yml`:

```yaml
name: Continuous Deployment (EC2)

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Deploy to AWS EC2 via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script_stop: true
          script: |
            cd /home/ubuntu/devops-monorepo

            echo "Pulling latest changes from git..."
            git pull origin main

            echo "Rebuilding and restarting updated containers..."
            docker compose up -d --build

            echo "Syncing Prisma database schema..."
            docker compose exec -T api bunx prisma@5 db push --schema packages/db/prisma/schema.prisma

            echo "Pruning dangling images..."
            docker image prune -f

            echo "Deployment successfully completed."
```

---

## 8. Troubleshooting & Maintenance

### 8.1 View Real-Time Container Logs
```bash
# All containers
docker compose logs -f

# Specific container
docker compose logs -f api
docker compose logs -f web
docker compose logs -f ws
docker compose logs -f postgres
```

### 8.2 Restart Single Service
```bash
docker compose restart api
```

### 8.3 Check Resource Usage
```bash
docker stats
```

### 8.4 Database Backups
Create a PostgreSQL dump:
```bash
docker compose exec postgres pg_dump -U postgres postgres > backup_$(date +%Y%m%d_%H%M%S).sql
```

Restore from a dump:
```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres -d postgres
```
