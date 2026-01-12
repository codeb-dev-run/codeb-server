# Version Management Guide

> **버전: 6.0.5** | 업데이트: 2026-01-11

## Single Source of Truth

CodeB v6.0은 **서버의 VERSION 파일**을 단일 진실 소스로 사용합니다.

```
codeb-server/
├── v6.0/VERSION         # 단일 진실 소스 (SSOT) - 현재: 6.0.5
├── api/package.json     # VERSION에서 동기화
├── cli/package.json     # VERSION에서 동기화
├── web-ui/package.json  # VERSION에서 동기화
└── CLAUDE.md            # VERSION 참조
```

## 버전 관리 원칙

### 1. 서버가 항상 버전 기준

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB 버전 관리 원칙                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. v6.0/VERSION 파일이 단일 진실 소스                           │
│     └─→ 모든 package.json은 VERSION에서 동기화                   │
│                                                                 │
│  2. 버전 업데이트 절차                                           │
│     └─→ v6.0/VERSION 파일 수정                                  │
│     └─→ 커밋 & 푸시 → GitHub Actions 자동 배포                  │
│     └─→ 서버가 새 버전으로 업데이트됨                            │
│                                                                 │
│  3. 로컬 개발 전 버전 체크                                       │
│     └─→ npm run dev 실행 시 서버 버전 확인 권장                  │
│     └─→ 버전 불일치 시 git pull 필요                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 버전 확인 방법

```bash
# 서버 버전 확인
curl -sf https://api.codeb.kr/health | jq '.version'

# 로컬 버전 확인
cat v6.0/VERSION

# 패키지 버전 확인
grep '"version"' api/package.json cli/package.json web-ui/package.json
```

## 버전 업데이트 방법

### 1. VERSION 파일 수정

```bash
# 버전 업데이트
echo "6.0.6" > v6.0/VERSION
```

### 2. package.json 동기화

```bash
# 수동 동기화 (선택)
NEW_VERSION=$(cat v6.0/VERSION)
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" api/package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" cli/package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" web-ui/package.json
```

### 3. 커밋 & 푸시

```bash
git add v6.0/VERSION api/package.json cli/package.json web-ui/package.json
git commit -m "chore: bump version to 6.0.6"
git push origin main
```

### 4. GitHub Actions 자동 배포

푸시 후 GitHub Actions가 자동으로:
- Docker 이미지 빌드
- Self-hosted runner에서 배포
- MCP API 서버 업데이트

## Semantic Versioning

```
MAJOR.MINOR.PATCH
  6   . 0  . 5

MAJOR (6): 호환성 깨지는 변경 (v5 → v6)
MINOR (0): 새 기능 추가
PATCH (5): 버그 수정, 문서 업데이트
```

### 버전 변경 예시

```
6.0.4 → 6.0.5  # 버그 수정, 레지스트리 동기화
6.0.5 → 6.1.0  # 새 기능 추가 (Edge Functions 개선)
6.1.0 → 7.0.0  # 호환성 깨지는 변경
```

## 금지 사항

- ❌ 개별 package.json 버전만 직접 수정 (VERSION과 불일치)
- ❌ 하드코딩된 버전 문자열 사용
- ❌ VERSION 파일 없이 배포
- ❌ 서버 버전과 로컬 버전 불일치 상태로 개발

## v6.0 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 6.0.5 | 2026-01-11 | 버전 통일, 레지스트리 동기화, 프로젝트 정리, 문서 업데이트 |
| 6.0.4 | 2026-01-10 | Self-hosted runner 설정, CODEB_DB_* env vars |
| 6.0.3 | 2026-01-09 | Container 배포 방식 전환 |
| 6.0.2 | 2026-01-08 | MCP API 서버 개선 |
| 6.0.1 | 2026-01-07 | 인프라 문서화 |
| 6.0.0 | 2026-01-06 | v6.0 초기 릴리즈 (Team-based auth, Edge Functions, Analytics) |

## 관련 파일

- [v6.0/VERSION](../v6.0/VERSION) - 단일 진실 소스
- [CLAUDE.md](../CLAUDE.md) - 프로젝트 규칙
- [api/package.json](../api/package.json) - API 패키지
- [cli/package.json](../cli/package.json) - CLI 패키지
- [web-ui/package.json](../web-ui/package.json) - Web UI 패키지
