#!/bin/bash
# CodeB v6.0 - 서버 마이그레이션 스크립트
# 무중단 서버 이전 지원

set -e

usage() {
  echo "사용법: $0 <source_ip> <target_ip> [--dry-run]"
  echo ""
  echo "예시:"
  echo "  $0 158.247.203.55 NEW_SERVER_IP"
  echo "  $0 158.247.203.55 NEW_SERVER_IP --dry-run"
  exit 1
}

if [ $# -lt 2 ]; then
  usage
fi

SOURCE=$1
TARGET=$2
DRY_RUN=""
if [ "$3" == "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "🔍 DRY RUN 모드 (실제 변경 없음)"
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          CodeB v6.0 - 서버 마이그레이션                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Source: $SOURCE"
echo "📍 Target: $TARGET"
echo ""

# 1. 사전 점검
echo "═══════════════════════════════════════════════════════════"
echo "Step 1: 사전 점검"
echo "═══════════════════════════════════════════════════════════"

echo "✓ Source 서버 연결 확인..."
ssh -o ConnectTimeout=5 root@$SOURCE "echo 'OK'" || { echo "❌ Source 연결 실패"; exit 1; }

echo "✓ Target 서버 연결 확인..."
ssh -o ConnectTimeout=5 root@$TARGET "echo 'OK'" || { echo "❌ Target 연결 실패"; exit 1; }

echo "✓ Target 서버 Podman 확인..."
ssh root@$TARGET "podman --version" || { echo "❌ Podman 미설치"; exit 1; }

# 2. 레지스트리 동기화
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Step 2: 레지스트리 및 설정 동기화"
echo "═══════════════════════════════════════════════════════════"

echo "📦 /opt/codeb 동기화..."
rsync -avz $DRY_RUN --exclude 'node_modules' --exclude 'logs' \
  root@$SOURCE:/opt/codeb/ root@$TARGET:/opt/codeb/

echo "📦 /etc/containers/systemd (Quadlet) 동기화..."
rsync -avz $DRY_RUN root@$SOURCE:/etc/containers/systemd/ root@$TARGET:/etc/containers/systemd/

echo "📦 /etc/caddy 동기화..."
rsync -avz $DRY_RUN root@$SOURCE:/etc/caddy/ root@$TARGET:/etc/caddy/

# 3. 데이터베이스 복제 (Storage 서버인 경우)
if ssh root@$SOURCE "podman ps --filter name=postgres -q" | grep -q .; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "Step 3: PostgreSQL 복제"
  echo "═══════════════════════════════════════════════════════════"

  echo "📦 PostgreSQL 데이터 동기화..."
  # pg_basebackup 또는 rsync
  if [ -z "$DRY_RUN" ]; then
    ssh root@$SOURCE "pg_dump -h localhost -U codeb -Fc codeb" | \
      ssh root@$TARGET "pg_restore -h localhost -U codeb -d codeb -c"
  else
    echo "  [DRY RUN] PostgreSQL 복제 건너뜀"
  fi
fi

# 4. Redis 복제 (Storage 서버인 경우)
if ssh root@$SOURCE "podman ps --filter name=redis -q" | grep -q .; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "Step 4: Redis 복제"
  echo "═══════════════════════════════════════════════════════════"

  echo "📦 Redis 데이터 동기화..."
  REDIS_DATA_SRC="/var/lib/containers/storage/volumes/codeb-redis-data/_data"
  REDIS_DATA_TGT="/var/lib/containers/storage/volumes/codeb-redis-data/_data"

  rsync -avz $DRY_RUN root@$SOURCE:$REDIS_DATA_SRC/ root@$TARGET:$REDIS_DATA_TGT/
fi

# 5. 컨테이너 시작
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Step 5: Target 서버 컨테이너 시작"
echo "═══════════════════════════════════════════════════════════"

if [ -z "$DRY_RUN" ]; then
  echo "🚀 Quadlet 서비스 리로드..."
  ssh root@$TARGET "systemctl daemon-reload"

  echo "🚀 컨테이너 시작..."
  ssh root@$TARGET "systemctl start codeb-*.service" || true

  echo "🚀 Caddy 시작..."
  ssh root@$TARGET "systemctl restart caddy"
else
  echo "  [DRY RUN] 컨테이너 시작 건너뜀"
fi

# 6. 헬스체크
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Step 6: 헬스체크"
echo "═══════════════════════════════════════════════════════════"

if [ -z "$DRY_RUN" ]; then
  sleep 10
  echo "🔍 Target 서버 헬스체크..."
  if ssh root@$TARGET "curl -sf http://localhost:9101/health"; then
    echo ""
    echo "✅ 헬스체크 통과!"
  else
    echo "❌ 헬스체크 실패!"
    exit 1
  fi
else
  echo "  [DRY RUN] 헬스체크 건너뜀"
fi

# 7. DNS 전환 안내
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Step 7: DNS 전환 (수동)"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "📋 DNS 전환이 필요합니다:"
echo ""
echo "   1. PowerDNS 레코드 업데이트:"
echo "      pdnsutil replace-rrset codeb.kr app A 300 $TARGET"
echo ""
echo "   2. 또는 Caddy 리버스 프록시 변경:"
echo "      ssh root@$SOURCE 'caddy reverse-proxy --to $TARGET:80'"
echo ""
echo "   3. Grace Period (48시간) 후 Source 서버 종료"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "✅ 마이그레이션 완료!"
echo "═══════════════════════════════════════════════════════════"
