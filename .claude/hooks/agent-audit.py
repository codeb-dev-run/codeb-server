#!/usr/bin/env python3
"""
CodeB Agent Audit Hook
에이전트 작업 감사 로깅

Claude Code 2.1 Agent Hook
에이전트가 도구를 사용할 때마다 기록
"""

import sys
import json
from datetime import datetime
from pathlib import Path

def log_agent_action(agent_name, tool_name, action_type, details=None):
    """에이전트 액션 로깅"""
    log_path = Path.home() / ".codeb" / "agent-audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().isoformat()
    log_entry = {
        "timestamp": timestamp,
        "agent": agent_name,
        "tool": tool_name,
        "action": action_type,
        "details": details or {}
    }

    with open(log_path, "a") as f:
        f.write(json.dumps(log_entry) + "\n")

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # 에이전트 정보 추출
    agent_name = hook_input.get("agent_name", "unknown")
    tool_name = hook_input.get("tool_name", "unknown")
    action_type = hook_input.get("action_type", "tool_use")  # PreToolUse, PostToolUse, Stop

    tool_input = hook_input.get("tool_input", {})
    tool_output = hook_input.get("tool_output", {})

    # 감사 로그 기록
    log_agent_action(
        agent_name=agent_name,
        tool_name=tool_name,
        action_type=action_type,
        details={
            "input_keys": list(tool_input.keys()) if isinstance(tool_input, dict) else [],
            "success": tool_output.get("success", None) if isinstance(tool_output, dict) else None
        }
    )

    print(json.dumps({
        "status": "ok",
        "audited": True
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
