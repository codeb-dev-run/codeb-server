#!/usr/bin/env node

/**
 * CodeB MCP Server Setup Script
 *
 * Claude Code의 글로벌 설정에 codeb-deploy MCP 서버를 추가합니다.
 * 사용법: we mcp setup
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 경로 설정
const CLAUDE_CONFIG_PATH = join(homedir(), '.claude.json');
const WE_CLI_ROOT = join(homedir(), '.we-cli');
const MCP_SERVER_PATH = join(WE_CLI_ROOT, 'codeb-deploy-system', 'mcp-server', 'dist', 'index.js');

// 기본 MCP 서버 설정
function getMcpServerConfig(serverHost, serverUser, sshKeyPath) {
  return {
    "codeb-deploy": {
      "command": "node",
      "args": [MCP_SERVER_PATH],
      "env": {
        "CODEB_SERVER_HOST": serverHost || "141.164.60.51",
        "CODEB_SERVER_USER": serverUser || "root",
        "CODEB_SSH_KEY_PATH": sshKeyPath || join(homedir(), '.ssh', 'id_rsa')
      }
    }
  };
}

export async function setupMcp(options = {}) {
  const { serverHost, serverUser, sshKeyPath, force = false } = options;

  console.log('🔧 CodeB MCP 서버 설정 중...\n');

  // 1. MCP 서버 파일 존재 확인
  if (!existsSync(MCP_SERVER_PATH)) {
    console.error('❌ MCP 서버를 찾을 수 없습니다:', MCP_SERVER_PATH);
    console.log('\n💡 해결 방법:');
    console.log('   cd codeb-deploy-system/mcp-server && npm run build');
    return { success: false, error: 'MCP server not found' };
  }

  console.log('✅ MCP 서버 파일 확인:', MCP_SERVER_PATH);

  // 2. Claude 설정 파일 읽기
  let claudeConfig = {};
  if (existsSync(CLAUDE_CONFIG_PATH)) {
    try {
      claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
      console.log('✅ 기존 Claude 설정 파일 발견');
    } catch (e) {
      console.log('⚠️  Claude 설정 파일 파싱 실패, 새로 생성합니다');
    }
  } else {
    console.log('📝 새 Claude 설정 파일 생성');
  }

  // 3. mcpServers 섹션 확인/생성
  if (!claudeConfig.mcpServers) {
    claudeConfig.mcpServers = {};
  }

  // 4. codeb-deploy 이미 설정되어 있는지 확인
  if (claudeConfig.mcpServers['codeb-deploy'] && !force) {
    console.log('\n⚠️  codeb-deploy MCP 서버가 이미 설정되어 있습니다.');
    console.log('   기존 설정:', JSON.stringify(claudeConfig.mcpServers['codeb-deploy'], null, 2));
    console.log('\n💡 덮어쓰려면: we mcp setup --force');
    return { success: true, message: 'Already configured' };
  }

  // 5. MCP 서버 설정 추가
  const mcpConfig = getMcpServerConfig(serverHost, serverUser, sshKeyPath);
  claudeConfig.mcpServers = {
    ...claudeConfig.mcpServers,
    ...mcpConfig
  };

  // 6. 설정 파일 저장
  try {
    writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
    console.log('\n✅ Claude 설정 파일 업데이트 완료:', CLAUDE_CONFIG_PATH);
  } catch (e) {
    console.error('❌ 설정 파일 저장 실패:', e.message);
    return { success: false, error: e.message };
  }

  // 7. 성공 메시지
  console.log('\n' + '='.repeat(60));
  console.log('🎉 CodeB MCP 서버 설정 완료!\n');
  console.log('📋 설정된 MCP 서버:');
  console.log('   - codeb-deploy: 배포, 헬스체크, 롤백, 도메인 관리\n');
  console.log('⚠️  중요: Claude Code를 재시작해야 MCP 서버가 로드됩니다.');
  console.log('   VSCode: Cmd+Shift+P → "Claude: Restart"\n');
  console.log('🔍 확인 방법:');
  console.log('   Claude Code에서 "mcp__codeb-deploy__" 로 시작하는 도구 사용 가능');
  console.log('='.repeat(60));

  return { success: true, path: CLAUDE_CONFIG_PATH };
}

export async function removeMcp() {
  console.log('🗑️  CodeB MCP 서버 제거 중...\n');

  if (!existsSync(CLAUDE_CONFIG_PATH)) {
    console.log('ℹ️  Claude 설정 파일이 없습니다.');
    return { success: true };
  }

  try {
    const claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));

    if (claudeConfig.mcpServers && claudeConfig.mcpServers['codeb-deploy']) {
      delete claudeConfig.mcpServers['codeb-deploy'];
      writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
      console.log('✅ codeb-deploy MCP 서버 제거 완료');
    } else {
      console.log('ℹ️  codeb-deploy MCP 서버가 설정되어 있지 않습니다.');
    }

    return { success: true };
  } catch (e) {
    console.error('❌ 제거 실패:', e.message);
    return { success: false, error: e.message };
  }
}

export async function statusMcp() {
  console.log('🔍 CodeB MCP 서버 상태 확인...\n');

  // MCP 서버 파일 확인
  const serverExists = existsSync(MCP_SERVER_PATH);
  console.log(`📦 MCP 서버 파일: ${serverExists ? '✅ 존재' : '❌ 없음'}`);
  if (serverExists) {
    console.log(`   경로: ${MCP_SERVER_PATH}`);
  }

  // Claude 설정 확인
  if (!existsSync(CLAUDE_CONFIG_PATH)) {
    console.log('📋 Claude 설정: ❌ 파일 없음');
    return { configured: false, serverExists };
  }

  try {
    const claudeConfig = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
    const mcpConfig = claudeConfig.mcpServers?.['codeb-deploy'];

    if (mcpConfig) {
      console.log('📋 Claude 설정: ✅ 설정됨');
      console.log('   서버 호스트:', mcpConfig.env?.CODEB_SERVER_HOST || '미설정');
      console.log('   SSH 사용자:', mcpConfig.env?.CODEB_SERVER_USER || '미설정');
      console.log('   SSH 키 경로:', mcpConfig.env?.CODEB_SSH_KEY_PATH || '미설정');
      return { configured: true, serverExists, config: mcpConfig };
    } else {
      console.log('📋 Claude 설정: ❌ codeb-deploy 미설정');
      return { configured: false, serverExists };
    }
  } catch (e) {
    console.log('📋 Claude 설정: ❌ 파싱 오류');
    return { configured: false, serverExists, error: e.message };
  }
}

// CLI 직접 실행 시
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] || 'setup';

  switch (action) {
    case 'setup':
      await setupMcp({ force: process.argv.includes('--force') });
      break;
    case 'remove':
      await removeMcp();
      break;
    case 'status':
      await statusMcp();
      break;
    default:
      console.log('사용법: node setup-mcp.js [setup|remove|status]');
  }
}
