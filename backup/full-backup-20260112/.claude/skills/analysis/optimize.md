---
name: optimize
description: "프로젝트 성능 및 리소스 최적화"
agent: Plan
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
  - TodoWrite
---

# /we:optimize - 프로젝트 최적화

## 목적
프로젝트의 성능, 번들 크기, 리소스 사용량을 최적화합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- 변경 전 항상 백업 확인
- 단계별로 진행하며 테스트 검증

## 최적화 영역

### 번들 최적화
- Tree-shaking 개선
- 코드 스플리팅
- 미사용 의존성 제거

### 성능 최적화
- 렌더링 최적화
- 메모이제이션 적용
- 이미지 최적화

### 코드 최적화
- 중복 코드 통합
- 복잡도 감소
- 타입 개선

### 의존성 최적화
- 중복 패키지 제거
- 버전 통일
- 불필요한 의존성 제거

## 사용법
```
/we:optimize [타입]
```

## 최적화 타입
- `all` (기본값) - 전체 최적화
- `bundle` - 번들만
- `performance` - 성능만
- `code` - 코드만
- `deps` - 의존성만

## 예제
```
/we:optimize             # 전체 최적화
/we:optimize bundle      # 번들 최적화
/we:optimize deps        # 의존성 정리
```

## 관련 명령어
- `/we:analyze` - 분석 먼저 실행
- `/cb-cleanup` - 중복 정리
