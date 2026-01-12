---
name: codeb-domain
description: "도메인", "domain", "DNS", "SSL", "인증서", "커스텀 도메인", "HTTPS" 등의 요청 시 자동 활성화. 도메인 설정 및 SSL 인증서를 관리합니다.
---

# CodeB Domain Skill

도메인 설정 및 SSL 인증서 관리 스킬입니다.

## 활성화 키워드
- 도메인, domain
- DNS 설정, DNS setup
- SSL, 인증서, certificate
- HTTPS 설정
- 커스텀 도메인, custom domain
- 도메인 연결

## 사용 도구
- `mcp__codeb-deploy__domain_setup` - 도메인 설정
- `mcp__codeb-deploy__domain_list` - 도메인 목록
- `mcp__codeb-deploy__domain_delete` - 도메인 삭제

## 도메인 설정 절차

### 1단계: 현재 도메인 목록 확인
```
mcp__codeb-deploy__domain_list { "projectName": "프로젝트명" }
```

### 2단계: 도메인 설정
```
mcp__codeb-deploy__domain_setup {
  "projectName": "프로젝트명",
  "domain": "myapp.codeb.kr",
  "environment": "production"
}
```

### 3단계: DNS 레코드 설정
외부 도메인인 경우:
- A 레코드: `158.247.203.55` (App 서버)
- 또는 CNAME: `app.codeb.kr`

### 4단계: SSL 인증서 자동 발급
Let's Encrypt 인증서가 자동으로 발급됩니다.

## 지원 도메인 형식
- `*.codeb.kr` - 서브도메인 (자동 DNS)
- `*.codeb.dev` - 개발용 (자동 DNS)
- 커스텀 도메인 - 수동 DNS 설정 필요

## 환경별 도메인 패턴
- Production: `myapp.codeb.kr`
- Staging: `myapp-staging.codeb.kr`
- Preview: `myapp-{branch}.preview.codeb.kr`

## 도메인 삭제
```
mcp__codeb-deploy__domain_delete {
  "projectName": "프로젝트명",
  "domain": "old-domain.codeb.kr"
}
```

## 트러블슈팅
- SSL 발급 실패: DNS 전파 대기 (최대 24시간)
- 연결 안됨: A 레코드 확인
- 혼합 컨텐츠: HTTPS 리다이렉트 확인

## 관련 스킬
- `codeb-deploy` - 도메인 설정 후 배포
- `codeb-workflow` - CI/CD에 도메인 포함
