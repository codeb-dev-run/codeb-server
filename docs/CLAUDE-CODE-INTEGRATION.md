# Claude Code 2.1 Integration Guide

> **버전: 7.0.0** | 업데이트: 2026-01-11

## Overview

CodeB v7.0은 Claude Code 2.1의 모든 새로운 기능을 100% 활용합니다:

- **Skills System** - 배포/모니터링/분석 작업을 Skill로 정의
- **Advanced Hooks** - PreToolUse, PostToolUse, Stop Hook으로 배포 감사
- **Agent Hooks** - 에이전트 레벨 작업 모니터링
- **Wildcard Permissions** - `Bash(we *)` 패턴으로 간편한 CLI 실행
- **context: fork** - 독립 컨텍스트로 병렬 실행
- **once: true** - 세션당 1회 실행 (세션 요약)

---

## Skills System

### 개요

Skills는 Claude Code 2.1에서 Commands를 대체하는 새로운 확장 시스템입니다.
**Hot Reload**를 지원하여 파일 수정 시 즉시 반영됩니다.

### 폴더 구조

```
.claude/skills/
├── deploy/                    # 배포 Skills
│   ├── deploy.md              # /deploy Skill
│   ├── promote.md             # /promote Skill
│   └── rollback.md            # /rollback Skill
├── monitoring/                # 모니터링 Skills
│   ├── health.md              # /health Skill
│   └── monitor.md             # /monitor Skill
├── infrastructure/            # 인프라 Skills
│   ├── domain.md              # /domain Skill
│   └── workflow.md            # /workflow Skill
└── analysis/                  # 분석 Skills
    ├── analyze.md             # /analyze Skill
    └── optimize.md            # /optimize Skill
```

### Skill 파일 형식

```markdown
---
name: deploy
description: Blue-Green Slot 배포 실행
agent: Bash
context: fork
allowed-tools:
  - mcp__codeb-deploy__deploy_project
  - mcp__codeb-deploy__slot_status
hooks:
  PreToolUse:
    - hooks:
        - type: command
          command: python .claude/hooks/pre-deploy.py
  PostToolUse:
    - hooks:
        - type: command
          command: python .claude/hooks/post-deploy.py
---

# Deploy Skill

Blue-Green 배포를 실행합니다.

## 사용법

/deploy <project> [--environment staging|production]

## 예시

/deploy myapp
/deploy myapp --environment production
```

### 주요 Skill 설명

| Skill | 용도 | MCP Tool |
|-------|------|----------|
| `/deploy` | 비활성 Slot에 배포 | `deploy_project` |
| `/promote` | 트래픽 전환 (무중단) | `slot_promote` |
| `/rollback` | 즉시 롤백 | `rollback` |
| `/health` | 시스템 상태 확인 | `health_check` |
| `/domain` | 도메인 설정 | `domain_setup` |
| `/workflow` | CI/CD 워크플로우 생성 | `workflow_init` |

---

## Hooks System

### 개요

Hooks는 특정 이벤트 발생 시 자동으로 실행되는 스크립트입니다.
Claude Code 2.1은 3가지 Hook 타입을 지원합니다.

### Hook 타입

| Hook | 실행 시점 | 용도 |
|------|----------|------|
| **PreToolUse** | Tool 실행 전 | 검증, 확인, 차단 |
| **PostToolUse** | Tool 실행 후 | 로깅, 알림, 메트릭 |
| **Stop** | 세션 종료 시 | 요약, 정리 |

### PreToolUse Hook (배포 검증)

```python
# .claude/hooks/pre-deploy.py
#!/usr/bin/env python3
"""
배포 전 검증 Hook
- 환경 변수 확인
- 버전 충돌 체크
- 권한 확인
"""

import sys
import json

def main():
    input_data = json.loads(sys.stdin.read())
    tool_input = input_data.get("tool_input", {})

    project_name = tool_input.get("projectName", "")
    environment = tool_input.get("environment", "staging")

    # 프로덕션 배포 확인
    if environment == "production":
        print(json.dumps({
            "decision": "ask",
            "message": f"프로덕션 배포입니다. {project_name}을(를) production에 배포할까요?"
        }))
    else:
        print(json.dumps({
            "decision": "approve",
            "message": "Staging 배포 승인됨"
        }))

    sys.exit(0)

if __name__ == "__main__":
    main()
```

### PostToolUse Hook (감사 로깅)

```python
# .claude/hooks/post-deploy.py
#!/usr/bin/env python3
"""
배포 완료 후 Hook
- 감사 로그 기록
- 메트릭 저장
- 알림 전송 (선택)
"""

import sys
import json
from datetime import datetime
from pathlib import Path

def log(message):
    log_path = Path.home() / ".codeb" / "deploy-audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat()
    with open(log_path, "a") as f:
        f.write(f"[{timestamp}] POST-DEPLOY: {message}\n")

def main():
    input_data = json.loads(sys.stdin.read())
    tool_output = input_data.get("tool_output", {})
    tool_input = input_data.get("tool_input", {})

    project_name = tool_input.get("projectName", "unknown")
    success = tool_output.get("success", False)

    status = "SUCCESS" if success else "FAILED"
    log(f"{status} - Project: {project_name}")

    print(json.dumps({
        "status": "ok",
        "logged": True
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
```

### Stop Hook (세션 요약)

