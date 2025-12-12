#!/bin/bash
# /we: CLI 설치 스크립트
# 직원용 원클릭 설치

set -e

echo "╔═══════════════════════════════════════════════╗"
echo "║   /we: CLI v2.4.0 설치                        ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Node.js 버전 확인
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 이상이 필요합니다."
    echo "   설치: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js v$(node -v | cut -d'v' -f2) 확인"

# 설치 디렉토리
INSTALL_DIR="$HOME/.we-cli"

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 기존 설치 업데이트 중..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "📥 CLI 다운로드 중..."
    git clone https://github.com/codeblabdev-max/codeb-server.git "$INSTALL_DIR"
fi

# CLI 디렉토리로 이동
cd "$INSTALL_DIR/cli"

# 의존성 설치
echo "📦 CLI 의존성 설치 중..."
npm install --silent

# MCP 서버 빌드 (Claude Code 연동용)
echo "🔧 MCP 서버 빌드 중..."
MCP_DIR="$INSTALL_DIR/codeb-deploy-system/mcp-server"
if [ -d "$MCP_DIR" ]; then
    cd "$MCP_DIR"
    npm install --silent 2>/dev/null || true
    npm run build --silent 2>/dev/null || echo "   ⚠️  MCP 빌드 실패 (나중에 수동 빌드 가능)"
    cd "$INSTALL_DIR/cli"
else
    echo "   ⚠️  MCP 서버 디렉토리 없음 (선택 사항)"
fi

# 전역 링크
echo "🔗 전역 명령어 등록 중..."
npm link --silent 2>/dev/null || sudo npm link --silent

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   ✅ 설치 완료!                               ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "다음 단계:"
echo "  1. 설정 초기화:    we config init"
echo "  2. MCP 설정:       we mcp setup"
echo "  3. Claude Code 재시작 (Cmd+Shift+P → Claude: Restart)"
echo "  4. 버전 확인:      we --version"
echo "  5. 도움말:         we help"
echo ""
