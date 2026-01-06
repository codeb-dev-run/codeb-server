# System Architecture

> **버전: 6.0.0** | 업데이트: 2026-01-07

## Overview

CodeB Server is a **Vercel-style self-hosted deployment platform** with:

- Blue-Green Slot deployment (zero-downtime)
- MCP API for Claude Code integration
- 4-server infrastructure on Vultr
- **실시간 백업** (PostgreSQL WAL + Redis AOF)
- **서버 마이그레이션 지원**
- **통합 버전 관리** (version.json)

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
# API health (v6.0)
curl https://api.codeb.kr/health

# Full server check
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: $KEY" \
  -d '{"tool": "health_check"}'
```

---

## Backup System (v6.0)

### 실시간 백업 구조

```
┌─────────────┐                      ┌─────────────┐
│  Storage    │   WAL 스트리밍        │   Backup    │
│   Server    │ ────────────────────▶│   Server    │
│             │   (실시간)            │             │
│ PostgreSQL  │                      │ WAL Archive │
│   Redis     │ ────────────────────▶│ RDB + AOF   │
│             │   매시간 동기화        │             │
└─────────────┘                      └─────────────┘
```

### 백업 유형

| 유형 | 방식 | 주기 | 보관 |
|------|------|------|------|
| PostgreSQL WAL | 스트리밍 | 실시간 | 7일 |
| PostgreSQL Dump | pg_dump | 매일 03:00 | 7일 |
| Redis RDB | BGSAVE | 매시간 | 24시간 |
| Redis AOF | everysec | 실시간 | 최신 1개 |
| ENV | 자동 | 변경 시 | 무제한 |

### 복구 명령

```bash
# ENV 복구
we env restore myapp --version master

# PostgreSQL 복구 (수동)
pg_restore -U codeb -d worb -c /backup/worb-2026-01-07.dump
```

---

## Server Migration (v6.0)

### 무중단 마이그레이션

```bash
# 1. Dry-run (확인만)
/opt/codeb/scripts/server-migration.sh SOURCE_IP TARGET_IP --dry-run

# 2. 실제 마이그레이션
/opt/codeb/scripts/server-migration.sh SOURCE_IP TARGET_IP

# 3. DNS 전환 후 48시간 Grace Period
```

### 마이그레이션 순서

1. 설정 동기화 (rsync)
2. PostgreSQL 복제 (pg_basebackup)
3. Redis 동기화 (rsync)
4. 컨테이너 시작
5. 헬스체크
6. DNS 전환
7. Grace Period (48시간)

---

## Related Documents

- [v6.0-INFRASTRUCTURE.md](./v6.0-INFRASTRUCTURE.md) - 인프라 가이드
- [v6.0-BACKUP-SYSTEM.md](./v6.0-BACKUP-SYSTEM.md) - 백업 시스템
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [VERSION-MANAGEMENT.md](./VERSION-MANAGEMENT.md) - 버전 관리