```python
# .claude/hooks/session-summary.py
#!/usr/bin/env python3
"""
세션 종료 시 요약 생성
once: true → 세션당 1회만 실행
"""

import sys
import json
from datetime import datetime
from pathlib import Path

def main():
    # 세션 요약 생성
    summary = f"""
╔════════════════════════════════════════════════════════════╗
║  CodeB Claude Code 세션 요약                                ║
╠════════════════════════════════════════════════════════════╣
║  시간: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
║  CodeB v7.0 + Claude Code 2.1
╚════════════════════════════════════════════════════════════╝
"""

    # 저장
    sessions_dir = Path.home() / ".codeb" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".md"
    (sessions_dir / filename).write_text(summary)

    print(summary)
    print(json.dumps({"status": "ok"}))
    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## settings.local.json 설정

### 전체 설정 예시

```json
{
  "language": "ko",
  "permissions": {
    "allow": [
      "Bash(we *)",
      "Bash(podman ps *)",
      "Bash(podman logs *)",
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(pnpm *)",
      "mcp__codeb-deploy__*"
    ],
    "deny": [
      "Bash(podman rm -f *)",
      "Bash(podman volume rm *)",
      "Bash(ssh root@*)",
      "Bash(rm -rf /opt/codeb/*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__codeb-deploy__deploy_project",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/pre-deploy.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__codeb-deploy__deploy_project",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/post-deploy.py",
            "timeout": 60000
          }
        ]
      },
      {
        "matcher": "mcp__codeb-deploy__slot_promote",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/post-promote.py"
          }
        ]
      },
      {
        "matcher": "mcp__codeb-deploy__rollback",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/post-rollback.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/session-summary.py",
            "once": true
          }
        ]
      }
    ]
  }
}
```

### 주요 설정 설명

#### Wildcard Permissions

```json
"permissions": {
  "allow": [
    "Bash(we *)"    // we CLI 모든 명령어 허용
  ]
}
```

이 설정으로 모든 `we` 명령어가 자동 승인됩니다:
- `we deploy myapp`
- `we promote myapp`
- `we rollback myapp`
- `we health`

#### once: true

```json
{
  "type": "command",
  "command": "python .claude/hooks/session-summary.py",
  "once": true
}
```

`once: true`는 세션 전체에서 딱 1번만 실행됩니다.
세션 종료 시 요약을 생성하는 데 적합합니다.

#### timeout

```json
{
  "type": "command",
  "command": "python .claude/hooks/post-deploy.py",
  "timeout": 60000
}
```

기본 타임아웃은 60초, 최대 600초(10분)까지 설정 가능합니다.
긴 작업이 필요한 경우 `timeout`을 늘려주세요.

---

## context: fork

### 개요

`context: fork`는 Skill을 독립 컨텍스트에서 실행합니다.
메인 대화와 분리되어 병렬 작업이 가능합니다.

### 사용 예시

```yaml
---
name: analyze
context: fork
---

# Analyze Skill

독립 컨텍스트에서 분석 실행
메인 대화에 영향 없음
```

### 장점

- **병렬 실행**: 여러 Skill 동시 실행 가능
- **컨텍스트 분리**: 메인 대화 오염 방지
- **리소스 효율**: 각 작업에 필요한 컨텍스트만 사용

---

## Agent Hooks

### 개요

Agent Hooks는 에이전트 레벨에서 작업을 모니터링합니다.
모든 Tool 사용을 감사하고 기록합니다.

### 설정

```json
{
  "agents": {
    "hooks": {
      "PreToolUse": [...],
      "PostToolUse": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "python .claude/hooks/agent-audit.py"
            }
          ]
        }
      ]
    }
  }
}
```

### agent-audit.py

```python
#!/usr/bin/env python3
"""에이전트 액션 감사 로깅"""

import sys
import json
from datetime import datetime
from pathlib import Path

def main():
    input_data = json.loads(sys.stdin.read())

    agent_name = input_data.get("agent_name", "unknown")
    tool_name = input_data.get("tool_name", "unknown")

    log_path = Path.home() / ".codeb" / "agent-audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "agent": agent_name,
        "tool": tool_name
    }

    with open(log_path, "a") as f:
        f.write(json.dumps(log_entry) + "\n")

    print(json.dumps({"status": "ok", "audited": True}))
    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## 로그 파일 위치

| 파일 | 위치 | 설명 |
|------|------|------|
| 배포 감사 로그 | `~/.codeb/deploy-audit.log` | 모든 배포 작업 기록 |
| 배포 메트릭 | `~/.codeb/metrics/deploys.jsonl` | 배포 메트릭 (JSON Lines) |
| 에이전트 감사 | `~/.codeb/agent-audit.log` | 에이전트 액션 기록 |
| 세션 요약 | `~/.codeb/sessions/*.md` | 세션별 요약 |

---

## 마이그레이션 가이드

### Commands → Skills 마이그레이션

| v6.0 Commands | v7.0 Skills |
|---------------|-------------|
| `.claude/commands/deploy.md` | `.claude/skills/deploy/deploy.md` |
| `allowed_tools` | `allowed-tools` |
| - | `context: fork` |
| - | `hooks` |

### 변경 사항

1. **폴더 구조**: `commands/` → `skills/카테고리/`
2. **Hot Reload**: 파일 저장 즉시 반영
3. **메타데이터**: YAML frontmatter 확장
4. **Hooks**: Skill별 Hook 정의 가능

---

## 트러블슈팅

### Hook이 실행되지 않음

```bash
# 1. 실행 권한 확인
chmod +x .claude/hooks/*.py

# 2. Python 경로 확인
which python3

# 3. 수동 테스트
echo '{}' | python3 .claude/hooks/post-deploy.py
```

### Skills가 인식되지 않음

```bash
# 1. 파일 형식 확인 (YAML frontmatter)
head -5 .claude/skills/deploy/deploy.md

# 2. Claude Code 재시작
# Ctrl+C 후 다시 시작
```

### 권한 오류

```bash
# settings.local.json 확인
cat .claude/settings.local.json | jq '.permissions'
```

---

## 관련 문서

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [CLAUDE.md](../CLAUDE.md) - AI 코딩 규칙
