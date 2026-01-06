#!/bin/bash
# CodeB v6.0 - SSOT Registry 초기화
# App 서버 (158.247.203.55)에서 실행

set -e

REGISTRY_DIR="/opt/codeb/registry"
SLOTS_DIR="$REGISTRY_DIR/slots"
DOMAINS_DIR="$REGISTRY_DIR/domains"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          CodeB v6.0 - SSOT Registry 초기화                 ║"
echo "╚════════════════════════════════════════════════════════════╝"

# 1. 디렉토리 생성
echo "📁 레지스트리 디렉토리 생성..."
mkdir -p $REGISTRY_DIR $SLOTS_DIR $DOMAINS_DIR
chown -R codeb:codeb $REGISTRY_DIR

# 2. SSOT 레지스트리 생성
echo "📝 SSOT 레지스트리 생성..."
cat > $REGISTRY_DIR/ssot.json << 'EOF'
{
  "version": "6.0.0",
  "updatedAt": "2026-01-07T06:30:00Z",
  "servers": {
    "app": {
      "id": "n1",
      "host": "158.247.203.55",
      "domain": "app.codeb.kr",
      "role": "application"
    },
    "streaming": {
      "id": "n2",
      "host": "141.164.42.213",
      "domain": "ws.codeb.kr",
      "role": "websocket"
    },
    "storage": {
      "id": "n3",
      "host": "64.176.226.119",
      "domain": "db.codeb.kr",
      "role": "database"
    },
    "backup": {
      "id": "n4",
      "host": "141.164.37.63",
      "domain": "backup.codeb.kr",
      "role": "backup"
    }
  },
  "portRanges": {
    "system": {"start": 3000, "end": 3499},
    "production": {"start": 4000, "end": 4499},
    "staging": {"start": 4500, "end": 4999},
    "preview": {"start": 5000, "end": 5499}
  },
  "projects": {},
  "usedPorts": []
}
EOF

# 3. 현재 실행 중인 컨테이너에서 프로젝트 정보 수집
echo "🔍 실행 중인 프로젝트 스캔..."

# 프로젝트 정보 수집
declare -A PROJECTS
while IFS= read -r line; do
  NAME=$(echo "$line" | awk '{print $1}')
  PORT=$(echo "$line" | awk '{print $2}' | grep -oE '[0-9]+' | head -1)
  if [ -n "$NAME" ] && [ -n "$PORT" ]; then
    PROJECTS["$NAME"]=$PORT
    echo "   발견: $NAME (포트: $PORT)"
  fi
done < <(podman ps --format '{{.Names}} {{.Ports}}' 2>/dev/null)

# 4. 각 프로젝트의 슬롯 레지스트리 생성
echo "📦 슬롯 레지스트리 생성..."

for NAME in "${!PROJECTS[@]}"; do
  PORT=${PROJECTS[$NAME]}

  # 시스템 컨테이너 제외
  if [[ "$NAME" == *"postgres"* ]] || [[ "$NAME" == *"redis"* ]] || [[ "$NAME" == *"powerdns"* ]]; then
    continue
  fi

  # 환경 결정
  if [ $PORT -ge 4500 ] && [ $PORT -lt 5000 ]; then
    ENV="staging"
  elif [ $PORT -ge 4000 ] && [ $PORT -lt 4500 ]; then
    ENV="production"
  else
    ENV="system"
  fi

  # 슬롯 레지스트리 생성
  cat > "$SLOTS_DIR/${NAME}-${ENV}.json" << SLOT
{
  "projectName": "$NAME",
  "environment": "$ENV",
  "activeSlot": "blue",
  "blue": {
    "name": "blue",
    "state": "active",
    "port": $PORT,
    "version": "current",
    "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "healthStatus": "healthy"
  },
  "green": {
    "name": "green",
    "state": "empty",
    "port": $((PORT + 1)),
    "version": null,
    "deployedAt": null,
    "healthStatus": "unknown"
  },
  "lastUpdated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
SLOT
  echo "   생성: $SLOTS_DIR/${NAME}-${ENV}.json"
done

# 5. 포트 사용 현황 업데이트
echo "🔌 포트 사용 현황 업데이트..."
USED_PORTS=$(podman ps --format '{{.Ports}}' | grep -oE '[0-9]+(?=->)' | sort -u | paste -sd, -)

# ssot.json 업데이트 (jq 사용)
if command -v jq &> /dev/null; then
  jq --arg ports "$USED_PORTS" '.usedPorts = ($ports | split(",") | map(tonumber))' \
    $REGISTRY_DIR/ssot.json > $REGISTRY_DIR/ssot.json.tmp && \
    mv $REGISTRY_DIR/ssot.json.tmp $REGISTRY_DIR/ssot.json
fi

# 6. 권한 설정
chown -R codeb:codeb $REGISTRY_DIR

echo ""
echo "✅ SSOT Registry 초기화 완료!"
echo ""
echo "📋 생성된 파일:"
echo "   - $REGISTRY_DIR/ssot.json"
ls -la $SLOTS_DIR/*.json 2>/dev/null | awk '{print "   - " $NF}'
echo ""
echo "📌 다음 단계:"
echo "   1. MCP API 재시작: systemctl restart codeb-mcp-api"
echo "   2. 레지스트리 확인: cat $REGISTRY_DIR/ssot.json"
