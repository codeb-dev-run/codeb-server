# Version Management Guide (v3.2.6+)

## Single Source of Truth

CodeB는 버전을 단일 파일에서 관리합니다.

```
codeb-server/
├── VERSION              # 단일 진실 소스 (SSOT)
├── cli/package.json     # VERSION 참조
├── api/package.json     # VERSION 참조
├── package.json         # VERSION 참조
├── cli/install.sh       # VERSION 참조
├── CLAUDE.md            # VERSION 참조
└── cli/rules/CLAUDE.md  # VERSION 참조
```

## 버전 업데이트 방법

### 1. sync-version.sh 사용 (권장)

```bash
# 버전 업데이트
./scripts/sync-version.sh 3.2.7

# 출력:
# Updated VERSION file to: 3.2.7
# Syncing all packages to version: 3.2.7
#   Updated: cli/package.json
#   Updated: api/package.json
#   Updated: package.json
#   Updated: cli/install.sh
#   Updated: CLAUDE.md
#   Synced: ~/.claude/CLAUDE.md
#   Synced: cli/rules/CLAUDE.md
```

### 2. 수동 업데이트 (비권장)

수동으로 VERSION 파일만 수정하면 다른 파일들이 동기화되지 않습니다.

```bash
# 절대 하지 마세요
echo "3.2.7" > VERSION  # ❌ 다른 파일 동기화 안됨
```

## sync-version.sh 동작

```bash
#!/bin/bash
# scripts/sync-version.sh

VERSION=$1

# 1. VERSION 파일 업데이트
echo "$VERSION" > VERSION

# 2. package.json 버전 업데이트
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" cli/package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" api/package.json
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

# 3. install.sh 배너 업데이트
sed -i "s/we-cli v[0-9]*\.[0-9]*\.[0-9]*/we-cli v$VERSION/" cli/install.sh

# 4. CLAUDE.md 버전 헤더 업데이트
sed -i "1s/v[0-9]*\.[0-9]*\.[0-9]*/v$VERSION/" CLAUDE.md

# 5. ~/.claude/CLAUDE.md 동기화
cp CLAUDE.md ~/.claude/CLAUDE.md

# 6. cli/rules/CLAUDE.md 동기화 (npm 패키지)
cp CLAUDE.md cli/rules/CLAUDE.md
```

## 배포 프로세스

버전 업데이트 후 배포 순서:

```bash
# 1. 버전 동기화
./scripts/sync-version.sh 3.2.7

# 2. CLI npm 배포
cd cli && npm publish --registry https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$(gh auth token)

# 3. API 서버 배포
cd ../api
scp mcp-http-api.js package.json root@158.247.203.55:/opt/codeb/mcp-api/
ssh root@158.247.203.55 'pkill -f "node.*mcp-http-api"; cd /opt/codeb/mcp-api && nohup node mcp-http-api.js > /var/log/codeb-api.log 2>&1 &'

# 4. Git 커밋 & 푸시
git add .
git commit -m "chore: bump version to 3.2.7"
git push origin main
```

## CLAUDE.md 배포

CLAUDE.md는 세 곳에 동기화됩니다:

| 위치 | 용도 |
|------|------|
| `CLAUDE.md` | 프로젝트 루트 (git) |
| `~/.claude/CLAUDE.md` | 글로벌 Claude 설정 |
| `cli/rules/CLAUDE.md` | npm 패키지 포함 |

### we update 명령어

타 프로젝트에서 CLAUDE.md를 최신 버전으로 업데이트:

```bash
# 현재 프로젝트 CLAUDE.md 업데이트
we update

# 특정 경로 프로젝트 업데이트
we update --path /path/to/project

# 강제 업데이트 (모든 파일)
we update --force

# 글로벌 CLAUDE.md만 스킵
we update --no-global
```

## 버전 규칙

### Semantic Versioning

```
MAJOR.MINOR.PATCH
  3   . 2  . 6

MAJOR: 호환성 깨지는 변경
MINOR: 새 기능 추가
PATCH: 버그 수정
```

### 예시

```
3.2.5 → 3.2.6  # 버그 수정, 권한 추가
3.2.6 → 3.3.0  # 새 기능 추가
3.3.0 → 4.0.0  # 호환성 깨지는 변경
```

## 금지 사항

- ❌ 개별 package.json 버전 직접 수정
- ❌ 하드코딩된 버전 문자열 사용
- ❌ VERSION 파일 없이 배포
- ❌ sync-version.sh 없이 수동 동기화

## 확인 방법

```bash
# 현재 버전 확인
cat VERSION

# 모든 파일 버전 일치 확인
grep -h '"version"' */package.json package.json | sort -u

# CLAUDE.md 버전 확인
head -1 CLAUDE.md
head -1 cli/rules/CLAUDE.md
```

## 관련 파일

- [scripts/sync-version.sh](../scripts/sync-version.sh)
- [VERSION](../VERSION)
- [CLAUDE.md](../CLAUDE.md)
