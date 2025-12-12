/**
 * CodeB Deploy MCP - Podman 헬퍼 도구
 * Podman 3.x 환경에서의 배포 문제 해결을 위한 유틸리티
 *
 * 해결하는 문제들:
 * 1. PostgreSQL pg_hba.conf 자동 설정 (컨테이너 네트워크 인증)
 * 2. Podman 3.x 서비스 DNS 미지원 대응 (컨테이너 IP 발견)
 * 3. 볼륨 초기화 vs 기존 데이터 충돌 처리
 * 4. CNI 네트워크 오류 폴백 전략
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 1. PostgreSQL pg_hba.conf 자동 설정
// ============================================================================

export interface PgHbaConfig {
  containerName: string;
  trustedNetworks?: string[];  // 기본: ['10.88.0.0/16'] (Podman 기본 네트워크)
  defaultAuthMethod?: 'trust' | 'md5' | 'scram-sha-256';
}

/**
 * PostgreSQL pg_hba.conf 자동 설정
 * Podman 컨테이너 네트워크에서 인증 문제 해결
 *
 * 문제: pg_hba.conf에서 "host all all all scram-sha-256"가 먼저 매칭되어
 *       컨테이너 간 통신이 차단됨
 *
 * 해결: 컨테이너 네트워크 규칙을 먼저 추가
 *       host all all 10.88.0.0/16 trust (또는 md5)
 *       host all all all scram-sha-256
 */
