#!/usr/bin/env python3
"""
CodeB Post-Promote Hook
트래픽 전환 후 알림 및 메트릭 기록

Claude Code 2.1 PostToolUse Hook
"""

import sys
import json
from datetime import datetime
from pathlib import Path

def log(message):
    """로그 기록"""
    log_path = Path.home() / ".codeb" / "deploy-audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat()
    with open(log_path, "a") as f:
        f.write(f"[{timestamp}] POST-PROMOTE: {message}\n")

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    tool_output = hook_input.get("tool_output", {})
    tool_input = hook_input.get("tool_input", {})

    project_name = tool_input.get("projectName", "unknown")
    environment = tool_input.get("environment", "staging")

    result = tool_output.get("result", {})
    success = tool_output.get("success", False)
    new_active_slot = result.get("activeSlot", "unknown")
    grace_slot = result.get("graceSlot", {})

    status = "SUCCESS" if success else "FAILED"
    log(f"{status} - Project: {project_name}, Env: {environment}, New Active: {new_active_slot}")

    if success:
        grace_info = f", Grace: {grace_slot.get('name', 'none')} (v{grace_slot.get('version', '?')})" if grace_slot else ""
        log(f"Traffic switched to {new_active_slot}{grace_info}")

    print(json.dumps({
        "status": "ok",
        "logged": True
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
