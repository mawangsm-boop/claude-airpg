#!/usr/bin/env node
/* GM 서술 점검 장치 — 회차를 녹화하는 동안에만 돈다(설계·시스템 작업 대화는 건드리지 않는다).
 *
 *   node tools/gm-guard.js remind   UserPromptSubmit 훅 — 매 턴 시작에 점검 목록을 GM에게 다시 보여 준다
 *   node tools/gm-guard.js lint     Stop 훅 — 방금 끝낸 GM 답변에 금지어·억지 의심이 있으면 한 번 막고 고쳐 쓰게 한다
 *   node tools/gm-guard.js test "문장"   문장 하나를 검사해 본다(훅 없이)
 *
 * 문서에 규칙만 적어서는 같은 실수(조선풍 말·셈 표현·회차 번호·억지 의심)가 되풀이돼서 만들었다(53회차 강평).
 * 점검에서 빼려면: 코드 펜스(```) 안, 또는 "[메타]"로 시작하는 줄.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REC = path.join(ROOT, "transcripts", ".recording.json");

function recording() {
  try {
    const st = JSON.parse(fs.readFileSync(REC, "utf8"));
    return !!(st.ranges || []).find((r) => !r.stoppedAt);
  } catch {
    return false;
  }
}

// 하드 금지어 — 하나라도 있으면 고쳐 쓴다.
const HARD = [
  [/양반|주막|객주|마님|도련님|너벅선|저잣거리|(?<!개)나리(?![꽃])/, "조선풍 호칭·장소(양반·주막·객주·나리·너벅선 등) — 여관·선술집·이름+씨로"],
  [/시진|반각|일각/, "옛 시간 단위 — 시간·분으로"],
  [/셈(?!배|방)/, "'셈' 표현 — 봅니다·짐작합니다·계산이 맞다로 (셈배·셈방만 예외)"],
  [/[一-鿿]/, "한자 글자 — 한글로"],
  [/닢|\b\d+\s?gp\b/i, "화폐 — 골드·실버·코퍼만"],
];
// 대사·서술 속 회차 번호
const TURN_NO = /["“][^"”\n]{0,200}\d+회차[^"”\n]{0,200}["”]/;
// 소프트 — 서로 다른 신호가 셋 이상 겹치면 '억지 의심' 가능성으로 다시 보게 한다.
const SOFT = ["의심", "믿을 수 없", "믿기 어렵", "믿지 않", "못 믿", "수상", "캐묻", "따지", "추궁", "증명", "거짓이", "장사하지 못", "다시는 장사", "협박", "재 본", "시험"];

function strip(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("[메타]"))
    .join("\n");
}

// 전투 서술 형식 — 53회차 3라운드 예문(CLAUDE.md "수치와 전투")처럼: 행동마다 서술 문단 → 인용(>) 블록에 수치.
// 54회차에 굵은 제목+수치 나열식으로 무너져 사용자가 지적했다("두 번에 한 번꼴로 이야기하는 게 지겹다").
const ROLL = /vs AC|d20\[|\d+d\d+\[/;
function combatCheck(text) {
  const out = [];
  const lines = text.split("\n");
  const bare = lines.filter((l) => ROLL.test(l) && !l.trim().startsWith(">"));
  if (bare.length) out.push(`수치 줄이 인용(>) 블록 밖에 있음 — "${bare[0].trim().slice(0, 40)}…" 수치는 서술 문단 아래 > 블록에만`);
  const noTarget = lines.filter((l) => l.trim().startsWith(">") && /vs AC/.test(l) && !/→[^:]*:/.test(l));
  if (noTarget.length) out.push(`공격 줄에 '공격자 → 대상:'이 없음 — "${noTarget[0].trim().slice(0, 40)}…"`);
  const heads = lines.filter((l) => /^\s*\*\*[^*\n]{1,40}\.\*\*/.test(l));
  if (heads.length) out.push(`행동마다 굵은 제목을 붙였음 — "${heads[0].trim().slice(0, 30)}" 제목 없이 서술 문단으로 시작한다(라운드 제목만 허용)`);
  // 인용 블록마다 바로 앞 서술 문단이 두 문장 이상인지
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith(">") || (i > 0 && lines[i - 1].trim().startsWith(">"))) continue;
    if (!ROLL.test(lines.slice(i, i + 6).join("\n"))) continue;
    let j = i - 1;
    while (j >= 0 && !lines[j].trim()) j--;
    const para = [];
    while (j >= 0 && lines[j].trim() && !lines[j].trim().startsWith(">")) para.unshift(lines[j--]);
    const sentences = (para.join(" ").match(/(다|요|오|까|군|네)[.!?]/g) || []).length;
    if (sentences < 2) {
      out.push(`수치 블록 앞 서술이 ${sentences}문장 — 누가 누구에게 무엇을 했고 어떻게 보였는지 두세 문장 이상 쓴다`);
      break;
    }
  }
  const coord = lines.find((l) => /\(\d+,\s?\d+\)/.test(l) && !/^\s*([-*>]|\d+\.)/.test(l) && !l.includes("|"));
  if (coord) out.push(`서술 문단에 좌표 — "${coord.trim().slice(0, 30)}…" 좌표는 '현재 상황' 목록에만`);
  return out;
}

