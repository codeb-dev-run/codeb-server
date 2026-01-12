---
name: rollback
description: "이전 버전으로 즉시 롤백 (Grace Slot 활성화)"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__rollback
  - mcp__codeb-deploy__health_check
hooks:
  PostToolUse:
    - matcher: mcp__codeb-deploy__rollback
      hooks:
        - type: command
          command: "python3 .claude/hooks/post-rollback.py"
---

# /we:rollback - 즉시 롤백

## 목적
Grace 상태의 이전 Slot을 다시 활성화하여 **즉시 롤백**합니다.
새로운 배포 없이 Caddy 설정만 변경하므로 **1초 이내** 완료됩니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- Grace Slot이 없으면 롤백 불가
- Grace 만료(48시간) 전에만 롤백 가능
- 롤백 후 현재 Active는 Grace 상태로 전환

## 자동 실행 플로우

### Step 1: 현재 Slot 상태 확인
```
mcp__codeb-deploy__slot_status 호출
- projectName: 프로젝트명
- environment: 환경
```

### Step 2: Grace Slot 확인
- Grace 상태 Slot이 없으면 **롤백 불가** 안내
- Grace Slot의 버전, 배포 시간 확인

### Step 3: Rollback 실행
```
mcp__codeb-deploy__rollback 호출
- projectName: 프로젝트명
- environment: 환경
```

### Step 4: Health Check & 결과 보고
- 롤백 완료 시간
- 복구된 버전 정보
- 현재 상태

## 사용법
```
/we:rollback [프로젝트] [환경]
```

## 롤백 플로우
```
Before:
  Blue [active]  ←── 트래픽
  Green [grace]      (v1.2.3, 2시간 전)

After Rollback:
  Blue [grace]       (v1.2.4)
  Green [active] ←── 트래픽 (v1.2.3 복구)
```

## 예제
```
/we:rollback myapp              # myapp staging 롤백
/we:rollback myapp production   # myapp production 롤백
```

## 롤백 불가 상황
- Grace Slot이 없음 (새 배포로 덮어쓰기됨)
- Grace 기간 만료 (48시간 초과)
- 두 Slot 모두 empty 상태

## 관련 명령어
- `/we:deploy` - 새 버전 배포
- `/we:promote` - 트래픽 전환
- `/we:slot` - Slot 상태 확인
