# MCP API Permissions Guide

> **버전: 6.0.5** | 업데이트: 2026-01-11

## API 키 구조 (v6.0)

```
codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
- codeb_default_viewer_abcdefghijklmnop
```

## 역할 계층

| Role | Level | Description |
|------|-------|-------------|
| **owner** | 4 | 모든 권한 + 팀 삭제 |
| **admin** | 3 | 멤버 관리, 토큰 생성, 슬롯 정리 |
| **member** | 2 | 배포, promote, rollback, ENV 설정 |
| **viewer** | 1 | 조회만 (상태, 로그, 메트릭) |

## 역할별 권한

### owner (팀 소유자)

**모든 도구 사용 가능** + 팀 삭제

```javascript
owner: ['*', 'team_delete']
```

### admin (관리자)

팀 관리 및 슬롯 정리 권한:

```javascript
admin: [
  // 팀 관리
  'team_settings', 'member_invite', 'member_remove',
  'token_create',

  // 슬롯 정리
  'slot_cleanup',

  // member 권한 전체 포함
  ...memberPermissions
]
```

### member (일반 멤버)

배포 및 ENV 관리 권한:

```javascript
member: [
  // 배포 & 롤백
  'deploy', 'deploy_project', 'rollback', 'promote', 'slot_promote',

  // ENV 관리
  'env_restore',

  // 도메인 설정
  'domain_setup', 'domain_delete',

  // 프로젝트 초기화
  'workflow_init',

  // Edge Functions
  'edge_deploy', 'edge_delete', 'edge_invoke',

  // 토큰 폐기 (자신의 토큰만)
  'token_revoke',

  // viewer 권한 전체 포함
  ...viewerPermissions
]
```

### viewer (뷰어)

읽기 전용 권한:

```javascript
viewer: [
  // 상태 조회
  'slot_status', 'slot_list', 'health_check', 'scan',
  'workflow_scan',

  // 팀 조회
  'team_list', 'team_get', 'member_list', 'token_list',

  // ENV 조회
  'env_scan',

  // 도메인 조회
  'domain_list',

  // Analytics
  'analytics_overview', 'analytics_webvitals',
  'analytics_deployments', 'analytics_realtime', 'analytics_speed_insights',

  // Edge Functions 조회
  'edge_list', 'edge_logs', 'edge_metrics',
]
```

## 권한 매트릭스

| Tool | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| **팀 관리** |
| team_create | O | X | X | X |
| team_delete | O | X | X | X |
| team_settings | O | O | X | X |
| team_list | O | O | O | O |
| team_get | O | O | O | O |
| **멤버 관리** |
| member_invite | O | O | X | X |
| member_remove | O | O | X | X |
| member_list | O | O | O | O |
| **토큰 관리** |
| token_create | O | O | X | X |
| token_revoke | O | O | O | X |
| token_list | O | O | O | X |
| **배포** |
| deploy | O | O | O | X |
| promote | O | O | O | X |
| rollback | O | O | O | X |
| **Slot** |
| slot_list | O | O | O | O |
| slot_status | O | O | O | O |
| slot_cleanup | O | O | X | X |
| **ENV** |
| env_scan | O | O | O | O |
| env_restore | O | O | O | X |
| **도메인** |
| domain_setup | O | O | O | X |
| domain_list | O | O | O | O |
| domain_delete | O | O | O | X |
| **Edge Functions** |
| edge_deploy | O | O | O | X |
| edge_list | O | O | O | O |
| edge_logs | O | O | O | O |
| edge_delete | O | O | O | X |
| edge_invoke | O | O | O | X |
| edge_metrics | O | O | O | O |
| **Analytics** |
| analytics_* | O | O | O | O |
| **시스템** |
| health_check | O | O | O | O |
| scan | O | O | O | O |
| workflow_init | O | O | O | X |
| workflow_scan | O | O | O | O |

## API 호출 예시

### 헤더

```bash
X-API-Key: codeb_default_member_a1b2c3d4e5f6g7h8
Content-Type: application/json
```

### 요청 형식

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "deploy",
    "params": {
      "projectName": "myapp",
      "environment": "staging"
    }
  }'
```

### 응답 형식

성공:
```json
{
  "success": true,
  "result": { ... }
}
```

실패:
```json
{
  "success": false,
  "error": "Permission denied: viewer cannot use deploy",
  "requiredRole": "member"
}
```

## 권한 에러 처리

### Permission denied

```
Error: Permission denied: viewer cannot use deploy
```

**원인**: 해당 도구가 역할에 허용되지 않음

**해결**:
1. 더 높은 권한의 API 키 사용
2. 팀 관리자에게 역할 변경 요청
3. 권한이 있는 다른 도구 사용

### Invalid API key

```
Error: Invalid or missing API Key
```

**원인**: API 키 형식이 잘못되었거나 등록되지 않음

**해결**:
1. 키 형식 확인: `codeb_{teamId}_{role}_{token}`
2. API 키 재발급 요청

## API 키 관리

### 레지스트리 위치

```
/opt/codeb/registry/api-keys.json
```

### 레지스트리 구조

```json
{
  "version": "6.0.5",
  "updatedAt": "2026-01-11T10:00:00Z",
  "keys": {
    "key_abc123": {
      "id": "key_abc123",
      "keyHash": "sha256_hash_of_api_key",
      "name": "John Doe",
      "teamId": "default",
      "role": "member",
      "createdAt": "2026-01-10T10:00:00Z",
      "createdBy": "web-ui",
      "scopes": ["*"],
      "lastUsed": "2026-01-11T09:00:00Z"
    }
  }
}
```

### Web UI에서 키 발급

1. Dashboard (https://app.codeb.kr) 접속
2. Team → Members 메뉴
3. "Add Member" 클릭
4. 이름, 이메일, 역할 입력
5. API Key 확인 (한 번만 표시됨)
6. GitHub Secrets의 `CODEB_API_KEY`에 저장

## Rate Limits

| Role | Requests/min | Burst |
|------|-------------|-------|
| owner | 1000 | 100 |
| admin | 500 | 50 |
| member | 200 | 20 |
| viewer | 100 | 10 |

## 관련 문서

- [API-REFERENCE.md](./API-REFERENCE.md) - API 전체 레퍼런스
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드
- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
