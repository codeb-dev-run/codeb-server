# CodeB Server Documentation

## Quick Navigation

| Document | For | Description |
|----------|-----|-------------|
| [QUICK_START.md](./QUICK_START.md) | Human | 5분 설치 및 첫 배포 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Human | Blue-Green 배포 상세 가이드 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Human | 시스템 아키텍처 |
| [API-REFERENCE.md](./API-REFERENCE.md) | Human/AI | MCP API 전체 레퍼런스 |
| [AI-CONTEXT.md](./AI-CONTEXT.md) | AI | Claude Code용 컨텍스트 |

---

## What is CodeB Server?

**Vercel 스타일 무중단 배포 시스템** for self-hosted infrastructure.

### Key Features

- **Blue-Green Slot 배포**: 컨테이너 2개 유지, Caddy만 전환 (다운타임 0)
- **Preview URL**: 배포 전 테스트, promote로 트래픽 전환
- **Grace Period**: 48시간 롤백 가능 (컨테이너 재배포 없음)
- **MCP API**: Claude Code에서 직접 배포/관리
- **팀 협업**: SSH 없이 API Key로 팀원 배포 가능

### Deployment Flow

```
1. deploy → Preview URL 생성 (새 Slot에 컨테이너)
2. 테스트 확인
3. promote → Caddy 설정만 변경 (도메인 전환)
4. 문제 시 rollback → 즉시 이전 Slot으로
```

---

## Infrastructure

### 4-Server Architecture

| Server | IP | Domain | Role |
|--------|-----|--------|------|
| **App** | 158.247.203.55 | app.codeb.kr | Apps, PowerDNS, Caddy |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV Backup, Monitoring |

### Port Allocation

| Environment | Port Range | Example |
|-------------|------------|---------|
| Production | 4000-4499 | myapp:4000, myapp:4001 (blue/green) |
| Staging | 4500-4999 | myapp-staging:4500, myapp-staging:4501 |

---

## Version

- **Current**: 3.1.0
- **Changelog**: [../CHANGELOG.md](../CHANGELOG.md)
