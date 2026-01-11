---
name: workflow
description: "Quadlet 및 GitHub Actions CI/CD 워크플로우 생성"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - mcp__codeb-deploy__workflow_init
  - mcp__codeb-deploy__workflow_scan
---

# /we:workflow - CI/CD 워크플로우

## 목적
프로젝트의 Quadlet 컨테이너 설정 및 GitHub Actions 워크플로우를 생성합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- 기존 설정이 있으면 백업 후 업데이트
- Quadlet + GitHub Actions 조합 사용

## 자동 실행 플로우

### 워크플로우 초기화 (init)
```
mcp__codeb-deploy__workflow_init 호출
- projectName: 프로젝트명
- type: nextjs | remix | nodejs | python | go (기본값: nextjs)
- database: true/false (기본값: true)
- redis: true/false (기본값: true)
```

### 워크플로우 스캔 (scan)
```
mcp__codeb-deploy__workflow_scan 호출
- projectName: 프로젝트명
```

## 생성 파일

### Quadlet 파일
- `{project}.container` - 컨테이너 정의
- `{project}.network` - 네트워크 설정
- `{project}.volume` - 볼륨 설정

### GitHub Actions
- `.github/workflows/deploy.yml` - CI/CD 파이프라인

## 사용법
```
/we:workflow init <프로젝트> [옵션]
/we:workflow scan <프로젝트>
```

## 옵션
- `--type` - 프로젝트 타입 (nextjs, remix, nodejs, python, go)
- `--no-database` - PostgreSQL 제외
- `--no-redis` - Redis 제외

## 예제
```
/we:workflow init myapp                    # 기본 설정 (Next.js + DB + Redis)
/we:workflow init myapp --type nodejs      # Node.js 프로젝트
/we:workflow init myapp --no-redis         # Redis 없이
/we:workflow scan myapp                    # 기존 설정 스캔
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:init` - 신규 프로젝트 초기화
