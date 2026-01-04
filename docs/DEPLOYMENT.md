# Deployment Guide

## Blue-Green Slot Architecture

CodeB Server uses a **Vercel-style Blue-Green deployment** system.

```
┌─────────────────────────────────────────────────────────────┐
│                        Caddy (Reverse Proxy)                │
│                     myapp.codeb.kr → localhost:4000         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────┐                         ┌───────────────┐
│   Blue Slot   │ ◀── Active              │  Green Slot   │
│   Port 4000   │                         │   Port 4001   │
│   Running     │                         │   Standby     │
└───────────────┘                         └───────────────┘
```

---

## Deployment Lifecycle

### Phase 1: Deploy (New Container)

```bash
we deploy myapp --environment production
```

**What happens:**
1. Pull new image from GHCR
2. Start container on **inactive slot** (green if blue is active)
3. Run health check
4. Return **Preview URL** (direct port access)

**Response:**
```json
{
  "success": true,
  "slot": "green",
  "port": 4001,
  "previewUrl": "http://158.247.203.55:4001",
  "activeSlot": "blue",
  "message": "Deployed to slot green. Run 'promote' to switch traffic."
}
```

### Phase 2: Promote (Traffic Switch)

```bash
we promote myapp --environment production
```

**What happens:**
1. Update Caddy config to point to new slot
2. Reload Caddy (zero downtime)
3. Set Grace Period on previous slot (48h)

**Response:**
```json
{
  "success": true,
  "activeSlot": "green",
  "previousSlot": "blue",
  "domain": "myapp.codeb.kr",
  "url": "https://myapp.codeb.kr",
  "gracePeriod": {
    "slot": "blue",
    "endsAt": "2025-01-07T10:00:00Z",
    "hoursRemaining": 48
  }
}
```

### Phase 3: Rollback (If Needed)

```bash
we rollback myapp --environment production
```

**What happens:**
1. Switch Caddy back to previous slot
2. No container restart needed
3. Instant rollback (Caddy reload only)

**Response:**
```json
{
  "success": true,
  "rolledBackTo": "blue",
  "previousActive": "green",
  "message": "Rolled back to slot blue. Slot green is now in grace period."
}
```

---

## Grace Period

After promote, the previous container stays running for **48 hours**.

| Status | Description |
|--------|-------------|
| `active` | Currently serving traffic |
| `deployed` | Ready but not serving |
| `grace-period` | Previous version, rollback available |

**Check Grace Period:**
```bash
we slot status myapp --environment production
```

**Response:**
```json
{
  "activeSlot": "green",
  "slots": {
    "blue": {
      "status": "grace-period",
      "gracePeriodRemaining": { "hours": 45, "minutes": 30 }
    },
    "green": {
      "status": "active",
      "isActive": true
    }
  }
}
```

**Manual Cleanup:**
```bash
# Force cleanup (ignores grace period)
we slot cleanup myapp --force
```

---

## Auto-Promote Options

### Option 1: Manual Promote (Default)

```bash
we deploy myapp                    # Deploy only
# ... test at preview URL ...
we promote myapp                   # Then promote
```

### Option 2: Auto-Promote

```bash
we deploy myapp --auto-promote     # Deploy + Promote
```

### Option 3: First Deploy Auto-Promote

First deployment to a project automatically promotes (no previous slot).

---

## GitHub Actions Integration

### Workflow Template

```yaml
name: Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Slot
        run: |
          ENV=$([[ "${{ github.ref }}" == "refs/heads/main" ]] && echo "production" || echo "staging")
          curl -X POST "http://app.codeb.kr:9100/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{"tool": "deploy", "params": {"projectName": "myapp", "environment": "'$ENV'"}}'

  # PR Merge triggers auto-promote
  promote:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Promote to Production
        run: |
          curl -X POST "http://app.codeb.kr:9100/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{"tool": "promote", "params": {"projectName": "myapp", "environment": "production"}}'
```

---

## Domain Configuration

### Auto-Domain (Default)

Deploy automatically creates:
- `myapp.codeb.kr` (production)
- `myapp-staging.codeb.kr` (staging)

### Custom Domain

```bash
we domain connect myapp --domain app.example.com
```

**DNS Setup Required:**
```
CNAME app.example.com → app.codeb.kr
# OR
A     app.example.com → 158.247.203.55
```

---

## Database Migrations

### Backward-Compatible Migrations Only

Since both slots share the same database:

**Safe Operations (Auto):**
- `ADD COLUMN` with default value
- `CREATE TABLE`
- `CREATE INDEX`

**Unsafe Operations (Manual after Grace Period):**
- `DROP COLUMN`
- `DROP TABLE`
- `RENAME COLUMN`

### Migration Strategy

```
1. Deploy v2 with new column (ADD COLUMN)
2. Promote v2
3. Grace Period (48h) - both v1 and v2 work
4. After Grace Period: DROP old column (manual)
```

---

## Troubleshooting

### Rollback Failed

```bash
# Check if previous container exists
we slot status myapp

# If "not_found", container was cleaned up
# Solution: Deploy previous version
we deploy myapp --image ghcr.io/org/myapp:v1.0.0
```

### Port Conflict

```bash
# Check port usage
we analyze_server

# Manually clean up stuck containers
we slot cleanup myapp --force
```

### Health Check Failed

```bash
# Check container logs
we deploy myapp --skip-healthcheck

# Then manually verify
curl http://158.247.203.55:4001/api/health
```
