---
name: health
description: "CodeB 인프라 전체 상태 확인"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__health_check
  - mcp__codeb-deploy__slot_status
---

# /we:health - 시스템 헬스체크

## 목적
CodeB 4-Server 인프라의 전체 상태를 확인합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- 모든 서버 상태를 한 번에 확인
- 문제 발견 시 권장 조치 안내

## 자동 실행 플로우

### Step 1: 전체 서버 헬스체크
```
mcp__codeb-deploy__health_check 호출
- server: "all"
```

### Step 2: 결과 분석 및 보고
각 서버별 상태:
- App Server (158.247.203.55)
- Streaming Server (141.164.42.213)
- Storage Server (64.176.226.119)
- Backup Server (141.164.37.63)

## 사용법
```
/we:health [서버]
```

## 서버 옵션
- `all` (기본값) - 전체 서버
- `app` - App 서버만
- `streaming` - Streaming 서버만
- `storage` - Storage 서버만
- `backup` - Backup 서버만

## 예제
```
/we:health              # 전체 서버 상태
/we:health app          # App 서버만 확인
```

## 관련 명령어
- `/we:monitor` - 실시간 모니터링
- `/we:slot` - Slot 상태 확인
