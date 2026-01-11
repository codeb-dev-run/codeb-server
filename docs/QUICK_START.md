# Quick Start Guide

> **버전: 6.0.5** | 업데이트: 2026-01-11

## Prerequisites

- Node.js 20+
- GitHub account
- API Key (팀 관리자에게 발급 요청)

---

## 1. CLI 설치

```bash
npm install -g @codeblabdev-max/we-cli
```

자동으로 설치되는 항목:
- `we` CLI 전역 명령어
- MCP 서버 설정 (`~/.claude/claude_desktop_config.json`)
- API Key 디렉토리 (`~/.codeb/`)

---

## 2. API Key 설정

```bash
# 1. 디렉토리 생성
mkdir -p ~/.codeb

# 2. API Key 설정 (팀 관리자에게 발급 요청)
echo "CODEB_API_KEY=codeb_default_member_YOUR_TOKEN" > ~/.codeb/.env

# 3. 확인
cat ~/.codeb/.env
```

### API Key 형식 (v6.0)

```
codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
```

### 역할별 권한

| 역할 | Deploy | Promote | Rollback | ENV 관리 | 팀 관리 |
|------|:------:|:-------:|:--------:|:--------:|:-------:|
| **owner** | O | O | O | O | O |
| **admin** | O | O | O | O | O |
| **member** | O | O | O | O | X |
| **viewer** | X | X | X | X | X |

---

## 3. 첫 프로젝트 생성

```bash
# 프로젝트 초기화 (Next.js + PostgreSQL + Redis)
we workflow init myapp --type nextjs --database --redis
```

생성되는 파일:
- `.github/workflows/deploy.yml` - GitHub Actions 워크플로우
- `Dockerfile` - 컨테이너 빌드 설정
- `.env.example` - 환경 변수 템플릿

---

## 4. 첫 배포

### 4.1 Staging 배포 (Preview URL)

```bash
we deploy myapp --environment staging
```

응답:
```json
{
  "success": true,
  "result": {
    "slot": "blue",
    "port": 3000,
    "previewUrl": "https://myapp-blue.preview.codeb.kr",
    "message": "Deployed to blue slot. Run 'promote' to switch traffic."
  }
}
```

### 4.2 테스트 후 Promote

```bash
# Preview URL에서 테스트 완료 후
we promote myapp --environment staging
```

응답:
```json
{
  "success": true,
  "result": {
    "activeSlot": "blue",
    "domain": "myapp-staging.codeb.kr",
    "url": "https://myapp-staging.codeb.kr"
  }
}
```

---

## 5. 자주 사용하는 명령어

| 명령어 | 설명 |
|--------|------|
| `we deploy <project>` | 비활성 Slot에 배포 (Preview URL) |
| `we promote <project>` | 트래픽 전환 (무중단) |
| `we rollback <project>` | 이전 버전으로 롤백 |
| `we slot status <project>` | Slot 상태 확인 |
| `we health` | 시스템 헬스체크 |
| `we env get <project>` | ENV 조회 |
| `we env set <project> KEY=val` | ENV 설정 |

---

## 6. MCP API 직접 호출 (옵션)

```bash
# 배포
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "deploy",
    "params": {
      "projectName": "myapp",
      "environment": "staging"
    }
  }'

# 헬스체크 (인증 불필요)
curl https://api.codeb.kr/health
```

---

## 7. GitHub Actions 연동

GitHub 저장소 Settings → Secrets에 추가:

| Secret | 값 |
|--------|-----|
| `CODEB_API_KEY` | `codeb_default_member_YOUR_TOKEN` |
| `GHCR_PAT` | GitHub Personal Access Token |

푸시하면 자동 배포:
```bash
git push origin main
# → GitHub Actions → CodeB API → Staging 배포
```

---

## 다음 단계

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-Green 배포 상세 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 전체 레퍼런스
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
