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

# 브랜치 동기화 검사 — 진행분이 세션 브랜치에만 남고 main에 반영되지 않는 사고(2026-10-06) 방지.
# 핸드북과 새 세션은 main을 기준으로 보므로, main보다 최근에 커밋된 브랜치가 있으면 그 진행분이 안 보인다.
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  timeout 20 git fetch origin --quiet 2>/dev/null || true
  # 클라우드 세션은 최근 커밋만 받은 얕은 복제본이라 커밋 수 비교가 틀린다(옛 브랜치가 100여 커밋 "앞선" 것처럼 보였음).
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
    timeout 60 git fetch --unshallow origin --quiet 2>/dev/null || true
  fi
  if git rev-parse --verify -q origin/main >/dev/null; then
    MAIN_TS=$(git log -1 --format=%ct origin/main)
    ALERT=""
    for B in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v -e '^origin/main$' -e '^origin/HEAD$' -e '^origin$'); do
      AHEAD=$(git rev-list --count origin/main.."$B" 2>/dev/null || echo 0)
      B_TS=$(git log -1 --format=%ct "$B" 2>/dev/null || echo 0)
      if [ "$AHEAD" -gt 0 ] && [ "$B_TS" -gt "$MAIN_TS" ]; then
        ALERT="${ALERT}\n  - ${B#origin/}: main에 없는 커밋 ${AHEAD}개, 마지막 커밋 $(git log -1 --format=%cs "$B")"
      fi
    done
    BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
    if [ -n "$ALERT" ]; then
      echo ""
      echo -e "‼ main보다 최근에 커밋된 브랜치가 있습니다 — 그 진행분이 main(핸드북)과 이 세션에 빠져 있을 수 있습니다:${ALERT}"
      echo "  진행에 들어가기 전에 내용을 확인하고 main에 반영하세요(사용자 확인 후)."
    fi
    if [ "$BEHIND" -gt 0 ]; then
      echo ""
      echo "‼ 지금 브랜치가 origin/main보다 ${BEHIND}커밋 뒤처져 있습니다 — 먼저 git merge origin/main 하세요."
    fi
  fi
fi

exit 0
