#!/usr/bin/env node

/**
 * /we: - Web Deploy CLI v7.0
 *
 * 핵심 5개 명령어만 유지:
 * 1. deploy   - Blue-Green 배포 (promote, rollback, slot, status)
 * 2. health   - 시스템 헬스체크
 * 3. init     - 프로젝트 초기화 (config, mcp, update)
 * 4. workflow - 인프라 설정 (domain, ssh, quadlet, github-actions)
 * 5. env      - 환경변수 관리 (scan, pull, push, fix)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get version from cli/package.json (single source of truth)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = pkg.version;

// Core Commands
import { deploy, deployBlueGreen, promote, rollback as rollbackBlueGreen, slotStatus } from '../src/commands/deploy.js';
import { health } from '../src/commands/health.js';
import { init } from '../src/commands/init.js';
import { workflow } from '../src/commands/workflow.js';
import { envScan, envPull, envPush, envFix, envList, envRestore, envBackups, envUpload } from '../src/commands/env.js';
// Legacy imports for subcommands
import { domain } from '../src/commands/domain.js';
import { ssh } from '../src/commands/ssh.js';
import { config } from '../src/commands/config.js';
import { mcp } from '../src/commands/mcp.js';
import { update } from '../src/commands/update.js';
import { scan } from '../src/commands/scan.js';
import { monitor } from '../src/commands/monitor.js';

const program = new Command();

// CLI Header - MCP serve 모드에서는 출력하지 않음
const isMcpServe = process.argv.includes('mcp') && process.argv.includes('serve');
if (!isMcpServe) {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold(`║   /we: Web Deploy CLI v${VERSION}                 ║`));
  console.log(chalk.cyan.bold('║   deploy → health → env (5 commands)          ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));
}

program
  .name('we')
  .description('/we: Web Deploy CLI - Blue-Green Deployment System')
  .version(VERSION);

// ============================================================================
// 1. DEPLOY - Blue-Green 배포 (핵심 명령어 #1)
// ============================================================================

const deployCmd = program
  .command('deploy')
  .description('Blue-Green 배포 시스템 (deploy, promote, rollback, slot)')
  .argument('[project]', 'Project name to deploy')
  .option('-e, --environment <env>', 'Target environment (staging|production)', 'production')
  .option('-i, --image <image>', 'Container image to deploy')
  .option('--skip-healthcheck', 'Skip health check after deploy')
  .option('--auto-promote', 'Auto-promote to active after deploy')
  .option('--force', 'Force deployment even with warnings')
  .option('--dry-run', 'Show deployment plan without executing')
  .action(async (project, options) => {
    if (!project) {
      console.log(chalk.yellow('Usage: we deploy <project> [options]'));
      console.log(chalk.gray('\nSubcommands:'));
      console.log(chalk.gray('  we deploy promote <project>  - Switch traffic to deployed slot'));
      console.log(chalk.gray('  we deploy rollback <project> - Rollback to previous slot'));
      console.log(chalk.gray('  we deploy slot <project>     - Check slot status'));
      console.log(chalk.gray('  we deploy status             - Show all deployments'));
      return;
    }
    return deployBlueGreen(project, options);
  });

// deploy promote
deployCmd
  .command('promote')
  .description('Switch traffic to deployed slot (zero-downtime)')
  .argument('<project>', 'Project name')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('-s, --slot <slot>', 'Specific slot to promote (blue|green)')
  .action(promote);

// deploy rollback
deployCmd
  .command('rollback')
  .description('Instant rollback to previous slot')
  .argument('<project>', 'Project name')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .action(rollbackBlueGreen);

// deploy slot
deployCmd
  .command('slot')
  .description('Check slot status (blue/green)')
  .argument('<project>', 'Project name')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .action(slotStatus);

// deploy status (alias for slot without project)
deployCmd
  .command('status')
  .description('Show all deployment status')
  .action(async () => {
    const { mcpClient } = await import('../src/lib/mcp-client.js');
    console.log(chalk.blue.bold('\n📊 Deployment Status\n'));
    try {
      const result = await mcpClient.healthCheck('all');
      console.log(chalk.gray(JSON.stringify(result, null, 2)));
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

// ============================================================================
// 2. HEALTH - 시스템 헬스체크 (핵심 명령어 #2)
// ============================================================================

const healthCmd = program
  .command('health')
  .description('시스템 헬스체크 (전체 인프라 상태 확인)')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-j, --json', 'Output in JSON format')
  .option('-w, --watch', 'Continuous health monitoring')
  .option('-i, --interval <seconds>', 'Watch interval in seconds', '30')
  .action(health);

// health monitor
healthCmd
  .command('monitor')
  .description('Real-time system monitoring')
  .option('-m, --metrics <types>', 'Metrics to monitor (cpu,memory,network,disk)', 'cpu,memory')
  .option('-i, --interval <seconds>', 'Update interval in seconds', '5')
  .option('-d, --duration <minutes>', 'Monitoring duration in minutes (0 = infinite)', '0')
  .option('-t, --threshold <value>', 'Alert threshold percentage', '80')
  .action(monitor);

// health scan
healthCmd
  .command('scan')
  .description('Scan server state and validate infrastructure')
  .argument('[project]', 'Project name to scan')
  .option('-s, --server', 'Scan servers only')
  .option('-p, --ports', 'Scan port allocation only')
  .option('-j, --json', 'Output in JSON format')
  .option('-d, --diff', 'Compare local vs server state')
  .option('-v, --validate', 'Validate infrastructure')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .action(scan);

// ============================================================================
// 3. INIT - 프로젝트 초기화 (핵심 명령어 #3)
// ============================================================================

const initCmd = program
  .command('init')
  .description('프로젝트 초기화 (CLAUDE.md, Skills, Hooks, MCP 설정)')
  .argument('[apiKey]', 'API Key (format: codeb_{teamId}_{role}_{token})')
  .option('-p, --path <path>', 'Target project path (default: current directory)')
  .option('-f, --force', 'Overwrite existing files')
  .action(init);

// init config
initCmd
  .command('config')
  .description('CLI 설정 관리 (show|set|path)')
  .argument('[action]', 'Action (show|set|path)', 'show')
  .option('--key <key>', 'Configuration key for set action')
  .option('--value <value>', 'Configuration value for set action')
  .action(config);

// init mcp
initCmd
  .command('mcp')
  .description('MCP 서버 설정 (setup|status|remove)')
  .argument('[action]', 'Action (setup|status|remove)', 'status')
  .option('--host <ip>', 'Server host IP')
  .option('--user <user>', 'SSH user')
  .option('--ssh-key <path>', 'SSH key path')
  .option('--force', 'Force overwrite existing config')
  .action(mcp);

// init update
initCmd
  .command('update')
  .description('CLAUDE.md 및 규칙 파일 업데이트')
  .option('-p, --path <path>', 'Target project path')
  .option('-f, --force', 'Force update all files')
  .option('--no-global', 'Skip updating ~/.claude/CLAUDE.md')
  .action(update);

// ============================================================================
// 4. WORKFLOW - 인프라 설정 (핵심 명령어 #4)
// ============================================================================

const workflowCmd = program
  .command('workflow')
  .description('인프라 설정 (Quadlet, GitHub Actions, 도메인, SSH)')
  .argument('<action>', 'Action (init|scan|github-actions|quadlet)')
  .argument('[target]', 'Project name or target')
  .option('-n, --name <name>', 'Project name')
  .option('-t, --type <type>', 'Project type (nextjs|remix|nodejs|python|go)', 'nextjs')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('--database', 'Include PostgreSQL database (default: true)')
  .option('--no-database', 'Exclude PostgreSQL database')
  .option('--redis', 'Include Redis cache (default: true)')
  .option('--no-redis', 'Exclude Redis cache')
  .option('--force', 'Overwrite existing files')
  .action(workflow);

// workflow domain
workflowCmd
  .command('domain')
  .description('도메인 관리 (setup|remove|check|list)')
  .argument('<action>', 'Action (setup|remove|check|list)')
  .argument('[domain]', 'Domain name')
  .option('-p, --project <name>', 'Project name')
  .option('--ssl', 'Enable SSL/TLS')
  .option('--www', 'Include www subdomain')
  .option('--force', 'Force operation')
  .action(domain);

// workflow ssh
workflowCmd
  .command('ssh')
  .description('SSH 키 관리 via Vultr API (register|list|remove|sync)')
  .argument('<action>', 'Action (register|list|remove|sync)')
  .argument('[target]', 'Key path or Key ID')
  .option('--api-key <key>', 'Vultr API key')
  .option('-n, --name <name>', 'SSH key name')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output in JSON format')
  .action(ssh);

// ============================================================================
// 5. ENV - 환경변수 관리 (핵심 명령어 #5)
// ============================================================================

const envCmd = program
  .command('env')
  .description('환경변수 관리 (scan, pull, push, fix)')
  .argument('<action>', 'Action (scan|pull|push|upload|fix|list|restore|backups)')
  .argument('[project]', 'Project name')
  .option('--env <environment>', 'Target environment (staging|production)', 'production')
  .option('--force', 'Force overwrite without prompts')
  .option('--dry-run', 'Show what would be changed')
  .option('--file <path>', 'Source .env file path')
  .option('--content <string>', 'ENV content string')
  .option('--no-restart', 'Skip service restart')
  .action(async (action, project, options) => {
    switch (action) {
      case 'scan':
        await envScan(project, options);
        break;
      case 'pull':
        await envPull(project, options);
        break;
      case 'push':
        await envPush(project, {
          environment: options.env,
          file: options.file,
          restart: options.restart
        });
        break;
      case 'upload':
        await envUpload(project, {
          environment: options.env,
          content: options.content,
          restart: options.restart
        });
        break;
      case 'fix':
        await envFix(project, {
          environment: options.env,
          dryRun: options.dryRun
        });
        break;
      case 'list':
        await envList(project, options);
        break;
      case 'restore':
        await envRestore(project, options);
        break;
      case 'backups':
        await envBackups(project, options);
        break;
      default:
        console.log(chalk.red(`Unknown action: ${action}`));
        console.log(chalk.gray('Available: scan, pull, push, upload, fix, list, restore, backups'));
    }
  });

// ============================================================================
// HELP
// ============================================================================

program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Core Commands (5):'));
  console.log('');
  console.log(chalk.cyan('  deploy') + chalk.gray('    - Blue-Green 배포 시스템'));
  console.log(chalk.gray('              we deploy <project>'));
  console.log(chalk.gray('              we deploy promote <project>'));
  console.log(chalk.gray('              we deploy rollback <project>'));
  console.log(chalk.gray('              we deploy slot <project>'));
  console.log('');
  console.log(chalk.cyan('  health') + chalk.gray('    - 시스템 헬스체크'));
  console.log(chalk.gray('              we health'));
  console.log(chalk.gray('              we health monitor'));
  console.log(chalk.gray('              we health scan'));
  console.log('');
  console.log(chalk.cyan('  init') + chalk.gray('      - 프로젝트 초기화'));
  console.log(chalk.gray('              we init [apiKey]'));
  console.log(chalk.gray('              we init config'));
  console.log(chalk.gray('              we init mcp'));
  console.log(chalk.gray('              we init update'));
  console.log('');
  console.log(chalk.cyan('  workflow') + chalk.gray('  - 인프라 설정'));
  console.log(chalk.gray('              we workflow init <project>'));
  console.log(chalk.gray('              we workflow scan <project>'));
  console.log(chalk.gray('              we workflow domain <action> [domain]'));
  console.log(chalk.gray('              we workflow ssh <action>'));
  console.log('');
  console.log(chalk.cyan('  env') + chalk.gray('       - 환경변수 관리'));
  console.log(chalk.gray('              we env scan [project]'));
  console.log(chalk.gray('              we env pull [project]'));
  console.log(chalk.gray('              we env push [project]'));
  console.log(chalk.gray('              we env fix [project]'));
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('');
  console.log(chalk.gray('  # 프로젝트 배포'));
  console.log('  $ we deploy myapp --environment staging');
  console.log('  $ we deploy promote myapp');
  console.log('  $ we deploy rollback myapp');
  console.log('');
  console.log(chalk.gray('  # 인프라 초기화'));
  console.log('  $ we workflow init myapp --type nextjs --database --redis');
  console.log('  $ we workflow domain setup myapp.codeb.kr');
  console.log('');
  console.log(chalk.gray('  # 환경변수 관리'));
  console.log('  $ we env scan myapp');
  console.log('  $ we env push myapp --file .env.production'));
  console.log('');
  console.log(chalk.cyan('Documentation: https://codeb.io/docs/cli'));
  console.log('');
});

// Error handling
program.configureOutput({
  outputError: (str, write) => {
    write(chalk.red(`\n❌ Error: ${str}`));
  }
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
