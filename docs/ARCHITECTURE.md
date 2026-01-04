# System Architecture

## Overview

CodeB Server is a **Vercel-style self-hosted deployment platform** with:

- Blue-Green Slot deployment (zero-downtime)
- MCP API for Claude Code integration
- 4-server infrastructure on Vultr

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Container Runtime | Podman 4.x | Rootless containers |
| Reverse Proxy | Caddy 2.x | HTTPS + Auto SSL |
| DNS | PowerDNS 4.x | Dynamic DNS management |
| Service Manager | systemd + Quadlet | Container as systemd units |
| Database | PostgreSQL 15 | Shared database |
| Cache | Redis 7 | Shared cache |
| WebSocket | Centrifugo | Real-time communication |
| CI/CD | GitHub Actions | Build & deploy automation |
| API | Express.js | MCP HTTP API server |

---

## Server Infrastructure

### 4-Server Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        App Server (158.247.203.55)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  PowerDNS   │  │    Caddy    │  │  MCP API    │  │ Containers  │    │
│  │ (DNS:53)    │  │ (HTTPS:443) │  │ (HTTP:9100) │  │ (4000-4999) │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
        │                                                    │
        │                                                    │
        ▼                                                    ▼
┌───────────────────────┐                    ┌───────────────────────┐
│ Storage (64.176.226.119)│                    │ Streaming (141.164.42.213)│
│  ┌─────────────────┐  │                    │  ┌─────────────────┐  │
│  │  PostgreSQL     │  │                    │  │   Centrifugo    │  │
│  │  (port 5432)    │  │                    │  │   (port 8000)   │  │
│  ├─────────────────┤  │                    │  └─────────────────┘  │
│  │     Redis       │  │                    └───────────────────────┘
│  │  (port 6379)    │  │
│  └─────────────────┘  │                    ┌───────────────────────┐
└───────────────────────┘                    │ Backup (141.164.37.63)  │
                                             │  ┌─────────────────┐  │
                                             │  │   ENV Backup    │  │
                                             │  │   Monitoring    │  │
                                             │  └─────────────────┘  │
                                             └───────────────────────┘
```

### Server Roles

| Server | IP | Domain | Services |
|--------|-----|--------|----------|
| **App** | 158.247.203.55 | app.codeb.kr | Containers, Caddy, PowerDNS, MCP API |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV backup, Monitoring |

---

## Blue-Green Slot System

### Concept

Each project has **two slots** (blue/green). Only one is active at a time.

```
Project: myapp
Environment: production

┌─────────────────────────────────────────────┐
│              Caddy Config                   │
│  myapp.codeb.kr → localhost:4000 (blue)     │
└─────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
   ┌──────────┐              ┌──────────┐
   │  BLUE    │ ◀── Active   │  GREEN   │
   │ :4000    │              │ :4001    │
   │ Running  │              │ Standby  │
   └──────────┘              └──────────┘
```

### State Transitions

```
EMPTY → deploy → DEPLOYED → promote → ACTIVE
                                ↓
                         (previous slot)
                                ↓
                          GRACE-PERIOD → cleanup → EMPTY
                                ↓
                             rollback
                                ↓
                              ACTIVE
```

### Data Files

| File | Location | Purpose |
|------|----------|---------|
| SSOT | `/opt/codeb/registry/ssot.json` | Project registry |
| Slots | `/opt/codeb/registry/slots.json` | Slot state |
| ENV | `/opt/codeb/env-backup/{project}/{env}/` | Environment files |
| Caddy | `/etc/caddy/sites/{project}-{env}.caddy` | Reverse proxy config |

---

## Port Allocation

### Port Ranges

| Environment | App Ports | Blue | Green |
|-------------|-----------|------|-------|
| Production | 4000-4499 | Base | Base+1 |
| Staging | 4500-4999 | Base | Base+1 |

### Port Calculation

```javascript
// Hash-based port allocation
const hash = projectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
const basePort = environment === 'production' ? 4000 + (hash % 500) : 4500 + (hash % 500);

