# Deployment Guide

> **버전: 7.0.10** | 업데이트: 2026-01-11

## Blue-Green Slot Architecture

CodeB Server는 **Vercel 스타일 Blue-Green 배포** 시스템을 사용합니다.

### v7.0 배포 방식: Quadlet + systemd (System-wide)

```
Quadlet 경로: /etc/containers/systemd/{project}-{env}-{slot}.container
systemctl: root 권한 (--user 없음)
```

```
┌─────────────────────────────────────────────────────────────┐
│                        Caddy (Reverse Proxy)                │
│                 myapp-staging.codeb.kr → localhost:3000     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────┐                         ┌───────────────┐
│   Blue Slot   │ ◀── Active              │  Green Slot   │
│   Port 3000   │                         │   Port 3001   │
│   Running     │                         │   Standby     │
└───────────────┘                         └───────────────┘
```

---

## 배포 흐름

### Step 1: 배포 (Deploy)

비활성 Slot에 새 버전을 배포합니다.

```bash
we deploy myapp --environment staging
```

**동작:**
1. Quadlet 파일 생성 (`/etc/containers/systemd/{project}-{env}-{slot}.container`)
2. `systemctl daemon-reload`
3. GHCR에서 새 이미지 Pull
4. **비활성 Slot**에 컨테이너 시작 (`systemctl start`)
5. Health check 실행
6. **Preview URL** 반환

**응답:**
```json
{
  "success": true,
  "result": {
    "slot": "green",
    "port": 3001,
    "previewUrl": "https://myapp-green.preview.codeb.kr",
    "activeSlot": "blue",
    "message": "Deployed to slot green. Run 'promote' to switch traffic."
  }
}
```

### Step 2: 트래픽 전환 (Promote)

Preview URL에서 테스트 후, 트래픽을 전환합니다.

```bash
we promote myapp --environment staging
```

**동작:**
1. Caddy 설정을 새 Slot으로 변경
2. Caddy Reload (무중단)
3. 이전 Slot에 Grace Period 설정 (48시간)

**응답:**
```json
{
  "success": true,
  "result": {
    "activeSlot": "green",
    "previousSlot": "blue",
    "domain": "myapp-staging.codeb.kr",
    "url": "https://myapp-staging.codeb.kr",
    "gracePeriod": {
      "slot": "blue",
      "endsAt": "2026-01-13T10:00:00Z",
      "hoursRemaining": 48
    }
  }
}
```

### Step 3: 롤백 (필요시)

문제 발생 시 즉시 이전 버전으로 롤백합니다.

```bash
we rollback myapp --environment staging
```

**동작:**
1. Caddy를 이전 Slot으로 전환
2. 컨테이너 재시작 불필요
3. 즉시 롤백 (Caddy reload만)

**응답:**
```json
{
  "success": true,
  "result": {
    "rolledBackTo": "blue",
    "previousActive": "green",
    "message": "Rolled back to slot blue. Slot green is now in grace period."
  }
}
```

---

## Slot 상태

### 상태 종류

| Status | Description |
|--------|-------------|
| `empty` | 컨테이너 없음 |
| `deployed` | 배포됨 (Preview URL 사용 가능) |
| `active` | 트래픽 수신 중 |
| `grace` | 이전 버전 (48시간 유지 후 정리) |

### 상태 확인

```bash
we slot status myapp --environment staging
```

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "environment": "staging",
    "activeSlot": "green",
    "blue": {
      "state": "grace",
      "port": 3000,
      "version": "v1.2.3",
      "gracePeriodRemaining": { "hours": 45, "minutes": 30 }
    },
    "green": {
      "state": "active",
      "port": 3001,
      "version": "v1.2.4"
    }
  }
}
```

### Grace Period 정리

```bash
# 만료된 Grace 슬롯만 정리
we slot cleanup myapp

# 강제 정리 (Grace period 무시)
we slot cleanup myapp --force
```

---

## 배포 옵션

### Option 1: 수동 Promote (기본)

```bash
# 1. 배포
we deploy myapp

# 2. Preview URL에서 테스트
curl https://myapp-green.preview.codeb.kr/health

