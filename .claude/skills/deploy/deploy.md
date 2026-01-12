---
name: deploy
description: "MCP codeb-deploy를 통한 Blue-Green 배포"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Edit
  - Bash
  - Glob
  - mcp__codeb-deploy__scan
  - mcp__codeb-deploy__deploy_project
  - mcp__codeb-deploy__health_check
  - mcp__codeb-deploy__workflow_scan
  - mcp__codeb-deploy__env_scan
hooks:
  PreToolUse:
    - matcher: mcp__codeb-deploy__deploy_project
      hooks:
        - type: command
          command: "echo '[PRE-DEPLOY] Starting deployment validation...'"
  PostToolUse:
    - matcher: mcp__codeb-deploy__deploy_project
      hooks:
        - type: command
          command: "python3 .claude/hooks/post-deploy.py"
---

# /we:deploy - Blue-Green 프로젝트 배포

## 목적
MCP codeb-deploy 연동을 통해 staging, production, preview 환경에 프로젝트를 **자동으로** Blue-Green 배포합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- **사용자에게 묻지 말고 자동으로 진행** (critical 에러 제외)
- 환경 미지정 시 **staging**을 기본값으로 사용
- 코드 수정 시 임시 해결책 금지 → 근본 원인 파악 후 수정

## 자동 실행 플로우 (반드시 따를 것)

### Step 1: 프로젝트 스캔
```
mcp__codeb-deploy__scan 호출
- projectName: 현재 디렉토리명 또는 인자로 받은 프로젝트명
```

### Step 2: 스캔 결과 분석
- **critical/error 이슈**: 배포 중단, 문제점 보고
- **warning 이슈**: 로그에 기록하고 계속 진행
- **info 이슈**: 무시하고 진행

### Step 3: 배포 실행
```
mcp__codeb-deploy__deploy_project 호출
- projectName: 프로젝트명
- environment: 인자로 받은 값 또는 "staging" (기본값)
```

### Step 4: 배포 결과 확인
```
mcp__codeb-deploy__health_check 호출
- server: "app"
```

### Step 5: 결과 보고
배포 성공/실패 여부와 Preview URL을 사용자에게 보고

## 사용법
```
/we:deploy [프로젝트] [환경]
```

## 인자
- `프로젝트` - 배포할 프로젝트 이름 (선택, 기본값: 현재 디렉토리의 package.json name)
- `환경` - staging | production | preview (기본값: staging)

## 예제
```
/we:deploy                      # 현재 프로젝트를 staging에 배포
/we:deploy myapp                # myapp을 staging에 배포
/we:deploy myapp production     # myapp을 production에 배포
```

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__scan` - 프로젝트 스캔
- `mcp__codeb-deploy__deploy_project` - 배포 실행
- `mcp__codeb-deploy__health_check` - 서버 상태 확인

## 서버 정보
- **App 서버**: 158.247.203.55 (api.codeb.kr)
- **컨테이너 런타임**: Docker
- **오케스트레이션**: Docker Compose / GitHub Actions

## 관련 명령어
- `/we:promote` - Production 트래픽 전환
- `/we:rollback` - 이전 버전으로 롤백
- `/we:health` - 시스템 상태 확인
