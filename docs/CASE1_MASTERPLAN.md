# CodeB CI/CD Master Plan - Case 1

> **Hybrid CI/CD System with AI Self-Healing**

## Executive Summary

GitHub Actions + Copilot과 Self-hosted Runner + Claude Code를 결합한 하이브리드 CI/CD 시스템.
빌드 에러 자동 수정, 프로젝트 자동 인덱싱, 포트 자동 할당, 도메인 자동 설정을 지원하는 Coolify 스타일의 배포 CLI.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CodeB CI/CD Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        GitHub Repository                             │   │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │   │
│  │  │   Push   │───▶│  Actions │───▶│  Build   │───▶│   Test   │      │   │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                     ┌────────────────┼────────────────┐                    │
│                     ▼                ▼                ▼                    │
│  ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────┐  │
│  │   Path 1: Copilot   │   │  Path 2: Claude Code │   │   Direct Deploy │  │
│  │   (GitHub Cloud)    │   │  (Self-hosted Runner)│   │   (No Errors)   │  │
│  │                     │   │                      │   │                 │  │
│  │  • Auto PR for fix  │   │  • Server-side fix   │   │  • Push to GHCR │  │
│  │  • Code suggestion  │   │  • MCP integration   │   │  • Trigger deploy│  │
│  │  • Human review     │   │  • Auto commit       │   │                 │  │
│  └─────────────────────┘   └─────────────────────┘   └─────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     VPS Server (Vultr/Production)                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                  Server Management Layer                     │    │   │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │    │   │
│  │  │  │  Project  │ │   Port    │ │  Domain   │ │ Container │   │    │   │
│  │  │  │  Registry │ │  Manager  │ │  Manager  │ │  Manager  │   │    │   │
│  │  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │    │   │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                 │    │   │
│  │  │  │    DB     │ │  Health   │ │  Backup   │                 │    │   │
│  │  │  │  Manager  │ │  Monitor  │ │  Manager  │                 │    │   │
│  │  │  └───────────┘ └───────────┘ └───────────┘                 │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                    Infrastructure Layer                       │   │   │
│  │  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐ │   │   │
│  │  │  │ Podman │  │Quadlet │  │PowerDNS│  │ Caddy  │  │ GHCR   │ │   │   │
│  │  │  │Container│  │systemd │  │  DNS   │  │ Proxy  │  │Registry│ │   │   │
│  │  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘ │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 CI/CD Pipeline (GitHub Actions)

```yaml
# Two-Path CI/CD Flow
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Workflow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Code Quality Check                                           │
│     ├── ESLint                                                   │
│     ├── TypeScript Type Check                                    │
│     └── Prettier Format Check                                    │
│                                                                  │
│  2. Security Scan                                                │
│     ├── npm audit                                                │
│     ├── Trivy (Container Scan)                                   │
│     └── Gitleaks (Secret Scan)                                   │
│                                                                  │
│  3. Test Suite                                                   │
│     ├── Unit Tests                                               │
│     ├── Integration Tests                                        │
│     └── E2E Tests (Playwright)                                   │
│                                                                  │
│  4. Build & Push                                                 │
│     ├── Docker Build (Multi-arch)                                │
│     └── Push to GHCR                                             │
│                                                                  │
│  5. Deploy                                                       │
│     ├── Staging (develop branch)                                 │
│     └── Production (main branch)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Self-Healing System

#### Path 1: GitHub Copilot (Cloud-based)
```
빌드 에러 발생 → Copilot 분석 → Auto PR 생성 → Human Review → Merge
```

**장점**: GitHub 인프라 활용, 설정 간단
**단점**: 자동 수정 범위 제한적, Human review 필요

#### Path 2: Claude Code (Self-hosted)
```
빌드 에러 발생 → Claude Code 분석 → 자동 수정 → 테스트 → Auto Commit → Re-build
```

**장점**: 완전 자동화 가능, MCP 통합, 복잡한 에러 해결
**단점**: Self-hosted Runner 필요, 서버 리소스 사용

### 2.3 Server Management Layer

| Component | 역할 | 기술 스택 |
|-----------|------|----------|
| **Project Registry** | 프로젝트 인덱싱 및 메타데이터 관리 | JSON/SQLite |
| **Port Manager** | 포트 자동 할당 및 충돌 방지 | Node.js API |
| **Domain Manager** | DNS 레코드 + Caddy 설정 관리 | PowerDNS API + Caddy |
| **Container Manager** | 컨테이너 라이프사이클 관리 | Podman + Quadlet |
| **DB Manager** | 프로젝트별 PostgreSQL/Redis 생성 | Podman |
| **Health Monitor** | 서비스 상태 모니터링 및 알림 | Prometheus + Grafana |
| **Backup Manager** | 자동 백업 및 복구 | Shell Scripts |

---

## 3. Port Allocation System

### 3.1 Port Range Design

```
┌────────────────────────────────────────────────────────────────┐
│                     Port Allocation Map                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Application Ports (3000-4999)                                  │
│  ├── 3000-3099: Production Apps                                 │
│  ├── 3100-3199: Staging Apps                                    │
│  ├── 3200-3299: Preview/PR Environments                         │
│  └── 3300-4999: Reserved                                        │
│                                                                 │
│  Database Ports (5432-5531)                                     │
│  ├── 5432: Shared PostgreSQL (Default)                          │
│  └── 5433-5531: Per-Project PostgreSQL                          │
│                                                                 │
│  Redis Ports (6379-6478)                                        │
│  ├── 6379: Shared Redis (Default)                               │
│  └── 6380-6478: Per-Project Redis                               │
│                                                                 │
│  System Ports                                                   │
│  ├── 80/443: Caddy (HTTP/HTTPS)                                 │
│  ├── 8081: PowerDNS API                                         │
│  ├── 9090: Prometheus                                           │
│  └── 3001: Grafana                                              │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Port Allocation Algorithm

