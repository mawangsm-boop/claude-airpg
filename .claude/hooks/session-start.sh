#!/bin/bash
# 세션이 열릴 때 state 건강 상태를 먼저 보여준다.
# 이 저장소는 외부 의존성이 없다(node 기본 모듈만 사용) — 설치할 것은 없고, 검증만 한다.
# 검증에 실패해도 세션은 정상적으로 시작한다(exit 0). 대신 무엇이 깨졌는지 눈에 띄게 알린다.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

if ! command -v node >/dev/null 2>&1; then
  echo "[세션 시작] node를 찾지 못해 state 검증을 건너뜁니다."
  exit 0
fi

echo "[세션 시작] state 검증 (node tools/validate.js)"
OUT="$(node tools/validate.js 2>&1)"
CODE=$?
echo "$OUT"

if [ $CODE -ne 0 ]; then
  echo ""
  echo "‼ state에 오류가 있습니다. 진행(서사·전투)에 들어가기 전에 먼저 고치세요."
fi

CORE="state/core.json"
if [ -f "$CORE" ]; then
  echo ""
  node -e '
    const c=require("./state/core.json");
    const cp=require("./state/checkpoint.json");
    console.log(`[현재] ${c.session}회차 · ${c.arc} · ${c.place} · 짧은 휴식 누적 ${cp.short_rest_count}회`);
  ' 2>/dev/null || true
fi

exit 0
