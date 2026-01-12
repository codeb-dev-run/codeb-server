# Quick Start Guide

> **버전: 7.0.0** | 업데이트: 2026-01-11

## Prerequisites

- Node.js 20+
- GitHub account
- API Key (팀 관리자에게 발급 요청)
- Claude Code 2.1+ (Skills/Hooks 사용 시)

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

### API Key 형식 (v7.0)

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

---

## 8. Claude Code 2.1 통합 (v7.0 신규)

v7.0에서는 Claude Code 2.1의 Skills와 Hooks 기능을 활용한 배포 자동화를 지원합니다.

### Skills 사용

```bash
# Claude Code에서 직접 배포 (Skills)
/deploy myapp                  # → 비활성 Slot에 배포
/promote myapp                 # → 트래픽 전환
/rollback myapp                # → 즉시 롤백
/health                        # → 시스템 상태 확인
```

### PostToolUse Hooks

배포 작업 후 자동으로 감사 로그가 기록됩니다:

```
~/.codeb/deploy-audit.log     # 배포 감사 로그
~/.codeb/metrics/deploys.jsonl # 배포 메트릭
```

### 세션 요약 (once: true)

Claude Code 세션 종료 시 자동으로 세션 요약이 생성됩니다:

```
~/.codeb/sessions/YYYYMMDD_HHMMSS.md   # 세션 요약
~/.codeb/sessions/YYYYMMDD_HHMMSS.json # 통계 데이터
```

자세한 내용은 [CLAUDE-CODE-INTEGRATION.md](./CLAUDE-CODE-INTEGRATION.md)를 참조하세요.

---

## 다음 단계

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-Green 배포 상세 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 전체 레퍼런스
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
- [CLAUDE-CODE-INTEGRATION.md](./CLAUDE-CODE-INTEGRATION.md) - Claude Code 2.1 통합 가이드
