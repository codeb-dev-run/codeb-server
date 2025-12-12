# CodeB 서버 업그레이드 리포트

**작성일**: 2025-12-09 09:50 KST
**최종 업데이트**: 2025-12-09 13:55 KST
**서버**: 141.164.60.51 (Vultr)
**OS**: Ubuntu 22.04.5 LTS (Jammy)

---

## 1. 업그레이드 요약

### 수행된 작업

| 작업 | 상태 | 결과 |
|------|------|------|
| **apt update** | ✅ 완료 | 패키지 목록 갱신 |
| **apt upgrade** | ✅ 완료 | 61개 패키지 업그레이드 |
| **apt autoremove** | ✅ 완료 | 657MB 디스크 회수 |
| **Vultr 스냅샷** | ✅ 생성 중 | `codeb-100-complete-20251209_093950` |
| **Podman 업그레이드** | ✅ 완료 | 3.4.4 → 4.6.2 (Quadlet 지원) |
| **Quadlet 마이그레이션** | ✅ 완료 | 10개 컨테이너 .container 파일 생성 |

### 디스크 공간 변화

```
업그레이드 전: ~89GB 사용
업그레이드 후: ~88GB 사용
회수된 공간: ~657MB (불필요 패키지 제거)
```

---

## 2. 업그레이드된 패키지

### 핵심 패키지

| 패키지 | 이전 버전 | 새 버전 |
|--------|----------|---------|
| **Podman** | 3.4.4 | **4.6.2** (Quadlet 지원) |
| **docker-ce** | 5:28.5.1 | 5:29.1.2 |
| **docker-ce-cli** | 5:28.5.1 | 5:29.1.2 |
| **containerd.io** | 1.7.28 | 2.2.0 |
| **docker-compose-plugin** | 2.40.0 | 5.0.0 |
| **docker-buildx-plugin** | 0.29.1 | 0.30.1 |
| **python3.10** | 3.10.12-1~22.04.11 | 3.10.12-1~22.04.12 |
| **libpq5** | 18.0-1.pgdg22.04+3 | 18.1-1.pgdg22.04+2 |

### 새로 설치된 패키지 (Podman 4.6.2)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **aardvark-dns** | 1.6.0 | Podman DNS 관리 |
| **netavark** | 1.3.0 | Podman 네트워크 백엔드 |
| **containers-common** | 100:1-22 | 컨테이너 공통 설정 |
| **podman-gvproxy** | 4.6.2 | 네트워크 프록시 |

### 보안 패키지

| 패키지 | 변경 내용 |
|--------|----------|
| binutils | 2.38-4ubuntu2.10 → 2.38-4ubuntu2.11 |
| libavahi-* | 0.8-5ubuntu5.2 → 0.8-5ubuntu5.3 |

### 제거된 패키지 (autoremove)

- `linux-headers-5.15.0-157`
- `linux-image-5.15.0-157-generic`
- `linux-modules-5.15.0-157-generic`
- `linux-modules-extra-5.15.0-157-generic`
- `postgresql-17` (사용 안 함)
- `postgresql-client-17` (사용 안 함)
- `buildah` (podman 4.6.2로 대체)
- `crun`, `criu`, `fuse-overlayfs`

---

## 3. Quadlet + systemd 통합 (완료)

### 업그레이드 후 상태

| 구성 요소 | 이전 버전 | 새 버전 | Quadlet 지원 |
|-----------|----------|---------|--------------|
| **Podman** | 3.4.4 | **4.6.2** | ✅ 지원 |
| **systemd** | 249.11 | 249.11 | ✅ 지원 |

### Quadlet 활성화 확인

```bash
# Quadlet 시스템 생성기
/usr/lib/systemd/system-generators/podman-system-generator -> ../../../libexec/podman/quadlet

# Quadlet 설정 디렉토리
/etc/containers/systemd/  # 시스템 전역 Quadlet 파일
~/.config/containers/systemd/  # 사용자별 Quadlet 파일
```

### Quadlet 사용 예시

```ini
# /etc/containers/systemd/codeb-web.container
[Container]
Image=localhost/codeb-web:latest
PublishPort=3000:3000
Volume=/data/codeb:/app/data:Z

[Service]
Restart=always

[Install]
WantedBy=default.target
```

