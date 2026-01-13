#!/usr/bin/env node
/**
 * CodeB MCP Proxy - Claude Code 연동용 엔트리포인트
 *
 * 사용법 (Claude Code settings.json):
 * {
 *   "mcpServers": {
 *     "codeb": {
 *       "command": "codeb-mcp"
 *     }
 *   }
 * }
 */

import { startMcpServer } from '../src/mcp/index.js';

startMcpServer().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
