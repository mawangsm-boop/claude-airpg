#!/usr/bin/env node
/* 베릭스 캠페인 state 검증기
 *
 * 사용법: node tools/validate.js        (커밋 직전에 한 번 돌린다)
 *
 * 오류(ERROR)가 하나라도 있으면 종료 코드 1로 끝난다 — 이 상태로 커밋하면
 * 핸드북이 깨지거나 서술에 잘못된 수치가 섞인다.
 * 경고(WARN)는 커밋을 막지 않지만, 방치하면 나중에 오류가 된다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const S = (...p) => path.join(ROOT, "state", ...p);

const errors = [];
const warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);

function readJSON(rel, { required = true } = {}) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    if (required) err(rel, "파일이 없습니다");
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    err(rel, "JSON 파싱 실패 — " + e.message);
    return null;
  }
}

/* ---------- 공통 검사 ---------- */
function checkDupIds(rel, arr, label, altKey) {
  if (!Array.isArray(arr)) return;
  const seen = new Map();
  arr.forEach((o, i) => {
    let key = null;
    if (o && typeof o === "object") {
      if (o.id !== undefined) key = "id:" + o.id;
      else if (o.n !== undefined) key = "n:" + o.n;
      else if (altKey && o[altKey] !== undefined) key = altKey + ":" + o[altKey];
    }
    if (key === null) {
      warn(rel, `${label}[${i}] 에 id도 n도 없습니다 — 병합·삭제 대상 지정이 불가능합니다`);
      return;
    }
    if (seen.has(key)) err(rel, `${label} 중복 키 ${key} (${seen.get(key)}번째와 ${i}번째)`);
    else seen.set(key, i);
  });
}

function checkHP(rel, hp, who) {
  if (!hp || typeof hp !== "object") return err(rel, `${who}: hp 객체가 없습니다`);
  for (const k of ["cur", "max"]) {
    if (typeof hp[k] !== "number") return err(rel, `${who}: hp.${k}가 숫자가 아닙니다 (${JSON.stringify(hp[k])})`);
  }
  if (hp.cur > hp.max) err(rel, `${who}: hp.cur(${hp.cur})이 hp.max(${hp.max})보다 큽니다`);
  if (hp.cur < 0) err(rel, `${who}: hp.cur이 음수입니다 (${hp.cur})`);
  if (hp.tmp !== undefined && typeof hp.tmp !== "number") err(rel, `${who}: hp.tmp가 숫자가 아닙니다`);
}

const RECHARGE = ["long", "short", "turn"];
function checkSheet(rel, sheet) {
  if (!sheet) return;
  checkDupIds(rel, sheet.resources, "sheet.resources");
  checkDupIds(rel, sheet.abilities, "sheet.abilities");
  (sheet.resources || []).forEach((r) => {
    if (typeof r.cur !== "number" || typeof r.max !== "number") err(rel, `자원 ${r.id}: cur/max가 숫자가 아닙니다`);
    else if (r.cur > r.max) err(rel, `자원 ${r.id}: cur(${r.cur})이 max(${r.max})를 넘습니다`);
    if (!RECHARGE.includes(r.recharge)) err(rel, `자원 ${r.id}: recharge 값이 유효하지 않습니다 (${r.recharge})`);
  });
}

const ITEM_CATS = new Set(["weapon", "accessory", "consumable", "trinket", "misc"]);
function checkItems(rel, items) {
  checkDupIds(rel, items, "items");
  (items || []).forEach((it) => {
    if (!it.id) return;
    if (!it.cat) warn(rel, `아이템 ${it.id}에 cat이 없습니다 — 획득 시점에 지정하는 것이 규칙입니다`);
    else if (!ITEM_CATS.has(it.cat)) err(rel, `아이템 ${it.id}의 cat이 유효하지 않습니다: ${it.cat}`);
    if (it.charge) {
      const c = it.charge;
      if (typeof c.cur !== "number" || typeof c.max !== "number") err(rel, `아이템 ${it.id}의 charge.cur/max가 숫자가 아닙니다`);
      else if (c.cur > c.max) err(rel, `아이템 ${it.id}의 charge.cur(${c.cur})이 max(${c.max})를 넘습니다`);
      if (!RECHARGE.includes(c.recharge)) err(rel, `아이템 ${it.id}의 charge.recharge 값이 유효하지 않습니다: ${c.recharge}`);
    }
  });
}

/* ---------- core.json (세션 헤더) ---------- */
const core = readJSON("state/core.json");
if (core) {
  if (core.pc) err("state/core.json", "pc 객체가 남아 있습니다 — 베릭스의 단일 출처는 state/chars/verrix.json입니다");
  if (typeof core.session !== "number") warn("state/core.json", "session이 숫자가 아닙니다");
  for (const k of ["arc", "place", "checkpoint"]) if (!core[k]) warn("state/core.json", `${k}가 비어 있습니다`);
}

