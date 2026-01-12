---
allowed-tools: [Read, Write, Bash, TodoWrite, mcp__codeb-deploy__domain_setup, mcp__codeb-deploy__domain_list, mcp__codeb-deploy__scan]
description: "MCP codeb-deploy를 통한 도메인 관리 (설정/삭제/확인/목록)"
---

# /we:domain - 도메인 관리

## 🎯 목적
MCP codeb-deploy를 통해 DNS 설정, SSL 인증서, Caddy 리버스 프록시 설정을 포함한 도메인을 **자동으로** 관리합니다.

## 📌 중요 규칙
- **모든 응답은 한글로 작성**
- **사용자에게 묻지 말고 자동으로 진행** (삭제 제외)
- SSL은 기본적으로 활성화

## ⚡ 자동 실행 플로우 (반드시 따를 것)

### setup 액션
```
mcp__codeb-deploy__domain_setup 호출
- domain: 도메인명
- projectName: 프로젝트명
- ssl: true (기본값)
```

### list 액션
```
mcp__codeb-deploy__domain_list 호출
```

### check 액션
```
mcp__codeb-deploy__scan 호출
- projectName: 프로젝트명 (도메인에서 추출)
```

## 사용법
```
/we:domain [액션] [도메인] [프로젝트]
```

## 액션
- `setup` - DNS 및 SSL로 새 도메인 설정 (기본값)
- `list` - 설정된 모든 도메인 목록
- `check` - 도메인 상태 확인

## 도메인 구조
```
기본 도메인: codeb.kr
서브도메인 형식:
  - myapp.codeb.kr (production)
  - myapp-staging.codeb.kr (staging)
```

## MCP 도구 (정확한 이름)
- `mcp__codeb-deploy__domain_setup` - 도메인 설정
- `mcp__codeb-deploy__domain_list` - 도메인 목록
- `mcp__codeb-deploy__scan` - 상태 확인

## 예제
```
/we:domain setup myapp.codeb.kr myapp     # 도메인 설정
/we:domain list                           # 도메인 목록
/we:domain check myapp                    # 상태 확인
```

## 관련 명령어
- `/we:deploy` - 프로젝트 배포
- `/we:workflow` - CI/CD 생성
