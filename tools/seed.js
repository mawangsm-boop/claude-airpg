#!/usr/bin/env node
/* 내장 SEED 갱신 — index.html 안에 박혀 있는 "로컬 모드용 기본 상태"를 현재 state로 다시 만든다.
 *
 *   node tools/seed.js            SEED를 현재 상태로 교체
 *   node tools/seed.js --check    교체하지 않고 지금 SEED가 몇 회차·어느 rev인지만 출력
 *
 * 원격(state/*.json)을 못 읽을 때만 쓰이는 값이라 평소엔 아무도 안 보지만, 방치하면
 * 40회차 옛 구조가 그대로 남아 로컬 모드에서 엉뚱한 화면이 뜬다. 큰 개편 뒤 한 번씩 돌린다.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const S = (...p) => path.join(ROOT, "state", ...p);
const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const check = process.argv.includes("--check");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const start = html.indexOf("const SEED = ");
if (start < 0) { console.error("index.html에서 SEED 블록을 찾지 못했습니다."); process.exit(1); }
const objStart = html.indexOf("{", start);

/* SEED는 거대한 JSON 객체라 그 안 문자열 값에 우연히 "};"가 들어갈 수 있다.
 * (예: 43회차, 실제로 이 정확한 패턴 때문에 뒤쪽 onclick 핸들러의 "};"를 끝으로
 * 잘못 잡아 렌더링 함수들이 통째로 날아간 사고가 있었다.) 그래서 단순 문자열
 * 검색 대신 문자열 리터럴을 건너뛰며 중괄호 깊이를 세어 진짜 끝을 찾는다. */
function findObjectEnd(s, openIdx) {
  let depth = 0, inStr = false, esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
const objEnd = findObjectEnd(html, objStart);
if (objEnd < 0) { console.error("SEED 객체의 끝(중괄호 짝)을 찾지 못했습니다."); process.exit(1); }
const end = objEnd + 1; // "}" 다음 위치 — 이 뒤에 곧바로 ";"가 온다
if (html[end] !== ";") { console.error("SEED 객체 뒤에 ';'가 없습니다 — index.html 구조가 예상과 다릅니다."); process.exit(1); }
const endMark = ";"; // slice 시 이 한 글자만 건너뛰면 된다

if (check) {
  const cur = html.slice(start, end);
  const m = cur.match(/"session":\s*(\d+)/);
  const seedRev = cur.match(/"seedRev":\s*"([^"]+)"/);
  console.log("현재 내장 SEED — 회차:", m ? m[1] : "?", "· rev:", seedRev ? seedRev[1] : "(표기 없음)");
  console.log("현재 state   — 회차:", rj(S("core.json")).session, "· rev:", rj(S("rev.json")).rev);
  process.exit(0);
}

/* 핸드북 로더(fetchRemoteState)와 같은 모양으로 조립한다 */
const merged = Object.assign({}, rj(S("core.json")), rj(S("world.json")), rj(S("threads.json")), rj(S("log.json")));
for (const opt of ["clocks", "factions"]) {
  const p = S(opt + ".json");
  if (fs.existsSync(p)) Object.assign(merged, rj(p));
}
merged.dungeon = { name: "", here: "", note: "", rooms: [], doors: [] };
merged.battle = { name: "", cols: 16, rows: 12, round: 1, terrain: [], tokens: [] };

const idx = rj(S("chars", "_index.json"));
merged.pc = rj(S("chars", idx.pc + ".json")).char;
merged.sheets = {};
merged.party = (idx.party || []).map((id) => {
  const { sheet, ...rest } = rj(S("chars", id + ".json")).char;
  if (sheet) merged.sheets[id] = sheet;
  return rest;
});
merged.npcs = [
  ...(idx.npcs || []).map((id) => rj(S("npcs", id + ".json")).char),
  ...(idx.npcMinor ? rj(S("npcs", idx.npcMinor + ".json")).npcs : []),
];
merged.seedRev = rj(S("rev.json")).rev; // 이 내장본이 언제 것인지 화면에서 확인할 수 있게

const block = "const SEED = " + JSON.stringify(merged, null, 2) + ";";
const out = html.slice(0, start) + block + html.slice(end + endMark.length);
fs.writeFileSync(path.join(ROOT, "index.html"), out);
console.log("SEED 갱신 완료 —", merged.session + "회차 ·", merged.seedRev);
console.log("  동료", merged.party.length, "명 · 시트", Object.keys(merged.sheets).length, "개 · NPC", merged.npcs.length, "명");
console.log("  index.html", out.length, "바이트");