```javascript
// From backup: codeb-api-server-v3.5.js
const PORT_CONFIG = {
  APP_PORT_START: 3000,
  APP_PORT_END: 4999,
  DB_PORT_START: 5433,
  DB_PORT_END: 5531,
  REDIS_PORT_START: 6380,
  REDIS_PORT_END: 6478,
  MAX_PROJECTS: 100
};

async function allocatePort(type, projectName) {
  const registry = await loadProjectRegistry();
  const usedPorts = getAllUsedPorts(registry, type);

  const range = PORT_RANGES[type];
  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.includes(port)) {
      await savePortAllocation(projectName, type, port);
      return port;
    }
  }
  throw new Error(`No available ${type} ports`);
}
```

---

## 4. Domain Management

### 4.1 Domain Structure

```
┌────────────────────────────────────────────────────────────────┐
│                      Domain Structure                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Base Domain: codeb.dev                                         │
│                                                                 │
│  Production:                                                    │
│  ├── api.codeb.dev          → API Gateway                       │
│  ├── {project}.codeb.dev    → Project Frontend                  │
│  └── admin.codeb.dev        → Admin Dashboard                   │
│                                                                 │
│  Staging:                                                       │
│  ├── staging.{project}.codeb.dev                                │
│  └── staging-api.codeb.dev                                      │
│                                                                 │
│  Preview (PR):                                                  │
│  └── pr-{number}.{project}.codeb.dev                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Auto Domain Setup Flow

```
1. 새 프로젝트 배포 요청
       │
       ▼
2. Port Manager: 포트 할당
       │
       ▼
3. PowerDNS API: A 레코드 생성
   POST /api/v1/servers/localhost/zones/codeb.dev
   {
     "rrsets": [{
       "name": "myapp.codeb.dev.",
       "type": "A",
       "records": [{ "content": "SERVER_IP" }]
     }]
   }
       │
       ▼
4. Caddy: Reverse Proxy 설정
   myapp.codeb.dev {
     reverse_proxy localhost:3005
   }
       │
       ▼
