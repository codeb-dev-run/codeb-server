#!/bin/bash
#
# we-cli 설치 스크립트
# 사용법: curl -fsSL https://raw.githubusercontent.com/codeblabdev-max/codeb-server/main/install.sh | bash
#

set -e

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   we-cli 설치 스크립트                        ║"
echo "║   Deploy • Analyze • Workflow • Optimize      ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required commands
check_requirements() {
  echo "📋 요구사항 확인 중..."

  if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo "   https://nodejs.org 에서 설치해주세요."
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18 이상이 필요합니다. 현재: $(node -v)${NC}"
    exit 1
  fi

  if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm이 설치되어 있지 않습니다.${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ Node.js $(node -v), npm $(npm -v)${NC}"
}

# Main installation
install_cli() {
  echo ""
  echo "📦 we-cli 설치 중..."

  # Create temp directory
  TEMP_DIR=$(mktemp -d)
  cd "$TEMP_DIR"

  # Download and create tarball from GitHub
  echo "   GitHub에서 패키지 다운로드 중..."
  npm pack github:codeblabdev-max/codeb-server 2>&1 | grep -v "^npm notice" || true

  TARBALL=$(ls *.tgz 2>/dev/null | head -1)

  if [ -z "$TARBALL" ]; then
    echo -e "${RED}❌ 패키지 다운로드 실패${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  # Install from tarball
  echo "   전역 설치 중..."
  npm install -g "$TARBALL" 2>&1 | grep -v "^npm notice" || true

  # Cleanup
  cd - > /dev/null
  rm -rf "$TEMP_DIR"

  echo -e "${GREEN}✅ we-cli 설치 완료${NC}"
}

# Verify installation
verify_install() {
  echo ""
  echo "🔍 설치 확인 중..."

  if command -v we &> /dev/null; then
    echo -e "${GREEN}✅ CLI: $(we --version 2>&1 | tail -1)${NC}"
  else
    echo -e "${YELLOW}⚠️  we 명령어가 PATH에 없습니다.${NC}"
    echo "   터미널을 다시 열거나 PATH를 확인해주세요."
  fi

  if [ -d "$HOME/.claude/commands/we" ]; then
    CMD_COUNT=$(ls -1 "$HOME/.claude/commands/we"/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}✅ 슬래시 명령어: ${CMD_COUNT}개 설치됨${NC}"
  else
    echo -e "${YELLOW}⚠️  슬래시 명령어가 설치되지 않았습니다.${NC}"
  fi

  if [ -f "$HOME/.claude/CLAUDE.md" ]; then
    echo -e "${GREEN}✅ 규칙 파일 설치됨${NC}"
  fi

  if grep -q "codeb-deploy" "$HOME/.claude.json" 2>/dev/null; then
    echo -e "${GREEN}✅ MCP 서버 등록됨${NC}"
  else
    echo -e "${YELLOW}⚠️  MCP 서버가 등록되지 않았습니다.${NC}"
  fi
}

# Print next steps
print_next_steps() {
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "🎉 설치 완료!"
  echo "═══════════════════════════════════════════════"
  echo ""
  echo "🚀 사용 가능한 명령어:"
  echo "   we workflow init <project>  - 프로젝트 초기화"
  echo "   we deploy <project>         - 프로젝트 배포"
  echo "   we health                   - 시스템 상태 점검"
  echo "   we domain                   - 도메인 관리"
  echo ""
  echo "📝 Claude Code 슬래시 명령어:"
  echo "   /we:init      - 프로젝트 초기화"
  echo "   /we:deploy    - 프로젝트 배포"
  echo "   /we:analyze   - 프로젝트 분석"
  echo ""
  echo "⚠️  Claude Code를 재시작하여 변경사항을 적용하세요."
  echo ""
}

# Main
main() {
  check_requirements
  install_cli
  verify_install
  print_next_steps
}

main
