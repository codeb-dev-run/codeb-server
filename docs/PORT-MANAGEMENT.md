# CodeB v7.0 - 포트 관리 로직 문서

## 현재 구현 상태

### 1. 포트 범위 정의 (servers.ts)

```typescript
export const PORT_RANGES = {
  staging: {
    app: { start: 3000, end: 3499 },
    db: { start: 5432, end: 5449 },
    redis: { start: 6379, end: 6399 },
  },
  production: {
    app: { start: 4000, end: 4499 },
    db: { start: 5450, end: 5469 },
    redis: { start: 6400, end: 6419 },
  },
  preview: {
    app: { start: 5000, end: 5999 },
  },
};
```

### 2. 포트 할당 로직 (deploy.ts - allocateBasePort)

```typescript
async function allocateBasePort(
  ssh: ReturnType<typeof getSSHClient>,
  environment: Environment,
  _projectName: string
): Promise<number> {
  const ranges: Record<Environment, { start: number; end: number }> = {
    staging: { start: 3000, end: 3499 },
    production: { start: 4000, end: 4499 },
    preview: { start: 5000, end: 5999 },
  };

  const range = ranges[environment];

  // 1. SSOT에서 등록된 포트 읽기
  const ssotPath = '/opt/codeb/registry/ssot.json';
  const ssotResult = await ssh.exec(`cat ${ssotPath} 2>/dev/null || echo "{}"`);
  const registeredPorts = new Set(ssot.ports?.used || []);

  // 2. 실행 중인 컨테이너 포트 확인 (podman)
  const portsResult = await ssh.exec(
    `podman ps --format '{{.Ports}}' | grep -oE '[0-9]+->3000' | cut -d'-' -f1`
  );
  const runningPorts = new Set(...);

  // 3. 실제 리스닝 포트 확인 (ss)
  const listeningResult = await ssh.exec(
    `ss -tlnp | awk '{print $4}' | grep -oE ':([0-9]+)$' | cut -d':' -f2`
  );
  const listeningPorts = new Set(...);

  // 4. 모든 사용 중인 포트 합치기
  const usedPorts = new Set([...registeredPorts, ...runningPorts, ...listeningPorts]);

  // 5. 다음 사용 가능한 짝수 포트 찾기 (blue=짝수, green=홀수)
  for (let port = range.start; port <= range.end; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      // SSOT에 예약
      await ssh.writeFile(ssotPath, JSON.stringify(updatedSsot, null, 2));
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range`);
}
```

### 3. 슬롯 레지스트리 (slot.ts)

```
위치: /opt/codeb/registry/slots/{project}-{environment}.json

내용:
{
  "projectName": "vsvs-kr",
  "environment": "production",
  "activeSlot": "blue",
  "blue": {
    "name": "blue",
    "state": "deployed|active|grace|empty",
    "port": 4102,
    "version": "1.0.0-abc1234",
    "deployedAt": "2026-01-13T...",
    "deployedBy": "codeb_team1_admin_xxx"
  },
  "green": { ... },
  "lastUpdated": "..."
}
```

---

## 문제점 분석

### 문제 1: SSOT와 실제 상태 불일치

```
현재 상황:
- SSOT: /opt/codeb/registry/ssot.json (포트 등록)
- 실제: docker ps / podman ps (런타임 상태)
- 불일치 가능성 높음
```

### 문제 2: 개별 프로젝트 포트 관리

```
현재:
각 프로젝트/.codeb/ports.json  ← 로컬 파일 (수동 관리)
    ↓
GitHub Actions에서 하드코딩
    ↓
서버에서 충돌

문제:
- vsvs-kr: ports.json에 4100/4101 할당
- worb: 이미 4100 사용 중
- 충돌 발생!
```

### 문제 3: MCP API vs GitHub Actions 동기화

```
MCP API (deploy.ts):
- allocateBasePort() 호출
- SSOT 확인 + 런타임 확인
- 자동 포트 할당

GitHub Actions (deploy.yml):
- env: BLUE_PORT: 4100 (하드코딩)
- MCP API 거치지 않음
- SSOT 무시
```

---

## 해결 방안

### 방안 1: 중앙 포트 레지스트리 (권장)

```
서버: /opt/codeb/registry/ports.json  ← SSOT

