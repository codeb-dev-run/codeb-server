#!/usr/bin/env node
/**
 * CodeB MCP Proxy Server v7.0
 *
 * This MCP server is a proxy to the CodeB HTTP API.
 * No SSH connections - all operations go through API with API Key authentication.
 *
 * Architecture:
 *   Claude Code → MCP Proxy → HTTP API (api.codeb.kr) → Server
 *
 * Benefits:
 *   - Team members don't need SSH access
 *   - API Key based authentication (like Vercel)
 *   - Centralized access control
 *   - Audit logging on API side
 */
export {};
