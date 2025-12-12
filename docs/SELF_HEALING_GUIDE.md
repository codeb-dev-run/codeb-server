# CodeB Self-Healing CI/CD Complete Guide

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [No-Deletion Principle](#no-deletion-principle)
- [Setup Guide](#setup-guide)
- [Configuration](#configuration)
- [Usage](#usage)
- [Monitoring & Metrics](#monitoring--metrics)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

CodeB Self-Healing CI/CD is an AI-powered continuous integration and deployment system that automatically detects and fixes build errors using Claude Code Max ($200/month subscription with unlimited tokens).

### Key Features

- **Automatic Error Detection**: Classifies TypeScript, ESLint, build, and test errors
- **AI-Powered Fixes**: Uses Claude Code CLI to intelligently fix errors
- **No-Deletion Principle**: Never deletes code to solve problems
- **Validation Gates**: Multi-step validation before accepting fixes
- **Preview Environments**: Automatic PR preview deployments
- **Slack Integration**: Real-time notifications
- **Metrics Tracking**: Success rate and performance monitoring

### Success Rate

- **Target**: >90% automatic fix rate for common errors
- **Average Fix Time**: 2-5 minutes per attempt
- **Max Attempts**: 5 attempts per workflow run
- **Supported Error Types**: TypeScript, ESLint, Import, Build, Test

---

## Architecture

### Workflow Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Trigger                       │
│              (push, pull_request, workflow_dispatch)            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Job 1: Build & Test (ubuntu-latest)                           │
│  ├─ Type Check                                                  │
│  ├─ Lint                                                        │
│  ├─ Build                                                       │
│  ├─ Test                                                        │
│  ├─ Capture Errors                                              │
│  └─ Classify Errors (type, complexity)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ (if build_failed)
┌─────────────────────────────────────────────────────────────────┐
│  Job 2: Claude Auto-Fix (self-hosted, claude-code)             │
│  ├─ Decode Error Logs                                           │
│  ├─ Create Fix Prompt (with No-Deletion rules)                 │
│  ├─ Run Claude Code CLI                                         │
│  ├─ Validate Fix (deletion check, forbidden patterns)          │
│  ├─ Re-test Build                                               │
│  ├─ Commit & Push Fix                                           │
│  └─ Notify Slack                                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
┌────────────────────┐   ┌────────────────────────┐
│  Job 3: Preview    │   │  Job 4: Docker Build   │
│  (PR only)         │   │  (main/develop only)   │
└────────┬───────────┘   └───────────┬────────────┘
         │                           │
         │                           ▼
         │              ┌─────────────────────────┐
         │              │  Job 5: Deploy Prod     │
         │              └────────┬────────────────┘
         │                       │
         └───────────────────────┴─────────┐
                                           │
                                           ▼
                           ┌───────────────────────────┐
                           │  Job 6: Collect Metrics   │
                           └───────────────────────────┘
```

### Infrastructure

- **GitHub Actions Runner**: Self-hosted runner with Claude Code CLI
- **Claude Code Max**: $200/month subscription (unlimited tokens)
- **MCP Server**: CodeB Deploy MCP for self-healing tools
- **Container Runtime**: Podman for deployments
- **Notification**: Slack webhooks

---

## No-Deletion Principle

### Core Philosophy

**"Never delete code to fix errors"**

The self-healing system is designed to add, modify, or refactor code, but never to simply remove code to make errors disappear.

### Forbidden Actions

#### Absolutely Prohibited

1. **Suppression Comments**
   ```typescript
   // ❌ FORBIDDEN
   // @ts-ignore
   // @ts-nocheck
   // @ts-expect-error
   // eslint-disable
   // eslint-disable-next-line
   ```

2. **Type Erasure**
   ```typescript
   // ❌ FORBIDDEN
   const data: any = fetchData();
   const result = data as any;
   ```

3. **Test Manipulation**
   ```typescript
   // ❌ FORBIDDEN
   test.skip('broken test', () => {});
   test.only('this one test', () => {});
   ```

4. **Error Suppression**
   ```bash
   # ❌ FORBIDDEN
   npm run build || true
   npm run test || exit 0
   continue-on-error: true
   ```

5. **Code Deletion**
   - Deleting functions to remove unused code errors
   - Removing imports to fix resolution errors
   - Commenting out failing tests
   - Removing type annotations

### Allowed Fixes

#### Constructive Solutions

1. **Type Definitions**
   ```typescript
   // ✅ ALLOWED
   interface UserData {
     id: number;
     name: string;
     email: string;
   }

   const data: UserData = fetchData();
   ```

2. **Import Additions**
   ```typescript
   // ✅ ALLOWED
   import { UserData } from './types';
   import type { ApiResponse } from '@/api';
   ```

3. **Null Safety**
   ```typescript
   // ✅ ALLOWED
   if (user && user.profile) {
     console.log(user.profile.name);
   }

   const name = user?.profile?.name ?? 'Anonymous';
   ```

4. **Type Assertions** (with specific types)
   ```typescript
   // ✅ ALLOWED
   const element = document.getElementById('app') as HTMLDivElement;
   const response = await fetch(url) as Promise<UserData>;

   // ❌ FORBIDDEN
   const data = response as any;
   ```

5. **Logic Fixes**
   ```typescript
   // ✅ ALLOWED
   // Fix: Missing return statement
   function getUser(id: number): User | null {
     const user = users.find(u => u.id === id);
     return user ?? null; // Added return
   }
   ```

6. **Test Assertion Corrections**
   ```typescript
   // ✅ ALLOWED
   // Fix: Wrong expected value
   expect(result).toBe(42); // Was: expect(result).toBe(0)
   ```

### Validation Process

The CI/CD validates every fix with three checks:

1. **Deletion Ratio Check**
   ```bash
   DELETIONS=$(git diff --numstat | awk '{ sum += $2 } END { print sum+0 }')
   ADDITIONS=$(git diff --numstat | awk '{ sum += $1 } END { print sum+0 }')

   if [ "$DELETIONS" -gt "$ADDITIONS" ]; then
     echo "::error::Fix rejected: More deletions than additions"
     exit 1
   fi
   ```

2. **Forbidden Pattern Scan**
   ```bash
   if git diff | grep -E "@ts-ignore|@ts-nocheck|eslint-disable|as any"; then
     echo "::error::Fix rejected: Contains forbidden patterns"
     exit 1
   fi
   ```

3. **Build Verification**
   ```bash
   npm run typecheck && \
   npm run lint && \
   npm run build && \
   npm run test:ci
   ```

---

## Setup Guide

### Prerequisites

- Ubuntu 20.04+ server with root access
- GitHub repository with Actions enabled
- Claude API key (from console.anthropic.com)
- Slack webhook (optional, for notifications)

### Step 1: Generate GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `admin:org` (if using organization runner)
4. Copy the token (starts with `ghp_`)

### Step 2: Install Self-Hosted Runner

```bash
# Set environment variables
export GITHUB_TOKEN="ghp_YOUR_TOKEN_HERE"
export GITHUB_REPO="owner/repository"  # or GITHUB_ORG="organization"

# Run installation script
sudo -E /path/to/scripts/setup-self-hosted-runner.sh
```

The script will:
- Install Node.js 20, GitHub CLI, and dependencies
- Download and configure GitHub Actions Runner
- Install Claude Code CLI
- Create systemd service
- Start the runner

### Step 3: Configure Claude Code Max

```bash
# Set Claude API key
export CLAUDE_API_KEY="sk-ant-YOUR_KEY_HERE"

# Optional: Set MCP server URL (default: http://localhost:3100)
export MCP_SERVER_URL="http://localhost:3100"

# Run configuration script
sudo -E /path/to/scripts/setup-claude-code-max.sh
```

The script will:
- Configure Claude authentication
- Set up MCP server connection
- Create environment variables
- Set up runner hooks
- Test connections

### Step 4: Configure Repository Secrets

Go to your GitHub repository settings → Secrets and variables → Actions:

1. **Required Secrets**:
   - None (runner uses local credentials)

2. **Optional Secrets**:
   - `SLACK_WEBHOOK_URL`: Slack incoming webhook URL for notifications

### Step 5: Add Workflow File

The workflow file is already created at `.github/workflows/self-healing-complete.yml`.

To use the basic version instead:
- Use `.github/workflows/claude-self-healing-ci.yml`

### Step 6: Test the Setup

```bash
# Push a commit with intentional error
git add .
git commit -m "test: trigger self-healing CI"
git push origin main

# Monitor the runner
journalctl -u actions.runner.* -f

# Check workflow on GitHub
# https://github.com/owner/repo/actions
```

---

## Configuration

### Workflow Inputs

```yaml
workflow_dispatch:
  inputs:
    skip_auto_fix:
      description: 'Skip automatic error fixing'
      default: 'false'
    max_attempts:
      description: 'Maximum fix attempts'
      default: '5'
    create_preview:
      description: 'Create preview environment'
      default: 'true'
```

### Environment Variables

#### Runner Environment (`/home/github-runner/.env`)

```bash
# Claude Configuration
CLAUDE_API_KEY=sk-ant-xxxxx
CLAUDE_MODEL=claude-sonnet-4
CLAUDE_MAX_TOKENS=unlimited

# MCP Server
MCP_SERVER_URL=http://localhost:3100
MCP_AUTO_CONNECT=true
MCP_TIMEOUT=30000

# CodeB Settings
CODEB_WORKSPACE=/opt/codeb/actions-runner/_work
CODEB_AUTO_FIX=true
CODEB_MAX_FIX_ATTEMPTS=5
CODEB_NO_DELETION_PRINCIPLE=true
```

#### Workflow Environment

```yaml
env:
  NODE_VERSION: '20'
  MAX_FIX_ATTEMPTS: '5'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
```

### MCP Server Configuration

Location: `/home/github-runner/.claude/mcp/settings.json`

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "url": "http://localhost:3100",
      "enabled": true,
      "capabilities": [
        "self-healing",
        "deployment",
        "database",
        "project-management"
      ],
      "tools": [
        "getBuildErrors",
        "validateFix",
        "autoFixBuildLoop"
      ]
    }
  }
}
```

---

## Usage

### Automatic Mode (Default)

Self-healing runs automatically on every push to `main`, `develop`, or `feature/**` branches.

```bash
# Just push your code
git push origin main

# CI will:
# 1. Build and test
# 2. Detect errors
# 3. Automatically fix (up to 5 attempts)
# 4. Commit fix
# 5. Deploy
```

### Manual Trigger

```bash
# Trigger via GitHub CLI
gh workflow run self-healing-complete.yml

# Or via GitHub UI:
# Actions → Self-Healing CI/CD Complete → Run workflow
```

### Skip Auto-Fix

```bash
# Push without auto-fix
gh workflow run self-healing-complete.yml -f skip_auto_fix=true

# Or add to commit message:
git commit -m "fix: manual fix [skip-auto-fix]"
```

### Preview Environments (PR)

When you create a PR:

1. Workflow runs automatically
2. Creates preview environment at `https://pr-{number}.preview.codeb.dev`
3. Comments on PR with preview URL
4. Auto-deletes when PR is closed

### Slack Notifications

If `SLACK_WEBHOOK_URL` is configured, you'll receive:

- ✅ Build fixed successfully
- ⚠️ Manual intervention required
- 🚀 Production deployment complete

---

## Monitoring & Metrics

### GitHub Actions Dashboard

View workflow runs at:
```
https://github.com/owner/repo/actions/workflows/self-healing-complete.yml
```

### Runner Logs

```bash
# View runner status
systemctl status actions.runner.*

# Follow runner logs
journalctl -u actions.runner.* -f

# View hook logs
tail -f /var/log/codeb/runner-hooks.log
```

### Self-Healing Metrics

The workflow automatically tracks:

| Metric | Description |
|--------|-------------|
| Total Runs | Number of workflow executions |
| Successful Fixes | Number of auto-fixed builds |
| Success Rate | Percentage of successful fixes |
| Error Type Distribution | TypeScript, ESLint, Build, Test |
| Fix Complexity | Low, Medium, High |
| Average Attempts | Average fix attempts per run |

View in workflow summary after each run.

### MCP Server Health

```bash
# Check MCP server
curl http://localhost:3100/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Runner Not Connecting

**Symptoms**: Runner shows as offline in GitHub

**Solutions**:
```bash
# Check runner status
systemctl status actions.runner.*

# Restart runner
sudo systemctl restart actions.runner.*

# Check runner logs
journalctl -u actions.runner.* -n 100 --no-pager

# Re-configure runner
cd /opt/codeb/actions-runner
sudo ./config.sh remove
sudo -E /path/to/scripts/setup-self-hosted-runner.sh
```

### Claude CLI Not Working

**Symptoms**: Error in auto-fix job

**Solutions**:
```bash
# Test Claude CLI
sudo -u github-runner claude --version

# Check API key
sudo -u github-runner cat /home/github-runner/.env | grep CLAUDE_API_KEY

# Re-configure Claude
sudo -E /path/to/scripts/setup-claude-code-max.sh
```

### Fix Validation Failing

**Symptoms**: "Fix rejected: Contains forbidden patterns"

**Cause**: Claude suggested a forbidden fix

**Solutions**:
1. Check `claude_output.log` in workflow artifacts
2. Review the error type and prompt
3. Manually fix the issue
4. Report pattern to improve prompts

### Build Still Failing After Max Attempts

**Symptoms**: All 5 attempts exhausted

**Actions**:
1. Review error logs in artifacts
2. Check if error is too complex for AI
3. Fix manually and push
4. Consider increasing `MAX_FIX_ATTEMPTS`

### Preview Environment Not Created

**Symptoms**: No preview URL in PR comment

**Solutions**:
```bash
# Check if preview job ran
gh run list --workflow=self-healing-complete.yml

# Check Podman containers
podman ps -a | grep preview

# Check logs
journalctl -u actions.runner.* | grep preview
```

---

## Best Practices

### 1. Commit Message Conventions

Use semantic commits for better tracking:

```bash
git commit -m "feat: add user authentication"
git commit -m "fix: resolve type error in UserService"
git commit -m "test: add unit tests for API"
```

### 2. Error Prevention

- Run `npm run typecheck` locally before pushing
- Use ESLint and Prettier in your IDE
- Enable pre-commit hooks with Husky

### 3. Monitoring

- Check workflow runs daily
- Review failed fixes to improve prompts
- Track success rate metrics

### 4. Cost Management

Claude Code Max costs $200/month:
- Monitor token usage in Claude dashboard
- Use caching for repeated queries
- Optimize fix prompts

### 5. Security

- Never commit API keys or secrets
- Use GitHub Secrets for sensitive data
- Regularly rotate runner tokens
- Keep runner system updated

### 6. Scaling

For multiple projects:
- Use organization-level runner
- Share MCP server across projects
- Implement runner auto-scaling
- Use GitHub Actions caching

---

## Advanced Configuration

### Custom Error Classification

Edit `.github/workflows/self-healing-complete.yml`:

```yaml
- name: Classify Errors
  run: |
    ERROR_TYPE="unknown"

    # Add custom patterns
    if grep -q "CUSTOM_ERROR_PATTERN" error_summary.log; then
      ERROR_TYPE="custom"
      FIX_COMPLEXITY="high"
    fi
```

### Custom Fix Prompts

Modify the prompt in the workflow:

```yaml
- name: Claude Code Auto-Fix Loop
  run: |
    cat > fix_prompt.txt << 'PROMPT_EOF'
    # Add project-specific context
    ## Project Architecture
    - Framework: Next.js 14
    - Database: PostgreSQL with Prisma
    - Testing: Jest + Playwright

    ## Custom Rules
    1. Always use Prisma client types
    2. Follow Next.js 14 App Router conventions
    PROMPT_EOF
```

### Multi-Language Support

For non-TypeScript projects, modify error detection:

```yaml
- name: Python Type Check
  run: mypy . 2>&1 | tee typecheck.log

- name: Go Build
  run: go build ./... 2>&1 | tee build.log
```

---

## FAQ

**Q: How much does this cost?**
A: Claude Code Max subscription is $200/month with unlimited tokens. Runner infrastructure costs depend on your hosting choice.

**Q: Can I use this with GitHub-hosted runners?**
A: The auto-fix job requires a self-hosted runner with Claude CLI. Other jobs can run on GitHub-hosted runners.

**Q: What types of errors can it fix?**
A: TypeScript type errors, ESLint issues, missing imports, simple logic bugs, and test assertion errors. Complex architectural issues require manual intervention.

**Q: How long does a fix attempt take?**
A: Typically 2-5 minutes per attempt, depending on error complexity and number of files.

**Q: Can it fix security vulnerabilities?**
A: It can fix simple dependency issues but should not be relied upon for security fixes. Always review security-related changes manually.

**Q: What happens if all attempts fail?**
A: The workflow fails and sends a Slack notification (if configured). You'll need to fix manually.

**Q: Can I customize the forbidden patterns?**
A: Yes, modify the `FORBIDDEN_PATTERNS` array in `codeb-deploy-system/mcp-server/src/tools/self-healing.ts`.

**Q: Does it work with monorepos?**
A: Yes, but you may need to customize error detection and fix prompts for each package.

---

## Support & Contributing

### Get Help

- GitHub Issues: https://github.com/your-org/codeb-server/issues
- Documentation: /docs
- MCP Server Logs: `journalctl -u codeb-mcp -f`

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### License

MIT License - see LICENSE file for details

---

**Last Updated**: 2024-12-09
**Version**: 1.0.0
**Maintained By**: CodeB Team