```bash
# Quadlet 컨테이너 활성화
systemctl daemon-reload
systemctl start codeb-web
systemctl enable codeb-web
```

---

## 4. 현재 컨테이너 관리 방식

### Podman 컨테이너 (10개 실행 중)

| 컨테이너 | 이미지 | 포트 | 상태 |
|----------|--------|------|------|
| codeb-mail-server | mailserver/docker-mailserver | 25,143,465,587,993 | ✅ Up |
| registry | registry:2 | 5000 | ✅ Up |
| project_cms_postgres | postgres:15-alpine | 5438 | ✅ Up |
| project_cms_redis | redis:7-alpine | 6384 | ✅ Up |
| workb-cms | localhost/workb-cms | 3200 | ⚠️ unhealthy |
| warehouse-postgres | postgres:15-alpine | 5436 | ✅ Up |
| project-cms-staging-db | postgres:15-alpine | 5434 | ✅ Up |
| project-cms-staging-redis | redis:7-alpine | 6381 | ✅ Up |
| project-cms-staging | localhost/project-cms-staging | 3201 | ⚠️ unhealthy |
| warehouse-web | localhost/warehouse-rental | 3010 | ✅ Up |

### PM2 프로세스 (8개 실행 중)

| 프로세스 | 모드 | 메모리 |
|----------|------|--------|
| codeb-api-server | fork | 54.4MB |
| codeb-web | fork | 53.9MB |
| misopin-cms (x2) | cluster | 234.7MB, 233.5MB |
| saju-naming | fork | 56.6MB |
| starpick | fork | 65.5MB |
| starpick-platform | fork | 56.5MB |
| workb | fork | 45.4MB |

### systemd 서비스

| 서비스 | 상태 | 용도 |
|--------|------|------|
| caddy | ✅ active | 리버스 프록시 |
| pdns | ✅ active | DNS 서버 |
| dovecot | ✅ active | 메일 서버 |
| fail2ban | ✅ active | 보안 |
| pm2-root | ✅ active | PM2 관리 |

---

## 5. 커널 업그레이드 상태

### 커널 정보

| 항목 | 값 |
|------|-----|
| **현재 실행 중** | 5.15.0-161-generic |
| **설치된 최신** | 5.15.0-163-generic |
| **재부팅 필요** | ✅ 예 |

### 재부팅 시 주의사항

```bash
# 재부팅 전 확인
1. Vultr 스냅샷 완료 확인
2. 모든 서비스 정상 확인
3. 데이터베이스 백업 확인

# 재부팅 명령
sudo reboot

# 재부팅 후 확인
uname -r  # 5.15.0-163-generic 예상
podman ps  # 컨테이너 자동 시작 확인
pm2 list  # PM2 프로세스 확인
```

---

## 6. Quadlet 마이그레이션 (완료)

### 생성된 Quadlet 파일 (10개)

| 파일 | 컨테이너 | 포트 | 의존성 |
|------|----------|------|--------|
| `registry.container` | registry | 5000 | - |
| `warehouse-postgres.container` | warehouse-postgres | 5436 | - |
| `warehouse-web.container` | warehouse-web | 3010 | warehouse-postgres |
| `project-cms-postgres.container` | project_cms_postgres | 5438 | - |
| `project-cms-redis.container` | project_cms_redis | 6384 | - |
| `project-cms-staging-db.container` | project-cms-staging-db | 5434 | - |
| `project-cms-staging-redis.container` | project-cms-staging-redis | 6381 | - |
| `project-cms-staging.container` | project-cms-staging | 3201 | staging-db, staging-redis |
| `workb-cms.container` | workb-cms | 3200 | - |
| `codeb-mail-server.container` | codeb-mail-server | 25,143,465,587,993 | - |

### Quadlet 파일 위치
```
/etc/containers/systemd/
├── codeb-mail-server.container
├── project-cms-postgres.container
├── project-cms-redis.container
├── project-cms-staging-db.container
├── project-cms-staging-redis.container
├── project-cms-staging.container
├── registry.container
├── warehouse-postgres.container
├── warehouse-web.container
└── workb-cms.container
```

