# MCP API Deployment Guide (v3.2.6+)

## Overview

CodeB는 MCP API 방식의 배포를 권장합니다. SSH 직접 접속 없이 GitHub Actions에서 API 호출만으로 배포가 가능합니다.

## 배포 방식 비교

| 항목 | MCP API (권장) | SSH (Admin 전용) |
|------|---------------|-----------------|
| 대상 | 모든 팀원 | Admin만 |
| 필요 Secrets | `CODEB_API_KEY`, `GHCR_PAT` | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `GHCR_PAT` |
| 서버 접속 | 없음 | SSH 직접 접속 |
| 보안 | 높음 (API 키 기반) | 낮음 (SSH 키 노출 위험) |

## GitHub Actions 설정

### 1. MCP API 방식 (권장)

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: your-org/your-app

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_PAT }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest
            type=sha,prefix=

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}

  deploy:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via CodeB MCP API
        run: |
          RESPONSE=$(curl -sf -X POST "https://app.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "project": "your-app",
                "image": "ghcr.io/your-org/your-app:latest",
                "environment": "production"
              }
            }')

          echo "Deploy Response: $RESPONSE"

          if echo "$RESPONSE" | grep -q '"success":true'; then
            echo "Deployment successful!"
          else
            echo "Deployment failed"
            exit 1
          fi
```

### 2. 필요한 GitHub Secrets

Repository Settings → Secrets and variables → Actions에서 설정:

| Secret | 값 | 설명 |
|--------|---|------|
| `CODEB_API_KEY` | `codeb_dev_xxx` 또는 `codeb_admin_xxx` | MCP API 키 |
| `GHCR_PAT` | GitHub PAT (packages:write) | 컨테이너 레지스트리 토큰 |

## API 키 발급

### 역할별 권한

| 역할 | 배포 | 롤백 | SSOT 조회 | 서버 설정 |
|------|-----|-----|----------|----------|
| admin | ✅ | ✅ | ✅ | ✅ |
| dev | ✅ | ✅ | ✅ | ❌ |
| view | ❌ | ❌ | ✅ | ❌ |

### 키 포맷

```
codeb_{role}_{token}

예시:
codeb_admin_6946b65a43c61441e9c8e1933ca09205
codeb_dev_282beec79c1e4810c9ea41d50cacc88c
codeb_view_4faa78fd083edc64c566c2e6c7dcdb2d
```

## MCP API 엔드포인트

### Base URL

```
Primary: https://app.codeb.kr/api
Fallback: http://158.247.203.55:9101/api
```

### 배포 관련 도구

```bash
# 배포
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_dev_xxx" \
  -H "Content-Type: application/json" \
  -d '{"tool": "deploy", "params": {"project": "myapp", "image": "ghcr.io/org/myapp:latest"}}'

# 롤백
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_dev_xxx" \
  -d '{"tool": "rollback", "params": {"project": "myapp"}}'

# 프로모트 (Blue-Green 전환)
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_dev_xxx" \
  -d '{"tool": "promote", "params": {"project": "myapp"}}'

# Slot 상태 확인
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_view_xxx" \
  -d '{"tool": "slot_status", "params": {"project": "myapp"}}'

# SSOT 상태
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_view_xxx" \
  -d '{"tool": "ssot_status"}'
```

## 기존 SSH 프로젝트 마이그레이션

```bash
# CLI로 자동 마이그레이션
we workflow migrate myapp

# 수동 마이그레이션 단계
# 1. deploy.yml에서 ssh-action 제거
# 2. MCP API 방식으로 deploy job 변경
# 3. CODEB_API_KEY secret 추가
# 4. SSH secrets 제거 (선택)
```

## 배포 플로우

```
Git Push
   ↓
GitHub Actions (build job)
   ↓
Docker Build → ghcr.io push
   ↓
GitHub Actions (deploy job)
   ↓
MCP API 호출 (CODEB_API_KEY)
   ↓
서버에서 이미지 pull & 컨테이너 시작
   ↓
Health Check
   ↓
배포 완료
```

## 트러블슈팅

### Permission denied 에러

```
Error: Permission denied: dev cannot use xxx
```

→ 해당 도구가 dev 역할에 허용되지 않음. admin 키 사용 또는 관리자에게 문의.

### GHCR 인증 실패

```
Error: unauthorized: unauthenticated
```

→ 서버에서 GHCR 로그인 필요 (Admin SSH 작업):
```bash
ssh root@app.codeb.kr
echo "GHCR_PAT" | podman login ghcr.io -u USERNAME --password-stdin
```

### 이미지 pull 실패

```
Error: image not found
```

→ 이미지 이름/태그 확인. ghcr.io 경로가 정확한지 확인.

## 관련 문서

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 규칙
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 일반 배포 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - API 레퍼런스
