---
name: codeb-workflow
description: "워크플로우", "workflow", "CI/CD", "GitHub Actions", "Quadlet" 등의 요청 시 자동 활성화. CI/CD 파이프라인을 생성합니다.
---

# CodeB Workflow Skill

CI/CD 워크플로우와 Quadlet 컨테이너를 생성하는 스킬입니다.

## 활성화 키워드
- 워크플로우, workflow
- CI/CD, cicd, 파이프라인
- GitHub Actions, 깃헙 액션
- Quadlet, 쿼드렛
- 자동 배포, auto deploy

## 사용 도구
- `mcp__codeb-deploy__workflow_init` - 워크플로우 초기화
- `mcp__codeb-deploy__workflow_scan` - 기존 설정 스캔

## 워크플로우 생성 절차

### 1단계: 기존 설정 스캔
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
```

### 2단계: 워크플로우 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

## 생성되는 파일
- `.github/workflows/deploy.yml` - GitHub Actions 워크플로우
- `docker-compose.yml` - Docker Compose 파일
- `.env.staging`, `.env.production` - 환경변수 파일

## 관련 스킬
- `codeb-init` - 프로젝트 초기화
- `codeb-deploy` - 프로젝트 배포
