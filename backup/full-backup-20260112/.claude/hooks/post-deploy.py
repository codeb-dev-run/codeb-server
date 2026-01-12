#!/usr/bin/env python3
"""
CodeB Post-Deploy Hook
배포 후 알림 및 메트릭 기록

Claude Code 2.1 PostToolUse Hook
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
        f.write(f"[{timestamp}] POST-DEPLOY: {message}\n")

def send_slack_notification(data):
    """Slack 알림 전송 (추후 구현)"""
    # webhook_url = os.environ.get("CODEB_SLACK_WEBHOOK")
    # if webhook_url:
    #     import requests
    #     requests.post(webhook_url, json=data)
    pass

def record_metrics(data):
    """메트릭 기록 (Prometheus 연동 예정)"""
    metrics_path = Path.home() / ".codeb" / "metrics" / "deploys.jsonl"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)

    with open(metrics_path, "a") as f:
        f.write(json.dumps({
            "timestamp": datetime.now().isoformat(),
            **data
        }) + "\n")

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # PostToolUse에서 tool_output 받기
    tool_output = hook_input.get("tool_output", {})
    tool_input = hook_input.get("tool_input", {})

    project_name = tool_input.get("projectName", "unknown")
    environment = tool_input.get("environment", "staging")

    # 배포 결과 추출
    result = tool_output.get("result", {})
    success = tool_output.get("success", False)
    slot = result.get("slot", "unknown")
    preview_url = result.get("previewUrl", "")
    duration = result.get("duration", 0)

    # 로그 기록
    status = "SUCCESS" if success else "FAILED"
    log(f"{status} - Project: {project_name}, Env: {environment}, Slot: {slot}, Duration: {duration}ms")

    # 메트릭 기록
    record_metrics({
        "project": project_name,
        "environment": environment,
        "slot": slot,
        "success": success,
        "duration_ms": duration
    })

    # Slack 알림 준비
    if success:
        slack_message = {
            "text": f"✅ 배포 완료!\n• 프로젝트: {project_name}\n• 환경: {environment}\n• 슬롯: {slot}\n• Preview: {preview_url}\n• 소요시간: {duration}ms"
        }
    else:
        error = tool_output.get("error", "Unknown error")
        slack_message = {
            "text": f"❌ 배포 실패!\n• 프로젝트: {project_name}\n• 환경: {environment}\n• 에러: {error}"
        }

    send_slack_notification(slack_message)

    # 결과 출력
    print(json.dumps({
        "status": "ok",
        "logged": True,
        "metrics_recorded": True
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
