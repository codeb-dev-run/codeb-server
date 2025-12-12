# CodeB CI/CD 아키텍처 문서

> **버전**: 1.0.0
> **작성일**: 2025-01-10
> **대상**: 10인 개발팀
> **목표**: 100% 자동화된 Self-Healing CI/CD 시스템

---

## 1. 개요

### 1.1 시스템 목표

이 문서는 CodeB 프로젝트의 CI/CD 파이프라인 설계를 설명합니다. **핵심 목표**는:

1. **100% 자동화**: 개발자가 코드를 push하면 배포까지 완전 자동화
2. **Self-Healing**: 빌드 에러 발생 시 AI(Claude Code)가 자동으로 수정
3. **No-Deletion 원칙**: 코드를 삭제하여 문제를 해결하는 것을 절대 금지
4. **간결함**: 10인 팀에 맞는 적절한 복잡도

### 1.2 아키텍처 요약

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Workflow                        │
├─────────────────────────────────────────────────────────────────┤
│  git push → GitHub Actions (Build) → ghcr.io → SSH Deploy       │
│                    ↓ (실패 시)                                   │
│              Claude Code Auto-Fix                                │
│                    ↓                                            │
│              재빌드 (최대 5회)                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Server Infrastructure                       │
├─────────────────────────────────────────────────────────────────┤
│  Podman Containers                                               │
│  ├── App Container (Next.js/Remix)                              │
│  ├── PostgreSQL Container                                        │
│  └── Redis Container                                            │
│                                                                  │
│  Caddy (Reverse Proxy + HTTPS)                                  │
│  PowerDNS (DNS Management)                                       │
│  PM2 (Process Management)                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 기술 선택 이유 (Why)

### 2.1 빌드 환경: GitHub Actions vs Self-Hosted Runner

#### 고민한 옵션들

| 옵션 | 장점 | 단점 |
|------|------|------|
| **GitHub Actions (ubuntu-latest)** | 무료 2000분/월, 관리 불필요, 격리된 환경 | 외부 네트워크, Cold Start |
| **Self-Hosted Runner** | 빠른 캐시, 내부 네트워크 | 서버 리소스 사용, 관리 필요 |
| **GitHub Codespaces** | 개발 환경 일치 | 비용, 설정 복잡 |

#### 최종 결정: **GitHub Actions (ubuntu-latest)**

**이유**:
1. **서버 리소스 보호**: 서버가 2코어밖에 없어서 빌드 시 운영 서비스에 영향
2. **비용 효율**: 10인 팀이면 월 2000분 무료로 충분 (하루 약 66분)
3. **관리 부담 제거**: Self-Hosted Runner 모니터링/업데이트 불필요
4. **격리된 환경**: 빌드 실패가 서버에 영향 없음

```yaml
# 실제 적용된 설정
runs-on: ubuntu-latest  # Self-hosted 아님
```

### 2.2 배포 전략: Rolling vs Blue-Green vs Canary

#### 고민한 옵션들

| 전략 | 복잡도 | 리소스 | 롤백 속도 | 적합한 팀 규모 |
|------|--------|--------|-----------|---------------|
| **Rolling** | 낮음 | 최소 | 중간 | 1-20명 |
| **Blue-Green** | 중간 | 2배 | 빠름 | 20-100명 |
| **Canary** | 높음 | 1.1배+ | 빠름 | 100명+ |

#### 최종 결정: **Rolling Only**

**이유**:
1. **10인 팀에 적합**: Blue-Green은 오버엔지니어링
2. **리소스 절약**: 서버 1대에서 2배 리소스 할당 불가
3. **복잡도 감소**: 트래픽 분산 로직 불필요
4. **충분한 안정성**: 헬스체크 + 자동 롤백으로 충분

```yaml
# 제거된 옵션들 (불필요한 복잡도)
# strategy: blue-green  # 제거
# strategy: canary      # 제거
strategy: rolling       # 유일한 선택
```

### 2.3 Self-Healing: 왜 코드 삭제를 금지하는가?

#### 문제 상황

AI가 빌드 에러를 수정할 때 **가장 쉬운 방법**은:
- 에러가 나는 코드를 삭제
- 테스트를 skip
- @ts-ignore 추가

이것은 **"수정"이 아니라 "회피"**입니다.

#### No-Deletion 원칙

```typescript
// 절대 금지
const FORBIDDEN_PATTERNS = [
  '@ts-ignore',
  '@ts-nocheck',
  '@ts-expect-error',
  'eslint-disable',
  '.skip(',      // test.skip()
  'as any',
  ': any',
];
```

#### 검증 방법

```bash
# git diff로 삭제가 추가보다 많으면 거부
DELETIONS=$(git diff --numstat | awk '{ sum += $2 } END { print sum }')
ADDITIONS=$(git diff --numstat | awk '{ sum += $1 } END { print sum }')

if [ "$DELETIONS" -gt "$ADDITIONS" ]; then
  echo "❌ Fix rejected: More deletions than additions"
  exit 1
fi
```

