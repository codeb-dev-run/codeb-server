---
allowed-tools: [Read, Bash, TodoWrite, mcp__codeb-deploy__health_check, mcp__codeb-deploy__scan, mcp__codeb-deploy__get_server_info, mcp__codeb-deploy__ssot_status, mcp__codeb-deploy__preview_status]
description: "MCP codeb-deploy를 통한 실시간 시스템 모니터링"
---

# /we:monitor - 실시간 모니터링

## 🎯 목적
MCP codeb-deploy를 통해 **자동으로** 시스템 모니터링을 수행합니다.

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **자동으로 모든 정보 수집 및 보고**
- 이상 징후 발견 시 원인 분석

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### Step 1: 서버 헬스체크
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

### Step 4: Preview 환경 상태
```
mcp__codeb-deploy__preview_status 호출
```

### Step 5: 결과 요약 보고
모든 정보를 종합하여 테이블 형태로 보고

## 상태 표시
```
📊 시스템 모니터링:
🟢 App Server: healthy
🟢 Streaming: healthy
🟢 Storage: healthy
🟢 Backup: healthy
```

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__health_check` - 헬스체크
- `mcp__codeb-deploy__get_server_info` - 서버 정보
- `mcp__codeb-deploy__ssot_status` - SSOT 상태
- `mcp__codeb-deploy__preview_status` - Preview 상태

## 예제
```
/we:monitor                     # 전체 시스템 모니터링
```

## 관련 명령어
- `/we:health` - 상태 점검
- `/we:deploy` - 프로젝트 배포