/* ---------- 캐릭터 파일 ---------- */
const idx = readJSON("state/chars/_index.json");
if (idx) {
  const seenIds = new Set();
  const loadChar = (rel, id) => {
    const o = readJSON(rel);
    if (!o) return null;
    if (!o.char) { err(rel, '{"char":{...}} 래핑이 아닙니다'); return null; }
    const c = o.char;
    if (!c.id) err(rel, "char.id가 없습니다");
    else if (c.id !== id) err(rel, `char.id(${c.id})가 인덱스의 id(${id})와 다릅니다`);
    if (seenIds.has(id)) err("state/chars/_index.json", `id ${id}가 인덱스에 두 번 있습니다`);
    seenIds.add(id);
    return c;
  };

  if (!idx.pc) err("state/chars/_index.json", "pc가 지정되지 않았습니다");
  else {
    const rel = `state/chars/${idx.pc}.json`;
    const pc = loadChar(rel, idx.pc);
    if (pc) {
      checkHP(rel, pc.hp, "pc");
      checkItems(rel, pc.items);
      checkDupIds(rel, pc.feats, "feats");
      checkDupIds(rel, pc.spells, "spells");
      if (pc.slots && pc.slots.cur > pc.slots.max) err(rel, `슬롯 cur(${pc.slots.cur})이 max(${pc.slots.max})를 넘습니다`);
    }
  }

  (idx.party || []).forEach((id) => {
    const rel = `state/chars/${id}.json`;
    const c = loadChar(rel, id);
    if (!c) return;
    checkHP(rel, c.hp, id);
    checkSheet(rel, c.sheet);
    if (!c.sheet) warn(rel, "sheet가 없습니다 — 핸드북에 스탯·자원이 표시되지 않습니다");
    for (const f of ["align", "voice", "code", "drive", "bond"])
      if (!c[f]) warn(rel, `${f}(개성 필드)가 없습니다 — 동료가 전투 유닛으로만 쓰이기 쉽습니다`);
    if (c.code && (!c.code.does || !c.code.wont)) warn(rel, "code에 does/wont 두 줄이 모두 있어야 판단 기준이 됩니다");
    if (!c.susp) warn(rel, "susp(의심도)가 없습니다");
    else if (typeof c.susp.cur !== "number" || typeof c.susp.max !== "number") err(rel, "susp.cur/max가 숫자가 아닙니다");
    else if (c.susp.cur > c.susp.max) err(rel, `susp.cur(${c.susp.cur})이 max(${c.susp.max})를 넘습니다`);
    (c.equipment || []).forEach((e, i) => { if (!e.slot) warn(rel, `equipment[${i}]에 slot이 없습니다`); });
  });

  (idx.npcs || []).forEach((id) => {
    const rel = `state/npcs/${id}.json`;
    const c = loadChar(rel, id);
    if (c && !c.name) warn(rel, "name이 비어 있습니다 — 관계 탭에 이름 없이 표시됩니다");
  });

  if (idx.npcMinor) {
    const rel = `state/npcs/${idx.npcMinor}.json`;
    const mf = readJSON(rel);
    if (mf) {
      if (!Array.isArray(mf.npcs)) err(rel, '{"npcs":[...]} 래핑이 아닙니다');
      else {
        checkDupIds(rel, mf.npcs, "npcs");
        mf.npcs.forEach((n) => {
          if (!n.name) warn(rel, `${n.id}: name이 비어 있습니다`);
          if (seenIds.has(n.id)) err(rel, `${n.id}는 개별 파일로도 있습니다 — 관계 탭에 두 번 나옵니다`);
        });
      }
    }
  }

  /* 인덱스에 없는 파일은 핸드북이 읽지 않는다 — 조용히 사라지는 것을 막는다 */
  const listed = new Set([idx.pc, ...(idx.party || [])]);
  for (const f of fs.existsSync(S("chars")) ? fs.readdirSync(S("chars")) : []) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    if (!listed.has(f.replace(/\.json$/, ""))) warn("state/chars", `${f}은 _index.json에 없어 읽히지 않습니다`);
  }
  const listedN = new Set([...(idx.npcs || []), idx.npcMinor]);
  for (const f of fs.existsSync(S("npcs")) ? fs.readdirSync(S("npcs")) : []) {
    if (!f.endsWith(".json")) continue;
    if (!listedN.has(f.replace(/\.json$/, ""))) warn("state/npcs", `${f}은 _index.json에 없어 읽히지 않습니다`);
  }
}

