---
name: promote
description: "Blue-Green Slot 트래픽 전환 (무중단)"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__slot_promote
  - mcp__codeb-deploy__health_check
hooks:
  PostToolUse:
    - matcher: mcp__codeb-deploy__slot_promote
      hooks:
        - type: command
          command: "python3 .claude/hooks/post-promote.py"
---

# /we:promote - Blue-Green 트래픽 전환

## 목적
현재 비활성 Slot(Preview)을 활성화하여 Production 트래픽을 전환합니다.
**무중단 배포**를 실현하며, 이전 Slot은 grace 상태(48시간)로 유지됩니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- Promote 전 반드시 **Slot 상태 확인**
- Preview URL에서 테스트 완료 확인 권장
- Promote 후 이전 Slot은 **grace 상태**로 48시간 유지 (롤백 가능)

## 자동 실행 플로우

### Step 1: 현재 Slot 상태 확인
```
mcp__codeb-deploy__slot_status 호출
- projectName: 프로젝트명
- environment: 환경 (기본값: staging)
```

### Step 2: Promote 실행
```
mcp__codeb-deploy__slot_promote 호출
- projectName: 프로젝트명
- environment: 환경
```

### Step 3: Health Check
```
mcp__codeb-deploy__health_check 호출
- server: "app"
```

### Step 4: 결과 보고
- 새로운 Active Slot 정보
- Production URL
- Grace 상태 Slot 정보 (롤백 가능 기간)

## 사용법
```
/we:promote [프로젝트] [환경]
```

## Slot 상태 다이어그램
```
[deployed] → promote → [active]
                         │
                         ▼
[active] → promote(다른) → [grace] (48시간)
                              │
                              ▼
                           [empty]
```

## 예제
```
/we:promote myapp              # myapp staging의 비활성 slot 활성화
/we:promote myapp production   # myapp production의 비활성 slot 활성화
```

## 관련 명령어
- `/we:deploy` - 비활성 Slot에 배포
- `/we:rollback` - Grace Slot으로 즉시 롤백
- `/we:slot` - Slot 상태 상세 확인
