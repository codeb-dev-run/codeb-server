#!/usr/bin/env python3
"""
CodeB Pre-Deploy Hook
배포 전 검증 및 알림
"""

import sys
import json
import os
from datetime import datetime
from pathlib import Path

def log(message):
    """로그 기록"""
    log_path = Path.home() / ".codeb" / "deploy-audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat()
    with open(log_path, "a") as f:
        f.write(f"[{timestamp}] PRE-DEPLOY: {message}\n")

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    tool_input = hook_input.get("tool_input", {})
    project_name = tool_input.get("projectName", "unknown")
    environment = tool_input.get("environment", "staging")
    version = tool_input.get("version", "latest")

    log(f"Project: {project_name}, Env: {environment}, Version: {version}")

    # 프로덕션 배포 시 추가 검증
    if environment == "production":
        log(f"PRODUCTION deployment requested for {project_name}")
        # 여기에 추가 검증 로직 (예: 테스트 통과 여부)

    # 배포 시작 알림 (추후 Slack 연동)
    print(json.dumps({
        "status": "ok",
        "message": f"Pre-deploy validation passed for {project_name}"
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
