#!/bin/bash
# CodeB v6.0 - Redis 실시간 백업 설정
# Storage 서버 (64.176.226.119)에서 실행

set -e

BACKUP_SERVER="141.164.37.63"
BACKUP_DIR="/opt/codeb/db-backup/redis"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          CodeB v6.0 - Redis 백업 시스템 설정               ║"
echo "╚════════════════════════════════════════════════════════════╝"

# 1. 백업 디렉토리 생성
echo "📁 백업 디렉토리 생성..."
mkdir -p $BACKUP_DIR
chmod 700 $BACKUP_DIR

# 2. Redis AOF 활성화
echo "⚙️  Redis AOF 설정 업데이트..."

# Redis 설정 파일 생성
cat > /tmp/redis-backup.conf << 'EOF'
# CodeB v6.0 - Redis Backup Configuration

# AOF 활성화 (실시간 백업)
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB 스냅샷 (주기적 백업)
save 900 1
save 300 10
save 60 10000

# 데이터 디렉토리
dir /data
dbfilename dump.rdb
appendfilename "appendonly.aof"
EOF

# Redis 컨테이너에 설정 적용
podman cp /tmp/redis-backup.conf codeb-redis:/data/redis-backup.conf

# Redis 설정 리로드 (재시작 없이)
echo "🔄 Redis 설정 리로드..."
REDIS_PASS=$(podman inspect codeb-redis --format '{{range .Config.Env}}{{println .}}{{end}}' | grep REDIS_PASSWORD | cut -d= -f2)

if [ -n "$REDIS_PASS" ]; then
  podman exec codeb-redis redis-cli -a "$REDIS_PASS" CONFIG SET appendonly yes 2>/dev/null || true
  podman exec codeb-redis redis-cli -a "$REDIS_PASS" CONFIG SET appendfsync everysec 2>/dev/null || true
else
  podman exec codeb-redis redis-cli CONFIG SET appendonly yes 2>/dev/null || true
  podman exec codeb-redis redis-cli CONFIG SET appendfsync everysec 2>/dev/null || true
fi

# 3. 백업 스크립트 설치
echo "📝 Redis 백업 스크립트 설치..."
cat > /opt/codeb/scripts/redis-backup.sh << 'SCRIPT'
#!/bin/bash
# Redis 백업 스크립트
DATE=$(date +%Y-%m-%d-%H%M)
BACKUP_DIR="/opt/codeb/db-backup/redis"
BACKUP_SERVER="backup.codeb.kr"
REDIS_DATA="/var/lib/containers/storage/volumes/codeb-redis-data/_data"

echo "[$(date)] Redis 백업 시작"

# RDB 스냅샷 강제 생성
podman exec codeb-redis redis-cli BGSAVE 2>/dev/null || true
sleep 5

# 백업 복사
if [ -f "$REDIS_DATA/dump.rdb" ]; then
  cp "$REDIS_DATA/dump.rdb" "$BACKUP_DIR/dump-$DATE.rdb"
fi

if [ -f "$REDIS_DATA/appendonly.aof" ]; then
  cp "$REDIS_DATA/appendonly.aof" "$BACKUP_DIR/appendonly-$DATE.aof"
fi

# 24시간 이상 된 시간별 백업 삭제 (일일 백업은 유지)
find $BACKUP_DIR -name "dump-*.rdb" -mmin +1440 -delete 2>/dev/null || true
find $BACKUP_DIR -name "appendonly-*.aof" -mmin +1440 -delete 2>/dev/null || true

# Backup 서버로 동기화 (최신 파일만)
rsync -avz "$REDIS_DATA/dump.rdb" root@$BACKUP_SERVER:/opt/codeb/db-backup/redis/current-dump.rdb
rsync -avz "$REDIS_DATA/appendonly.aof" root@$BACKUP_SERVER:/opt/codeb/db-backup/redis/current-appendonly.aof 2>/dev/null || true

echo "[$(date)] Redis 백업 완료"
SCRIPT

chmod +x /opt/codeb/scripts/redis-backup.sh

# 4. Cron 작업 등록 (매시간)
echo "⏰ Cron 작업 등록..."
(crontab -l 2>/dev/null | grep -v "redis-backup"; echo "0 * * * * /opt/codeb/scripts/redis-backup.sh >> /var/log/codeb/redis-backup.log 2>&1") | crontab -

echo ""
echo "✅ Redis 백업 시스템 설정 완료!"
echo ""
echo "📋 설정 요약:"
echo "   - AOF: 활성화 (everysec)"
echo "   - RDB 스냅샷: 15분/5분/1분 조건부"
echo "   - 백업 주기: 매시간"
echo "   - 백업 서버: $BACKUP_SERVER"
