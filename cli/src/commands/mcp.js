/**
 * MCP Setup Command
 *
 * Claude Code의 글로벌 설정에 codeb-deploy MCP 서버를 설정합니다.
 *
 * Actions:
 * - setup: MCP 서버 설정 추가
 * - status: 현재 MCP 설정 상태 확인
 * - remove: MCP 서버 설정 제거
 */

import chalk from 'chalk';
import ora from 'ora';
import { setupMcp, removeMcp, statusMcp } from '../lib/setup-mcp.js';
import { getServerHost, getServerUser } from '../lib/config.js';
import { homedir } from 'os';
import { join } from 'path';

export async function mcp(action = 'status', options = {}) {
  switch (action) {
    case 'setup':
      await handleSetup(options);
      break;

    case 'status':
      await handleStatus();
      break;

    case 'remove':
      await handleRemove(options);
      break;

    case 'serve':
      await handleServe(options);
      break;

    default:
      console.log(chalk.red(`\n❌ 알 수 없는 액션: ${action}`));
      showUsage();
  }
}

async function handleSetup(options) {
  console.log(chalk.cyan('\n🔧 MCP 서버 설정\n'));

  // 설정값 가져오기
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();
  const sshKeyPath = options.sshKey || join(homedir(), '.ssh', 'id_rsa');

  if (!serverHost) {
    console.log(chalk.yellow('⚠️  서버 호스트가 설정되지 않았습니다.'));
    console.log(chalk.gray('   we config init 으로 설정하거나 --host 옵션을 사용하세요.\n'));
  }

  const spinner = ora('MCP 서버 설정 중...').start();

  try {
    const result = await setupMcp({
      serverHost,
      serverUser,
      sshKeyPath,
      force: options.force
    });

    spinner.stop();

    if (result.success) {
      console.log(chalk.green('\n✅ MCP 서버 설정 완료!'));
      console.log(chalk.yellow('\n⚠️  Claude Code를 재시작해야 MCP가 로드됩니다.'));
      console.log(chalk.gray('   VSCode: Cmd+Shift+P → "Claude: Restart"'));
    }
  } catch (error) {
    spinner.fail('MCP 설정 실패');
    console.error(chalk.red(`\n❌ 오류: ${error.message}`));
  }
}

async function handleStatus() {
  console.log(chalk.cyan('\n📊 MCP 서버 상태\n'));

  const result = await statusMcp();

  console.log('\n' + '─'.repeat(50));

  if (result.configured && result.serverExists) {
    console.log(chalk.green('\n✅ MCP 서버가 올바르게 설정되어 있습니다.'));
    console.log(chalk.gray('\n사용 가능한 MCP 도구:'));
    console.log(chalk.white('  • mcp__codeb-deploy__deploy_compose_project'));
    console.log(chalk.white('  • mcp__codeb-deploy__full_health_check'));
    console.log(chalk.white('  • mcp__codeb-deploy__setup_domain'));
    console.log(chalk.white('  • mcp__codeb-deploy__rollback'));
    console.log(chalk.white('  • ... 외 50+ 도구'));
  } else if (!result.serverExists) {
    console.log(chalk.red('\n❌ MCP 서버 파일이 없습니다.'));
    console.log(chalk.yellow('\n해결 방법:'));
    console.log(chalk.gray('  cd codeb-deploy-system/mcp-server && npm run build'));
  } else {
    console.log(chalk.yellow('\n⚠️  MCP 서버가 Claude Code에 설정되지 않았습니다.'));
    console.log(chalk.gray('\n설정하려면:'));
    console.log(chalk.white('  we mcp setup'));
  }
}

async function handleRemove(options) {
  console.log(chalk.cyan('\n🗑️  MCP 서버 제거\n'));

  if (!options.force) {
    console.log(chalk.yellow('정말 MCP 서버 설정을 제거하시겠습니까?'));
    console.log(chalk.gray('  --force 옵션으로 확인 없이 제거할 수 있습니다.\n'));

    // inquirer를 사용한 확인은 나중에 추가
    // 지금은 --force 필요
    console.log(chalk.red('❌ --force 옵션이 필요합니다.'));
    return;
  }

  const spinner = ora('MCP 서버 제거 중...').start();

  try {
    const result = await removeMcp();
    spinner.stop();

    if (result.success) {
      console.log(chalk.green('\n✅ MCP 서버 설정이 제거되었습니다.'));
    }
  } catch (error) {
    spinner.fail('MCP 제거 실패');
    console.error(chalk.red(`\n❌ 오류: ${error.message}`));
  }
}

/**
 * MCP Server - HTTP API 프록시 방식
 * Claude Code에서 호출되는 MCP 서버
 * stdio transport를 통해 통신, HTTP API로 실제 작업 수행
 */
async function handleServe(options) {
  const { startMcpServer } = await import('../mcp/index.js');

  // HTTP API 프록시 MCP 서버 시작
  await startMcpServer();
}

function showUsage() {
  console.log(chalk.cyan('\n📖 MCP 명령어 사용법\n'));
  console.log('Actions:');
  console.log(chalk.white('  setup   ') + chalk.gray('Claude Code에 MCP 서버 설정'));
  console.log(chalk.white('  status  ') + chalk.gray('현재 MCP 설정 상태 확인'));
  console.log(chalk.white('  remove  ') + chalk.gray('MCP 서버 설정 제거'));
  console.log(chalk.white('  serve   ') + chalk.gray('MCP 서버 실행 (Claude Code용)'));
  console.log('\nOptions:');
  console.log(chalk.white('  --host <ip>    ') + chalk.gray('서버 호스트 지정'));
  console.log(chalk.white('  --user <user>  ') + chalk.gray('SSH 사용자 지정'));
  console.log(chalk.white('  --ssh-key <path> ') + chalk.gray('SSH 키 경로 지정'));
  console.log(chalk.white('  --force        ') + chalk.gray('확인 없이 실행'));
  console.log('\nExamples:');
  console.log(chalk.gray('  we mcp status'));
  console.log(chalk.gray('  we mcp setup'));
  console.log(chalk.gray('  we mcp serve'));
  console.log(chalk.gray('  we mcp remove --force'));
}
