#!/usr/bin/env python3
"""
CodeB Session Summary Hook
세션 종료 시 요약 생성

Claude Code 2.1 Stop Hook (once: true)
전체 세션에서 딱 1번만 실행됨
"""

import sys
import json
import os
from datetime import datetime
from pathlib import Path

def get_session_stats():
    """세션 통계 수집"""
    # 실제로는 Claude Code에서 전달받음
    # 여기서는 로그 파일에서 집계

    stats = {
        "deploys": 0,
        "promotes": 0,
        "rollbacks": 0,
        "files_changed": 0
    }

    log_path = Path.home() / ".codeb" / "deploy-audit.log"
    if log_path.exists():
        with open(log_path, "r") as f:
            lines = f.readlines()
            # 오늘 날짜의 로그만 카운트
            today = datetime.now().strftime("%Y-%m-%d")
            for line in lines:
                if today in line:
                    if "POST-DEPLOY" in line and "SUCCESS" in line:
                        stats["deploys"] += 1
                    elif "POST-PROMOTE" in line and "SUCCESS" in line:
                        stats["promotes"] += 1
                    elif "POST-ROLLBACK" in line and "SUCCESS" in line:
                        stats["rollbacks"] += 1

    return stats

def generate_summary():
    """세션 요약 생성"""
    stats = get_session_stats()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    summary = f"""
╔════════════════════════════════════════════════════════════╗
║  CodeB Claude Code 세션 요약                                ║
╠════════════════════════════════════════════════════════════╣
║  시간: {timestamp}
║
║  📊 배포 작업 통계:
║  • 배포 (deploy): {stats['deploys']}회
║  • 프로모트 (promote): {stats['promotes']}회
║  • 롤백 (rollback): {stats['rollbacks']}회
║
║  🔧 CodeB v7.0 + Claude Code 2.1
╚════════════════════════════════════════════════════════════╝
"""
    return summary, stats

def save_summary(summary, stats):
    """요약 저장"""
    sessions_dir = Path.home() / ".codeb" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)

    filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".md"
    filepath = sessions_dir / filename

    with open(filepath, "w") as f:
        f.write(summary)

    # JSON 형태로도 저장
    json_path = sessions_dir / (datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
    with open(json_path, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "stats": stats
        }, f, indent=2)

    return filepath

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # 세션 요약 생성
    summary, stats = generate_summary()

    # 파일로 저장
    saved_path = save_summary(summary, stats)

    # 콘솔에 출력 (Claude Code가 사용자에게 표시)
    print(summary)

    # 결과 반환
    print(json.dumps({
        "status": "ok",
        "summary_saved": str(saved_path),
        "stats": stats
    }))

    sys.exit(0)

if __name__ == "__main__":
    main()
