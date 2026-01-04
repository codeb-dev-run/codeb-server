# MCP API Permissions Guide (v3.2.6+)

## API 키 구조

```
codeb_{role}_{token}

예시:
codeb_admin_6946b65a43c61441e9c8e1933ca09205
codeb_dev_282beec79c1e4810c9ea41d50cacc88c
codeb_view_4faa78fd083edc64c566c2e6c7dcdb2d
```

## 역할별 권한

### admin (관리자)

**모든 도구 사용 가능** (`*`)

```javascript
admin: ['*']
```

### dev (개발자/팀원)

배포 및 조회 권한:

```javascript
dev: [
  // 배포 & 롤백
  'deploy', 'rollback', 'promote',

  // Slot 관리
  'slot_list', 'slot_status', 'slot_cleanup',

  // 프로젝트 관리
  'create_project', 'list_projects', 'get_project',

  // SSOT 조회
  'ssot_get', 'ssot_get_project', 'ssot_list_projects', 'ssot_status',

  // 모니터링
  'full_health_check', 'analyze_server', 'check_domain_status',

  // ENV 관리
  'env_scan', 'env_pull', 'env_backups', 'env_init', 'env_push',

  // 도메인 관리
  'domain_setup', 'domain_status', 'domain_list', 'domain_connect',

  // 워크플로우
  'workflow_scan', 'workflow_update',

  // 로그 조회
  'api_access_stats', 'api_active_users', 'api_keys_list',
]
```

### view (조회 전용)

읽기 전용 권한:

```javascript
view: [
  // SSOT 조회
  'ssot_get', 'ssot_get_project', 'ssot_list_projects', 'ssot_status',

  // 헬스체크
  'full_health_check', 'list_projects', 'get_project',

  // ENV 조회
  'env_scan', 'env_backups',

  // 도메인 조회
  'domain_status', 'domain_list',

  // Slot 조회
  'slot_list', 'slot_status',

  // 워크플로우 조회
  'workflow_scan',

  // 로그 조회
  'api_access_stats', 'api_active_users',
]
```

## 권한 매트릭스

| 도구 | admin | dev | view |
|------|-------|-----|------|
| **배포** |
| deploy | ✅ | ✅ | ❌ |
| rollback | ✅ | ✅ | ❌ |
| promote | ✅ | ✅ | ❌ |
| **Slot** |
| slot_list | ✅ | ✅ | ✅ |
| slot_status | ✅ | ✅ | ✅ |
| slot_cleanup | ✅ | ✅ | ❌ |
| **SSOT** |
| ssot_status | ✅ | ✅ | ✅ |
| ssot_get | ✅ | ✅ | ✅ |
| ssot_get_project | ✅ | ✅ | ✅ |
| ssot_list_projects | ✅ | ✅ | ✅ |
| **ENV** |
| env_scan | ✅ | ✅ | ✅ |
| env_pull | ✅ | ✅ | ❌ |
| env_push | ✅ | ✅ | ❌ |
| env_backups | ✅ | ✅ | ✅ |
| env_init | ✅ | ✅ | ❌ |
| **도메인** |
| domain_setup | ✅ | ✅ | ❌ |
| domain_status | ✅ | ✅ | ✅ |
| domain_list | ✅ | ✅ | ✅ |
| domain_connect | ✅ | ✅ | ❌ |
| **워크플로우** |
| workflow_scan | ✅ | ✅ | ✅ |
| workflow_update | ✅ | ✅ | ❌ |
| **모니터링** |
| full_health_check | ✅ | ✅ | ✅ |
| analyze_server | ✅ | ✅ | ❌ |
| api_access_stats | ✅ | ✅ | ✅ |
| api_active_users | ✅ | ✅ | ✅ |
| **프로젝트** |
| create_project | ✅ | ✅ | ❌ |
| list_projects | ✅ | ✅ | ✅ |
| get_project | ✅ | ✅ | ✅ |

## API 호출 예시

### 헤더

```bash
X-API-Key: codeb_dev_282beec79c1e4810c9ea41d50cacc88c
Content-Type: application/json
```

### 요청 형식

```bash
curl -X POST "https://app.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_dev_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "도구명",
    "params": {
      "param1": "value1"
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
  "error": "Permission denied: dev cannot use xxx"
}
```

## 권한 에러 처리

### Permission denied

```
Error: Permission denied: dev cannot use ssot_sync
```

**원인**: 해당 도구가 역할에 허용되지 않음

**해결**:
1. admin 키 사용
2. 관리자에게 권한 요청
3. 권한이 있는 다른 도구 사용

### Invalid API key

```
Error: Invalid API key
```

**원인**: API 키 형식이 잘못되었거나 등록되지 않음

**해결**:
1. 키 형식 확인: `codeb_{role}_{token}`
2. 서버 api-keys.json 확인

## API 키 관리

### 서버 설정 파일

```
/opt/codeb/config/api-keys.json
```

```json
{
  "admin": "codeb_admin_xxx",
  "dev": "codeb_dev_xxx",
  "view": "codeb_view_xxx"
}
```

### 키 추가 (Admin SSH)

```bash
ssh root@app.codeb.kr
vi /opt/codeb/config/api-keys.json
# API 서버 재시작
pkill -f "node.*mcp-http-api"
cd /opt/codeb/mcp-api && nohup node mcp-http-api.js &
```

## 관련 파일

- [api/mcp-http-api.js](../api/mcp-http-api.js) - checkPermission 함수
- [MCP-API-DEPLOYMENT.md](./MCP-API-DEPLOYMENT.md) - 배포 가이드
