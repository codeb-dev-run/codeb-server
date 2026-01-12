#!/usr/bin/env python3
"""
CodeB v7.0 - Bash Command Validator (Admin Mode)

어드민 레벨: 최소 규제
- DB 삭제 절대 금지
- 시스템 파괴 명령만 차단
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime

# ============================================================================
# 설정
# ============================================================================

CONFIG = {
    # 감사 로그 경로
    "audit_log_path": Path.home() / ".codeb" / "hook-audit.log",
}

# ============================================================================
# 절대 금지 패턴 (DB 보호 + 시스템 파괴만)
# ============================================================================

FORBIDDEN_PATTERNS = [
    # === DB 절대 보호 ===
    (r"docker\s+(rm|remove)\s+.*postgres", "🛑 PostgreSQL 컨테이너 삭제 절대 금지"),
    (r"docker\s+(rm|remove)\s+.*redis", "🛑 Redis 컨테이너 삭제 절대 금지"),
    (r"docker\s+volume\s+(rm|remove)\s+.*postgres", "🛑 PostgreSQL 볼륨 삭제 절대 금지"),
    (r"docker\s+volume\s+(rm|remove)\s+.*redis", "🛑 Redis 볼륨 삭제 절대 금지"),
    (r"rm\s+(-rf|-fr).*postgres.*data", "🛑 PostgreSQL 데이터 삭제 절대 금지"),
    (r"rm\s+(-rf|-fr).*redis.*data", "🛑 Redis 데이터 삭제 절대 금지"),
    (r"DROP\s+DATABASE", "🛑 DROP DATABASE 절대 금지"),
    (r"dropdb\s+", "🛑 dropdb 명령 절대 금지"),
    (r"FLUSHALL", "🛑 Redis FLUSHALL 절대 금지"),
    (r"FLUSHDB", "🛑 Redis FLUSHDB 절대 금지"),

    # === 시스템 파괴 방지 ===
    (r"rm\s+(-rf|-fr)\s+/\s*$", "루트 디렉토리 삭제 금지"),
    (r"rm\s+(-rf|-fr)\s+/var/lib/docker\s*$", "Docker 데이터 전체 삭제 금지"),
    (r"docker\s+system\s+prune\s+(-a|--all)\s+(-f|--force)", "Docker 전체 강제 정리 금지"),
    (r"docker\s+volume\s+prune\s+(-a|--all)\s+(-f|--force)", "모든 볼륨 강제 삭제 금지"),
    (r"mkfs\.", "파일시스템 포맷 금지"),
    (r"dd\s+if=.*of=/dev/", "디스크 직접 쓰기 금지"),
]

# ============================================================================
# JSON 응답 헬퍼
# ============================================================================

def deny(reason):
    """명령 거부"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    audit_log("DENIED", reason)
    sys.exit(0)

def allow():
    """명령 허용"""
    sys.exit(0)

# ============================================================================
# 감사 로그
# ============================================================================

def audit_log(action, message, command=""):
    """감사 로그 기록"""
    try:
        log_path = CONFIG["audit_log_path"]
        log_path.parent.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] {action}: {message}"
        if command:
            log_entry += f" | Command: {command[:100]}"
        log_entry += "\n"

        with open(log_path, "a") as f:
            f.write(log_entry)
    except Exception:
        pass

# ============================================================================
# 검증 함수
# ============================================================================

def check_forbidden(command):
    """금지 패턴 체크"""
    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True, message
    return False, None

# ============================================================================
# 메인
# ============================================================================

def main():
    # stdin에서 hook input 읽기
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # Bash 도구의 command 파라미터 추출
    tool_input = hook_input.get("tool_input", {})
    command = tool_input.get("command", "")

    if not command:
        allow()

    # 금지 패턴만 체크 (DB 보호 + 시스템 파괴)
    is_forbidden, forbidden_reason = check_forbidden(command)
    if is_forbidden:
        deny(forbidden_reason)

    # 나머지는 모두 허용 (어드민 모드)
    allow()

if __name__ == "__main__":
    main()
