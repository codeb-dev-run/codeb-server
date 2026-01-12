# AI Context - CodeB Server

> **버전: 7.0.0** | 업데이트: 2026-01-11
> This document is optimized for AI assistants (Claude Code 2.1+, Cursor, etc.)

## System Overview

```yaml
name: CodeB Server
type: Self-hosted Deployment Platform
style: Vercel-like Blue-Green Slot Deployment
version: 7.0.0
api: MCP HTTP API (https://api.codeb.kr)
auth: Team-based API Key (codeb_{teamId}_{role}_{token})
claude_code: 2.1+ (Skills, Hooks, Agent Integration)
```

## Architecture Summary

```
4-Server Infrastructure:
├── App (158.247.203.55)      → Containers, Caddy, PowerDNS, MCP API:9101, GitHub Runner
├── Storage (64.176.226.119)  → PostgreSQL:5432, Redis:6379
├── Streaming (141.164.42.213)→ Centrifugo:8000 (WebSocket)
└── Backup (141.164.37.63)    → ENV backup, Prometheus, Grafana
```

## Core Concepts

### Blue-Green Slot Deployment

```
Each project has 2 slots (blue/green):

deploy  → Creates container on INACTIVE slot
        → Returns preview URL (https://myapp-green.preview.codeb.kr)

promote → Updates Caddy config only
        → Zero-downtime traffic switch
        → Previous slot enters grace-period (48h)

rollback→ Switches Caddy back
        → Instant (no container restart)
```

### Slot States

| State | Description |
|-------|-------------|
| `empty` | No container |
| `deployed` | Container ready, not serving (Preview URL) |
| `active` | Serving production traffic |
| `grace` | Previous version, 48h rollback window |

### Port Allocation

```javascript
// Hash-based port calculation
const hash = projectName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const basePort = environment === 'production'
  ? 4000 + (hash % 500)
  : 3000 + (hash % 500);  // staging

// Slot ports
blue  = basePort      // e.g., 3050
green = basePort + 1  // e.g., 3051
```

## API Quick Reference

### Base URL
```
https://api.codeb.kr/api
# fallback: http://app.codeb.kr:9101/api
```

### Authentication (v6.0)
```http
X-API-Key: codeb_{teamId}_{role}_{token}

Examples:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| owner | 4 | All + team delete |
| admin | 3 | Member manage, token create, slot cleanup |
| member | 2 | Deploy, promote, rollback, env set |
| viewer | 1 | Read-only (status, logs, metrics) |

### Key Endpoints

```javascript
// Deploy to next slot
POST /api/tool
{ "tool": "deploy", "params": { "projectName": "myapp", "environment": "staging" }}
// Returns: { slot, port, previewUrl }

// Switch traffic
POST /api/tool
{ "tool": "promote", "params": { "projectName": "myapp" }}
// Returns: { activeSlot, domain, url, gracePeriod }

// Rollback
POST /api/tool
{ "tool": "rollback", "params": { "projectName": "myapp" }}
// Returns: { rolledBackTo, previousActive }

// Check slots
POST /api/tool
{ "tool": "slot_status", "params": { "projectName": "myapp" }}
// Returns: { activeSlot, blue: {...}, green: {...} }

// Health check (no auth needed)
GET /health
// Returns: { status, version, uptime }
```

## File Locations (Server)

```
/opt/codeb/registry/
├── ssot.json                      → Project registry (SSOT)
├── slots/{project}-{env}.json     → Slot states
├── teams.json                     → Team registry
├── api-keys.json                  → API key registry
└── edge-functions/{project}/      → Edge function manifests

/opt/codeb/env-backup/{project}/{env}/
├── master.env                     → Initial ENV (immutable)
├── current.env                    → Latest version
└── {timestamp}.env                → History

/etc/caddy/sites/{project}-{env}.caddy → Reverse proxy configs
```

## Container Naming

```
{project}-{environment}-{slot}

Examples:
- myapp-staging-blue
- myapp-staging-green
- myapp-production-blue
```

## ENV Variables

### Auto-preserved (Protected)
```
DATABASE_URL
POSTGRES_USER
POSTGRES_PASSWORD
REDIS_URL
```

### Auto-generated
```bash
DATABASE_URL=postgresql://postgres:xxx@db.codeb.kr:5432/{project}
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX={project}:
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://ws.codeb.kr:8000/api
```

## Domain Structure

```
Production: {project}.codeb.kr
Staging:    {project}-staging.codeb.kr
Preview:    https://{project}-{slot}.preview.codeb.kr
```

## Key Files in Codebase (v6.0)

```
codeb-server/
├── v6.0/
│   ├── VERSION                 → Single source of truth (6.0.5)
│   └── mcp-server/             → TypeScript MCP API Server
│       └── src/
│           ├── index.ts        → Express HTTP API
│           ├── lib/auth.ts     → Team-based auth
│           └── tools/          → 30 API tools
├── api/                        → API package
├── cli/                        → we CLI Tool
├── web-ui/                     → Dashboard (Next.js)
└── docs/                       → Documentation
```

## Common Operations

### Deploy Flow
```bash
# Via CLI
we deploy myapp --environment staging
we promote myapp

# Via API
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_default_member_xxx" \
  -d '{"tool":"deploy","params":{"projectName":"myapp","environment":"staging"}}'
```

### Check Status
```bash
we slot status myapp
# or
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_default_viewer_xxx" \
  -d '{"tool":"slot_status","params":{"projectName":"myapp"}}'
```

### ENV Management
```bash
we env scan myapp      # Compare local vs server
we env restore myapp   # Restore from backup (master)
we env restore myapp --version current  # Latest backup
```

## Important Constraints

1. **Never delete containers directly** - Use `slot_cleanup` tool
2. **Protected ENV vars** - DATABASE_URL, REDIS_URL always preserved from master.env
3. **Grace period** - 48 hours before old slot cleanup
4. **Shared database** - All projects share PostgreSQL, use backward-compatible migrations
5. **Centrifugo for WebSocket** - Never use Socket.IO
6. **Self-hosted runner** - Always use `runs-on: self-hosted` in GitHub Actions
7. **API Key format** - Always `codeb_{teamId}_{role}_{token}`

## Error Handling

```json
// 401 - Missing/invalid API key
{ "success": false, "error": "Invalid or missing API Key" }

// 403 - Permission denied
{ "success": false, "error": "Permission denied: viewer cannot use deploy" }

// Tool-specific errors include hints
{ "success": false, "error": "...", "hint": "..." }
```

## Quick Decision Tree

```
Need to deploy?
├── First deploy → deploy (auto-promotes)
├── Update existing → deploy → test preview → promote
└── Problem? → rollback (instant)

Need to check?
├── Project status → slot_status
├── Server health → health_check
└── Domain status → domain_list

Need ENV?
├── Compare → env_scan
├── Restore → env_restore --version master
└── History → env_backup_list
```

## Related Documents

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드
