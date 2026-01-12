---
name: codeb-init
description: "초기화", "init", "프로젝트 설정", "인프라 생성", "새 프로젝트" 등의 요청 시 자동 활성화. 서버 인프라를 초기화합니다.
---

# CodeB Init Skill

신규 프로젝트의 서버 인프라를 초기화하는 스킬입니다.

## 활성화 키워드
- 초기화, init, initialize
- 프로젝트 설정, project setup
- 인프라 생성, 서버 설정
- 새 프로젝트

## 사용 도구
- `mcp__codeb-deploy__workflow_init` - 서버 인프라 초기화
- `mcp__codeb-deploy__workflow_scan` - 기존 설정 스캔
- `mcp__codeb-deploy__health_check` - 시스템 상태 확인

## 초기화 절차

### 1단계: API 키 자동 감지 (중요!)

**Read 도구로 프로젝트 .env 파일 확인:**
```
Read: .env
→ CODEB_API_KEY=codeb_xxx 가 있으면 바로 2단계로!
→ 없으면 사용자에게 API 키 요청
```

### 2단계: 프로젝트 정보 확인
```
Read: package.json
→ name 필드에서 프로젝트명 추출
```

### 3단계: MCP 도구로 서버 인프라 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

## API 키 우선순위
1. **프로젝트 .env 파일** (최우선)
2. 환경변수 `CODEB_API_KEY`
3. `~/.codeb/config.json`
4. `~/.codeb/.env` (레거시)

## 생성되는 리소스
- Blue-Green 슬롯 (staging/production)
- Quadlet 컨테이너 파일
- 환경변수 파일 (.env.staging, .env.production)
- SSOT 레지스트리 등록

## 관련 스킬
- `codeb-deploy` - 프로젝트 배포
- `codeb-workflow` - CI/CD 워크플로우
- `codeb-health` - 시스템 상태 확인