function check(raw, opts = {}) {
  const text = strip(raw);
  const out = [];
  if (opts.combat || ROLL.test(text)) out.push(...combatCheck(text));
  for (const [re, why] of HARD) {
    const m = text.match(re);
    if (m) out.push(`「${m[0]}」 — ${why}`);
  }
  const prose = text.split("\n").filter((l) => !l.trim().startsWith(">")).join("\n");
  const gridSpeech = prose.match(/["“][^"”\n]*(?:\d+|[한두세네다섯여섯일곱여덟아홉열스물])\s?칸[^"”\n]*["”]/);
  if (gridSpeech) out.push(`대사에 격자 단위 '칸' — "${gridSpeech[0].slice(0, 30)}…" 인물은 걸음·미터·몇 걸음 거리로 말한다(칸은 현재 상황 목록에만)`);
  const t = prose.match(TURN_NO);
  if (t) out.push(`대사·서술에 회차 번호 — "${t[0].slice(0, 40)}…" 사건·날짜로 바꾼다`);
  const hits = SOFT.filter((w) => prose.includes(w));
  if (hits.length >= 3) out.push(`의심·압박 표현이 겹침(${hits.join("·")}) — 이 NPC가 이득을 봤는가? 증거가 실제로 있는가? 없으면 호의·호기심·정중한 걱정으로 고치고, 한 번 짚고 넘어간다`);
  return out;
}

function lastAssistantText(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const entries = [];
  for (const l of lines) {
    try {
      entries.push(JSON.parse(l));
    } catch {}
  }
  let start = -1;
  entries.forEach((e, i) => {
    if (e.type !== "user" || e.isMeta) return;
    const c = e.message && e.message.content;
    const real = typeof c === "string" ? !c.startsWith("<") : Array.isArray(c) && c.some((b) => b.type === "text");
    if (real) start = i;
  });
  const texts = [];
  for (const e of entries.slice(start + 1)) {
    if (e.type !== "assistant" || !Array.isArray(e.message && e.message.content)) continue;
    for (const b of e.message.content) if (b.type === "text" && b.text) texts.push(b.text);
  }
  return texts.join("\n");
}

function stdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

const cmd = process.argv[2];
if (cmd === "remind") {
  if (!recording()) process.exit(0);
  console.log(
    "[GM 점검 — 이번 답변을 쓰기 전에]\n" +
      "①금지어: 양반·주막·객주·나리·시진·'셈'·한자·대사 속 회차 번호·gp/닢\n" +
      "②이득 본·우호적인 NPC에게 증거 없는 의심·압박·협박을 시키지 않는다. 의심은 구체적 증거가 있을 때만, 한 번 짚고 넘어간다. 새 NPC는 파일에 stance(호의·중립·경계·적대)와 경계·적대의 근거(stanceWhy)를 적는다.\n" +
      "③베릭스의 말·행동·이동을 대신 쓰지 않는다(준비하라고 했으면 준비까지만).\n" +
      "④싸움이 예고되면 정찰 직후 round 0 전투판을 그리고, 베릭스 차례마다 main에 푸시한다.\n" +
      "⑤물건 값은 2024 PHB 표 기준 실버부터. ⑧탐지·길 안내·정찰 능력은 확정된 사실만 — 쓰는 순간 새 위험·장애물을 만들지 않는다(없으면 「위험 없음」, 의도에 맞는 안전한 길). ⑥계약·조건은 앞서 읽어 준 문장을 그대로 인용해 대조한다. ⑦포로·단역 목록을 장면마다 갱신한다." +
      (fs.existsSync(path.join(ROOT, "state", "battle.json"))
        ? "\n⑨전투 중 — CLAUDE.md '전투 서술 예문'대로: 라운드 제목만 두고, 행동마다 굵은 제목 없이 서술 문단(누가 누구에게·어떻게·보이는 결과, 두세 문장 이상) → 바로 아래 > 인용 블록에 '공격자 → 대상: 합계 vs AC — 명중(보정 설명)' / '피해: 주사위[값]+보정 = 합 → 대상 현재/최대'. 좌표는 서술에 넣지 않고 '현재 상황' 목록에만."
        : "")
  );
} else if (cmd === "lint") {
  const info = stdin();
  if (!recording() || info.stop_hook_active || !info.transcript_path) process.exit(0);
  let problems = [];
  try {
    problems = check(lastAssistantText(info.transcript_path), { combat: fs.existsSync(path.join(ROOT, "state", "battle.json")) });
  } catch {
    process.exit(0);
  }
  if (!problems.length) process.exit(0);
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        "방금 GM 답변에서 점검에 걸린 것: " +
        problems.map((p, i) => `${i + 1}) ${p}`).join(" / ") +
        ". 해당 문장만 고쳐 다시 출력하라. 사과는 한 줄로, 장면 진행은 그대로.",
    })
  );
} else if (cmd === "test") {
  const arg = process.argv.slice(3).join(" ");
  const r = check(arg === "-" ? fs.readFileSync(0, "utf8") : arg);
  console.log(r.length ? r.join("\n") : "통과");
} else {
  console.log("사용법: node tools/gm-guard.js remind | lint | test \"문장\"");
}