5. Caddy: Auto HTTPS (Let's Encrypt)
       │
       ▼
6. Health Check: 배포 완료 확인
```

---

## 5. Project Registry Schema

### 5.1 Registry Structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2024-12-03T00:00:00Z",
  "projects": {
    "my-nextjs-app": {
      "id": "proj_abc123",
      "name": "my-nextjs-app",
      "type": "nextjs",
      "repository": "https://github.com/org/my-nextjs-app",
      "environments": {
        "production": {
          "status": "running",
          "domain": "myapp.codeb.dev",
          "ports": {
            "app": 3005,
            "db": 5435,
            "redis": 6382
          },
          "containers": {
            "app": "myapp-prod",
            "db": "myapp-postgres-prod",
            "redis": "myapp-redis-prod"
          },
          "deployedAt": "2024-12-03T00:00:00Z",
          "version": "v1.2.3",
          "imageTag": "ghcr.io/org/myapp:v1.2.3"
        },
        "staging": {
          "status": "running",
          "domain": "staging.myapp.codeb.dev",
          "ports": {
            "app": 3105
          }
        }
      },
      "config": {
        "buildCommand": "npm run build",
        "startCommand": "npm start",
        "healthCheck": "/api/health",
        "envVars": ["DATABASE_URL", "REDIS_URL", "SECRET_KEY"]
      },
      "createdAt": "2024-12-01T00:00:00Z",
      "updatedAt": "2024-12-03T00:00:00Z"
    }
  },
  "portAllocations": {
    "app": { "3005": "my-nextjs-app/production", "3105": "my-nextjs-app/staging" },
    "db": { "5435": "my-nextjs-app/production" },
    "redis": { "6382": "my-nextjs-app/production" }
  }
}
```

---

## 6. Self-Healing Workflow

### 6.1 Build Error Detection & Fix

```yaml
# .github/workflows/self-healing-ci.yml 핵심 로직

on:
  workflow_run:
    workflows: ["CI/CD Pipeline"]
    types: [completed]
    branches: [main, develop]

jobs:
  self-heal:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: self-hosted  # Claude Code가 설치된 러너

    steps:
      - name: Download failure logs
        uses: actions/download-artifact@v3

      - name: Analyze with Claude Code
        run: |
          claude --analyze-errors logs/build-errors.log \
                 --auto-fix \
                 --max-attempts 3 \
                 --commit-message "fix: auto-heal build errors"

      - name: Re-trigger CI
        if: success()
        run: gh workflow run ci-cd.yml
```

### 6.2 Error Types & Resolution

| Error Type | Detection | Resolution |
|------------|-----------|------------|
| **Type Error** | TypeScript compiler | 타입 정의 추가/수정 |
| **Lint Error** | ESLint | 코드 스타일 수정 |
| **Import Error** | Build failure | 누락된 import 추가 |
| **Test Failure** | Jest/Vitest | 테스트 로직 수정 |
| **Security Vuln** | npm audit | 패키지 업데이트 |
| **Container Build** | Docker build | Dockerfile 수정 |

### 6.3 Bypass Prevention Rules

```bash
# DEPLOYMENT_RULES.md 에서 정의된 금지 패턴

# ❌ 절대 금지
command || true                    # 에러 무시
// @ts-ignore                      # TypeScript 무시
// eslint-disable                  # Lint 무시
chmod 777                          # 보안 위험
--privileged                       # 권한 상승

# ✅ 허용되는 수정
- 누락된 타입 정의 추가
- 누락된 import 추가
- null/undefined 체크 추가
- 로직 버그 수정 (조건문 등)
- 올바른 에러 처리 (재throw)
```

---

## 7. Technology Stack

### 7.1 Infrastructure

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Containerization** | Podman | Docker 대체, rootless |
| **Process Management** | Quadlet + systemd | 컨테이너 서비스화 |
| **Reverse Proxy** | Caddy | Auto HTTPS, Load Balancing |
| **DNS** | PowerDNS | 프로그래매틱 DNS 관리 |
| **Registry** | GHCR | 컨테이너 이미지 저장소 |
| **Database** | PostgreSQL | 앱 데이터베이스 |
| **Cache** | Redis | 세션, 캐시, 큐 |

### 7.2 CI/CD

| Component | Technology | Purpose |
|-----------|------------|---------|
| **CI Pipeline** | GitHub Actions | 빌드, 테스트, 배포 |
| **Self-Healing** | Claude Code | 빌드 에러 자동 수정 |
| **Code Review** | Copilot | PR 리뷰, 코드 제안 |
| **Security** | Trivy, Gitleaks | 취약점 스캔 |
| **Testing** | Playwright | E2E 테스트 |

### 7.3 Server Management (MCP)

| Tool | MCP Server | Purpose |
|------|------------|---------|
| **Deploy** | codeb-deploy | 프로젝트 배포 관리 |
| **Analysis** | sequential-thinking | 복잡한 문제 분석 |
| **Docs** | context7 | 라이브러리 문서 조회 |
| **Browser** | playwright | E2E 테스트 |

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] GitHub Actions CI/CD 파이프라인 구축
- [ ] Self-Healing 워크플로우 기본 구현
- [ ] Project Registry 스키마 및 API 개발
- [ ] Port Manager 구현

