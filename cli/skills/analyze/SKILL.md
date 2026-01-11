---
name: codeb-analyze
description: "분석", "analyze", "코드 분석", "성능 분석", "보안 검사" 등의 요청 시 자동 활성화. 프로젝트를 분석합니다.
---

# CodeB Analyze Skill

프로젝트 코드, 성능, 보안을 분석하는 스킬입니다.

## 활성화 키워드
- 분석, analyze, analysis
- 코드 분석, code analysis
- 성능 분석, performance analysis
- 보안 검사, security audit
- 취약점 검사

## 분석 영역

### 1. 코드 품질 분석
- ESLint/TypeScript 오류
- 코드 복잡도
- 중복 코드

### 2. 성능 분석
- 번들 크기
- 렌더링 성능
- API 응답 시간

### 3. 보안 분석
- 의존성 취약점
- 환경변수 노출
- SQL 인젝션 위험

## 분석 절차

### 1단계: 프로젝트 스캔
```
mcp__codeb-deploy__scan { "projectName": "프로젝트명" }
```

### 2단계: 워크플로우 상태 확인
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
```

## 분석 결과 활용
- 문제점 자동 수정 제안
- CI/CD 파이프라인에 검사 추가
- 코드 리뷰 자동화

## 관련 스킬
- `codeb-deploy` - 분석 후 배포
- `codeb-health` - 시스템 상태 확인
