#!/bin/bash
# 회차를 녹화하는 동안 GM 답변이 끝날 때마다 금지어·억지 의심을 점검한다(tools/gm-guard.js). 걸리면 한 번 막고 고쳐 쓰게 한다.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f transcripts/.recording.json ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
node tools/gm-guard.js lint
exit 0