### 2.4 컨테이너: Docker vs Podman

#### 고민한 옵션들

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Docker** | 업계 표준, 문서 풍부 | daemon 필요, root 권한 |
| **Podman** | rootless, daemonless, OCI 호환 | 문서 부족, 일부 호환성 |
| **containerd** | 경량 | 사용성 낮음 |

#### 최종 결정: **Podman**

**이유**:
1. **보안**: rootless로 실행 가능 (서버 보안 강화)
2. **호환성**: Docker CLI 호환 (alias docker=podman)
3. **리소스**: daemon 없어서 메모리 절약
4. **이미 설치됨**: 서버에 Podman 3.4.4 설치되어 있음

### 2.5 레지스트리: ghcr.io vs Docker Hub vs Self-Hosted

#### 최종 결정: **ghcr.io (GitHub Container Registry)**

**이유**:
1. **GitHub 통합**: Actions에서 인증 자동
2. **비용**: Private 저장소 무료
3. **관리 불필요**: Self-Hosted Registry 운영 부담 제거
4. **보안**: GitHub 보안 모델 활용

```yaml
# 실제 적용
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
```

---

## 3. Self-Healing CI/CD 상세

### 3.1 전체 플로우

```
Developer Push
     │
     ▼
┌─────────────┐
│  Build Job  │ ← TypeCheck, Lint, Build, Test
└─────────────┘
     │
     ├── 성공 → Docker Build → Deploy
     │
     └── 실패 → Auto-Fix Job
                    │
                    ▼
              ┌─────────────┐
              │ Parse Error │ ← 에러 로그 분석
              └─────────────┘
                    │
                    ▼
              ┌─────────────┐
              │  AI Fix     │ ← Claude API 호출
              └─────────────┘
                    │
                    ▼
              ┌─────────────┐
              │  Validate   │ ← No-Deletion 검증
              └─────────────┘
                    │
                    ├── 검증 실패 → 알림 & 중단
                    │
                    └── 검증 성공 → Commit & Push
                                        │
                                        ▼
                                  새 빌드 트리거
                                  (최대 5회 반복)
```

### 3.2 에러 분류

```typescript
type ErrorType =
  | 'typescript'  // TS2304: Cannot find name 'foo'
  | 'lint'        // ESLint rule violation
  | 'import'      // Module not found
  | 'test'        // Jest test failure
  | 'build'       // Compilation error
  | 'unknown';    // Other errors
```

### 3.3 AI 수정 프롬프트

```typescript
const SYSTEM_PROMPT = `
## 절대 금지 규칙
1. 코드를 삭제하여 문제를 해결하지 마세요
2. 테스트를 skip하거나 제거하지 마세요
3. @ts-ignore, @ts-nocheck 추가 금지
4. eslint-disable 추가 금지
5. any 타입 사용 금지
6. 기능을 제거하여 에러를 피하지 마세요

## 허용되는 수정
1. 타입 정의 추가/수정 (interface, type 생성)
2. 누락된 import 추가
3. null/undefined 체크 추가
4. 올바른 타입 캐스팅 (as 특정타입, any 제외)
5. 로직 버그 수정
6. 테스트 assertion 수정 (기대값이 잘못된 경우)
7. 누락된 return 추가
`;
```

### 3.4 검증 규칙

| 검증 항목 | 기준 | 실패 시 |
|----------|------|---------|
| 삭제/추가 비율 | 삭제 < 추가 | 수정 거부 |
| 금지 패턴 | 0개 | 수정 거부 |
| 재빌드 성공 | Pass | 커밋 |
| 최대 시도 | 5회 | 수동 검토 알림 |

---

## 4. 서버 모니터링

### 4.1 모니터링 항목

| 항목 | 임계값 | 알림 |
|------|--------|------|
| 디스크 사용량 | 80% 경고, 90% 위험 | Slack/Email |
| SSL 인증서 | 14일 경고, 7일 위험 | Slack/Email |
| 컨테이너 상태 | unhealthy | 즉시 알림 |
| 백업 | 24시간 이상 미실행 | 경고 |

### 4.2 자동 백업

```bash
# 매일 새벽 3시 자동 백업
0 3 * * * /opt/codeb/scripts/auto-backup.sh

# 백업 스크립트 내용
pg_dump $DB_NAME | gzip > $BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d).sql.gz
find $BACKUP_DIR -mtime +7 -delete  # 7일 이상 삭제
```

---

## 5. MCP 도구 목록

### 5.1 핵심 도구 (20개 → 35개에서 간소화)

#### 배포 관련
- `deploy_compose_project` - Compose 스타일 배포
- `healthcheck` - 헬스체크
- `rollback` - 롤백

