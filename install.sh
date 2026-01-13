#!/bin/bash
# CodeB MCP 설치 스크립트

set -e

INSTALL_DIR="$HOME/.codeb"
CLAUDE_CONFIG="$HOME/.claude.json"
ENV_FILE="$INSTALL_DIR/.env"

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

# .env 파일 생성
echo "⚙️ 환경 설정 파일 생성 중..."
cat > "$ENV_FILE" << EOF
CODEB_API_URL=https://api.codeb.kr
CODEB_API_KEY=$API_KEY
EOF

# Claude MCP 설정 추가
echo "⚙️ Claude Code MCP 설정 중..."

MCP_CONFIG="{
  \"command\": \"node\",
  \"args\": [\"$HOME/.codeb/mcp-server/dist/index.js\"],
  \"env\": {
    \"CODEB_API_KEY\": \"$API_KEY\",
    \"CODEB_API_URL\": \"https://api.codeb.kr\"
  }
}"

if [ -f "$CLAUDE_CONFIG" ]; then
  if command -v jq &> /dev/null; then
    jq --arg key "$API_KEY" --arg path "$HOME/.codeb/mcp-server/dist/index.js" '
      .mcpServers["codeb-deploy"] = {
        "command": "node",
        "args": [$path],
        "env": {
          "CODEB_API_KEY": $key,
          "CODEB_API_URL": "https://api.codeb.kr"
        }
      }
    ' "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
  else
    echo "⚠️ jq 설치 중..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      brew install jq
    else
      sudo apt-get install -y jq
    fi
    jq --arg key "$API_KEY" --arg path "$HOME/.codeb/mcp-server/dist/index.js" '
      .mcpServers["codeb-deploy"] = {
        "command": "node",
        "args": [$path],
        "env": {
          "CODEB_API_KEY": $key,
          "CODEB_API_URL": "https://api.codeb.kr"
        }
      }
    ' "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
  fi
else
  cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["$HOME/.codeb/mcp-server/dist/index.js"],
      "env": {
        "CODEB_API_KEY": "$API_KEY",
        "CODEB_API_URL": "https://api.codeb.kr"
      }
    }
  }
}
EOF
fi

echo ""
echo "✅ 설치 완료!"
echo ""
echo "📁 설치 위치: $INSTALL_DIR"
echo "🔑 API Key: $API_KEY"
echo ""
echo "🚀 Claude Code를 재시작하면 codeb-deploy MCP가 활성화됩니다"
