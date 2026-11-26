#!/usr/bin/env node
// 동행 동료의 쓸 수 있는 능력·자원을 뽑는다 — 보조 GM(동료 담당)에게 넘기는 카드이자, 주 GM의 점검표.
// 60회차 강평 ㄷ: 전투 준비에 이드라의 인도를 GM이 꺼내지 않은 일.
//
// 사용:
//   node tools/assist.js                 동행 동료 전원의 자원 요약 + 보조 능력 후보(전투 준비·대기 장면용)
//   node tools/assist.js card [id ...]   보조 GM 첫 호출용 인물 카드(개성·지식·관계·장비·주문 전부)
//   node tools/assist.js --with nadin    동행 명단에 id를 더한다(at이 낡았을 때) · --without neri 빼기
//
// 동행 판단: _index.party 중 at이 없거나 '동행'이 들어간 사람 + npcs 중 at에 '동행'이 들어간 사람.
// 파일은 바꾸지 않는다.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

function load(id) {
  for (const dir of ["state/chars", "state/npcs"]) {
    const f = path.join(ROOT, dir, id + ".json");
    if (fs.existsSync(f)) { const d = JSON.parse(fs.readFileSync(f, "utf8")); return d.char || d.npc || d; }
  }
  return null;
}

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const plus = (opt("--with") || "").split(",").filter(Boolean);
const minus = (opt("--without") || "").split(",").filter(Boolean);
const mode = args[0] === "card" ? "card" : "list";
const named = mode === "card" ? args.slice(1) : [];

function roster() {
  const idx = rj("state/chars/_index.json");
  const ids = [];
  (idx.party || []).forEach((id) => { const c = load(id); if (c && (!c.at || /동행/.test(c.at))) ids.push(id); });
  (idx.npcs || []).forEach((id) => { const c = load(id); if (c && c.at && /동행/.test(c.at)) ids.push(id); });
  return [...new Set([...ids, ...plus])].filter((id) => !minus.includes(id));
}

// 전투 준비·대기 장면에서 먼저 꺼낼 만한 것(보조·보호·회복·탐색·통역)
const SUPPORT = /인도|축복|보호|방패|영웅|나무껍질|치유|치료|회복|착한 열매|은신|투명|변신|야수|대지의 가호|탐지|대화|통역|언어|용언어|추적|안개 걸음|빛|어둠 시야|신속|원조|도움|강화|이점/;
const short = (s, n = 70) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

function mech(c) {
  const sh = c.sheet || {};
  const lines = [];
  const hp = c.hp ? `HP ${c.hp.cur}/${c.hp.max}${c.hp.tmp ? ` (+임시 ${c.hp.tmp})` : ""}` : "";
  lines.push(`${hp} · AC ${sh.ac ?? "?"}${sh.slots ? " · 슬롯 " + sh.slots.map((s) => `${s.lvl}레벨 ${s.cur}/${s.max}`).join(", ") : ""}`);
  const res = (sh.resources || []).map((r) => `${r.n} ${r.cur}/${r.max}`);
  if (res.length) lines.push("자원: " + res.join(" · "));
  const eq = [...(c.equipment || []), ...(c.items || [])].filter((x) => x.equipped).map((x) => x.item || x.n);
  if (eq.length) lines.push("장착: " + eq.join(" · "));
  if (sh.attacks) lines.push("공격: " + sh.attacks.map((a) => `${a.n} ${a.atk} ${a.dmg}`).join(" / "));
  return lines;
}

function supportList(c) {
  const sh = c.sheet || {};
  const out = [];
  (sh.cantrips || []).forEach((s) => { if (SUPPORT.test(s.n + (s.d || ""))) out.push(`[소마법] ${s.n} — ${short(s.sum || s.d)}`); });
  (sh.spells || []).forEach((s) => { if (SUPPORT.test(s.n + (s.sum || "") + (s.d || "").slice(0, 120))) out.push(`[${s.t || "주문"}${s.c ? " · " + s.c : ""}] ${s.n} — ${short(s.sum || s.d)}`); });
  (sh.abilities || []).forEach((a) => { if (SUPPORT.test(a.n + (a.sum || "") + (a.d || "").slice(0, 120))) out.push(`[${a.t || "특성"}] ${a.n} — ${short(a.sum || a.d)}`); });
  (sh.resources || []).forEach((r) => { if (r.cur > 0 && SUPPORT.test(r.n + (r.sum || ""))) out.push(`[자원 ${r.cur}/${r.max}] ${r.n} — ${short(r.sum || r.note)}`); });
  return out;
}

const tail = (s, n) => (s && s.length > n ? "…" + s.slice(-n) : s);
const str = (v) => (typeof v === "string" ? v : JSON.stringify(v));

if (mode === "list") {
  const ids = roster();
  if (!ids.length) { console.log("동행 동료 없음 — --with id로 더할 수 있다"); process.exit(0); }
  console.log(`동행: ${ids.join(", ")}  (낡은 at이면 --with/--without)`);
  for (const id of ids) {
    const c = load(id); if (!c) { console.log(`[${id}] 없음`); continue; }
    console.log(`\n=== ${c.name} (${id}) ===`);
    mech(c).forEach((l) => console.log("  " + l));
    const sup = supportList(c);
    if (sup.length) { console.log("  먼저 꺼낼 만한 것:"); sup.forEach((l) => console.log("   · " + l)); }
  }
} else {
  const ids = named.length ? named : roster();
  for (const id of ids) {
    const c = load(id); if (!c) { console.log(`[${id}] 없음`); continue; }
    console.log(`=== ${c.name} (${id}) ===`);
    for (const k of ["role", "at", "align", "stance", "voice", "drive", "fear", "spotlight", "comply"]) if (c[k] !== undefined) console.log(`${k}: ${str(c[k])}`);
    if (c.code) console.log(`code.does: ${c.code.does}\ncode.wont: ${c.code.wont}`);
    if (c.knows) console.log(`knows: ${str(c.knows)}`);
    if (c.unknown) console.log(`unknown: ${str(c.unknown)}`);
    if (c.bond) console.log(`bond(최근): ${tail(c.bond, 900)}`);
    if (c.susp !== undefined) console.log(`susp: ${str(c.susp)}`);
    mech(c).forEach((l) => console.log(l));
    const sh = c.sheet || {};
    const sp = [...(sh.cantrips || []).map((s) => `${s.n}(소마법)`), ...(sh.spells || []).map((s) => `${s.n}(${s.t || ""}${s.c ? ", " + s.c : ""})`)];
    if (sp.length) console.log("주문: " + sp.join(" · "));
    const ab = (sh.abilities || []).map((a) => `${a.n}${a.sum ? "(" + a.sum + ")" : ""}`);
    if (ab.length) console.log("특성: " + ab.join(" · "));
    if (sh.languages) console.log("언어: " + str(sh.languages));
    console.log("");
  }
}
