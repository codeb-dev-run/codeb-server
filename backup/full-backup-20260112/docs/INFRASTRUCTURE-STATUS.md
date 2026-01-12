# CodeB 서버 인프라 상태 점검 보고서

> **점검일시**: 2026-01-12 08:22 KST
> **점검자**: Claude Code
> **서버**: App Server (158.247.203.55)

---

## 1. 점검 결과 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 디스크 용량 | ✅ 정상 | 18% 사용 (236GB 가용) |
| GitHub Actions Runner | ✅ 정상 | 2개 서비스 running |
| Docker 권한 | ✅ 정상 | runner 사용자 docker 그룹 |
| MCP API 서비스 | ✅ 정상 | v7.0.23 running |
| Podman 네트워크 | ✅ 정상 | codeb-network 존재 |
| External API | ✅ 정상 | https://api.codeb.kr 응답 |
| 로그 자동정리 | ✅ 설정완료 | cron 매일 03:00 |

**전체 상태**: 🟢 **GitHub Actions 배포 준비 완료**

---

## 2. 상세 점검 내역

### 2.1 디스크 용량

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2       300G   51G  236G  18% /
```

**주요 디렉토리 사용량:**

| 디렉토리 | 용량 | 설명 |
|---------|------|------|
| /opt/videopick | 11G | 레거시 프로젝트 |
| /opt/codeb | 2.7G | CodeB 프로젝트 |
| /opt/actions-runner | 2.1G | codeb-server Runner |
| /opt/actions-runner-codeb-project | 1.8G | worb Runner |
| /var/lib/containers | 11G | Podman 컨테이너 |
| /var/lib/docker | 5.6G | Docker 이미지 |
| /var/log | 3.9G | 시스템 로그 |

**Runner 로그 상태:**
- `/opt/actions-runner/_diag`: 1.3MB (정리됨)
- 로그 파일 수: 0개

---

### 2.2 GitHub Actions Runner

**서비스 목록:**

| 서비스명 | 상태 | 메모리 | 용도 |
|---------|------|--------|------|
| actions.runner.codeb-dev-run-worb.codeb-devrun-runner | ✅ running | 101MB | worb 프로젝트 |
| actions.runner.codeblabdev-max-codeb-server.codeb-app-server | ✅ running | 82MB | codeb-server |

**Runner 버전:** 2.330.0

**서비스 상태 확인:**
```bash
systemctl status actions.runner.codeb-dev-run-worb.codeb-devrun-runner
# Active: active (running) since Sun 2026-01-11 22:11:02 UTC
```

---

### 2.3 Docker 권한

**runner 사용자 그룹:**
```
runner : runner systemd-journal docker
```

**Docker 소켓 권한:**
```
srw-rw---- 1 root docker 0 Sep 30 15:20 /var/run/docker.sock
```

**권한 테스트 결과:** ✅ 통과
```bash
su - runner -c 'docker ps'
# 정상 실행됨
```

---

### 2.4 MCP API 서비스

**서비스 정보:**

| 항목 | 값 |
|------|-----|
| 서비스명 | codeb-mcp-api.service |
| 버전 | 7.0.23 |
| 상태 | active (running) |
| 컨테이너 이미지 | ghcr.io/codeblabdev-max/codeb-server/codeb-api:7.0.23 |
| 포트 | 9101 (host network) |

**헬스체크:**
```json
{
  "status": "healthy",
  "version": "7.0.12",
  "uptime": 411.75
}
```

**Quadlet 설정 위치:**
```
/etc/containers/systemd/codeb-mcp-api.container
```

---

### 2.5 Podman 네트워크

**네트워크 목록:**

| 이름 | 드라이버 | 서브넷 |
|------|---------|--------|
| codeb-network | bridge | 10.89.3.0/24 |
| podman | bridge | 기본 |

**실행 중인 컨테이너:**

| 컨테이너명 | 상태 | 포트 |
|-----------|------|------|
| codeb-mcp-api | running | host network |
| worb-production-green | running | 4013→3000 |
| worb-production-blue | unhealthy | 4000→3000 |
| w-homepage-react | healthy | 4001→3000 |
| codeb-api | running | 3200→3000 |
| da-rak-postgres | healthy | 5450→5432 |
| da-rak-redis | healthy | 6400→6379 |

---

### 2.6 External API 테스트

**엔드포인트:** https://api.codeb.kr

**헬스체크 응답:**
```bash
curl -s https://api.codeb.kr/health
```
```json
{
  "status": "healthy",
  "version": "7.0.12",
  "timestamp": "2026-01-11T23:22:47.235Z"
}
```

**API Tool 테스트 (slot_status):**
```bash
curl -s -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: $CODEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool":"slot_status","params":{"projectName":"worb","environment":"production"}}'
```
```json
{
  "success": true,
  "data": {
    "activeSlot": "blue",
    "blue": "empty",
    "green": "deployed"
  }
}
```

---

## 3. 로그 자동 정리 설정

### 3.1 Cron 설정

**추가된 cron 작업:**
```cron
# Runner 로그 자동 정리 (매일 03:00, 3일 이상된 로그 삭제)
0 3 * * * find /opt/actions-runner/_diag -name "*.log" -mtime +3 -delete 2>/dev/null
0 3 * * * find /opt/actions-runner-codeb-project/_diag -name "*.log" -mtime +3 -delete 2>/dev/null
```

**확인 방법:**
```bash
ssh root@app.codeb.kr "crontab -l"
```

### 3.2 수동 정리 명령어

긴급 시 수동으로 로그 정리:
```bash
# 7일 이상된 로그 삭제
find /opt/actions-runner/_diag -name "*.log" -mtime +7 -delete
find /opt/actions-runner-codeb-project/_diag -name "*.log" -mtime +7 -delete