/* ---------- threads / log ---------- */
const threadsFile = readJSON("state/threads.json");
if (threadsFile) {
  const th = threadsFile.threads;
  if (!Array.isArray(th)) err("state/threads.json", '{"threads":[...]} 래핑이 아닙니다');
  else {
    checkDupIds("state/threads.json", th, "threads", "t");
    th.forEach((t, i) => {
      if (!t.id) warn("state/threads.json", `threads[${i}] "${t.t}"에 id가 없습니다`);
      if (t.st && !["open", "resolved"].includes(t.st))
        err("state/threads.json", `${t.id || t.t}: st는 open/resolved 중 하나여야 합니다 (현재 ${t.st})`);
      else if (!t.st) warn("state/threads.json", `${t.id || t.t}: st(open/resolved)가 없습니다`);
    });
  }
}
const logFile = readJSON("state/log.json");
if (logFile && !Array.isArray(logFile.log)) err("state/log.json", '{"log":[...]} 래핑이 아닙니다');

/* ---------- world.json ---------- */
const indexHtml = fs.existsSync(path.join(ROOT, "index.html")) ? fs.readFileSync(path.join(ROOT, "index.html"), "utf8") : "";
const worldFile = readJSON("state/world.json");
if (worldFile) {
  const w = worldFile.world;
  if (!w) err("state/world.json", '{"world":{...}} 래핑이 아닙니다');
  else {
    checkDupIds("state/world.json", w.customPlaces, "customPlaces");
    const CATS = new Set(["settlement", "dungeon", "terrain", "waypoint"]);
    (w.customPlaces || []).forEach((p) => {
      if (!p.cat) warn("state/world.json", `${p.id}: cat이 없습니다 — 지도 마커가 기타로 분류됩니다`);
      else if (!CATS.has(p.cat)) err("state/world.json", `${p.id}: cat 값이 유효하지 않습니다 (${p.cat})`);
      if (p.cat === "settlement" && !p.tier) warn("state/world.json", `${p.id}: settlement인데 tier(city/village)가 없습니다`);
      if (typeof p.x !== "number" || typeof p.y !== "number") err("state/world.json", `${p.id}: 좌표가 숫자가 아닙니다`);
      else if (p.x < 0 || p.x > 4050 || p.y < 0 || p.y > 3000) err("state/world.json", `${p.id}: 좌표가 4050x3000 범위를 벗어납니다`);
    });
    const placeIds = new Set([
      ...[...indexHtml.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*n:\s*"/g)].map((m) => m[1]),
      ...(w.customPlaces || []).map((p) => p.id),
    ]);
    if (placeIds.size === 0) warn("index.html", "PLACES 목록을 찾지 못해 지점 참조 검사를 건너뜁니다");
    else {
      (w.discovered || []).forEach((id) => {
        if (!placeIds.has(id)) err("state/world.json", `discovered의 "${id}"에 해당하는 지점이 없습니다 (PLACES·customPlaces 모두)`);
      });
      if (w.here && !placeIds.has(w.here)) err("state/world.json", `here "${w.here}"에 해당하는 지점이 없습니다`);
      if (w.here && !(w.discovered || []).includes(w.here)) warn("state/world.json", `here "${w.here}"가 discovered에 없습니다`);
    }
  }
}

/* ---------- 전투·던전 (있을 때만) ---------- */
const battleFile = readJSON("state/battle.json", { required: false });
if (battleFile) {
  const b = battleFile.battle;
  if (!b) err("state/battle.json", '{"battle":{...}} 래핑이 아닙니다');
  else {
    checkDupIds("state/battle.json", b.tokens, "tokens");
    (b.tokens || []).forEach((t) => {
      if (typeof t.x !== "number" || typeof t.y !== "number") err("state/battle.json", `${t.id}: 좌표가 숫자가 아닙니다`);
      else if (t.x < 0 || t.y < 0 || (b.cols && t.x >= b.cols) || (b.rows && t.y >= b.rows))
        err("state/battle.json", `${t.id}: 좌표(${t.x},${t.y})가 그리드(${b.cols}x${b.rows})를 벗어납니다`);
      if (t.hp !== undefined && !/^\d+\/\d+$/.test(String(t.hp)))
        err("state/battle.json", `${t.id}: hp는 "현재/최대" 형식이어야 합니다 (현재 ${JSON.stringify(t.hp)})`);
      if (!["pc", "ally", "enemy", "neutral"].includes(t.side)) err("state/battle.json", `${t.id}: side 값이 유효하지 않습니다 (${t.side})`);
    });
  }
}
const dungeonFile = readJSON("state/dungeon.json", { required: false });
if (dungeonFile) {
  const dg = dungeonFile.dungeon;
  if (!dg) err("state/dungeon.json", '{"dungeon":{...}} 래핑이 아닙니다');
  else {
    checkDupIds("state/dungeon.json", dg.rooms, "rooms");
    const rid = new Set((dg.rooms || []).map((r) => r.id));
    (dg.doors || []).forEach((d, i) => {
      if (!Array.isArray(d) || d.length !== 2) return err("state/dungeon.json", `doors[${i}]는 [방id, 방id] 형식이어야 합니다`);
      d.forEach((x) => { if (!rid.has(x)) err("state/dungeon.json", `doors[${i}]가 존재하지 않는 방 "${x}"를 가리킵니다`); });
    });
    if (dg.here && !rid.has(dg.here)) err("state/dungeon.json", `here "${dg.here}"에 해당하는 방이 없습니다`);
  }
}

/* ---------- clocks / factions ---------- */
const clocksFile = readJSON("state/clocks.json", { required: false });
if (clocksFile) {
  const cl = clocksFile.clocks;
  if (!Array.isArray(cl)) err("state/clocks.json", '{"clocks":[...]} 래핑이 아닙니다');
  else {
    checkDupIds("state/clocks.json", cl, "clocks");
    cl.forEach((c) => {
      if (typeof c.cur !== "number" || typeof c.max !== "number") err("state/clocks.json", `${c.id}: cur/max가 숫자가 아닙니다`);
      else if (c.cur > c.max) err("state/clocks.json", `${c.id}: cur(${c.cur})이 max(${c.max})를 넘습니다`);
      else if (c.cur < 0) err("state/clocks.json", `${c.id}: cur이 음수입니다`);
      if (c.vis && !["open", "gm"].includes(c.vis)) err("state/clocks.json", `${c.id}: vis는 open/gm 중 하나여야 합니다 (${c.vis})`);
      if (c.st && !["open", "done"].includes(c.st)) err("state/clocks.json", `${c.id}: st는 open/done 중 하나여야 합니다 (${c.st})`);
      if (c.cur === c.max && c.st !== "done") warn("state/clocks.json", `${c.id}: 시계가 가득 찼습니다 — 발동 처리 후 st를 done으로 바꾸세요`);
    });
  }
}
const facFile = readJSON("state/factions.json", { required: false });
if (facFile) {
  const fa = facFile.factions;
  if (!Array.isArray(fa)) err("state/factions.json", '{"factions":[...]} 래핑이 아닙니다');
  else {
    checkDupIds("state/factions.json", fa, "factions");
    fa.forEach((f) => {
      if (typeof f.rep !== "number" || f.rep < -3 || f.rep > 3) err("state/factions.json", `${f.id}: rep는 -3~+3 사이 숫자여야 합니다 (${f.rep})`);
      if (!f.stance) warn("state/factions.json", `${f.id}: stance가 없습니다`);
      if (f.st && !["active", "ended"].includes(f.st)) err("state/factions.json", `${f.id}: st는 active/ended 중 하나여야 합니다 (${f.st})`);
    });
  }
}

/* ---------- index.html ---------- */
if (indexHtml) {
  const blocks = [...indexHtml.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) warn("index.html", "<script> 블록을 찾지 못했습니다");
  blocks.forEach((code, i) => {
    try { new vm.Script(code); }
    catch (e) { err("index.html", `script[${i}] 구문 오류 — ${e.message} (이 상태로 올리면 핸드북이 아예 뜨지 않습니다)`); }
  });
  const partsMatch = indexHtml.match(/const REMOTE_PARTS\s*=\s*\[([^\]]*)\]/);
  if (partsMatch) {
    [...partsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).forEach((n) => {
      if (!fs.existsSync(S(n + ".json")))
        err("index.html", `REMOTE_PARTS의 ${n}.json이 없습니다 — 핸드북이 통째로 "로컬 모드"로 떨어집니다`);
    });
  }
}

