---
name: codeb-deploy
description: "배포", "deploy", "릴리즈", "프로덕션 올려", "스테이징 배포", "서버에 올려" 등의 요청 시 자동 활성화. Blue-Green 무중단 배포를 수행합니다.
---

# CodeB Deploy Skill

Blue-Green 무중단 배포를 수행하는 스킬입니다.

## 활성화 키워드
- 배포, deploy, release
- 프로덕션에 올려, 스테이징에 올려
- 서버에 올려, 서버에 배포
- 릴리즈, publish

## 사용 도구
- `mcp__codeb-deploy__deploy_project` - 프로젝트 배포
- `mcp__codeb-deploy__slot_promote` - 트래픽 전환
- `mcp__codeb-deploy__rollback` - 롤백
- `mcp__codeb-deploy__slot_status` - 슬롯 상태 확인

## 배포 절차

### 1단계: 프로젝트 정보 확인
```
package.json에서 프로젝트명 추출
```

### 2단계: 배포 실행
```
mcp__codeb-deploy__deploy_project {
  "projectName": "프로젝트명",
  "environment": "staging" | "production"
}
```

### 3단계: 프로모트 (선택)
```
mcp__codeb-deploy__slot_promote {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

## 관련 스킬
- `codeb-init` - 프로젝트 초기화
- `codeb-rollback` - 배포 롤백
- `codeb-health` - 시스템 상태 확인