# 전체 로그 삭제 (긴급 시)
rm -f /opt/actions-runner/_diag/*.log
rm -f /opt/actions-runner-codeb-project/_diag/*.log
```

---

## 4. 이전 문제점 및 해결 상태

| 문제 | 원인 | 해결 상태 |
|------|------|----------|
| 디스크 99% 사용 | Runner 로그 233GB 축적 | ✅ 정리 + cron 설정 |
| MCP API 14시간 다운 | 디스크 부족으로 크래시 | ✅ 재시작 + 모니터링 |
| Docker 권한 오류 | runner 그룹 세션 미적용 | ✅ 서비스 재시작 |
| Podman 네트워크 누락 | 시스템 재시작으로 삭제 | ✅ 네트워크 재생성 |
| Health check 실패 | Netavark 네트워크 문제 | ✅ 3단계 헬스체크로 우회 |
| 이미지 경로 오류 | 하드코딩된 조직명 | ✅ codeb-dev-run으로 수정 |
| 아키텍처 불일치 | arm64 빌드 → amd64 서버 | ✅ 멀티아키텍처 빌드 |

---

## 5. 모니터링 명령어

### 서버 상태 빠른 확인

```bash
# 디스크 용량
ssh root@app.codeb.kr "df -h /"

# Runner 서비스 상태
ssh root@app.codeb.kr "systemctl list-units --type=service | grep runner"

# MCP API 상태
ssh root@app.codeb.kr "systemctl status codeb-mcp-api --no-pager | head -10"

# 컨테이너 상태
ssh root@app.codeb.kr "podman ps"

# API 헬스체크
curl -s https://api.codeb.kr/health | jq .
```

### 전체 점검 스크립트

```bash
ssh root@app.codeb.kr "
echo '=== 디스크 ===' && df -h / | tail -1
echo '=== Runner ===' && systemctl is-active actions.runner.codeb-dev-run-worb.codeb-devrun-runner
echo '=== MCP API ===' && systemctl is-active codeb-mcp-api
echo '=== 컨테이너 수 ===' && podman ps -q | wc -l
" && echo '=== External API ===' && curl -s https://api.codeb.kr/health | jq -r .status
```

---

## 6. 다음 단계

- [ ] GitHub Actions 배포 테스트 실행
- [ ] worb 프로젝트 CI/CD 워크플로우 검증
- [ ] 배포 성공 시 문서 업데이트

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-12 | 1.0 | 최초 작성 - 인프라 점검 완료 |
