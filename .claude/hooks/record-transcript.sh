#!/bin/bash
# 답변이 끝날 때마다 녹화 중인 회차의 대화 원본을 transcripts/에 저장한다(tools/record.js 참고).
# 녹화 중이 아니면 아무것도 하지 않는다. 실패해도 대화는 막지 않는다(exit 0).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f transcripts/.recording.json ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
node tools/record.js hook
exit 0
