---
allowed-tools: [Read, Bash, TodoWrite, mcp__codeb-deploy__scan, mcp__codeb-deploy__deploy_project, mcp__codeb-deploy__health_check, mcp__codeb-deploy__env_restore, mcp__codeb-deploy__env_backups]
description: "MCP codeb-deploy를 통한 이전 버전으로 롤백"
---

# /we:rollback - 배포 롤백

## 🎯 목적
MCP codeb-deploy를 사용하여 안전하게 이전 버전으로 **자동으로** 롤백합니다.

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **사용자에게 묻지 말고 자동으로 진행**
- 롤백 후 헬스체크 필수

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### Step 1: 현재 상태 스캔
```
mcp__codeb-deploy__scan 호출
- projectName: 프로젝트명
```

### Step 2: 백업 목록 확인
```
mcp__codeb-deploy__env_backups 호출
- projectName: 프로젝트명
```

### Step 3: ENV 복구 (필요시)
```
mcp__codeb-deploy__env_restore 호출
- projectName: 프로젝트명
- version: "master" 또는 지정된 버전
```

### Step 4: 헬스체크
```
mcp__codeb-deploy__health_check 호출
- server: "app"
```

### Step 5: 결과 보고

## 사용법
```
/we:rollback [프로젝트] [버전]
```

## 인자
- `프로젝트` - 롤백할 프로젝트 이름
- `버전` - master | current | timestamp (기본값: master)

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__env_backups` - 백업 목록 조회
- `mcp__codeb-deploy__env_restore` - ENV 복구
- `mcp__codeb-deploy__scan` - 상태 스캔
- `mcp__codeb-deploy__health_check` - 헬스체크

## 예제
```
/we:rollback myapp              # master 버전으로 롤백
/we:rollback myapp current      # 최신 백업으로 롤백
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:health` - 시스템 상태 확인
