# CodeB MCP Server 배포 트러블슈팅 가이드

> 2026-01-12 작성 - GitHub Actions 빌드 실패로 인한 로컬 Buildx 배포 과정 문서화

## 개요

GitHub Actions를 통한 자동 배포 시스템에서 여러 차례 빌드 및 배포 실패가 발생했습니다. 이 문서는 발생한 문제들과 로컬 Buildx를 사용한 우회 배포 방법을 상세히 기록합니다.

---

## 1. 발생한 문제들

### 1.1 디스크 용량 부족 (99% 사용)

**증상:**
```
No space left on device
```

**원인:**
- Self-hosted runner의 `/opt/actions-runner/_diag` 폴더에 로그가 233GB 이상 축적
- GitHub Actions runner가 로그 정리를 하지 않아 디스크 꽉 참

**해결:**
```bash
# 서버에서 오래된 runner 로그 삭제
ssh root@app.codeb.kr "find /opt/actions-runner/_diag -name '*.log' -mtime +7 -delete"
# 238GB 공간 확보
```

---

### 1.2 MCP API 서비스 다운 (14시간 이상 중단)

**증상:**
```
systemctl status codeb-mcp-api
○ codeb-mcp-api.service - Dead
```

**원인:**
- 디스크 용량 부족으로 서비스 크래시
- systemd가 자동 재시작 실패

**해결:**
```bash
ssh root@app.codeb.kr "systemctl start codeb-mcp-api"
```

---

### 1.3 Podman 네트워크 누락

**증상:**
```
Error: network codeb-network not found
```

**원인:**
- 시스템 재시작 또는 podman reset으로 네트워크 삭제됨

**해결:**
```bash
ssh root@app.codeb.kr "podman network create codeb-network"
```

---

### 1.4 API Key 401 Unauthorized

**증상:**
```json
{"success": false, "error": "Invalid API key"}
```

**원인:**
- GitHub Secrets의 `CODEB_API_KEY`가 서버의 `/opt/codeb/registry/api-keys.json`에 등록되지 않음
- API 키 해시가 일치하지 않음

**해결:**
```bash
# 1. 서버에서 새 API 키 생성
ssh root@app.codeb.kr "podman exec codeb-mcp-api node -e \"
const { auth } = require('./dist/lib/auth.js');
const key = auth.generateApiKey('codeb', 'member');
console.log(key);
\""

# 2. GitHub Secrets 업데이트
gh secret set CODEB_API_KEY --repo codeb-dev-run/worb --body "<새로운_API_키>"

# 3. 서버 registry에 키 등록
ssh root@app.codeb.kr "podman exec codeb-mcp-api node -e \"
const fs = require('fs');
const { auth } = require('./dist/lib/auth.js');
const registry = JSON.parse(fs.readFileSync('/opt/codeb/registry/api-keys.json'));
registry.keys['key_github_actions'] = {
  id: 'key_github_actions',
  keyHash: auth.hashApiKey('<새로운_API_키>'),
  name: 'GitHub Actions Deploy Key',
  teamId: 'codeb',
  role: 'member',
  createdAt: new Date().toISOString(),
  createdBy: 'admin-cli',
  scopes: ['*']
};
fs.writeFileSync('/opt/codeb/registry/api-keys.json', JSON.stringify(registry, null, 2));
\""
```

---

### 1.5 Health Check 실패 (60초 타임아웃)

**증상:**
```json
{"success": false, "error": "Health check failed after 60s"}
```

**원인 1: Podman Netavark 네트워크 문제**
- 컨테이너 내부에서는 정상 작동
- 호스트에서 `localhost:port`로 접근 불가 ("No route to host")
- `cni-podman0` 인터페이스가 `linkdown` 상태

```bash
# 테스트
podman exec worb-production-green curl localhost:3000/api/health  # OK
curl localhost:4013/api/health  # FAIL - No route to host
```

**해결:**
`waitForHealthy` 함수를 3단계 체크로 수정:
```typescript
// 1차: podman inspect로 healthcheck 상태 확인
podman inspect ${containerName} --format '{{.State.Health.Status}}'

// 2차: podman exec로 컨테이너 내부에서 curl (네트워크 문제 우회)
podman exec ${containerName} curl -sf http://localhost:3000/health

// 3차: 호스트에서 직접 curl (fallback)
curl -sf http://localhost:${port}/health
```

**원인 2: Health 엔드포인트 경로 불일치**
- MCP 서버는 `/health`만 체크
- worb 앱은 `/api/health` 엔드포인트 사용

**해결:**
```typescript
// /health 또는 /api/health 모두 체크
podman exec ${containerName} sh -c 'curl -sf http://localhost:3000/health || curl -sf http://localhost:3000/api/health'
```

