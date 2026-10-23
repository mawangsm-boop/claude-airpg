#!/bin/bash
# 회차를 녹화하는 동안 매 턴 시작에 GM 점검 목록을 다시 보여 준다(tools/gm-guard.js). 실패해도 대화는 막지 않는다.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f transcripts/.recording.json ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
node tools/gm-guard.js remind
exit 0
