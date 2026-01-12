# 팀원용 CodeB 설정 가이드

> **버전: 6.0.5** | 업데이트: 2026-01-11

## 개요

이 문서는 CodeB 배포 시스템을 사용하기 위한 팀원 설정 가이드입니다.

---

## 1. API Key 설정

### 1.1 API Key 받기

Admin으로부터 개인 API Key를 받으세요:

```
형식: codeb_{teamId}_{role}_{token}
예시: codeb_codeb_member_9d7660fec3656818d677db2292b35a47
```

### 1.2 환경 변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export CODEB_API_KEY="codeb_codeb_member_여기에_본인_토큰"

# 적용
source ~/.zshrc  # 또는 source ~/.bashrc

# 확인
echo $CODEB_API_KEY
```

### 1.3 연결 테스트

```bash
# API 연결 확인
curl -X GET https://api.codeb.kr/health

# API Key 권한 확인
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: $CODEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool": "slot_status", "params": {"projectName": "worb"}}'
```

---

## 2. CLI 설치 (we CLI)

### 2.1 GitHub Package Registry 설정

```bash
# ~/.npmrc 파일 생성/수정
echo "@codeblabdev-max:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

> GitHub Token은 Admin으로부터 받거나 본인 계정에서 생성 (read:packages 권한 필요)

### 2.2 CLI 설치

```bash
# 글로벌 설치
npm install -g @codeblabdev-max/we-cli

# 버전 확인
we --version  # 6.0.5
```

### 2.3 CLI 로그인

```bash
# API Key 설정 확인
we whoami

# 또는 직접 로그인
we login
# → API Key 입력 프롬프트
```

---

## 3. 프로젝트 연결

### 3.1 기존 프로젝트

```bash
cd my-project

# 프로젝트 연결
we link

# 상태 확인
we slot status
```

### 3.2 새 프로젝트 초기화

```bash
# 프로젝트 초기화 (DB + Redis 포함)
we init myapp --type nextjs --database --redis
```

---

## 4. 기본 배포 명령어

### 4.1 배포 (Deploy)

```bash
# Staging 배포 (기본)
we deploy myapp

# Production 배포
we deploy myapp --environment production

# 특정 이미지 배포
we deploy myapp --image ghcr.io/org/myapp:v1.0.0
```

배포 결과:
- Preview URL 반환: `https://myapp-green.preview.codeb.kr`
- 테스트 후 Promote 필요

### 4.2 트래픽 전환 (Promote)

```bash
# Preview에서 테스트 완료 후
we promote myapp

# Production
we promote myapp --environment production
```

### 4.3 롤백 (Rollback)

```bash
# 문제 발생 시 즉시 롤백
we rollback myapp
```

### 4.4 상태 확인

```bash
# Slot 상태
we slot status myapp

# 시스템 상태
we health

# ENV 비교 (로컬 vs 서버)
we env scan myapp
```

---

## 5. 역할별 권한

| 권한 | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| 배포 (deploy) | ✅ | ✅ | ✅ | ❌ |
| 트래픽 전환 (promote) | ✅ | ✅ | ✅ | ❌ |
| 롤백 (rollback) | ✅ | ✅ | ✅ | ❌ |
| ENV 설정 | ✅ | ✅ | ✅ | ❌ |
| 상태 조회 | ✅ | ✅ | ✅ | ✅ |
| 슬롯 정리 | ✅ | ✅ | ❌ | ❌ |
| 멤버 관리 | ✅ | ✅ | ❌ | ❌ |
| 팀 삭제 | ✅ | ❌ | ❌ | ❌ |

> 대부분의 팀원은 **member** 역할입니다.

---

## 6. GitHub Actions 연동

### 6.1 Repository Secrets 설정

GitHub Repository → Settings → Secrets and variables → Actions에서:

| Secret | 값 | 설명 |
|--------|-----|------|
| `CODEB_API_KEY` | `codeb_codeb_member_xxx` | 배포용 API Key |
| `GHCR_PAT` | GitHub Token | Container Registry 접근용 |

### 6.2 기본 Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted  # CodeB Self-hosted Runner 사용
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        run: |
          echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build and Push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "staging",
                "version": "${{ github.sha }}",
                "image": "ghcr.io/${{ github.repository }}:${{ github.sha }}"
              }
            }'
```

---

## 7. 자주 사용하는 명령어

```bash
# 배포 흐름
we deploy myapp              # 배포 → Preview URL
we promote myapp             # 트래픽 전환
we rollback myapp            # 문제 시 롤백

# 상태 확인
we slot status myapp         # Slot 상태
we health                    # 시스템 상태
we logs myapp                # 로그 확인

# ENV 관리
we env scan myapp            # 로컬/서버 ENV 비교
we env restore myapp         # master.env에서 복구
we env restore myapp --version current  # 최신 백업에서 복구

# 도메인
we domain list myapp         # 도메인 목록
we domain setup myapp --domain app.example.com  # 커스텀 도메인
```

---

## 8. 문제 해결

### API Key 오류

```
Error: Invalid or missing API Key
```

**해결:**
1. `echo $CODEB_API_KEY`로 환경변수 확인
2. API Key 형식 확인: `codeb_{teamId}_{role}_{token}`
3. Admin에게 새 Key 요청

### 권한 오류

```
Error: Permission denied: viewer cannot use deploy
```

**해결:**
1. 역할 확인 (member 이상 필요)
2. Admin에게 역할 변경 요청

### 연결 오류

```
Error: Connection refused
```

**해결:**
1. `we health`로 서버 상태 확인
2. VPN 연결 확인 (필요시)
3. Admin에게 문의

---

## 9. 보안 주의사항

1. **API Key는 절대 Git에 커밋하지 마세요**
   - `.env` 파일은 반드시 `.gitignore`에 포함

2. **API Key는 본인만 사용하세요**
   - 공유 금지

3. **유출 시 즉시 Admin에게 보고하세요**
   - 기존 Key 폐기 후 새 Key 발급

4. **SSH 직접 접속 금지**
   - 서버 접속은 CLI/API로만 가능
   - SSH는 Admin 전용

---

## 10. 버전 확인

```bash
# CLI 버전
we --version  # 6.0.5

# 서버 버전
curl -sf https://api.codeb.kr/health | jq '.version'  # 6.0.5

# 로컬 VERSION 파일
cat v6.0/VERSION  # 6.0.5

# 버전 불일치 시
git pull origin main  # 최신 코드 가져오기
npm install -g @codeblabdev-max/we-cli  # CLI 업데이트
```

---

## 관련 문서

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [API-PERMISSIONS.md](./API-PERMISSIONS.md) - 권한 상세
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드

---

*문의: Admin 또는 #codeb-support 채널*
