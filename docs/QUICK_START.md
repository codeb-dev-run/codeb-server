# Quick Start Guide

## Prerequisites

- Node.js 20+
- GitHub account

---

## Installation

```bash
npm install -g @codeblabdev-max/we-cli
```

This installs:
- `we` CLI globally
- MCP server registration
- Claude Code slash commands

---

## First Deployment

### 1. Create Project

```bash
# Via CLI
we workflow init myapp --type nextjs --database --redis

# Via MCP API
curl -X POST http://app.codeb.kr:9100/api/tool \
  -H "Content-Type: application/json" \
  -H "X-API-Key: codeb_dev_YOUR_KEY" \
  -d '{"tool": "create_project", "params": {"name": "myapp", "type": "nextjs"}}'
```

### 2. Initialize ENV

```bash
we env init myapp
```

### 3. Deploy

```bash
# Deploy to staging (Preview URL)
we deploy myapp --environment staging

# Response:
# {
#   "previewUrl": "http://158.247.203.55:4500",
#   "slot": "blue",
#   "message": "Deployed to slot blue. Run 'promote' to switch traffic."
# }
```

### 4. Test & Promote

```bash
# Test at preview URL, then promote
we promote myapp --environment staging

# Response:
# {
#   "domain": "myapp-staging.codeb.kr",
#   "url": "https://myapp-staging.codeb.kr",
#   "activeSlot": "blue"
# }
```

---

## Common Commands

| Command | Description |
|---------|-------------|
| `we deploy <project>` | Deploy to new slot |
| `we promote <project>` | Switch traffic to new slot |
| `we rollback <project>` | Switch back to previous slot |
| `we slot list <project>` | Show slot status |
| `we health` | Check server health |

---

## Access Control

| Role | Deploy | Promote | Rollback | ENV Manage |
|------|--------|---------|----------|------------|
| **Admin** | Yes | Yes | Yes | Yes |
| **Developer** | Yes | Yes | Yes | No |
| **Viewer** | No | No | No | No |

---

## Next Steps

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-Green 배포 상세
- [API-REFERENCE.md](./API-REFERENCE.md) - 전체 API 레퍼런스
