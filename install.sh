#!/bin/bash
# CodeB MCP 설치 스크립트

set -e

INSTALL_DIR="$HOME/.codeb"
CLAUDE_CONFIG="$HOME/.claude.json"

echo "📦 CodeB MCP 설치 중..."

# 기존 설치 제거
rm -rf "$INSTALL_DIR"

# 클론
git clone --depth 1 https://github.com/codeb-dev-run/codeb-server.git "$INSTALL_DIR"

# MCP 서버 설치 및 빌드
cd "$INSTALL_DIR/mcp-server"
npm install --production=false
npm run build

# API Key 입력
echo ""
read -p "🔑 CODEB_API_KEY 입력: " API_KEY

if [ -z "$API_KEY" ]; then
  echo "❌ API Key가 필요합니다"
  exit 1
fi

# Claude MCP 설정 추가
echo "⚙️ Claude Code MCP 설정 중..."

if [ -f "$CLAUDE_CONFIG" ]; then
  # 기존 설정에 mcpServers 추가/업데이트
  if command -v jq &> /dev/null; then
    jq --arg key "$API_KEY" --arg path "$HOME/.codeb/mcp-server/dist/index.js" '
      .mcpServers["codeb-deploy"] = {
        "command": "node",
        "args": [$path],
        "env": {
          "CODEB_API_KEY": $key
        }
      }
    ' "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
  else
    echo "⚠️ jq가 없어서 수동 설정 필요"
    echo "~/.claude.json에 다음 추가:"
    echo ""
    echo "\"codeb-deploy\": {"
    echo "  \"command\": \"node\","
    echo "  \"args\": [\"$HOME/.codeb/mcp-server/dist/index.js\"],"
    echo "  \"env\": { \"CODEB_API_KEY\": \"$API_KEY\" }"
    echo "}"
    exit 0
  fi
else
  # 새 설정 파일 생성
  cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["$HOME/.codeb/mcp-server/dist/index.js"],
      "env": {
        "CODEB_API_KEY": "$API_KEY"
      }
    }
  }
}
EOF
fi

echo ""
echo "✅ 설치 완료!"
echo "🚀 Claude Code를 재시작하면 codeb-deploy MCP가 활성화됩니다"
