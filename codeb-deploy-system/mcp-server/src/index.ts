#!/usr/bin/env node

/**
 * CodeB Deploy MCP Server
 * 100% CI/CD 자동화를 위한 MCP 서버
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Tools import
import { analyzeServer } from './tools/analyze-server.js';
import { initProject } from './tools/init-project.js';
import { executeDeploy } from './tools/deploy.js';
import { executeHealthcheck } from './tools/healthcheck.js';
import { executeRollback, getVersionHistory } from './tools/rollback.js';
import { executeNotify } from './tools/notify.js';
import { executeSecurityScan, generateSBOM } from './tools/security-scan.js';
import { executePreview } from './tools/preview.js';
import { executeMonitoring } from './tools/monitoring.js';
import { setupDomain, removeDomain, setupProjectDomains, setupPreviewDomain, checkDomainStatus } from './tools/domain.js';

// Podman Helpers & Compose Deploy
import {
  configurePgHba,
  getContainerIP,
  initVolume,
  ensureNetwork,
} from './tools/podman-helpers.js';
import {
  deployComposeProject,
  stopComposeProject,
  removeComposeProject,
  generateGitHubActionsWorkflow,
} from './tools/compose-deploy.js';

// GitHub Actions Error Analysis
import {
  getWorkflowErrors,
  analyzeBuildError,
  generateErrorReport,
} from './tools/github-actions.js';

// Self-Healing CI/CD
import {
  getBuildErrors,
  validateFix,
  autoFixBuildLoop,
  generateFixPrompt,
} from './tools/self-healing.js';

// Server Monitoring
import {
  monitorDisk,
  monitorSSL,
  checkBackupStatus,
  checkContainerHealth,
  fullHealthCheck,
  setupAutoBackup,
} from './tools/server-monitoring.js';

// Environment & Workflow Management
import { manageEnv, manageSecrets } from './tools/env-manager.js';
import { manageWorkflow, triggerBuildAndMonitor, checkBuildAndGetFeedback } from './tools/workflow-manager.js';

// Manifest Manager (IaC Layer)
import {
  validateManifest,
  applyManifest,
  getManifest,
  listManifests,
  generateManifestTemplate,
} from './tools/manifest-manager.js';

// Port Registry
import {
  portRegistry,
  loadPortRegistryFromServer,
  savePortRegistryToServer,
  syncPortRegistryWithServer,
} from './lib/port-registry.js';

// Project Registry
import {
  projectRegistry,
  loadProjectRegistryFromServer,
  saveProjectRegistryToServer,
  scanExistingProjects,
  generateConfigForProject,
  getProjectRegistrySummary,
} from './lib/project-registry.js';

// 서버 인스턴스 생성
const server = new Server(
  {
    name: 'codeb-deploy-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 도구 목록
const tools = [
  {
    name: 'analyze_server',
    description: '서버 상태를 분석합니다 (시스템 정보, 컨테이너, PM2 프로세스, 포트, 데이터베이스, 레지스트리)',
    inputSchema: {
      type: 'object',
      properties: {
        includeContainers: {
          type: 'boolean',
          description: '컨테이너 정보 포함 여부',
        },
        includePm2: {
          type: 'boolean',
          description: 'PM2 프로세스 정보 포함 여부',
        },
        includePorts: {
          type: 'boolean',
          description: '포트 정보 포함 여부',
        },
        includeDatabases: {
          type: 'boolean',
          description: '데이터베이스 정보 포함 여부',
        },
        includeRegistry: {
          type: 'boolean',
          description: '레지스트리 정보 포함 여부',
        },
      },
    },
  },
  {
    name: 'init_project',
    description: '새 프로젝트를 초기화합니다 (배포 설정, GitHub Actions, 환경 분리)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        projectType: {
          type: 'string',
          enum: ['nextjs', 'remix', 'nodejs', 'static'],
          description: '프로젝트 유형',
        },
        gitRepo: { type: 'string', description: 'GitHub 저장소 URL' },
        domain: { type: 'string', description: '기본 도메인' },
        services: {
          type: 'object',
          properties: {
            database: { type: 'boolean', description: 'PostgreSQL 사용 여부' },
            redis: { type: 'boolean', description: 'Redis 사용 여부' },
          },
        },
      },
      required: ['projectName', 'projectType'],
    },
  },
  {
    name: 'deploy',
    description: '프로젝트를 배포합니다 (Rolling, Blue-Green, Canary 전략 지원)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '배포 환경',
        },
        version: { type: 'string', description: '배포할 버전 태그' },
        strategy: {
          type: 'string',
          enum: ['rolling', 'blue-green', 'canary'],
          description: '배포 전략',
        },
        canaryWeight: { type: 'number', description: 'Canary 트래픽 비율 (%)' },
        skipTests: { type: 'boolean', description: '테스트 스킵 여부' },
        skipHealthcheck: { type: 'boolean', description: '헬스체크 스킵 여부' },
        prNumber: { type: 'string', description: 'Preview 환경 PR 번호' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'healthcheck',
    description: '배포된 서비스의 상태를 확인합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['http', 'container', 'database', 'redis', 'custom'],
          },
          description: '수행할 체크 종류',
        },
        httpEndpoint: { type: 'string', description: 'HTTP 헬스체크 엔드포인트' },
        timeout: { type: 'number', description: '타임아웃 (초)' },
        retries: { type: 'number', description: '재시도 횟수' },
        autoRollback: { type: 'boolean', description: '실패 시 자동 롤백' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'rollback',
    description: '배포를 이전 버전으로 롤백합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        targetVersion: { type: 'string', description: '롤백할 특정 버전' },
        reason: { type: 'string', description: '롤백 사유' },
        notify: { type: 'boolean', description: '알림 발송 여부' },
        dryRun: { type: 'boolean', description: '시뮬레이션 모드' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'get_version_history',
    description: '배포 버전 히스토리를 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        limit: { type: 'number', description: '조회할 버전 수' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'notify',
    description: 'Slack, PagerDuty, 이메일 등으로 알림을 전송합니다',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['slack', 'pagerduty', 'email', 'webhook'],
          description: '알림 채널',
        },
        type: {
          type: 'string',
          enum: ['deployment', 'rollback', 'healthcheck', 'security', 'custom'],
          description: '알림 유형',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warning', 'error', 'critical'],
          description: '심각도',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        title: { type: 'string', description: '알림 제목' },
        message: { type: 'string', description: '알림 메시지' },
        details: { type: 'object', description: '추가 상세 정보' },
        webhookUrl: { type: 'string', description: '커스텀 웹훅 URL' },
      },
      required: ['channel', 'type', 'severity', 'projectName', 'title', 'message'],
    },
  },
  {
    name: 'security_scan',
    description: 'Trivy로 이미지 취약점을 스캔하고 gitleaks로 시크릿을 검사합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        scanType: {
          type: 'string',
          enum: ['image', 'secrets', 'all'],
          description: '스캔 유형',
        },
        imageTag: { type: 'string', description: '스캔할 이미지 태그' },
        repoPath: { type: 'string', description: '스캔할 저장소 경로' },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
          description: '최소 심각도 필터',
        },
        failOnVulnerability: { type: 'boolean', description: '취약점 발견 시 실패 처리' },
      },
      required: ['projectName', 'scanType'],
    },
  },
  {
    name: 'generate_sbom',
    description: 'SBOM (Software Bill of Materials)을 생성합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        imageTag: { type: 'string', description: '이미지 태그' },
        format: {
          type: 'string',
          enum: ['spdx-json', 'cyclonedx', 'github'],
          description: 'SBOM 형식',
        },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'preview',
    description: 'PR 기반 Preview 환경을 생성, 업데이트, 삭제, 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'list', 'get'],
          description: '액션',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        prNumber: { type: 'string', description: 'PR 번호' },
        gitRef: { type: 'string', description: 'Git 참조' },
        ttlHours: { type: 'number', description: '자동 삭제까지 시간' },
      },
      required: ['action', 'projectName'],
    },
  },
  {
    name: 'monitoring',
    description: 'Prometheus + Grafana 기반 모니터링 스택을 설정하고 메트릭/알림을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['setup', 'status', 'metrics', 'alerts', 'configure'],
          description: '액션',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        metric: { type: 'string', description: '조회할 메트릭 이름' },
        timeRange: { type: 'string', description: '시간 범위 (예: 1h, 24h)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'port_summary',
    description: '포트 할당 현황을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sync_port_registry',
    description: '서버의 실제 포트 사용 현황을 스캔하여 포트 레지스트리를 동기화합니다. 포트 충돌 방지를 위해 배포 전 실행을 권장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        saveToServer: {
          type: 'boolean',
          description: '동기화 결과를 서버에 저장할지 여부 (기본값: true)',
        },
      },
    },
  },
  {
    name: 'setup_domain',
    description: 'PowerDNS와 Caddy를 사용하여 도메인을 설정합니다 (DNS A 레코드 + 리버스 프록시 + HTTPS)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        subdomain: { type: 'string', description: '서브도메인 (예: myapp → myapp.codeb.dev)' },
        baseDomain: { type: 'string', description: '기본 도메인 (예: codeb.dev 또는 one-q.xyz)' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        targetPort: { type: 'number', description: '프록시 대상 포트' },
        enableHttps: { type: 'boolean', description: 'HTTPS 활성화 (기본값: true)' },
        enableWwwRedirect: { type: 'boolean', description: 'www 리다이렉트 활성화' },
      },
      required: ['projectName', 'subdomain', 'baseDomain', 'environment', 'targetPort'],
    },
  },
  {
    name: 'remove_domain',
    description: '도메인 설정을 삭제합니다 (DNS 레코드 + Caddy 설정)',
    inputSchema: {
      type: 'object',
      properties: {
        subdomain: { type: 'string', description: '서브도메인' },
        baseDomain: { type: 'string', description: '기본 도메인' },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: { type: 'string', description: '환경' },
      },
      required: ['subdomain', 'baseDomain', 'projectName', 'environment'],
    },
  },
  {
    name: 'setup_project_domains',
    description: '프로젝트의 staging과 production 도메인을 일괄 설정합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        baseDomain: { type: 'string', description: '기본 도메인 (예: codeb.dev)' },
        stagingPort: { type: 'number', description: 'Staging 환경 포트' },
        productionPort: { type: 'number', description: 'Production 환경 포트' },
        customStagingSubdomain: { type: 'string', description: '커스텀 staging 서브도메인' },
        customProductionSubdomain: { type: 'string', description: '커스텀 production 서브도메인' },
      },
      required: ['projectName', 'baseDomain', 'stagingPort', 'productionPort'],
    },
  },
  {
    name: 'setup_preview_domain',
    description: 'PR Preview 환경의 도메인을 설정합니다',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        prNumber: { type: 'string', description: 'PR 번호' },
        baseDomain: { type: 'string', description: '기본 도메인' },
        targetPort: { type: 'number', description: '대상 포트' },
      },
      required: ['projectName', 'prNumber', 'baseDomain', 'targetPort'],
    },
  },
  {
    name: 'check_domain_status',
    description: '도메인의 DNS 및 HTTPS 상태를 확인합니다',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '확인할 도메인 (예: myapp.codeb.dev)' },
      },
      required: ['domain'],
    },
  },
  // ========== Podman Helpers ==========
  {
    name: 'configure_pg_hba',
    description: 'PostgreSQL pg_hba.conf를 설정합니다. 컨테이너 네트워크(10.88.0.0/16)에서의 접속을 허용하도록 규칙을 추가합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        containerName: { type: 'string', description: 'PostgreSQL 컨테이너 이름' },
        allowedNetworks: {
          type: 'array',
          items: { type: 'string' },
          description: '허용할 네트워크 CIDR (기본값: ["10.88.0.0/16", "172.16.0.0/12"])',
        },
        authMethod: {
          type: 'string',
          enum: ['trust', 'md5', 'scram-sha-256'],
          description: '인증 방식 (기본값: trust)',
        },
        restartAfter: { type: 'boolean', description: '설정 후 PostgreSQL 재시작 (기본값: true)' },
      },
      required: ['containerName'],
    },
  },
  {
    name: 'get_container_ip',
    description: 'Podman 컨테이너의 IP 주소를 조회합니다. Podman 3.x에서 서비스 DNS가 작동하지 않을 때 실제 IP를 사용하기 위해 필요합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        containerName: { type: 'string', description: '컨테이너 이름' },
        networkName: { type: 'string', description: '네트워크 이름 (선택사항)' },
      },
      required: ['containerName'],
    },
  },
  {
    name: 'init_volume',
    description: 'Podman 볼륨을 초기화합니다. 기존 볼륨의 비밀번호 충돌 문제를 해결하기 위한 다양한 모드를 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        volumeName: { type: 'string', description: '볼륨 이름' },
        mode: {
          type: 'string',
          enum: ['create-if-not-exists', 'recreate', 'backup-and-recreate'],
          description: '볼륨 초기화 모드 (기본값: create-if-not-exists)',
        },
        labels: {
          type: 'object',
          description: '볼륨 라벨',
        },
      },
      required: ['volumeName'],
    },
  },
  {
    name: 'ensure_network',
    description: 'Podman 네트워크를 생성하거나 확인합니다. CNI 네트워크 오류 시 기본 podman 네트워크로 폴백합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        networkName: { type: 'string', description: '네트워크 이름' },
        subnet: { type: 'string', description: '서브넷 CIDR (예: 10.89.0.0/24)' },
        gateway: { type: 'string', description: '게이트웨이 IP' },
        internal: { type: 'boolean', description: '내부 전용 네트워크 (기본값: false)' },
        labels: { type: 'object', description: '네트워크 라벨' },
      },
      required: ['networkName'],
    },
  },
  // ========== Compose Deploy ==========
  {
    name: 'deploy_compose_project',
    description: 'Compose 스타일로 프로젝트를 배포합니다 (App + PostgreSQL + Redis). pg_hba.conf 자동 설정, 컨테이너 IP 발견, DATABASE_URL 주입을 자동으로 처리합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '배포 환경',
        },
        app: {
          type: 'object',
          description: '앱 설정',
          properties: {
            image: { type: 'string', description: '앱 이미지 (예: ghcr.io/org/app:latest)' },
            port: { type: 'number', description: '앱 포트' },
            envFile: { type: 'string', description: '환경 변수 파일 경로' },
            env: { type: 'object', description: '환경 변수' },
            healthcheck: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '헬스체크 경로' },
                port: { type: 'number', description: '헬스체크 포트' },
              },
            },
          },
          required: ['image', 'port'],
        },
        postgres: {
          type: 'object',
          description: 'PostgreSQL 설정',
          properties: {
            enabled: { type: 'boolean', description: 'PostgreSQL 사용 여부 (기본값: true)' },
            version: { type: 'string', description: 'PostgreSQL 버전 (기본값: 15)' },
            port: { type: 'number', description: '외부 포트' },
            database: { type: 'string', description: '데이터베이스 이름' },
            username: { type: 'string', description: '사용자명' },
            password: { type: 'string', description: '비밀번호' },
            volumeMode: {
              type: 'string',
              enum: ['create-if-not-exists', 'recreate', 'backup-and-recreate'],
              description: '볼륨 모드',
            },
          },
        },
        redis: {
          type: 'object',
          description: 'Redis 설정',
          properties: {
            enabled: { type: 'boolean', description: 'Redis 사용 여부 (기본값: true)' },
            version: { type: 'string', description: 'Redis 버전 (기본값: 7)' },
            port: { type: 'number', description: '외부 포트' },
            password: { type: 'string', description: 'Redis 비밀번호' },
          },
        },
        network: {
          type: 'object',
          description: '네트워크 설정',
          properties: {
            name: { type: 'string', description: '네트워크 이름' },
            subnet: { type: 'string', description: '서브넷 CIDR' },
          },
        },
      },
      required: ['projectName', 'environment', 'app'],
    },
  },
  {
    name: 'stop_compose_project',
    description: 'Compose 프로젝트의 모든 컨테이너를 중지합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'remove_compose_project',
    description: 'Compose 프로젝트의 모든 컨테이너와 선택적으로 볼륨을 삭제합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        removeVolumes: { type: 'boolean', description: '볼륨도 삭제할지 여부 (기본값: false)' },
        removeNetwork: { type: 'boolean', description: '네트워크도 삭제할지 여부 (기본값: false)' },
      },
      required: ['projectName', 'environment'],
    },
  },
  {
    name: 'generate_github_actions_workflow',
    description: 'GitHub Actions CI/CD 워크플로우를 생성합니다. 이 워크플로우는 코드를 빌드하고 ghcr.io에 이미지를 푸시합니다. 생성된 파일을 .github/workflows/ 디렉토리에 저장하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름 (Docker 이미지 이름으로 사용)' },
        nodeVersion: { type: 'string', description: 'Node.js 버전 (기본값: 20)' },
        dockerfile: { type: 'string', description: 'Dockerfile 경로 (기본값: ./Dockerfile)' },
        buildContext: { type: 'string', description: '빌드 컨텍스트 경로 (기본값: .)' },
        includeTests: { type: 'boolean', description: '테스트 단계 포함 여부 (기본값: true)' },
        includeLint: { type: 'boolean', description: '린트 단계 포함 여부 (기본값: true)' },
      },
      required: ['projectName'],
    },
  },
  // ========== Project Registry ==========
  {
    name: 'scan_existing_projects',
    description: 'MCP 사용 전 기존 배포된 프로젝트를 스캔하여 자동 등록합니다. Podman 컨테이너를 분석하여 프로젝트별로 그룹화하고, 포트 충돌을 감지합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        generateConfigs: {
          type: 'boolean',
          description: '스캔된 프로젝트에 대해 설정 파일을 자동 생성할지 여부 (기본값: false)',
        },
      },
    },
  },
  {
    name: 'list_projects',
    description: '등록된 모든 프로젝트 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'active', 'inactive'],
          description: '필터링할 상태 (기본값: all)',
        },
      },
    },
  },
  {
    name: 'get_project',
    description: '특정 프로젝트의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'generate_project_config',
    description: '스캔된 프로젝트에 대해 MCP 설정 파일을 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '프로젝트 이름' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'project_registry_summary',
    description: '프로젝트 레지스트리 요약 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // ========== GitHub Actions Error Analysis ==========
  {
    name: 'get_workflow_errors',
    description: 'GitHub Actions 워크플로우의 에러를 조회합니다. 실패한 워크플로우 실행의 로그를 분석하여 에러 정보를 추출합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자 (사용자명 또는 조직명)' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        branch: { type: 'string', description: '특정 브랜치만 필터링 (선택사항)' },
        limit: { type: 'number', description: '조회할 워크플로우 실행 수 (기본값: 10)' },
        githubToken: { type: 'string', description: 'GitHub Personal Access Token (GITHUB_TOKEN 환경변수 대신 사용)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'analyze_build_error',
    description: 'GitHub Actions 빌드 에러를 분석하고 수정 방안을 제안합니다. get_workflow_errors로 조회한 에러를 분석합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          description: 'get_workflow_errors에서 반환된 에러 객체',
          properties: {
            runId: { type: 'number' },
            runUrl: { type: 'string' },
            branch: { type: 'string' },
            commit: { type: 'string' },
            jobName: { type: 'string' },
            stepName: { type: 'string' },
            stepNumber: { type: 'number' },
            errorType: { type: 'string' },
            errorMessage: { type: 'string' },
            errorDetails: { type: 'array', items: { type: 'string' } },
            timestamp: { type: 'string' },
          },
        },
        projectPath: { type: 'string', description: '로컬 프로젝트 경로 (선택사항)' },
      },
      required: ['error'],
    },
  },
  {
    name: 'generate_error_report',
    description: '여러 GitHub Actions 에러와 분석 결과를 Markdown 리포트로 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        errors: {
          type: 'array',
          description: 'get_workflow_errors에서 반환된 에러 배열',
          items: { type: 'object' },
        },
        analyses: {
          type: 'array',
          description: 'analyze_build_error에서 반환된 분석 결과 배열',
          items: { type: 'object' },
        },
      },
      required: ['errors'],
    },
  },
  // ========== Self-Healing CI/CD ==========
  {
    name: 'get_build_errors',
    description: '최근 빌드 에러를 조회합니다. GitHub Actions 워크플로우 실패 로그를 분석하여 에러 유형별로 분류합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        runId: { type: 'number', description: '특정 워크플로우 실행 ID (선택사항)' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'validate_fix',
    description: '수정이 No-Deletion 원칙을 준수하는지 검증합니다. 금지된 패턴(@ts-ignore, eslint-disable 등) 사용 여부와 삭제/추가 비율을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        branch: { type: 'string', description: '검증할 브랜치' },
        baseRef: { type: 'string', description: '비교 기준 (기본값: HEAD~1)' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['owner', 'repo', 'branch'],
    },
  },
  {
    name: 'auto_fix_build_loop',
    description: '빌드 에러를 자동으로 수정하고 성공할 때까지 반복합니다. 최대 시도 횟수까지 빌드→수정→검증→재빌드를 반복합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        branch: { type: 'string', description: '대상 브랜치' },
        maxAttempts: { type: 'number', description: '최대 시도 횟수 (기본값: 5)' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['owner', 'repo', 'branch'],
    },
  },
  {
    name: 'generate_fix_prompt',
    description: '빌드 에러에 대한 AI 수정 프롬프트를 생성합니다. No-Deletion 원칙이 포함된 상세한 수정 지침을 제공합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        errors: {
          type: 'array',
          description: '빌드 에러 배열',
          items: {
            type: 'object',
            properties: {
              errorType: { type: 'string' },
              file: { type: 'string' },
              line: { type: 'number' },
              message: { type: 'string' },
            },
          },
        },
      },
      required: ['errors'],
    },
  },
  // ========== Server Monitoring ==========
  {
    name: 'monitor_disk',
    description: '서버 디스크 사용량을 모니터링합니다. 80% 이상 경고, 90% 이상 위험 알림을 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'monitor_ssl',
    description: 'SSL 인증서 만료일을 모니터링합니다. 7일 이하 위험, 14일 이하 경고 알림을 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: '확인할 도메인 목록 (미지정 시 Caddy에서 자동 추출)',
        },
      },
    },
  },
  {
    name: 'check_backup_status',
    description: '백업 상태를 확인합니다. 최근 백업 파일, 자동 백업 cron 설정 여부를 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_container_health',
    description: '컨테이너 헬스 상태를 확인합니다. 비정상 컨테이너, 재시작 횟수, 리소스 사용량을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'full_health_check',
    description: '서버 전체 헬스체크를 수행합니다. 디스크, SSL, 백업, 컨테이너를 모두 확인하고 종합 상태를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'setup_auto_backup',
    description: 'PostgreSQL 자동 백업을 설정합니다. cron 작업을 등록하고 백업 스크립트를 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        databases: {
          type: 'array',
          items: { type: 'string' },
          description: '백업할 데이터베이스 목록',
        },
        backupDir: { type: 'string', description: '백업 저장 디렉토리 (기본값: /opt/codeb/backups)' },
        retention: { type: 'number', description: '보관 기간 (일, 기본값: 7)' },
        schedule: { type: 'string', description: 'cron 표현식 (기본값: 0 3 * * * - 매일 새벽 3시)' },
      },
      required: ['databases'],
    },
  },
  // ========== Environment & Secrets Management ==========
  {
    name: 'manage_env',
    description: '서버의 환경 변수 파일(.env)을 관리합니다. 조회, 설정, 삭제, 동기화를 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'delete', 'list', 'sync'],
          description: '수행할 액션',
        },
        projectName: { type: 'string', description: '프로젝트 이름' },
        environment: {
          type: 'string',
          enum: ['staging', 'production', 'preview'],
          description: '환경',
        },
        key: { type: 'string', description: '환경 변수 키' },
        value: { type: 'string', description: '환경 변수 값' },
        envFile: {
          type: 'object',
          description: '여러 환경 변수를 한번에 설정 (key-value 객체)',
        },
      },
      required: ['action', 'projectName', 'environment'],
    },
  },
  {
    name: 'manage_secrets',
    description: 'GitHub Secrets를 관리합니다. gh CLI를 통해 시크릿을 조회, 설정, 삭제합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'delete', 'list'],
          description: '수행할 액션',
        },
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        secretName: { type: 'string', description: '시크릿 이름' },
        secretValue: { type: 'string', description: '시크릿 값' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['action', 'owner', 'repo'],
    },
  },
  // ========== Workflow Management ==========
  {
    name: 'manage_workflow',
    description: 'GitHub Actions 워크플로우를 관리합니다. 목록 조회, 실행, 취소, 재실행을 지원합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'run', 'cancel', 'rerun', 'logs'],
          description: '수행할 액션',
        },
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        workflowId: { type: 'string', description: '워크플로우 ID 또는 파일명' },
        runId: { type: 'number', description: '실행 ID' },
        ref: { type: 'string', description: 'Git 참조 (브랜치, 태그)' },
        inputs: { type: 'object', description: '워크플로우 입력 값' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['action', 'owner', 'repo'],
    },
  },
  {
    name: 'trigger_build_and_monitor',
    description: '빌드를 트리거하고 완료될 때까지 모니터링합니다. 실패 시 에러 로그를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        workflowId: { type: 'string', description: '워크플로우 ID 또는 파일명' },
        ref: { type: 'string', description: 'Git 참조' },
        inputs: { type: 'object', description: '워크플로우 입력 값' },
        pollInterval: { type: 'number', description: '상태 확인 간격 (초, 기본값: 30)' },
        timeout: { type: 'number', description: '타임아웃 (초, 기본값: 1800)' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['owner', 'repo', 'workflowId', 'ref'],
    },
  },
  {
    name: 'check_build_and_get_feedback',
    description: '빌드 상태를 확인하고 실패 시 AI 수정용 피드백을 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'GitHub 저장소 소유자' },
        repo: { type: 'string', description: 'GitHub 저장소 이름' },
        runId: { type: 'number', description: '실행 ID' },
        generatePrompt: { type: 'boolean', description: 'AI 수정 프롬프트 생성 여부 (기본값: true)' },
        githubToken: { type: 'string', description: 'GitHub Token' },
      },
      required: ['owner', 'repo', 'runId'],
    },
  },
  // ========== Manifest Manager (IaC Layer) ==========
  {
    name: 'validate_manifest',
    description: 'YAML 프로젝트 매니페스트를 검증합니다. 필수 필드, 포트 범위, Redis DB 인덱스, 배포 전략 등을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'YAML 매니페스트 내용' },
      },
      required: ['content'],
    },
  },
  {
    name: 'apply_manifest',
    description: '매니페스트를 적용하여 인프라를 프로비저닝합니다. 포트 할당, 데이터베이스 생성, Redis 예약, MinIO 버킷 생성, 도메인 설정을 자동으로 수행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'YAML 매니페스트 내용' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_manifest',
    description: '프로젝트의 저장된 매니페스트를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '프로젝트 ID' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_manifests',
    description: '서버에 저장된 모든 매니페스트 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'generate_manifest_template',
    description: '새 프로젝트를 위한 매니페스트 템플릿을 생성합니다. 프로젝트 타입에 따라 기본값이 설정됩니다.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '프로젝트 ID' },
        projectType: {
          type: 'string',
          enum: ['nextjs', 'remix', 'nodejs', 'static'],
          description: '프로젝트 유형 (기본값: nextjs)',
        },
      },
      required: ['projectId'],
    },
  },
];

// 도구 목록 요청 핸들러
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 도구 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'analyze_server':
        result = await analyzeServer();
        break;

      case 'init_project':
        result = await initProject(args as any);
        break;

      case 'deploy':
        result = await executeDeploy(args as any);
        break;

      case 'healthcheck':
        result = await executeHealthcheck(args as any);
        break;

      case 'rollback':
        result = await executeRollback(args as any);
        break;

      case 'get_version_history':
        result = await getVersionHistory(args as any);
        break;

      case 'notify':
        result = await executeNotify(args as any);
        break;

      case 'security_scan':
        result = await executeSecurityScan(args as any);
        break;

      case 'generate_sbom':
        result = await generateSBOM(args as any);
        break;

      case 'preview':
        result = await executePreview(args as any);
        break;

      case 'monitoring':
        result = await executeMonitoring(args as any);
        break;

      case 'port_summary':
        result = portRegistry.getSummary();
        break;

      case 'sync_port_registry':
        result = await syncPortRegistryWithServer();
        break;

      case 'setup_domain':
        result = await setupDomain(args as any);
        break;

      case 'remove_domain':
        result = await removeDomain(args as any);
        break;

      case 'setup_project_domains':
        result = await setupProjectDomains(args as any);
        break;

      case 'setup_preview_domain':
        result = await setupPreviewDomain(args as any);
        break;

      case 'check_domain_status':
        result = await checkDomainStatus((args as any).domain);
        break;

      // Podman Helpers
      case 'configure_pg_hba':
        result = await configurePgHba(args as any);
        break;

      case 'get_container_ip':
        result = await getContainerIP((args as any).containerName);
        break;

      case 'init_volume':
        result = await initVolume(args as any);
        break;

      case 'ensure_network':
        result = await ensureNetwork(args as any);
        break;

      // Compose Deploy
      case 'deploy_compose_project':
        // MCP 스키마 → 내부 타입 변환 (username→user, 플랫→services 중첩)
        const composeArgs = args as any;
        result = await deployComposeProject({
          projectName: composeArgs.projectName,
          projectPath: composeArgs.projectPath,
          services: {
            app: composeArgs.app,
            postgres: composeArgs.postgres ? {
              enabled: composeArgs.postgres.enabled ?? true,
              port: composeArgs.postgres.port,
              database: composeArgs.postgres.database,
              user: composeArgs.postgres.user || composeArgs.postgres.username, // username→user 호환
              password: composeArgs.postgres.password,
              version: composeArgs.postgres.version,
            } : undefined,
            redis: composeArgs.redis,
          },
          domain: composeArgs.domain,
          networkName: composeArgs.network?.name || composeArgs.networkName,
          ghcrAuth: composeArgs.ghcrAuth,
        });
        break;

      case 'stop_compose_project':
        // 환경 정보를 프로젝트 이름에 포함
        const stopProjectName = (args as any).environment
          ? `${(args as any).projectName}-${(args as any).environment}`
          : (args as any).projectName;
        result = await stopComposeProject(stopProjectName);
        break;

      case 'remove_compose_project':
        // 환경 정보를 프로젝트 이름에 포함
        const removeProjectName = (args as any).environment
          ? `${(args as any).projectName}-${(args as any).environment}`
          : (args as any).projectName;
        result = await removeComposeProject(removeProjectName, (args as any).removeVolumes || false);
        break;

      case 'generate_github_actions_workflow':
        result = generateGitHubActionsWorkflow(args as any);
        break;

      // Project Registry
      case 'scan_existing_projects':
        const scanResult = await scanExistingProjects();
        // 설정 파일 자동 생성 옵션
        if ((args as any)?.generateConfigs) {
          for (const project of scanResult.projects) {
            await generateConfigForProject(project.name);
          }
        }
        result = scanResult;
        break;

      case 'list_projects':
        const statusFilter = (args as any)?.status || 'all';
        let projects = projectRegistry.getAllProjects();
        if (statusFilter === 'active') {
          projects = projects.filter((p) => p.status === 'active');
        } else if (statusFilter === 'inactive') {
          projects = projects.filter((p) => p.status === 'inactive');
        }
        result = { projects, total: projects.length };
        break;

      case 'get_project':
        const projectName = (args as any).projectName;
        const project = projectRegistry.getProject(projectName);
        if (!project) {
          throw new McpError(ErrorCode.InvalidRequest, `Project not found: ${projectName}`);
        }
        result = project;
        break;

      case 'generate_project_config':
        result = await generateConfigForProject((args as any).projectName);
        break;

      case 'project_registry_summary':
        result = getProjectRegistrySummary();
        break;

      // GitHub Actions Error Analysis
      case 'get_workflow_errors':
        result = await getWorkflowErrors(args as any);
        break;

      case 'analyze_build_error':
        result = await analyzeBuildError(args as any);
        break;

      case 'generate_error_report':
        const reportArgs = args as any;
        const analyses = reportArgs.analyses || [];
        result = {
          report: generateErrorReport(reportArgs.errors, analyses),
          errorCount: reportArgs.errors.length,
          analysisCount: analyses.length,
        };
        break;

      // Self-Healing CI/CD
      case 'get_build_errors':
        result = await getBuildErrors(args as any);
        break;

      case 'validate_fix':
        result = await validateFix(args as any);
        break;

      case 'auto_fix_build_loop':
        result = await autoFixBuildLoop(args as any);
        break;

      case 'generate_fix_prompt':
        result = { prompt: generateFixPrompt((args as any).errors) };
        break;

      // Server Monitoring
      case 'monitor_disk':
        result = await monitorDisk();
        break;

      case 'monitor_ssl':
        result = await monitorSSL((args as any)?.domains);
        break;

      case 'check_backup_status':
        result = await checkBackupStatus();
        break;

      case 'check_container_health':
        result = await checkContainerHealth();
        break;

      case 'full_health_check':
        result = await fullHealthCheck();
        break;

      case 'setup_auto_backup':
        result = await setupAutoBackup(args as any);
        break;

      // Environment & Secrets Management
      case 'manage_env':
        result = await manageEnv(args as any);
        break;

      case 'manage_secrets':
        result = await manageSecrets(args as any);
        break;

      // Workflow Management
      case 'manage_workflow':
        result = await manageWorkflow(args as any);
        break;

      case 'trigger_build_and_monitor':
        result = await triggerBuildAndMonitor(args as any);
        break;

      case 'check_build_and_get_feedback':
        result = await checkBuildAndGetFeedback(args as any);
        break;

      // Manifest Manager (IaC Layer)
      case 'validate_manifest':
        result = validateManifest((args as any).content);
        break;

      case 'apply_manifest':
        result = await applyManifest((args as any).content);
        break;

      case 'get_manifest':
        result = await getManifest((args as any).projectId);
        break;

      case 'list_manifests':
        result = await listManifests();
        break;

      case 'generate_manifest_template':
        result = {
          template: generateManifestTemplate(
            (args as any).projectId,
            (args as any).projectType || 'nextjs'
          ),
        };
        break;

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };

  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// 서버 시작
async function main() {
  // 서버에서 포트 레지스트리 로드
  try {
    await loadPortRegistryFromServer();
  } catch (error) {
    console.error('Failed to load port registry:', error);
  }

  // 서버에서 프로젝트 레지스트리 로드
  try {
    await loadProjectRegistryFromServer();
  } catch (error) {
    console.error('Failed to load project registry:', error);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CodeB Deploy MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
