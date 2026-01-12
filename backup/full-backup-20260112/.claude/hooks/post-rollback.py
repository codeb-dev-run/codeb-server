#!/usr/bin/env python3
"""
CodeB Post-Rollback Hook
롤백 후 알림 및 메트릭 기록

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
        f.write(f"[{timestamp}] POST-ROLLBACK: {message}\n")

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
    restored_slot = result.get("restoredSlot", "unknown")
    restored_version = result.get("restoredVersion", "unknown")

    status = "SUCCESS" if success else "FAILED"
    log(f"{status} - Project: {project_name}, Env: {environment}, Restored: {restored_slot} (v{restored_version})")

    if success:
        log(f"ROLLBACK COMPLETED - Traffic restored to {restored_slot}")
    else:
        error = tool_output.get("error", "Unknown error")
        log(f"ROLLBACK FAILED - {error}")

    print(json.dumps({
        "status": "ok",
        "logged": True,
        "alert": not success  # 실패 시 알림 필요
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