Quadlet HealthCmd도 수정:
```ini
HealthCmd=sh -c 'curl -sf http://localhost:3000/health || curl -sf http://localhost:3000/api/health || exit 1'
```

---

### 1.6 이미지 경로 버그

**증상:**
```
Error: ghcr.io/codeb/worb:latest not found
```

**원인:**
- `deploy.ts`에서 이미지 경로가 `ghcr.io/codeb/${projectName}` 하드코딩
- 실제 GHCR 조직명은 `codeb-dev-run`

**해결:**
```typescript
// Before
const imageUrl = input.image || `ghcr.io/codeb/${projectName}:${version}`;

// After
const imageUrl = input.image || `ghcr.io/codeb-dev-run/${projectName}:${version}`;
```

---

### 1.7 Preview URL 도메인 오류

**증상:**
```
previewUrl: "https://worb-green.preview.codeb.dev"  // 존재하지 않는 도메인
```

**원인:**
- `codeb.dev` 도메인이 설정되지 않음
- 실제 도메인은 `codeb.kr`

**해결:**
```typescript
// Before
const previewUrl = `https://${projectName}-${slot}.preview.codeb.dev`;

// After
const previewUrl = `https://${projectName}-${slot}.preview.codeb.kr`;
```

---

### 1.8 Docker Buildx 아키텍처 불일치

**증상:**
```
Error: no image found in image index for architecture amd64
```

**원인:**
- Mac (arm64)에서 `docker build`하면 arm64 이미지만 생성
- 서버는 amd64 (x86_64) 아키텍처

**해결:**
Docker Buildx로 멀티 아키텍처 빌드:
```bash
# Buildx builder 생성 및 사용
docker buildx create --use --name multibuilder

# amd64 + arm64 동시 빌드 및 푸시
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/codeblabdev-max/codeb-server/codeb-api:7.0.23 \
  --push .
```

---

## 2. 로컬 Buildx 배포 방법

GitHub Actions가 실패할 때 로컬에서 직접 배포하는 절차:

### 2.1 Buildx 설정

```bash
# Builder 생성 (최초 1회)
docker buildx create --use --name multibuilder

# 또는 기존 builder 사용
docker buildx use multibuilder
```

### 2.2 멀티 아키텍처 빌드 및 푸시

```bash
cd v7.0/mcp-server

# 버전 수정
# package.json의 version 필드 업데이트

# 빌드 + 푸시 (약 30초)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/codeblabdev-max/codeb-server/codeb-api:7.0.23 \
  --push .
```

### 2.3 서버 배포

```bash
# Quadlet 파일 버전 업데이트
ssh root@158.247.203.55 "sed -i 's/7.0.22/7.0.23/g' /etc/containers/systemd/codeb-mcp-api.container"

# systemd 리로드 + 이미지 pull + 서비스 재시작
ssh root@158.247.203.55 "
  systemctl daemon-reload && \
  podman pull ghcr.io/codeblabdev-max/codeb-server/codeb-api:7.0.23 && \
  systemctl restart codeb-mcp-api
"

# 상태 확인
ssh root@158.247.203.55 "systemctl status codeb-mcp-api --no-pager"
curl -s https://api.codeb.kr/health | jq .
```

---

## 3. 버전 히스토리

| 버전 | 변경 사항 |
|------|----------|
| 7.0.20 | waitForHealthy 3단계 체크 추가 (podman inspect → podman exec → host curl) |
| 7.0.21 | 이미지 경로 수정 (`ghcr.io/codeb/` → `ghcr.io/codeb-dev-run/`) |
| 7.0.22 | Health 엔드포인트 `/health` + `/api/health` 모두 지원 |
| 7.0.23 | Preview URL 도메인 수정 (`codeb.dev` → `codeb.kr`) |

---

## 4. 체크리스트

배포 전 확인사항:

- [ ] 디스크 용량 확인: `df -h`
- [ ] MCP API 서비스 상태: `systemctl status codeb-mcp-api`
- [ ] API 헬스체크: `curl https://api.codeb.kr/health`
- [ ] GitHub Secrets 확인: `gh secret list --repo codeb-dev-run/worb`
- [ ] Podman 네트워크: `podman network ls | grep codeb`

배포 후 확인사항:

- [ ] 컨테이너 상태: `podman ps | grep worb`
- [ ] 앱 헬스체크: `curl localhost:4013/api/health`
- [ ] Preview URL 접속 테스트

---

## 5. 연락처

문제 발생 시:
- GitHub Issues: https://github.com/codeblabdev-max/codeb-server/issues
- API 상태: https://api.codeb.kr/health