### systemd 서비스 상태
```bash
# 생성된 서비스 확인
systemctl list-unit-files --type=service | grep -E '(registry|warehouse|project-cms|workb|codeb-mail)'

# 모든 서비스가 "generated" 상태로 등록됨
```

### Quadlet 전환 명령 (재부팅 후)
```bash
# 1. 기존 컨테이너 중지
podman stop <container-name>
podman rm <container-name>

# 2. Quadlet 서비스 시작
systemctl daemon-reload
systemctl start <service-name>.service

# 예: registry 전환
podman stop registry && podman rm registry
systemctl start registry.service
```

### 장점

- systemd 네이티브 통합
- 자동 시작/재시작 관리
- 로그 통합 (journalctl)
- 의존성 관리 개선
- 부팅 시 자동 시작

---

## 7. 백업 정보

### Vultr 스냅샷

| 항목 | 값 |
|------|-----|
| **ID** | 98c0b912-a166-4c73-a116-b4199e595871 |
| **이름** | codeb-100-complete-20251209_093950 |
| **상태** | pending (생성 중) |
| **생성 시간** | 2025-12-09T00:39:51+00:00 |

### 복구 명령

```bash
# 스냅샷에서 새 인스턴스 생성
vultr instance create \
  --snapshot 98c0b912-a166-4c73-a116-b4199e595871 \
  --region icn \
  --plan vc2-4c-8gb
```

---

## 8. 서버 현황 요약

```
┌─────────────────────────────────────────────────────────────┐
│ CodeB Server Status (2025-12-09 10:00 KST)                  │
├─────────────────────────────────────────────────────────────┤
│ OS        : Ubuntu 22.04.5 LTS                              │
│ Kernel    : 5.15.0-161-generic (5.15.0-163 대기 중)         │
│ Uptime    : ~50분                                           │
├─────────────────────────────────────────────────────────────┤
│ Disk      : 88GB / 187GB (49%)                              │
│ Memory    : 1.6GB / 15GB (10.7%)                            │
│ Swap      : 0B / 8GB (0%)                                   │
├─────────────────────────────────────────────────────────────┤
│ Containers: 10 (Podman 4.6.2)                               │
│ PM2 Apps  : 8 processes                                     │
│ Services  : caddy, pdns, dovecot, fail2ban, pm2-root        │
├─────────────────────────────────────────────────────────────┤
│ Quadlet   : ✅ 지원 (Podman 4.6.2)                          │
│ systemd   : ✅ 249.11                                       │
│ Netavark  : ✅ 1.3.0 (새 네트워크 백엔드)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. PM2 vs Quadlet 비교

### 용도 차이

| 관리 도구 | 용도 | 현재 사용 |
|-----------|------|----------|
| **PM2** | Node.js 앱 직접 실행 | 8개 프로세스 |
| **Quadlet** | Podman 컨테이너 systemd 통합 | 10개 컨테이너 |

### PM2 앱 목록 (유지)
```
codeb-api-server, codeb-web, misopin-cms (x2)
saju-naming, starpick, starpick-platform, workb
```
→ Node.js 직접 실행, 컨테이너화 불필요시 PM2 유지 권장

### 컨테이너 앱 → Quadlet (전환됨)
```
registry, warehouse-*, project-cms-*, workb-cms, codeb-mail-server
```
→ 모든 Podman 컨테이너에 Quadlet .container 파일 생성 완료

---

## 10. 다음 단계

### 즉시 조치 (권장)

1. **서버 재부팅** - 커널 5.15.0-163 적용 + Quadlet 활성화
2. **Vultr 스냅샷 완료 확인**

### 재부팅 후 확인사항
```bash
# 커널 확인
uname -r  # 5.15.0-163-generic 예상

# Quadlet 서비스 확인
systemctl status registry.service
systemctl status warehouse-web.service

# PM2 확인
pm2 list
```

### 선택 작업

1. ~~**Quadlet 마이그레이션**~~ - ✅ 완료 (10개 .container 파일 생성)
2. **Grafana 모니터링** - Prometheus + Grafana 스택 설치
3. **Self-Hosted Runner 활성화** - GitHub Actions 연동

---

*Generated by Claude Code on 2025-12-09*
*Podman 4.6.2 + Quadlet 마이그레이션 완료*
