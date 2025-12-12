# CLI vs 실제 배포 분석 리포트

## 개요

WorkB CMS Production 배포 로그와 CLI 로직을 비교 분석한 결과입니다.

---

## 핵심 문제점 요약

| 구분 | CLI 가정 | 서버 현실 | 영향도 |
|------|----------|-----------|--------|
| Podman 버전 | Quadlet 지원 (4.4+) | **Podman 3.4.4** (Quadlet 미지원) | 🔴 Critical |
| MCP 클라이언트 | 실제 MCP 서버 호출 | **Mock 데이터 반환** | 🔴 Critical |
| systemd 서비스 | Quadlet → 자동 생성 | **서비스 미생성** | 🔴 Critical |
| 네트워크 | codeb-network DNS | **CNI 설정 오류** | 🟡 Major |
| 사용자 권한 | root 실행 | **linuxuser (sudo 필요)** | 🟡 Major |

---

## 상세 분석

### 1. Quadlet 지원 문제 🔴

**CLI 코드** (`workflow.js:20-98`):
```javascript
function generateQuadletTemplate(config) {
  // Quadlet .container 파일 생성
  // systemd가 자동으로 서비스로 변환할 것으로 기대
  return `[Container]
Image=${image}
...
[Service]
Restart=always
`;
}
```

**실제 배포 로그**:
```bash
# 서버 Podman 버전
$ podman --version
podman version 3.4.4

# Quadlet 서비스 확인 시도 - 실패
$ systemctl status workb-cms.service
Unit workb-cms.service not found

# /run/systemd/generator/ 비어있음 - Quadlet 미동작
$ ls /run/systemd/generator/
(empty)
```

**원인**:
- Quadlet은 **Podman 4.4+** 필요
- 서버는 **Podman 3.4.4** 사용
- systemd generator가 .container 파일을 서비스로 변환하지 못함

**해결 방안**:
1. Podman 업그레이드 (권장: 4.4+)
2. 또는 CLI가 `podman run` 스크립트 생성하도록 수정

---

### 2. MCP 클라이언트 Mock 데이터 🔴

**CLI 코드** (`mcp-client.js:43-55`):
```javascript
async deployComposeProject(params) {
  await this.initialize();

  // ⚠️ 실제 MCP 호출 없이 Mock 데이터 반환!
  return {
    success: true,
    project: params.projectName,
    version: 'v1.0.0',
    containers: 3,
    url: `https://${params.projectName}.codeb.io`,
    duration: 45
  };
}
```

**문제점**:
- `we deploy` 명령이 실제로 배포하지 않음
- 항상 성공으로 보고
- Claude Code의 MCP 서버와 연동 필요

**해결 방안**:
1. Claude Code 환경에서는 MCP 도구 직접 사용
2. CLI 단독 실행 시 SSH를 통한 실제 배포 구현

---

### 3. GitHub Actions 배포 단계 문제 🟡

**CLI 생성 워크플로우** (`workflow.js:456-477`):
```yaml
- name: Update Quadlet image reference
  run: |
    QUADLET_FILE="/etc/containers/systemd/${CONTAINER_NAME}.container"
    sed -i "s|^Image=.*|Image=...|" "$QUADLET_FILE"

- name: Restart service via systemd/Quadlet
  run: |
    systemctl daemon-reload
    systemctl stop ${CONTAINER_NAME}.service  # ❌ 서비스 없음
    systemctl start ${CONTAINER_NAME}.service # ❌ 실패
```

**실제 성공한 배포 방법**:
```bash
# 직접 podman run 사용
$ podman run -d \
  --name workb-cms \
  --network bridge \
  -p 3020:3000 \
  -e DATABASE_URL="..." \
  -e NODE_ENV=production \
  ghcr.io/codeblabdev-max/workb-cms:latest
```

---

### 4. 네트워크 DNS 문제 🟡

**CLI 가정** (`workflow.js:134`):
```javascript
// DNS 기반 컨테이너 통신 가정
appEnvVars.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@${containerPrefix}-postgres:5432/${dbNameFinal}`;
```

**실제 배포 로그**:
```bash
# CNI 네트워크 오류
WARN[0000] Error validating CNI config file workb-network.conflist

# podman network create 실패
Error: network name "workb-network" already exists

# DNS 해결 불가 - IP 직접 사용 필요
```

**해결 방안**:
1. 컨테이너 IP 직접 조회 후 DATABASE_URL 설정
2. 또는 호스트 네트워크 사용 (`--network host`)

---

### 5. 사용자 권한 문제 🟡

**실제 배포 로그**:
```bash
# GitHub Actions는 linuxuser로 실행
$ whoami
linuxuser

# sudo 권한 없음
$ sudo podman ps
linuxuser is not in the sudoers file

# 권한 추가 필요
$ echo 'linuxuser ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/linuxuser
```

**CLI 가정**:
- root 권한으로 실행
- `/etc/containers/systemd/`에 쓰기 가능

