/**
 * Workflow Module - Template Generators
 *
 * Re-exports all template generators for use in main workflow.js
 * This module structure allows for easier maintenance and testing
 */

// GitHub Actions CI/CD workflow generator
export { generateGitHubActionsWorkflow } from './github-actions.js';

// Dockerfile generator for various project types
export { generateDockerfile } from './dockerfile.js';

// Quadlet (Podman systemd) configuration generators
export { generateQuadletTemplate, generateProjectSet } from './quadlet.js';
