---
name: analyze
description: "7-Agent 시스템으로 프로젝트 분석"
agent: Plan
context: fork
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - TodoWrite
---

# /we:analyze - 프로젝트 분석

## 목적
7-Agent 시스템을 활용하여 프로젝트를 종합적으로 분석합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- Task tool을 사용하여 전문 에이전트 호출
- 분석 결과를 구조화된 리포트로 제공

## 7-Agent 시스템

### 사용 가능한 에이전트
1. **master-orchestrator** - 전체 작업 조율
2. **frontend-specialist** - 프론트엔드 분석
3. **api-contract-guardian** - API 설계 분석
4. **db-schema-architect** - 데이터베이스 분석
5. **admin-panel-builder** - 관리자 패널 분석
6. **e2e-test-strategist** - E2E 테스트 분석
7. **Explore** - 코드베이스 탐색

## 분석 항목

### 코드 품질
- 중복 코드 탐지
- 복잡도 분석
- 미사용 코드 식별

### 성능
- 번들 크기 분석
- 의존성 분석
- 최적화 기회 식별

### 보안
- 취약점 스캔
- 민감 정보 노출 검사
- 권한 검증

### 아키텍처
- 구조 분석
- 패턴 식별
- 개선 제안

## 사용법
```
/we:analyze [분석타입]
```

## 분석 타입
- `all` (기본값) - 전체 분석
- `code` - 코드 품질만
- `performance` - 성능만
- `security` - 보안만
- `architecture` - 아키텍처만

## 예제
```
/we:analyze              # 전체 분석
/we:analyze code         # 코드 품질 분석
/we:analyze security     # 보안 분석
```

## 관련 명령어
- `/we:optimize` - 분석 결과 기반 최적화
- `/codeb-delegate` - 작업 위임