### Phase 2: Infrastructure (Week 3-4)
- [ ] PowerDNS + Caddy 자동화
- [ ] Podman + Quadlet 통합
- [ ] Container Manager 구현
- [ ] DB Manager (PostgreSQL/Redis) 구현

### Phase 3: CLI Development (Week 5-6)
- [ ] CodeB CLI 개발 (Coolify 스타일)
- [ ] 팀 공유용 패키지 배포
- [ ] 문서화 및 가이드 작성

### Phase 4: Advanced Features (Week 7-8)
- [ ] Claude Code Self-hosted Runner 설정
- [ ] 고급 Self-Healing 로직 구현
- [ ] Monitoring & Alerting 시스템
- [ ] Backup & Recovery 시스템

---

## 9. CLI Commands (Target)

```bash
# Project Management
codeb init <project-name>              # 새 프로젝트 초기화
codeb list                             # 프로젝트 목록
codeb status <project>                 # 프로젝트 상태

# Deployment
codeb deploy <project> [--env staging|prod]
codeb rollback <project> [--version v1.0.0]
codeb logs <project> [--follow]

# Domain Management
codeb domain add <project> <domain>
codeb domain list <project>
codeb ssl renew <project>

# Database
codeb db create <project> [--type postgres|redis]
codeb db backup <project>
codeb db restore <project> <backup-file>

# Health & Monitoring
codeb health <project>
codeb metrics <project>

# Self-Healing
codeb heal <project>                   # 수동 Self-Healing 트리거
codeb heal --analyze <error-log>       # 에러 분석
```

---

## 10. Existing Code to Reuse

### From Backup Analysis

| File | Reusable Components |
|------|---------------------|
| `codeb-api-server-v3.5.js` | Port allocation, Project CRUD, Container management |
| `deployment-api.js` | PowerDNS integration, API gateway patterns |
| `coolify-auto-deploy.sh` | DNS creation, SSL setup, Verification flow |
| `domain-config.json` | Domain configuration schema |

### Key Code Patterns

```javascript
// Port Allocation (from backup)
async function allocatePort(type, projectName) {
  // ... existing implementation
}

// PowerDNS Integration (from backup)
async function createDNSRecord(subdomain, ip) {
  await axios.patch(`http://${SERVER_IP}:8081/api/v1/servers/localhost/zones/${zone}`, {
    rrsets: [{
      name: `${subdomain}.${zone}.`,
      type: 'A',
      records: [{ content: ip, disabled: false }]
    }]
  }, { headers: { 'X-API-Key': PDNS_API_KEY } });
}

// Health Check (from backup)
async function verifyDeployment(domain) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`https://${domain}/health`);
      if (response.status === 200) return true;
    } catch {}
    await sleep(10000);
  }
  return false;
}
```

---

## 11. Security Considerations

### 11.1 Secret Management
- GitHub Secrets for CI/CD
- Server-side .env files (not in registry)
- Encrypted backup storage

### 11.2 Network Security
- Caddy handles all external traffic
- Internal services on private network
- Rootless Podman containers

### 11.3 Self-Healing Safety
- Bypass pattern detection (deployment-logger.sh)
- Human review for critical changes
- Rollback capability for failed fixes

---

## 12. References

- [CI/CD Pipeline](.github/workflows/ci-cd.yml)
- [Self-Healing CI](.github/workflows/self-healing-ci.yml)
- [Deployment Rules](../DEPLOYMENT_RULES.md)
- [Infrastructure README](../infrastructure/README.md)
- [DevOps Complete Guide](./DEVOPS_COMPLETE_GUIDE.md)

---

**Document Version**: 1.0.0
**Last Updated**: 2024-12-03
**Status**: Draft - Case 1 Master Plan
