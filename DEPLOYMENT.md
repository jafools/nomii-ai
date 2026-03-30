# Nomii AI — Proxmox Deployment Guide

## Overview

This guide deploys Nomii AI on a Proxmox VM using Docker Compose. The setup includes three containers: PostgreSQL database, Node.js backend API, and React frontend served via nginx.

## Prerequisites

- Proxmox VE with ability to create VMs or LXC containers
- Basic familiarity with SSH and command line

## Step 1: Create a VM on Proxmox

Create an Ubuntu 22.04 (or 24.04) VM with the following specs:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 40 GB |
| Network | Bridge (vmbr0) | Bridge (vmbr0) |

Alternatively, use an LXC container (lighter weight) with the same specs.

After creation, note the VM's IP address.

## Step 2: Install Docker on the VM

SSH into your VM and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Log out and back in for group changes
exit
```

SSH back in and verify:

```bash
docker --version
docker compose version
```

## Step 3: Deploy Nomii AI

```bash
# Clone or copy the project to the VM
# Option A: If using git
git clone <your-repo-url> nomii-ai
cd nomii-ai

# Option B: SCP from your local machine
# scp -r "Nomii AI/" user@<vm-ip>:~/nomii-ai

# Create environment file
cp .env.example .env
# Edit .env to set a strong DB_PASSWORD for production
nano .env
```

## Step 4: Build and Start

```bash
# Build all containers
docker compose build

# Start everything (detached)
docker compose up -d

# Check all services are running
docker compose ps
```

You should see three containers running: nomii-db, nomii-backend, nomii-frontend.

## Step 5: Initialize the Database

```bash
# Run the setup script
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh
```

This runs the schema migrations and seeds the database with the Covenant Trust demo data (3 customer personas, advisors, financial accounts, and sample flags).

## Step 6: Verify

Open a browser and navigate to:

- **App**: `http://<vm-ip>`
- **API Health**: `http://<vm-ip>:3001/api/health`

You should see the Nomii AI home page with the Covenant Trust demo.

## Common Operations

```bash
# View logs
docker compose logs -f              # All services
docker compose logs -f backend      # Backend only

# Restart a service
docker compose restart backend

# Reset database (drops all data and re-seeds)
docker compose exec backend node db/reset.js

# Stop everything
docker compose down

# Stop and remove volumes (deletes database data)
docker compose down -v

# Rebuild after code changes
docker compose build
docker compose up -d
```

## Connecting Claude API

When you have your Claude API key:

```bash
# Edit .env
nano .env
# Set:
#   LLM_PROVIDER=claude
#   CLAUDE_API_KEY=sk-ant-...

# Install Anthropic SDK in the backend container
docker compose exec backend npm install @anthropic-ai/sdk

# Restart backend
docker compose restart backend
```

Then uncomment the Claude integration in `server/src/routes/chat.js`.

## Production Hardening (Future)

When moving beyond PoC:

- Add HTTPS with Let's Encrypt (Traefik or certbot)
- Set strong DB_PASSWORD in .env
- Add rate limiting to the API
- Set up database backups (pg_dump cron job)
- Add monitoring (health check endpoint is already at /api/health)
- Consider Proxmox firewall rules to restrict access
