---
name: domain
description: "도메인 설정 및 SSL 인증서 관리"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Bash
  - mcp__codeb-deploy__domain_setup
  - mcp__codeb-deploy__domain_list
  - mcp__codeb-deploy__domain_delete
---

# /we:domain - 도메인 관리

## 목적
프로젝트의 도메인 설정 및 SSL 인증서를 관리합니다.

## 중요 규칙
- **모든 응답은 한글로 작성**
- 도메인 설정 시 자동으로 SSL 인증서 발급
- DNS 설정은 Cloudflare에서 관리

## 자동 실행 플로우

### 도메인 설정 (setup)
```
mcp__codeb-deploy__domain_setup 호출
- projectName: 프로젝트명
- domain: 도메인명
- environment: 환경 (기본값: production)
```

### 도메인 목록 (list)
```
mcp__codeb-deploy__domain_list 호출
- projectName: 프로젝트명 (선택)
```

### 도메인 삭제 (delete)
```
mcp__codeb-deploy__domain_delete 호출
- projectName: 프로젝트명
- domain: 도메인명
```

## 사용법
```
/we:domain setup <프로젝트> <도메인>
/we:domain list [프로젝트]
/we:domain delete <프로젝트> <도메인>
```

## 예제
```
/we:domain setup myapp myapp.codeb.kr     # 도메인 설정
/we:domain list myapp                      # myapp 도메인 목록
/we:domain list                            # 전체 도메인 목록
/we:domain delete myapp myapp.codeb.kr    # 도메인 삭제
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:health` - 시스템 상태 확인
