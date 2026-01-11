# CodeB v6.0 백업 시스템 설계

## 개요

- **목표**: 무중단 실시간 백업 + 서버 마이그레이션 지원
- **최소 부하**: WAL 스트리밍 + 증분 백업
- **롤백 지원**: Blue-Green 배포 시 즉시 롤백 가능

---

## 1. PostgreSQL 실시간 백업

### 1.1 WAL (Write-Ahead Logging) 아카이빙

```bash
# Storage 서버 (64.176.226.119) postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'rsync -a %p backup.codeb.kr:/opt/codeb/wal-archive/%f'
archive_timeout = 300  # 5분마다 강제 아카이브
max_wal_senders = 3
wal_keep_size = 1GB
```

### 1.2 백업 서버로 스트리밍 복제

```bash
# Backup 서버 (141.164.37.63) - Standby 설정
primary_conninfo = 'host=db.codeb.kr port=5432 user=replicator password=xxx'
restore_command = 'cp /opt/codeb/wal-archive/%f %p'
```

### 1.3 일일 스냅샷 (pg_dump)

```bash
# 매일 03:00 UTC 실행
0 3 * * * /opt/codeb/scripts/pg-backup.sh

# pg-backup.sh
#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR=/opt/codeb/db-backup/postgresql

for DB in codeb worb workb; do
  pg_dump -h db.codeb.kr -U codeb -Fc $DB > $BACKUP_DIR/$DB-$DATE.dump
  # 7일 보관
  find $BACKUP_DIR -name "$DB-*.dump" -mtime +7 -delete
done

# Backup 서버로 rsync
rsync -avz $BACKUP_DIR/ backup.codeb.kr:/opt/codeb/db-backup/postgresql/
```

---

## 2. Redis 실시간 백업

### 2.1 AOF (Append Only File) 활성화

```bash
# Storage 서버 redis.conf
appendonly yes
appendfsync everysec  # 1초마다 fsync (부하 최소화)
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### 2.2 RDB 스냅샷 (주기적)

```bash
# redis.conf
save 900 1      # 15분 내 1회 변경
save 300 10     # 5분 내 10회 변경
save 60 10000   # 1분 내 10000회 변경

dir /data
dbfilename dump.rdb
```

### 2.3 백업 서버로 동기화

```bash
# 매 시간 Backup 서버로 복사
0 * * * * rsync -avz /data/dump.rdb backup.codeb.kr:/opt/codeb/db-backup/redis/
0 * * * * rsync -avz /data/appendonly.aof backup.codeb.kr:/opt/codeb/db-backup/redis/
```

---

## 3. ENV 백업 시스템 (기존 유지)

```
/opt/codeb/env-backup/{project}/{environment}/
├── master.env       # 최초 생성 (불변)
├── current.env      # 현재 버전
├── {timestamp}.env  # 변경 이력
└── backup-log.json  # 변경 로그
```

### 자동 백업 트리거

1. `we env set` 명령 실행 시
2. 배포 시 ENV 변경 감지
3. 매일 자동 스냅샷

---

## 4. 서버 마이그레이션 지원

### 4.1 마이그레이션 체크리스트

```yaml
migration:
  source: 158.247.203.55
  target: NEW_SERVER_IP
  steps:
    - name: "1. 백업 동기화 확인"
      command: "rsync -avz --dry-run source:/ target:/"

    - name: "2. PostgreSQL 스탠바이 설정"
      command: "pg_basebackup -h source -D /var/lib/postgresql/data"

    - name: "3. Redis AOF 복사"
      command: "rsync -avz source:/data/ target:/data/"

    - name: "4. 컨테이너 설정 복사"
      command: "rsync -avz source:/etc/containers/ target:/etc/containers/"

    - name: "5. DNS 전환 (Caddy)"
      command: "we domain migrate --from source --to target"

    - name: "6. 헬스체크 후 전환"
      command: "we health --target target && we promote --target target"
```

### 4.2 무중단 마이그레이션 흐름

```
[기존 서버]                    [신규 서버]
    │                              │
    │  1. PostgreSQL 복제 시작      │
    │ ─────────────────────────▶  │
    │                              │
    │  2. Redis AOF 동기화         │
    │ ─────────────────────────▶  │
    │                              │
    │  3. 컨테이너 시작             │
    │                              │ ◀── 신규 서버 Ready
    │                              │
    │  4. DNS 전환 (Caddy)         │
    │ ─────────────────────────▶  │
    │                              │
    │  5. Grace Period (48h)       │
    │ ◀─── 롤백 가능               │
    │                              │
    └──────── 완료 ────────────────┘
```

---

## 5. Blue-Green 배포 + 롤백

### 5.1 슬롯 상태 저장

```json
{
  "project": "worb",
  "environment": "production",
  "activeSlot": "blue",
  "blue": {
    "state": "active",
    "port": 4000,
    "version": "v1.2.3",
    "deployedAt": "2026-01-07T00:00:00Z",
    "dbSnapshot": "worb-2026-01-07.dump",
    "redisSnapshot": "worb-2026-01-07.rdb"
  },
  "green": {
    "state": "grace",
    "port": 4001,
    "version": "v1.2.2",
    "deployedAt": "2026-01-06T00:00:00Z",
    "dbSnapshot": "worb-2026-01-06.dump",
    "redisSnapshot": "worb-2026-01-06.rdb"
  }
}
```

### 5.2 롤백 시 DB 복구

```bash
# 롤백 시 이전 슬롯의 DB 스냅샷으로 복구
we rollback worb --restore-db

# 실행 과정:
# 1. Green 슬롯 활성화 (트래픽 전환)
# 2. Green 슬롯의 dbSnapshot 복구 (선택적)
# 3. Redis 스냅샷 복구 (선택적)
```

---

## 6. 백업 모니터링

### Prometheus 메트릭

```yaml
# Backup 서버 prometheus.yml
scrape_configs:
  - job_name: 'backup-status'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'

# 알림 규칙
alerting:
  rules:
    - alert: BackupFailed
      expr: backup_last_success_timestamp < time() - 86400
      labels:
        severity: critical

    - alert: WALArchiveLag
      expr: pg_stat_archiver_archived_count < 1
      for: 1h
```

### 백업 상태 API

```bash
# MCP API로 백업 상태 조회
curl https://api.codeb.kr/api/tool \
  -H "X-API-Key: $KEY" \
  -d '{"tool": "backup_status", "params": {"project": "worb"}}'

# 응답
{
  "postgresql": {
    "lastSnapshot": "2026-01-07T03:00:00Z",
    "walArchived": 156,
    "replicationLag": "0 bytes"
  },
  "redis": {
    "aofEnabled": true,
    "lastRdbSave": "2026-01-07T05:00:00Z",
    "aofSize": "128MB"
  },
  "env": {
    "lastBackup": "2026-01-07T05:30:00Z",
    "versions": 3
  }
}
```

---

## 7. 구현 우선순위

| 순서 | 작업 | 예상 시간 |
|------|------|----------|
| 1 | PostgreSQL WAL 아카이빙 설정 | 30분 |
| 2 | Redis AOF 활성화 | 15분 |
| 3 | 백업 서버 스크립트 배포 | 1시간 |
| 4 | SSOT Registry 초기화 | 30분 |
| 5 | MCP API 백업 도구 추가 | 1시간 |
| 6 | Prometheus 모니터링 설정 | 30분 |
