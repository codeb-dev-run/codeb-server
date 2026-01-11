#!/bin/bash
# CodeB v6.0 - PostgreSQL 실시간 백업 설정
# Storage 서버 (64.176.226.119)에서 실행

set -e

BACKUP_SERVER="141.164.37.63"
WAL_ARCHIVE_DIR="/opt/codeb/wal-archive"
BACKUP_DIR="/opt/codeb/db-backup/postgresql"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        CodeB v6.0 - PostgreSQL 백업 시스템 설정            ║"
echo "╚════════════════════════════════════════════════════════════╝"

# 1. 백업 디렉토리 생성
echo "📁 백업 디렉토리 생성..."
mkdir -p $WAL_ARCHIVE_DIR
mkdir -p $BACKUP_DIR
chmod 700 $WAL_ARCHIVE_DIR $BACKUP_DIR

# 2. PostgreSQL 설정 업데이트
echo "⚙️  PostgreSQL WAL 설정 업데이트..."

# Podman exec로 설정 변경
podman exec codeb-postgres bash -c "cat >> /var/lib/postgresql/data/pgdata/postgresql.conf << 'EOF'

# CodeB v6.0 - WAL Archiving Configuration
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /wal-archive/%f && cp %p /wal-archive/%f'
archive_timeout = 300
max_wal_senders = 3
wal_keep_size = 1GB
EOF"

# 3. 복제 사용자 생성
echo "👤 복제 사용자 생성..."
podman exec codeb-postgres psql -U codeb -d codeb -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'codeb_repl_2026';
  END IF;
END
\$\$;
"

# 4. pg_hba.conf 업데이트
echo "🔐 접근 권한 설정..."
podman exec codeb-postgres bash -c "cat >> /var/lib/postgresql/data/pgdata/pg_hba.conf << 'EOF'

# Replication
host    replication     replicator      141.164.37.63/32        scram-sha-256
EOF"

# 5. WAL 아카이브 볼륨 마운트 확인
echo "📦 WAL 아카이브 볼륨 설정..."
if ! podman volume exists codeb-wal-archive 2>/dev/null; then
  podman volume create codeb-wal-archive
fi

# 6. 일일 백업 스크립트 설치
echo "📝 일일 백업 스크립트 설치..."
cat > /opt/codeb/scripts/pg-daily-backup.sh << 'SCRIPT'
#!/bin/bash
# PostgreSQL 일일 백업 스크립트
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/opt/codeb/db-backup/postgresql"
BACKUP_SERVER="backup.codeb.kr"

echo "[$(date)] PostgreSQL 백업 시작"

# 각 데이터베이스 백업
for DB in codeb worb workb da_rak; do
  echo "  - $DB 백업 중..."
  podman exec codeb-postgres pg_dump -U codeb -Fc $DB > $BACKUP_DIR/$DB-$DATE.dump 2>/dev/null || true
done

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "*.dump" -mtime +7 -delete

# Backup 서버로 동기화
rsync -avz --delete $BACKUP_DIR/ root@$BACKUP_SERVER:/opt/codeb/db-backup/postgresql/

echo "[$(date)] PostgreSQL 백업 완료"
SCRIPT

chmod +x /opt/codeb/scripts/pg-daily-backup.sh

# 7. Cron 작업 등록
echo "⏰ Cron 작업 등록..."
(crontab -l 2>/dev/null | grep -v "pg-daily-backup"; echo "0 3 * * * /opt/codeb/scripts/pg-daily-backup.sh >> /var/log/codeb/pg-backup.log 2>&1") | crontab -

# 8. PostgreSQL 재시작
echo "🔄 PostgreSQL 재시작..."
podman restart codeb-postgres

echo ""
echo "✅ PostgreSQL 백업 시스템 설정 완료!"
echo ""
echo "📋 설정 요약:"
echo "   - WAL 아카이빙: 활성화 (5분마다)"
echo "   - 일일 백업: 매일 03:00 UTC"
echo "   - 보관 기간: 7일"
echo "   - 백업 서버: $BACKUP_SERVER"
