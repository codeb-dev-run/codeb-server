# CodeB CI/CD 빠른 시작 가이드

> 5분 안에 프로젝트를 배포할 수 있습니다.

---

## 1. 사전 요구사항

- GitHub 저장소
- `ANTHROPIC_API_KEY` (Claude API)
- 서버 SSH 접근 권한

---

## 2. GitHub Secrets 설정

저장소 설정 → Secrets and variables → Actions에서 추가:

```
ANTHROPIC_API_KEY     # Claude API 키 (Self-Healing용)
SERVER_HOST           # 141.164.60.51
SERVER_USER           # root
SERVER_SSH_KEY        # SSH 개인키 (base64 인코딩)
```

SSH 키 인코딩:
```bash
cat ~/.ssh/id_ed25519 | base64 -w 0
```

---

## 3. 워크플로우 파일 추가

`.github/workflows/self-healing-ci.yml` 파일을 저장소에 추가합니다.

(이미 생성되어 있음: `/Users/admin/new_project/codeb-server/.github/workflows/self-healing-ci.yml`)

---

## 4. Dockerfile 추가

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
```

---

## 5. 첫 배포

```bash
git add .
git commit -m "feat: add CI/CD configuration"
git push origin main
```

GitHub Actions에서 자동으로:
1. TypeCheck → Lint → Build → Test
2. 성공 시 Docker 이미지 빌드 → ghcr.io 푸시
3. 서버 SSH 접속 → Podman으로 배포
4. 헬스체크 → 완료

---

## 6. 빌드 실패 시

### 자동 처리

1. Claude API가 에러 분석
2. No-Deletion 원칙에 따라 수정
3. 자동 커밋 & 재빌드
4. 최대 5회 반복

### 수동 개입이 필요한 경우

5회 실패 시 Slack/Email 알림이 발송됩니다.
이 경우 직접 코드를 수정해야 합니다.

---

## 7. MCP 도구 사용

### 서버 상태 확인

```
mcp full_health_check
```

### 환경변수 설정

```
mcp manage_env --action set --projectName myapp --environment production --key API_KEY --value xxx
```

### 롤백

```
mcp rollback --projectName myapp --environment production
```

---

## 8. 문제 해결

### 빌드가 계속 실패

1. `Actions` 탭에서 로그 확인
2. 에러 메시지 복사
3. Claude Code에서 직접 수정

### 배포 후 서비스 안 됨

```bash
# 서버에서 확인
ssh root@141.164.60.51
podman ps -a
podman logs myapp-production
```

### SSL 인증서 문제

```
mcp monitor_ssl
```

---

## 9. 유용한 명령어

| 명령어 | 설명 |
|--------|------|
| `mcp analyze_server` | 서버 전체 상태 |
| `mcp full_health_check` | 종합 헬스체크 |
| `mcp monitor_disk` | 디스크 확인 |
| `mcp monitor_ssl` | SSL 확인 |
| `mcp rollback` | 이전 버전 복원 |

---

## 10. 다음 단계

- [CICD_ARCHITECTURE.md](./CICD_ARCHITECTURE.md) - 상세 아키텍처
- [DECISION_LOG.md](./DECISION_LOG.md) - 의사결정 기록
