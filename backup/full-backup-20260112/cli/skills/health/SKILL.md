---
name: codeb-health
description: "헬스체크", "health", "상태 확인", "서버 상태", "시스템 상태" 등의 요청 시 자동 활성화. 시스템 상태를 확인합니다.
---

# CodeB Health Skill

CodeB 인프라 시스템 상태를 확인하는 스킬입니다.

## 활성화 키워드
- 헬스체크, health, health check
- 상태 확인, status check
- 서버 상태, server status
- 시스템 상태, system status
- 인프라 상태

## 사용 도구
- `mcp__codeb-deploy__health_check` - 전체 시스템 헬스체크
- `mcp__codeb-deploy__slot_status` - 슬롯 상태 확인

## 헬스체크 절차

### 전체 시스템 상태 확인
```
mcp__codeb-deploy__health_check { "server": "all" }
```

### 특정 서버 상태 확인
```
mcp__codeb-deploy__health_check { "server": "app" }
mcp__codeb-deploy__health_check { "server": "storage" }
mcp__codeb-deploy__health_check { "server": "streaming" }
mcp__codeb-deploy__health_check { "server": "backup" }
```

### 프로젝트 슬롯 상태 확인
```
mcp__codeb-deploy__slot_status {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

## 서버 구성
- **App Server** (158.247.203.55): Next.js, MCP API, Caddy
- **Streaming** (141.164.42.213): Centrifugo WebSocket
- **Storage** (64.176.226.119): PostgreSQL, Redis
- **Backup** (141.164.37.63): ENV 백업, Prometheus, Grafana

## 관련 스킬
- `codeb-deploy` - 프로젝트 배포
- `codeb-rollback` - 배포 롤백
