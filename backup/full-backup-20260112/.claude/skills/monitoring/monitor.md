---
name: monitor
description: "실시간 시스템 모니터링"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__health_check
  - mcp__codeb-deploy__slot_status
---

# /we:monitor - 실시간 모니터링

## 목적
CodeB 시스템의 실시간 상태를 모니터링합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- 주기적으로 상태 확인 (기본 30초)
- 이상 징후 발견 시 즉시 알림

## 모니터링 항목

### 컨테이너 상태
- 실행 중인 컨테이너 수
- CPU/메모리 사용량
- 재시작 횟수

### Slot 상태
- Active/Deployed/Grace/Empty 상태
- 각 Slot의 버전 정보
- 마지막 배포 시간

### 서버 리소스
- 디스크 사용량
- 네트워크 상태
- 서비스 포트 상태

## 사용법
```
/we:monitor [프로젝트]
```

## 예제
```
/we:monitor              # 전체 프로젝트 모니터링
/we:monitor myapp        # myapp만 모니터링
```

## 관련 명령어
- `/we:health` - 전체 헬스체크
- `/we:slot` - Slot 상세 상태