# 3. 테스트 완료 후 Promote
we promote myapp
```

### Option 2: Auto-Promote

```bash
we deploy myapp --auto-promote
```

> 첫 번째 배포는 자동으로 promote됩니다 (이전 slot이 없으므로).

---

## GitHub Actions 연동

### Self-Hosted Runner 설정

CodeB는 App 서버에서 Self-hosted runner를 사용합니다.

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: self-hosted  # 반드시 self-hosted 사용
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        run: |
          echo "${{ secrets.GHCR_PAT }}" | sudo podman login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build and Push
        run: |
          sudo podman build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          sudo podman push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy to Staging
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "staging",
                "version": "${{ github.sha }}",
                "image": "ghcr.io/${{ github.repository }}:${{ github.sha }}"
              }
            }'
```

### PR Merge시 Auto-Promote

```yaml
name: Promote to Production

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  promote:
    if: github.event.pull_request.merged == true
    runs-on: self-hosted
    steps:
      - name: Promote to Production
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "promote",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "production"
              }
            }'
```

### 필요한 Secrets

| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | v7.0 형식: `codeb_{teamId}_{role}_{token}` |
| `SSH_PRIVATE_KEY` | Self-hosted runner SSH 키 (선택) |

---

## 도메인 설정

### 자동 도메인 (기본)

배포 시 자동으로 도메인이 생성됩니다:
- Staging: `myapp-staging.codeb.kr`
- Production: `myapp.codeb.kr`

### 커스텀 도메인 연결

```bash
we domain setup myapp --domain app.example.com
```

**DNS 설정 필요:**
```
# CNAME 방식 (권장)
CNAME app.example.com → app.codeb.kr

# A 레코드 방식
A app.example.com → 158.247.203.55
```

### 도메인 목록 확인

```bash
we domain list myapp
```

---

## 데이터베이스 마이그레이션

### 주의사항

Blue-Green Slot은 **같은 데이터베이스를 공유**합니다.
따라서 **후방 호환 마이그레이션**만 사용해야 합니다.

### 안전한 작업 (자동)

- `ADD COLUMN` (기본값 필수)
- `CREATE TABLE`
- `CREATE INDEX`

### 위험한 작업 (Grace Period 이후 수동)

- `DROP COLUMN`
- `DROP TABLE`
- `RENAME COLUMN`

### 마이그레이션 전략

```
1. v2 배포: 새 컬럼 추가 (ADD COLUMN with default)
   ↓
2. v2 Promote
   ↓
3. Grace Period (48시간) - v1, v2 모두 동작
   ↓
4. Grace Period 종료 후: 이전 컬럼 삭제 (수동)
```

---

## 포트 할당

### 포트 범위

| Environment | 포트 범위 | Blue | Green |
|-------------|----------|------|-------|
| Staging | 3000-3499 | Base | Base+1 |
| Production | 4000-4499 | Base | Base+1 |
| Preview | 5000-5999 | Base | Base+1 |

### 포트 계산

```javascript
const hash = projectName.split('')
  .reduce((acc, char) => acc + char.charCodeAt(0), 0);
const basePort = environment === 'production'
  ? 4000 + (hash % 500)
  : 3000 + (hash % 500);

// Slot ports
const bluePort = basePort;      // e.g., 3050
const greenPort = basePort + 1; // e.g., 3051
```

---

## Troubleshooting

### 롤백 실패

```bash
# 이전 컨테이너 존재 확인
we slot status myapp

# "empty" 상태면 컨테이너가 정리됨
# 해결: 이전 버전으로 배포
we deploy myapp --image ghcr.io/org/myapp:v1.0.0
```

### 포트 충돌

```bash
# 포트 사용 확인
we health

# stuck 컨테이너 정리
we slot cleanup myapp --force
```

### Health Check 실패

```bash
# Health check 스킵하고 배포
we deploy myapp --skip-healthcheck

# 수동 확인
curl https://myapp-green.preview.codeb.kr/health
```

### 배포 권한 오류

```bash
# API Key 확인
echo $CODEB_API_KEY

# 권한 확인 (member 이상 필요)
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: $CODEB_API_KEY" \
  -d '{"tool": "slot_status", "params": {"projectName": "myapp"}}'
```

---

## API Key 형식 (v7.0)

```
codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
```

### 역할별 배포 권한

| Role | Deploy | Promote | Rollback | Cleanup |
|------|:------:|:-------:|:--------:|:-------:|
| owner | O | O | O | O |
| admin | O | O | O | O |
| member | O | O | O | X |
| viewer | X | X | X | X |

---

## 관련 문서

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