{
  "lastUpdated": "2026-01-13T...",
  "projects": {
    "worb": {
      "production": { "blue": 4100, "green": 4101 }
    },
    "w-homepage": {
      "production": { "blue": 4102, "green": 4103 }  // 수정 필요
    },
    "vsvs-kr": {
      "production": { "blue": 4104, "green": 4105 }
    }
  },
  "allocated": [4100, 4101, 4102, 4103, 4104, 4105]
}
```

### 방안 2: MCP API 포트 관리 도구 추가

```typescript
// 새로운 도구 필요
port_register   - 프로젝트 포트 등록
port_allocate   - 자동 포트 할당
port_check      - 포트 사용 가능 여부
port_list       - 전체 포트 현황
port_release    - 포트 해제
port_sync       - 런타임과 SSOT 동기화
```

### 방안 3: GitHub Actions 연동

```yaml
# deploy.yml
- name: Get allocated ports from MCP API
  run: |
    PORTS=$(curl -s https://api.codeb.kr/api/port/get \
      -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
      -d '{"project": "vsvs-kr", "environment": "production"}')

    echo "BLUE_PORT=$(echo $PORTS | jq -r '.blue')" >> $GITHUB_ENV
    echo "GREEN_PORT=$(echo $PORTS | jq -r '.green')" >> $GITHUB_ENV
```

### 방안 4: 워크플로우 MCP 통합

```yaml
# 배포 전 포트 할당 받기
- name: Allocate ports via MCP
  id: ports
  run: |
    # MCP API 호출해서 포트 할당
    RESULT=$(curl -X POST https://api.codeb.kr/api/port/allocate ...)

    if [ "$(echo $RESULT | jq -r '.success')" != "true" ]; then
      echo "❌ Port allocation failed: $(echo $RESULT | jq -r '.error')"
      exit 1
    fi

    echo "blue_port=$(echo $RESULT | jq -r '.blue')" >> $GITHUB_OUTPUT
    echo "green_port=$(echo $RESULT | jq -r '.green')" >> $GITHUB_OUTPUT
```

---

## 현재 서버 포트 사용 현황

### App Server (158.247.203.55)

| 포트 | 컨테이너 | 프로젝트 | 환경 |
|------|----------|----------|------|
| 3001 | monitoring-grafana | monitoring | - |
| 4100 | worb-docker-blue | worb | production |
| 4101 | w-homepage-docker | w-homepage | production |
| 5432 | videopick-postgres | videopick | - |
| 5450 | da-rak-postgres | da-rak | - |
| 6379 | videopick-redis | videopick | - |
| 6400 | da-rak-redis | da-rak | - |
| 8000 | videopick-centrifugo | videopick | - |
| 8080 | monitoring-cadvisor | monitoring | - |
| 9090 | monitoring-prometheus | monitoring | - |
| 9100 | monitoring-node-exporter | monitoring | - |
| 9121 | monitoring-redis-exporter | monitoring | - |
| 9187 | monitoring-postgres-exporter | monitoring | - |

### Storage Server (64.176.226.119)

| 포트 | 서비스 | 프로젝트 |
|------|--------|----------|
| 5432 | PostgreSQL (default) | 공용 |
| 5433 | PostgreSQL | vsvs-kr |
| 6379 | Redis (default) | 공용 |
| 6380 | Redis | vsvs-kr |

---

## 권장 포트 할당 (수정 후)

### Production App (4000-4499)

| 포트 | 프로젝트 | Slot |
|------|----------|------|
| 4100 | worb | blue |
| 4101 | worb | green (미사용) |
| 4102 | w-homepage | blue |
| 4103 | w-homepage | green |
| 4104 | vsvs-kr | blue |
| 4105 | vsvs-kr | green |
| 4106-4499 | 예약 | - |

---

## TODO

1. [ ] MCP API에 port 관리 도구 추가
2. [ ] 중앙 포트 레지스트리 파일 생성
3. [ ] 기존 프로젝트 포트 마이그레이션
4. [ ] GitHub Actions에서 MCP API 포트 조회 연동
5. [ ] 프로젝트별 .codeb/ports.json 제거 (MCP API로 대체)