// Slot ports
const bluePort = basePort;      // e.g., 4050
const greenPort = basePort + 1; // e.g., 4051
```

---

## Request Flow

### Deploy Request

```
1. Client → POST /api/tool {tool: "deploy"}
2. API → Validate permissions
3. API → Load slots.json
4. API → Determine target slot (opposite of active)
5. API → SSH to app server
6. API → podman pull + podman run
7. API → Health check
8. API → Update slots.json
9. API → Return preview URL
```

### Promote Request

```
1. Client → POST /api/tool {tool: "promote"}
2. API → Load slots.json
3. API → Generate Caddy config
4. API → Write to /etc/caddy/sites/
5. API → systemctl reload caddy
6. API → Update slots.json (active slot, grace period)
7. API → Return domain URL
```

---

## Database Architecture

### Shared Database

All projects share PostgreSQL on Storage server.

```
PostgreSQL (db.codeb.kr:5432)
├── myapp (database)
├── another-app (database)
└── ...

Redis (db.codeb.kr:6379)
├── myapp: (prefix)
├── another-app: (prefix)
└── ...
```

### Migration Strategy

**Expand-Contract Pattern** for backward compatibility:

```
Phase 1: ADD COLUMN (new column with default)
   ↓
Phase 2: Deploy v2 (uses new column)
   ↓
Phase 3: Grace Period (v1 still works)
   ↓
Phase 4: DROP COLUMN (after grace period)
```

---

## Security Model

### Access Control

| Role | SSH | API | Deploy | ENV | Admin |
|------|-----|-----|--------|-----|-------|
| Admin | Yes | Yes | Yes | Yes | Yes |
| Developer | No | Yes | Yes | No | No |
| Viewer | No | Yes | No | No | No |

### API Key Format

```
codeb_{role}_{random_token}

Examples:
- codeb_admin_abc123xyz
- codeb_dev_def456uvw
- codeb_view_ghi789rst
```

### Protected ENV Variables

These are preserved from `master.env` even if overwritten:

- `DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `REDIS_URL`

---

## File Structure

```
codeb-server/
├── api/                        # MCP HTTP API Server
│   ├── mcp-http-api.js         # Main API server
│   ├── Dockerfile
│   └── quadlet/                # systemd Quadlet files
│
├── cli/                        # we CLI Tool
│   ├── bin/we.js               # Entry point
│   ├── commands/               # CLI commands
│   └── src/lib/                # Shared libraries
│
├── server-scripts/             # Server-side scripts
│   ├── domain-manager.js       # PowerDNS + Caddy automation
│   └── deploy-domain-manager.sh
│
├── security/                   # Security daemon
│   ├── daemon/                 # Protection daemon
│   └── monitor/                # File/container watchdog
│
├── web-ui/                     # Dashboard (Next.js)
│
└── docs/                       # Documentation
```

---

## Container Lifecycle

### Container Naming

```
{project}-{environment}-{slot}

Examples:
- myapp-production-blue
- myapp-production-green
- myapp-staging-blue
```

### Labels

```bash
podman run \
  -l "codeb.project=myapp" \
  -l "codeb.environment=production" \
  -l "codeb.slot=blue" \
  ...
```

### Network

All containers join `codeb-main` network:

```bash
podman network create codeb-main
```

---

## Monitoring & Logging

### Current Setup

| Component | Method | Location |
|-----------|--------|----------|
| Containers | podman logs | journalctl |
| Caddy | Access logs | /var/log/caddy/ |
| API | Console | journalctl -u codeb-mcp-api |
| Audit | SQLite | /var/lib/codeb/audit.db |

### Health Checks

```bash
# API health
curl http://app.codeb.kr:9100/api/health

# Full server check
curl -X POST http://app.codeb.kr:9100/api/tool \
  -d '{"tool": "full_health_check"}'
```
