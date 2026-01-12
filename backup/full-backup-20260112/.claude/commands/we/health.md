---
allowed-tools: [Read, Bash, TodoWrite, mcp__codeb-deploy__health_check, mcp__codeb-deploy__scan, mcp__codeb-deploy__get_server_info, mcp__codeb-deploy__ssot_status]
description: "MCP codeb-deploy를 통한 시스템 상태 점검"
---

# /we:health - 시스템 상태 점검

## 🎯 목적
MCP codeb-deploy를 통해 컨테이너, 서비스, 리소스, 네트워크 연결 상태를 **자동으로** 점검합니다.

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **자동으로 모든 서버 점검 실행**
- 문제 발견 시 원인과 해결방안 함께 제시
- 심각한 문제는 🚨 표시로 강조

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### Step 1: 전체 서버 헬스체크
```
mcp__codeb-deploy__health_check 호출
- server: "all"
```

### Step 2: 서버 정보 조회
```
mcp__codeb-deploy__get_server_info 호출
```

### Step 3: SSOT 상태 확인
```
mcp__codeb-deploy__ssot_status 호출
```

### Step 4: 결과 요약 보고
서버별 상태를 테이블 형태로 정리하여 보고

## 상태 표시
```
🟢 healthy: 정상
🟡 warning: 주의 필요
🔴 unhealthy: 즉시 조치 필요
⚫ offline: 서버 접속 불가
```

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__health_check` - 헬스체크 실행
- `mcp__codeb-deploy__get_server_info` - 서버 정보 조회
- `mcp__codeb-deploy__ssot_status` - SSOT 상태 확인
- `mcp__codeb-deploy__scan` - 프로젝트 스캔

## 서버 목록
| 역할 | IP | 도메인 |
|------|-----|--------|
| App | 158.247.203.55 | app.codeb.kr |
| Streaming | 141.164.42.213 | ws.codeb.kr |
| Storage | 64.176.226.119 | db.codeb.kr |
| Backup | 141.164.37.63 | backup.codeb.kr |

## 예제
```
/we:health              # 모든 서버 상태 점검
```

## 관련 명령어
- `/we:monitor` - 실시간 모니터링
- `/we:deploy` - 프로젝트 배포