/* ---------- rev.json 갱신 여부 ---------- */
const rev = readJSON("state/rev.json");
try {
  const changed = execSync("git status --porcelain -- state/", { cwd: ROOT, encoding: "utf8" })
    .split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
  if (changed.length && !changed.some((f) => f.endsWith("state/rev.json")))
    err("state/rev.json", `state 파일이 ${changed.length}개 바뀌었는데 rev.json은 그대로입니다 — 핸드북 화면이 갱신되지 않습니다`);
  if (rev && !/^S\d+-\d+$/.test(String(rev.rev))) warn("state/rev.json", `rev 형식이 S{회차}-{일련번호}가 아닙니다 (${rev.rev})`);
} catch {
  warn("state/rev.json", "git 상태를 읽지 못해 rev 갱신 검사를 건너뜁니다");
}

/* ---------- 결과 ---------- */
const out = [];
if (errors.length) out.push("오류 " + errors.length + "건", ...errors.map((e) => "  ✗ " + e));
if (warns.length) out.push("경고 " + warns.length + "건", ...warns.map((w) => "  ! " + w));
if (!errors.length && !warns.length) out.push("문제 없습니다.");
else if (!errors.length) out.push("\n오류 없음 — 커밋 가능합니다.");
console.log(out.join("\n"));
process.exit(errors.length ? 1 : 0);