---

## CLI 수정 권장사항

### Phase 1: 즉시 수정 필요

1. **Podman 버전 감지 추가**
```javascript
// workflow.js에 추가
async function detectPodmanVersion(serverHost, serverUser) {
  const version = execSync(`ssh ${serverUser}@${serverHost} "podman --version" 2>/dev/null`);
  const match = version.match(/podman version (\d+)\.(\d+)/);
  return { major: parseInt(match[1]), minor: parseInt(match[2]) };
}

// Quadlet 대신 podman run 스크립트 생성 옵션
if (podmanVersion.major < 4 || (podmanVersion.major === 4 && podmanVersion.minor < 4)) {
  generatePodmanRunScript(config);  // Quadlet 대신 스크립트 생성
}
```

2. **MCP 클라이언트 실제 구현**
```javascript
// mcp-client.js 수정
async deployComposeProject(params) {
  // SSH를 통한 실제 배포 구현
  const { execSync } = await import('child_process');

  // 1. 이미지 pull
  execSync(`ssh ${this.serverUser}@${this.serverHost} "podman pull ${params.image}"`);

  // 2. 기존 컨테이너 정리
  execSync(`ssh ${this.serverUser}@${this.serverHost} "podman rm -f ${params.projectName} 2>/dev/null || true"`);

  // 3. 새 컨테이너 실행
  const runCmd = buildPodmanRunCommand(params);
  execSync(`ssh ${this.serverUser}@${this.serverHost} "${runCmd}"`);

  return { success: true, ... };
}
```

### Phase 2: GitHub Actions 워크플로우 수정

**현재** (`workflow.js:467-477`):
```yaml
- name: Restart service via systemd/Quadlet
  run: |
    systemctl daemon-reload
    systemctl start ${CONTAINER_NAME}.service
```

**수정 권장**:
```yaml
- name: Deploy container (Podman 3.x compatible)
  run: |
    # Quadlet 시도, 실패시 직접 podman run
    if systemctl start ${CONTAINER_NAME}.service 2>/dev/null; then
      echo "Deployed via Quadlet"
    else
      echo "Quadlet unavailable, using direct podman run"
      podman rm -f ${CONTAINER_NAME} 2>/dev/null || true
      podman run -d \
        --name ${CONTAINER_NAME} \
        --network bridge \
        -p ${PORT}:3000 \
        --env-file /opt/codeb/envs/${CONTAINER_NAME}.env \
        ${IMAGE}
    fi
```

### Phase 3: 네트워크 전략 개선

```javascript
// workflow.js에 네트워크 감지 로직 추가
function getNetworkStrategy(serverInfo) {
  if (serverInfo.podmanVersion.major >= 4) {
    return 'codeb-network';  // DNS 지원
  } else {
    return 'bridge';  // IP 직접 사용 필요
  }
}

// DATABASE_URL 생성시 IP 또는 DNS 사용
function getDatabaseUrl(serverInfo, config) {
  if (serverInfo.networkStrategy === 'bridge') {
    // 컨테이너 IP 조회 필요
    const postgresIp = getContainerIp(`${config.projectName}-postgres`);
    return `postgresql://...@${postgresIp}:5432/...`;
  } else {
    // DNS 이름 사용
    return `postgresql://...@${config.projectName}-postgres:5432/...`;
  }
}
```

---

## 배포 성공 케이스 (WorkB CMS)

최종 성공한 배포 명령:

```bash
# 1. 이미지 pull
podman pull ghcr.io/codeblabdev-max/workb-cms:latest

# 2. 기존 컨테이너 제거
podman rm -f workb-cms

# 3. 새 컨테이너 실행 (Quadlet 없이)
podman run -d \
  --name workb-cms \
  --network bridge \
  -p 3020:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@10.88.0.5:5432/workb_cms?schema=public" \
  -e DIRECT_URL="postgresql://postgres:postgres@10.88.0.5:5432/workb_cms?schema=public" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  --restart always \
  ghcr.io/codeblabdev-max/workb-cms:latest

# 4. 헬스체크
curl -sf http://localhost:3020/api/health
# {"status":"healthy","timestamp":"..."}
```

---

## 결론

| 우선순위 | 항목 | 작업 |
|----------|------|------|
| 1 | Podman 버전 감지 | `workflow.js`에 버전 체크 추가 |
| 2 | Fallback 배포 | Quadlet 실패시 `podman run` 사용 |
| 3 | MCP 실제 구현 | `mcp-client.js` SSH 배포 구현 |
| 4 | 네트워크 전략 | bridge 네트워크 + IP 직접 사용 |
| 5 | 권한 처리 | linuxuser sudo 설정 자동화 |

**핵심**: CLI가 **Podman 4.4+ Quadlet**을 전제로 설계되었으나, 서버는 **Podman 3.4.4**로 Quadlet 미지원. 직접 `podman run` 방식으로 fallback 필요.