#### Self-Healing
- `get_build_errors` - 빌드 에러 조회
- `validate_fix` - 수정 검증
- `auto_fix_build_loop` - 자동 수정 루프
- `generate_fix_prompt` - AI 프롬프트 생성

#### 모니터링
- `monitor_disk` - 디스크 모니터링
- `monitor_ssl` - SSL 모니터링
- `check_backup_status` - 백업 상태
- `full_health_check` - 전체 헬스체크

#### 환경/시크릿
- `manage_env` - 환경변수 관리
- `manage_secrets` - GitHub Secrets 관리

#### 워크플로우
- `manage_workflow` - 워크플로우 관리
- `trigger_build_and_monitor` - 빌드 트리거 및 모니터링

### 5.2 제거된 도구들

| 도구 | 제거 이유 |
|------|----------|
| Prometheus/Grafana 설정 | 10인 팀에 과도한 모니터링 |
| Blue-Green 배포 | 리소스 부족, 복잡도 |
| Canary 배포 | 트래픽 분산 불필요 |
| Self-Hosted Registry | ghcr.io로 충분 |

---

## 6. 디렉토리 구조

```
/opt/codeb/
├── projects/
│   └── {project-name}/
│       ├── .env.staging
│       ├── .env.production
│       └── docker-compose.yml
├── backups/
│   └── {db-name}_YYYYMMDD.sql.gz
├── scripts/
│   └── auto-backup.sh
└── config/
    ├── port-registry.json
    └── project-registry.json

/etc/caddy/
└── Caddyfile  # 리버스 프록시 설정
```

---

## 7. 보안 고려사항

### 7.1 시크릿 관리

```yaml
# GitHub Secrets (절대 코드에 포함하지 않음)
ANTHROPIC_API_KEY     # Claude API
SERVER_HOST           # 배포 서버 IP
SERVER_USER           # SSH 사용자
SERVER_SSH_KEY        # SSH 키 (base64)
GITHUB_TOKEN          # 자동 생성
```

### 7.2 네트워크 보안

- SSH 포트만 공개 (22)
- 앱 포트는 Caddy를 통해서만 접근
- PostgreSQL/Redis는 내부 네트워크만

### 7.3 취약점 스캔

```yaml
# CI/CD 파이프라인에 포함
- name: Trivy Scan
  run: trivy image $IMAGE_NAME
```

---

## 8. 트러블슈팅

### 8.1 빌드 실패 시

1. **자동 수정 대기**: 최대 5회 자동 수정 시도
2. **수동 개입**: 5회 실패 시 Slack 알림
3. **롤백**: `rollback` 도구로 이전 버전 복원

### 8.2 배포 실패 시

```bash
# 컨테이너 로그 확인
podman logs {container-name}

# 헬스체크 실행
mcp healthcheck --project {name} --environment production
```

### 8.3 디스크 부족 시

```bash
# 미사용 이미지 정리
podman image prune -a

# 오래된 백업 삭제
find /opt/codeb/backups -mtime +7 -delete
```

---

## 9. 참고 자료

### 9.1 고민했던 대안들

| 카테고리 | 선택 | 대안 | 선택 이유 |
|---------|------|------|----------|
| 빌드 환경 | GitHub Actions | Self-Hosted | 서버 리소스 보호 |
| 배포 전략 | Rolling | Blue-Green | 10인 팀에 적합 |
| 컨테이너 | Podman | Docker | 보안, 이미 설치됨 |
| 레지스트리 | ghcr.io | Docker Hub | GitHub 통합 |
| Self-Healing | Claude Code | GitHub Copilot | 더 강력한 코드 수정 |

### 9.2 관련 링크

- [GitHub Actions 문서](https://docs.github.com/actions)
- [Podman 문서](https://docs.podman.io)
- [Caddy 문서](https://caddyserver.com/docs)

---

## 10. 버전 히스토리

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0.0 | 2025-01-10 | 초기 버전 |

---

## 부록 A: 워크플로우 파일

```yaml
# .github/workflows/self-healing-ci.yml
name: Self-Healing CI/CD

on:
  push:
    branches: [main, develop]

env:
  MAX_FIX_ATTEMPTS: 5

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      - run: npm run test

  auto-fix:
    needs: build
    if: failure()
    runs-on: ubuntu-latest
    steps:
      # ... Claude API로 에러 수정
      # ... No-Deletion 검증
      # ... 재빌드 트리거
```

## 부록 B: MCP 서버 설정

```json
// .mcp.json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["path/to/mcp-server/dist/index.js"],
      "env": {
        "SSH_HOST": "141.164.60.51",
        "SSH_USER": "root",
        "SSH_KEY_PATH": "~/.ssh/id_ed25519"
      }
    }
  }
}
```
