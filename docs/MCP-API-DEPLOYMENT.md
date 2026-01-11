# MCP API Deployment Guide

> **버전: 6.0.5** | 업데이트: 2026-01-11

## Overview

CodeB는 MCP API 방식의 배포를 권장합니다. SSH 직접 접속 없이 GitHub Actions에서 API 호출만으로 배포가 가능합니다.

## 배포 방식 비교

| 항목 | MCP API (권장) | SSH (Admin 전용) |
|------|---------------|-----------------|
| 대상 | 모든 팀원 (member+) | Admin만 |
| 필요 Secrets | `CODEB_API_KEY`, `GHCR_PAT` | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` |
| 서버 접속 | 없음 | SSH 직접 접속 |
| 보안 | 높음 (API 키 기반, 역할 권한) | 낮음 (SSH 키 노출 위험) |

## GitHub Actions 설정

### Self-Hosted Runner 방식 (권장)

CodeB는 App 서버에서 Self-hosted runner를 사용합니다.

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

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
          sudo podman build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          sudo podman push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

      - name: Deploy via CodeB MCP API
        run: |
          RESPONSE=$(curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "staging",
                "version": "${{ github.sha }}",
                "image": "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}"
              }
            }')

          echo "Deploy Response: $RESPONSE"

          if echo "$RESPONSE" | grep -q '"success":true'; then
            PREVIEW_URL=$(echo "$RESPONSE" | jq -r '.result.previewUrl')
            echo "Deployment successful!"
            echo "Preview URL: $PREVIEW_URL"
          else
            echo "Deployment failed"
            exit 1
          fi
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

### 필요한 GitHub Secrets

Repository Settings → Secrets and variables → Actions에서 설정:

| Secret | 값 | 설명 |
|--------|---|------|
| `CODEB_API_KEY` | `codeb_{teamId}_{role}_{token}` | MCP API 키 (v6.0 형식) |
| `GHCR_PAT` | GitHub PAT (packages:write) | 컨테이너 레지스트리 토큰 |

## API 키 발급 (v6.0)

### 역할별 권한

| 역할 | Deploy | Promote | Rollback | ENV 관리 | 팀 관리 |
|------|:------:|:-------:|:--------:|:--------:|:-------:|
| **owner** | O | O | O | O | O |
| **admin** | O | O | O | O | O |
| **member** | O | O | O | O | X |
| **viewer** | X | X | X | X | X |

### 키 포맷 (v6.0)

```
codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
```

### Web UI에서 발급

1. https://app.codeb.kr 접속
2. Team → Members
3. "Add Member" 클릭
4. 역할 선택 (member 권장)
5. API Key 복사 (한 번만 표시)

## MCP API 엔드포인트

### Base URL

```
Primary: https://api.codeb.kr/api
Fallback: http://158.247.203.55:9101/api
```

### 배포 관련 도구

```bash
# 배포
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "deploy",
    "params": {
      "projectName": "myapp",
      "environment": "staging",
      "image": "ghcr.io/org/myapp:latest"
    }
  }'

# 프로모트 (Blue-Green 전환)
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_xxx" \
  -d '{"tool": "promote", "params": {"projectName": "myapp", "environment": "staging"}}'

# 롤백
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_xxx" \
  -d '{"tool": "rollback", "params": {"projectName": "myapp", "environment": "staging"}}'

# Slot 상태 확인
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_viewer_xxx" \
  -d '{"tool": "slot_status", "params": {"projectName": "myapp", "environment": "staging"}}'

# 헬스체크 (인증 불필요)
curl https://api.codeb.kr/health
```

## 배포 플로우

```
Git Push
   ↓
GitHub Actions (self-hosted runner)
   ↓
Podman Build → ghcr.io push
   ↓
MCP API 호출 (CODEB_API_KEY)
   ↓
서버에서 이미지 pull & 컨테이너 시작
   ↓
Health Check
   ↓
Preview URL 반환 (https://myapp-green.preview.codeb.kr)
   ↓
테스트 완료 후 Promote
   ↓
Production 트래픽 전환 (무중단)
```

## 트러블슈팅

### Permission denied 에러

```
Error: Permission denied: viewer cannot use deploy
```

→ 해당 도구가 역할에 허용되지 않음. member 이상 권한 필요.

### GHCR 인증 실패

```
Error: unauthorized: unauthenticated
```

→ GitHub Secrets의 `GHCR_PAT` 확인 또는 재발급.

### 이미지 pull 실패

```
Error: image not found
```

→ 이미지 이름/태그 확인. ghcr.io 경로가 정확한지 확인.

### Self-hosted runner 오류

```
Error: No runner found
```

→ App 서버의 runner 서비스 확인:
```bash
ssh root@app.codeb.kr "cd /opt/actions-runner && ./svc.sh status"
```

## 관련 문서

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-Green 배포 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - API 레퍼런스
- [API-PERMISSIONS.md](./API-PERMISSIONS.md) - 권한 가이드