export async function configurePgHba(config: PgHbaConfig): Promise<{
  success: boolean;
  message: string;
  currentConfig?: string;
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    containerName,
    trustedNetworks = ['10.88.0.0/16'],
    defaultAuthMethod = 'trust',
  } = config;

  try {
    // 1. 컨테이너 존재 확인
    const exists = await ssh.exec(
      `podman container exists ${containerName} && echo "exists" || echo "not_found"`
    );
    if (exists.stdout.trim() !== 'exists') {
      return {
        success: false,
        message: `Container not found: ${containerName}`,
      };
    }

    // 2. 컨테이너가 실행 중인지 확인
    const running = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Running}}'`
    );
    if (running.stdout.trim() !== 'true') {
      return {
        success: false,
        message: `Container not running: ${containerName}`,
      };
    }

    // 3. pg_hba.conf 위치 확인
    const pgDataResult = await ssh.exec(
      `podman exec ${containerName} bash -c "echo \\$PGDATA"`
    );
    const pgData = pgDataResult.stdout.trim() || '/var/lib/postgresql/data';

    // 4. 현재 pg_hba.conf 읽기
    const currentHba = await ssh.exec(
      `podman exec ${containerName} cat ${pgData}/pg_hba.conf 2>/dev/null || echo ""`
    );

    // 5. 컨테이너 네트워크 규칙이 이미 있는지 확인
    const hasNetworkRule = trustedNetworks.some(network =>
      currentHba.stdout.includes(network)
    );

    if (hasNetworkRule) {
      // 규칙이 있지만 순서 확인
      const lines = currentHba.stdout.split('\n');
      const networkRuleIndex = lines.findIndex(line =>
        trustedNetworks.some(network => line.includes(network))
      );
      const allRuleIndex = lines.findIndex(line =>
        line.includes('host') && line.includes('all') &&
        !trustedNetworks.some(network => line.includes(network)) &&
        (line.includes('scram-sha-256') || line.includes('md5'))
      );

      // 네트워크 규칙이 all 규칙보다 먼저 있으면 OK
      if (networkRuleIndex < allRuleIndex || allRuleIndex === -1) {
        return {
          success: true,
          message: 'pg_hba.conf already configured correctly',
          currentConfig: currentHba.stdout,
        };
      }
    }

    // 6. 새 pg_hba.conf 생성
    const networkRules = trustedNetworks
      .map(network => `host    all             all             ${network}            ${defaultAuthMethod}`)
      .join('\n');

    // 기존 설정에서 네트워크 규칙 제거 후 맨 앞에 추가
    const filteredLines = currentHba.stdout
      .split('\n')
      .filter(line => !trustedNetworks.some(network => line.includes(network)))
      .join('\n');

    // IPv4/IPv6 local connections 섹션 찾아서 그 앞에 추가
    const newHba = filteredLines.replace(
      /(# IPv4 local connections:)/,
      `# Podman container network (auto-configured by CodeB Deploy)\n${networkRules}\n\n$1`
    );

    // 7. pg_hba.conf 업데이트
    const escapedHba = newHba.replace(/'/g, "'\\''");
    await ssh.exec(
      `podman exec ${containerName} bash -c "echo '${escapedHba}' > ${pgData}/pg_hba.conf"`
    );

    // 8. PostgreSQL 설정 리로드 (재시작 없이)
    await ssh.exec(
      `podman exec ${containerName} pg_ctl reload -D ${pgData}`
    );

    // 9. 최종 설정 확인
    const finalHba = await ssh.exec(
      `podman exec ${containerName} cat ${pgData}/pg_hba.conf`
    );

    return {
      success: true,
      message: `pg_hba.conf configured: added ${trustedNetworks.join(', ')} with ${defaultAuthMethod}`,
      currentConfig: finalHba.stdout,
    };

  } catch (error) {
    return {
      success: false,
      message: `Failed to configure pg_hba.conf: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 2. 컨테이너 IP 발견 (Podman 3.x 서비스 DNS 미지원 대응)
// ============================================================================

export interface ContainerIPResult {
  containerName: string;
  ipAddress: string | null;
  networkName: string;
  status: 'running' | 'stopped' | 'not_found';
}

/**
 * 컨테이너 IP 주소 발견
 * Podman 3.4.4에서는 서비스 DNS가 지원되지 않으므로
 * 컨테이너 IP를 직접 찾아서 DATABASE_URL 등에 주입해야 함
 *
 * 사용 예:
 * const dbIP = await getContainerIP('postgres-container');
 * DATABASE_URL=postgresql://user:pass@${dbIP}:5432/db
 */
export async function getContainerIP(containerName: string): Promise<ContainerIPResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 컨테이너 존재 확인
    const exists = await ssh.exec(
      `podman container exists ${containerName} && echo "exists" || echo "not_found"`
    );

    if (exists.stdout.trim() !== 'exists') {
      return {
        containerName,
        ipAddress: null,
        networkName: '',
        status: 'not_found',
      };
    }

    // 컨테이너 상태 확인
    const running = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Running}}'`
    );

    if (running.stdout.trim() !== 'true') {
      return {
        containerName,
        ipAddress: null,
        networkName: '',
        status: 'stopped',
      };
    }

    // IP 주소 가져오기 (여러 네트워크 중 첫 번째)
    const ipResult = await ssh.exec(
      `podman inspect ${containerName} --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`
    );

    // 네트워크 이름 가져오기
    const networkResult = await ssh.exec(
      `podman inspect ${containerName} --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}'`
    );

    return {
      containerName,
      ipAddress: ipResult.stdout.trim() || null,
      networkName: networkResult.stdout.trim(),
      status: 'running',
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 여러 컨테이너의 IP 일괄 조회
 */
export async function getMultipleContainerIPs(containerNames: string[]): Promise<ContainerIPResult[]> {
  const results: ContainerIPResult[] = [];

  for (const name of containerNames) {
    const result = await getContainerIP(name);
    results.push(result);
  }

  return results;
}

/**
 * DATABASE_URL에 컨테이너 IP 주입
 *
 * 예: postgresql://user:pass@postgres:5432/db
 * → postgresql://user:pass@10.88.0.136:5432/db
 */
export async function injectContainerIP(
  databaseUrl: string,
  dbContainerName: string
): Promise<{ url: string; injected: boolean; originalHost: string }> {
  const ipResult = await getContainerIP(dbContainerName);

  if (!ipResult.ipAddress) {
    return {
      url: databaseUrl,
      injected: false,
      originalHost: '',
    };
  }

  // URL 파싱
  const urlMatch = databaseUrl.match(/^(postgresql:\/\/[^@]+@)([^:\/]+)(:\d+\/.*)?$/);

  if (!urlMatch) {
    return {
      url: databaseUrl,
      injected: false,
      originalHost: '',
    };
  }

  const [, prefix, host, suffix] = urlMatch;
  const newUrl = `${prefix}${ipResult.ipAddress}${suffix || ':5432/'}`;

  return {
    url: newUrl,
    injected: true,
    originalHost: host,
  };
}

// ============================================================================
// 3. 볼륨 관리 (초기화 vs 기존 데이터 충돌 처리)
// ============================================================================

export interface VolumeInitOptions {
  projectName: string;
  environment: 'staging' | 'production';
  volumeType: 'postgres' | 'redis' | 'app-data';
  mode: 'create-if-not-exists' | 'recreate' | 'backup-and-recreate';
}

export interface VolumeInitResult {
  success: boolean;
  volumeName: string;
  action: 'created' | 'reused' | 'recreated' | 'backed-up-and-recreated';
  backupPath?: string;
  message: string;
}

/**
 * 볼륨 초기화 관리
 * 기존 볼륨에 다른 비밀번호가 저장된 경우 등의 충돌 해결
 */
export async function initVolume(options: VolumeInitOptions): Promise<VolumeInitResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    projectName,
    environment,
    volumeType,
    mode,
  } = options;

  const volumeName = `codeb-${volumeType}-${projectName}-${environment}`;

  try {
    // 볼륨 존재 여부 확인
    const existsResult = await ssh.exec(
      `podman volume exists ${volumeName} && echo "exists" || echo "not_found"`
    );
    const exists = existsResult.stdout.trim() === 'exists';

    if (!exists) {
      // 볼륨 생성
      await ssh.exec(`podman volume create ${volumeName}`);
      return {
        success: true,
        volumeName,
        action: 'created',
        message: `Volume ${volumeName} created`,
      };
    }

    // 볼륨이 존재하는 경우
    switch (mode) {
      case 'create-if-not-exists':
        return {
          success: true,
          volumeName,
          action: 'reused',
          message: `Volume ${volumeName} already exists, reusing`,
        };

      case 'recreate':
        // 볼륨 사용 중인 컨테이너 확인
        const usingContainers = await ssh.exec(
          `podman ps -a --filter volume=${volumeName} --format '{{.Names}}'`
        );

        if (usingContainers.stdout.trim()) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Volume ${volumeName} is in use by: ${usingContainers.stdout.trim()}. Stop containers first.`,
          };
        }

        await ssh.exec(`podman volume rm ${volumeName}`);
        await ssh.exec(`podman volume create ${volumeName}`);

        return {
          success: true,
          volumeName,
          action: 'recreated',
          message: `Volume ${volumeName} recreated (data deleted)`,
        };

      case 'backup-and-recreate':
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = `/home/codeb/backups/volumes`;
        const backupPath = `${backupDir}/${volumeName}-${timestamp}.tar`;

        // 백업 디렉토리 생성
        await ssh.exec(`mkdir -p ${backupDir}`);

        // 볼륨 사용 중인 컨테이너 확인
        const containers = await ssh.exec(
          `podman ps -a --filter volume=${volumeName} --format '{{.Names}}'`
        );

        if (containers.stdout.trim()) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Volume ${volumeName} is in use by: ${containers.stdout.trim()}. Stop containers first.`,
          };
        }

        // 볼륨 백업 (podman volume export)
        const exportResult = await ssh.exec(
          `podman volume export ${volumeName} > ${backupPath}`,
          { timeout: 300000 }
        );

        if (exportResult.code !== 0) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Failed to backup volume: ${exportResult.stderr}`,
          };
        }

        // 볼륨 삭제 및 재생성
        await ssh.exec(`podman volume rm ${volumeName}`);
        await ssh.exec(`podman volume create ${volumeName}`);

        return {
          success: true,
          volumeName,
          action: 'backed-up-and-recreated',
          backupPath,
          message: `Volume ${volumeName} backed up to ${backupPath} and recreated`,
        };

      default:
        return {
          success: false,
          volumeName,
          action: 'reused',
          message: `Unknown mode: ${mode}`,
        };
    }

  } finally {
    ssh.disconnect();
  }
}

/**
 * 볼륨 복원
 */
export async function restoreVolume(
  volumeName: string,
  backupPath: string
): Promise<{ success: boolean; message: string }> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 백업 파일 존재 확인
    const backupExists = await ssh.exec(`test -f ${backupPath} && echo "yes" || echo "no"`);
    if (backupExists.stdout.trim() !== 'yes') {
      return {
        success: false,
        message: `Backup file not found: ${backupPath}`,
      };
    }

    // 볼륨 존재 확인 및 생성
    const volumeExists = await ssh.exec(
      `podman volume exists ${volumeName} && echo "exists" || echo "not_found"`
    );

    if (volumeExists.stdout.trim() !== 'exists') {
      await ssh.exec(`podman volume create ${volumeName}`);
    }

    // 볼륨 복원
    const importResult = await ssh.exec(
      `podman volume import ${volumeName} ${backupPath}`,
      { timeout: 300000 }
    );

    if (importResult.code !== 0) {
      return {
        success: false,
        message: `Failed to restore volume: ${importResult.stderr}`,
      };
    }

    return {
      success: true,
      message: `Volume ${volumeName} restored from ${backupPath}`,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 4. CNI 네트워크 폴백 전략
// ============================================================================

export interface NetworkConfig {
  preferredNetwork?: string;
  fallbackToDefault?: boolean;
  createIfMissing?: boolean;
}

export interface NetworkResult {
  success: boolean;
  networkName: string;
  action: 'existing' | 'created' | 'fallback-to-default' | 'repaired';
  message: string;
}

/**
 * 안전한 네트워크 확보
 * CNI 네트워크 오류 시 기본 podman 네트워크로 폴백
 */
export async function ensureNetwork(config: NetworkConfig = {}): Promise<NetworkResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    preferredNetwork = 'codeb-network',
    fallbackToDefault = true,
    createIfMissing = true,
  } = config;

  try {
    // 1. 선호 네트워크 상태 확인
    const inspectResult = await ssh.exec(
      `podman network inspect ${preferredNetwork} 2>&1`
    );

    if (inspectResult.code === 0) {
      // 네트워크가 정상적으로 존재
      return {
        success: true,
        networkName: preferredNetwork,
        action: 'existing',
        message: `Network ${preferredNetwork} is available`,
      };
    }

    // 2. 네트워크가 손상되었거나 없는 경우
    const errorOutput = inspectResult.stderr + inspectResult.stdout;
    const isCorrupted = errorOutput.includes('CNI') ||
                        errorOutput.includes('plugin firewall') ||
                        errorOutput.includes('not found');

    if (isCorrupted) {
      // 손상된 네트워크 제거 시도
      await ssh.exec(`podman network rm ${preferredNetwork} 2>/dev/null || true`);
    }

    // 3. 네트워크 재생성 시도
    if (createIfMissing) {
      const createResult = await ssh.exec(
        `podman network create ${preferredNetwork} 2>&1`
      );

      if (createResult.code === 0) {
        return {
          success: true,
          networkName: preferredNetwork,
          action: isCorrupted ? 'repaired' : 'created',
          message: `Network ${preferredNetwork} ${isCorrupted ? 'repaired' : 'created'}`,
        };
      }
    }

    // 4. 기본 네트워크로 폴백
    if (fallbackToDefault) {
      const defaultCheck = await ssh.exec(
        `podman network inspect podman 2>/dev/null && echo "ok" || echo "fail"`
      );

      if (defaultCheck.stdout.includes('ok')) {
        return {
          success: true,
          networkName: 'podman',
          action: 'fallback-to-default',
          message: `Falling back to default 'podman' network due to issues with ${preferredNetwork}`,
        };
      }
    }

    return {
      success: false,
      networkName: '',
      action: 'existing',
      message: `Failed to ensure network: ${preferredNetwork}`,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 네트워크 상태 진단
 */
export async function diagnoseNetwork(): Promise<{
  healthy: boolean;
  networks: Array<{
    name: string;
    driver: string;
    ipam: string;
    containers: number;
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
  }>;
  recommendations: string[];
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 모든 네트워크 목록
    const listResult = await ssh.exec(
      `podman network ls --format '{{.Name}}|{{.Driver}}'`
    );

    const networks: Array<{
      name: string;
      driver: string;
      ipam: string;
      containers: number;
      status: 'healthy' | 'warning' | 'error';
      issues: string[];
    }> = [];

    const recommendations: string[] = [];
    let healthy = true;

    for (const line of listResult.stdout.split('\n').filter(l => l.trim())) {
      const [name, driver] = line.split('|');
      const issues: string[] = [];
      let status: 'healthy' | 'warning' | 'error' = 'healthy';

      // 네트워크 상세 정보 확인
      const inspectResult = await ssh.exec(
        `podman network inspect ${name} 2>&1`
      );

      if (inspectResult.code !== 0) {
        issues.push(`Cannot inspect: ${inspectResult.stderr}`);
        status = 'error';
        healthy = false;
      }

      // CNI 오류 확인
      if (inspectResult.stdout.includes('firewall') ||
          inspectResult.stderr.includes('CNI')) {
        issues.push('CNI plugin compatibility issue detected');
        status = status === 'error' ? 'error' : 'warning';
        recommendations.push(`Consider recreating network '${name}' or using default 'podman' network`);
      }

      // 이 네트워크를 사용하는 컨테이너 수
      const containerCount = await ssh.exec(
        `podman ps -a --filter network=${name} --format '{{.Names}}' | wc -l`
      );

      networks.push({
        name,
        driver: driver || 'bridge',
        ipam: 'default',
        containers: parseInt(containerCount.stdout.trim()) || 0,
        status,
        issues,
      });
    }

    if (!healthy) {
      recommendations.push('Run "podman network prune" to clean up unused networks');
      recommendations.push('Consider using default "podman" network for better compatibility');
    }

    return {
      healthy,
      networks,
      recommendations,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// MCP 도구 정의
// ============================================================================

export const configurePgHbaTool = {
  name: 'configure_pg_hba',
  description: 'PostgreSQL pg_hba.conf를 자동 설정하여 Podman 컨테이너 네트워크에서의 인증 문제를 해결합니다',
  inputSchema: z.object({
    containerName: z.string().describe('PostgreSQL 컨테이너 이름'),
    trustedNetworks: z.array(z.string()).optional().describe('신뢰할 네트워크 CIDR 목록 (기본: 10.88.0.0/16)'),
    authMethod: z.enum(['trust', 'md5', 'scram-sha-256']).optional().describe('인증 방식 (기본: trust)'),
  }),
  execute: async (input: {
    containerName: string;
    trustedNetworks?: string[];
    authMethod?: 'trust' | 'md5' | 'scram-sha-256';
  }) => {
    return configurePgHba({
      containerName: input.containerName,
      trustedNetworks: input.trustedNetworks,
      defaultAuthMethod: input.authMethod,
    });
  },
};

export const getContainerIPTool = {
  name: 'get_container_ip',
  description: 'Podman 컨테이너의 IP 주소를 조회합니다. Podman 3.x에서 서비스 DNS가 지원되지 않을 때 사용합니다.',
  inputSchema: z.object({
    containerName: z.string().describe('컨테이너 이름'),
  }),
  execute: getContainerIP,
};

export const initVolumeTool = {
  name: 'init_volume',
  description: '볼륨을 초기화합니다. 기존 볼륨과 새 설정이 충돌할 때 백업/재생성 옵션을 제공합니다.',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    environment: z.enum(['staging', 'production']).describe('환경'),
    volumeType: z.enum(['postgres', 'redis', 'app-data']).describe('볼륨 유형'),
    mode: z.enum(['create-if-not-exists', 'recreate', 'backup-and-recreate']).describe('초기화 모드'),
  }),
  execute: initVolume,
};

export const ensureNetworkTool = {
  name: 'ensure_network',
  description: 'Podman 네트워크를 확보합니다. CNI 오류 시 기본 네트워크로 폴백합니다.',
  inputSchema: z.object({
    preferredNetwork: z.string().optional().describe('선호 네트워크 이름 (기본: codeb-network)'),
    fallbackToDefault: z.boolean().optional().describe('실패 시 기본 네트워크로 폴백 (기본: true)'),
    createIfMissing: z.boolean().optional().describe('없으면 생성 (기본: true)'),
  }),
  execute: ensureNetwork,
};

export const diagnoseNetworkTool = {
  name: 'diagnose_network',
  description: 'Podman 네트워크 상태를 진단하고 문제점과 권장사항을 제공합니다.',
  inputSchema: z.object({}),
  execute: diagnoseNetwork,
};
