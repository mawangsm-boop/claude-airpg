#!/usr/bin/env node
/* 전투 계산 — 거리·사거리·범위·기회 공격·협공을 머리로 셈하지 말고 battle.json 좌표로 계산한다.
 * (51회차 강평: 장거리 불리점 누락, 최면 무늬 범위 과장, 서제스천 사거리 착오, 물 위에 선 토큰, 쌍둥이 인장 누락)
 *
 * 1칸 = 1.5m. 거리는 2024 기본 격자 규칙(대각선도 1칸) — 칸 수 = max(|dx|,|dy|).
 * 토큰은 id 또는 이름 일부로 부른다(예: verrix, 세스, 조장1). 좌표는 "x,y"로 직접 줘도 된다.
 *
 *   node tools/battle.js board                       판 요약 — 크기 경고, 판 밖·겹친 토큰, 물 위에 선 토큰
 *   node tools/battle.js dist A B                    A↔B 칸 수와 m
 *   node tools/battle.js near A [m]                  A에서 m 안의 토큰(기본 1.5m = 붙어 있음)
 *   node tools/battle.js attack A B [정상m] [장거리m]  공격 점검 — 사거리·장거리 불리점·근접한 적 옆 원거리 불리점·
 *                                                     협공(대상 곁의 A 편)·쌍둥이 인장 안내. 근접이면 사거리 생략
 *   node tools/battle.js spell A B "주문 이름 일부"     A의 캐릭터 파일에서 주문 사거리("사거리 18m")를 읽어 닿는지
 *   node tools/battle.js cube x y m                  (x,y)를 한 모서리로 한 m 정육면체(정사각형) 안의 토큰
 *   node tools/battle.js cube-at A m                 A를 가운데 두는 m 정육면체 안의 토큰
 *   node tools/battle.js sphere A|x,y m              중심에서 반경 m 안(구·원기둥·발산)의 토큰
 *   node tools/battle.js fit A m [대상들...]          A의 사거리 안에서, 대상들을 모두 덮는 m 정육면체 자리가 있는지 찾는다
 *                                                     (예: fit verrix 9 세스 쇠뇌수1 쇠뇌수2 — 사거리는 --range 36으로)
 *   node tools/battle.js move A x y                  A가 (x,y)로 곧게 가는 칸 수와, 붙어 있다가 벗어나는 적(기회 공격 후보)
 *
 * 옵션: --range m (fit의 시전 사거리, 기본 36) · --file 경로 (기본 state/battle.json)
 * 계산만 한다. 파일은 바꾸지 않는다.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const CELL = 1.5;

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { opt[argv[i].slice(2)] = argv[i + 1]; argv.splice(i, 2); i--; }
}
const file = opt.file ? path.resolve(opt.file) : path.join(ROOT, "state", "battle.json");
if (!fs.existsSync(file)) { console.error("battle.json이 없습니다 — 전투 중이 아닙니다."); process.exit(1); }
const B = JSON.parse(fs.readFileSync(file, "utf8")).battle;
const T = B.tokens || [];
const alive = (t) => !t.down && !/^0\//.test(String(t.hp || ""));
const sideOf = (t) => (t.side === "pc" || t.side === "ally") ? "party" : t.side;
const m = (cells) => `${cells}칸(${(cells * CELL).toFixed(1).replace(/\.0$/, "")}m)`;
const cellsOf = (meters) => Math.floor(Number(meters) / CELL + 1e-9);
const D = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function find(q) {
  if (/^\d+,\d+$/.test(q)) { const [x, y] = q.split(",").map(Number); return { id: q, name: `(${q})`, x, y, side: "point" }; }
  const s = q.toLowerCase().replace(/\s/g, "");
  const hit = T.filter((t) => t.id.toLowerCase() === s) ;
  if (hit.length) return hit[0];
  const part = T.filter((t) => t.id.toLowerCase().includes(s) || String(t.name).replace(/\s/g, "").includes(q.replace(/\s/g, "")));
  if (part.length === 1) return part[0];
  if (!part.length) { console.error(`토큰 '${q}'을 찾지 못했습니다. 있는 토큰: ${T.map((t) => t.id).join(", ")}`); process.exit(1); }
  console.error(`'${q}'에 맞는 토큰이 여럿입니다: ${part.map((t) => `${t.id}(${t.name})`).join(", ")}`); process.exit(1);
}
const label = (t) => `${t.name}(${t.x},${t.y})${alive(t) ? "" : " [쓰러짐]"}`;
const inRect = (t, x0, y0, n) => t.x >= x0 && t.x < x0 + n && t.y >= y0 && t.y < y0 + n;
const terrainAt = (x, y) => (B.terrain || []).filter((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

const cmd = argv.shift();
const out = [];
switch (cmd) {
  case "board": {
    out.push(`${B.name} · ${B.cols}×${B.rows}칸 · ${B.round || 1}라운드 · 차례 ${B.turn || "-"}`);
    if (B.cols > 28 || B.rows > 20) out.push(`⚠ 판이 큽니다(${B.cols}×${B.rows}) — 휴대폰에서 작게 보인다. 빈 줄·칸을 잘라 28칸 이하로.`);
    const pos = {};
    for (const t of T) {
      if (t.x < 0 || t.y < 0 || t.x >= B.cols || t.y >= B.rows) out.push(`⚠ 판 밖: ${label(t)}`);
      if (alive(t)) { const k = `${t.x},${t.y}`; (pos[k] = pos[k] || []).push(t.name); }
      const ter = terrainAt(t.x, t.y);
      const wet = ter.length && ter.every((r) => r.type === "water");
      if (alive(t) && wet && !/배|물|헤엄|수영/.test((t.st || []).join(" "))) out.push(`⚠ 물 위에 선 토큰: ${label(t)} — 배·선창 칸이 아니면 위치를 다시 보라`);
    }
    for (const [k, v] of Object.entries(pos)) if (v.length > 1) out.push(`⚠ 같은 칸(${k})에 산 토큰 여럿: ${v.join(", ")}`);
    const init = new Set(B.init || []);
    for (const t of T) if (!init.has(t.id)) out.push(`· 이니셔티브에 없음: ${t.id}`);
    if (out.length === 1) out.push("이상 없음.");
    break;
  }
  case "dist": {
    const a = find(argv[0]), b = find(argv[1]);
    out.push(`${label(a)} → ${label(b)} : ${m(D(a, b))}`);
    break;
  }
  case "near": {
    const a = find(argv[0]); const r = argv[1] ? cellsOf(argv[1]) : 1;
    const list = T.filter((t) => t !== a && alive(t) && D(a, t) <= r).sort((p, q) => D(a, p) - D(a, q));
    out.push(`${label(a)}에서 ${m(r)} 안: ${list.length ? "" : "없음"}`);
    for (const t of list) out.push(`  ${t.side === a.side || sideOf(t) === sideOf(a) ? "아군" : "적  "} ${label(t)} — ${m(D(a, t))}`);
    break;
  }
  case "attack": {
    const a = find(argv[0]), b = find(argv[1]);
    const d = D(a, b); const normal = argv[2] ? Number(argv[2]) : null; const long = argv[3] ? Number(argv[3]) : null;
    out.push(`${label(a)} → ${label(b)} : ${m(d)}`);
    const adv = [], dis = [];
    if (normal === null) {
      out.push(d <= 1 ? "근접: 닿음(1.5m)." : d <= 2 ? "근접: 간격 무기(3m)여야 닿음." : "근접: 닿지 않음.");
    } else {
      const nc = cellsOf(normal), lc = long ? cellsOf(long) : nc;
      if (d <= nc) out.push(`정상 사거리 ${normal}m 안.`);
      else if (d <= lc) { out.push(`장거리(${normal}~${long}m) — 불리점.`); dis.push("장거리"); }
      else out.push(`⛔ 사거리 밖(최대 ${long || normal}m) — 공격 불가.`);
      const foes = T.filter((t) => alive(t) && t !== a && sideOf(t) !== sideOf(a) && sideOf(t) !== "neutral" && D(a, t) <= 1);
      if (foes.length) { dis.push("근접한 적 옆 원거리"); out.push(`원거리인데 1.5m 안에 적: ${foes.map(label).join(", ")} — 불리점.`); }
    }
    const pals = T.filter((t) => alive(t) && t !== a && t !== b && sideOf(t) === sideOf(a) && D(t, b) <= 1);
    if (pals.length) out.push(`대상 곁 1.5m에 ${a.name} 편: ${pals.map(label).join(", ")} — 로그 암습 조건(아군 인접)·무리 전술 충족.`);
    else out.push("대상 곁에 같은 편 없음 — 암습은 이점이 있어야 한다(스와시버클러는 '내 곁 1.5m에 다른 생물 없음'으로도 가능).");
    if (["isabel", "liv"].includes(a.id)) out.push("쌍둥이 인장 결속: 이번 차례·같은 대상에 상대 무기(레이피어↔자단검)가 먼저 명중했다면 이 공격에 +1d6. 먼저 친 쪽은 없음.");
    if (dis.length) out.push(`→ 불리점 사유: ${dis.join(", ")}`);
    break;
  }
  case "spell": {
    const a = find(argv[0]), b = find(argv[1]); const q = argv[2] || "";
    const f = [path.join(ROOT, "state", "chars", `${a.id}.json`), path.join(ROOT, "state", "npcs", `${a.id}.json`)].find(fs.existsSync);
    if (!f) { console.error(`${a.id}의 캐릭터 파일이 없습니다.`); process.exit(1); }
    const c = JSON.parse(fs.readFileSync(f, "utf8")); const ch = c.char || c;
    const pool = [...(ch.spells || []), ...((ch.sheet || {}).spells || []), ...((ch.sheet || {}).cantrips || []), ...(ch.resources || [])];
    const sp = pool.filter((s) => String(s.n).includes(q));
    if (sp.length !== 1) { console.error(sp.length ? `여럿: ${sp.map((s) => s.n).join(", ")}` : `'${q}' 주문이 없습니다.`); process.exit(1); }
    const s = sp[0]; const txt = `${s.d || ""} ${s.note || ""} ${s.sum || ""}`;
    const d = D(a, b);
    let r = (txt.match(/사거리\s*([\d.]+)\s*m/) || [])[1];
    if (/접촉/.test(txt) && !r) r = "1.5";
    if (/자신/.test(txt) && !r) r = "0";
    if (r === undefined) { out.push(`${s.n}: 설명에서 사거리를 읽지 못했습니다 — 원문을 보라.`); break; }
    const ok = d <= cellsOf(r);
    out.push(`${s.n}${s.school ? ` (${s.school})` : ""} · 사거리 ${r}m = ${m(cellsOf(r))}`);
    out.push(`${label(a)} → ${label(b)} : ${m(d)} → ${ok ? "닿음" : `⛔ 닿지 않음 — ${m(d - cellsOf(r))} 더 가야 함`}`);
    if (/집중/.test(txt)) out.push("집중 주문 — 다른 집중이 있으면 끝난다.");
    if (/슬롯|레벨/.test(String(s.t || "")) && !/캔트립/.test(String(s.t))) out.push("한 차례에 주문 슬롯은 하나만(2024) — 보조 행동 슬롯 주문과 같이 못 씀.");
    break;
  }
  case "cube": case "cube-at": case "sphere": {
    let x0, y0, n, list, desc;
    if (cmd === "cube") { x0 = Number(argv[0]); y0 = Number(argv[1]); n = cellsOf(argv[2]); }
    else if (cmd === "cube-at") { const a = find(argv[0]); n = cellsOf(argv[1]); x0 = a.x - Math.floor((n - 1) / 2); y0 = a.y - Math.floor((n - 1) / 2); }
    if (cmd === "sphere") {
      const c = find(argv[0]); const r = cellsOf(argv[1]);
      list = T.filter((t) => alive(t) && D(c, t) <= r); desc = `${label(c)} 중심 반경 ${m(r)}`;
    } else {
      list = T.filter((t) => alive(t) && inRect(t, x0, y0, n)); desc = `정육면체 (${x0}~${x0 + n - 1}, ${y0}~${y0 + n - 1}) = ${n}×${n}칸`;
    }
    out.push(desc);
    for (const sd of ["enemy", "party", "neutral"]) {
      const g = list.filter((t) => sideOf(t) === sd); if (g.length) out.push(`  ${{ enemy: "적", party: "아군", neutral: "중립" }[sd]} ${g.length}: ${g.map(label).join(", ")}`);
    }
    if (!list.length) out.push("  안에 든 토큰 없음.");
    break;
  }
  case "fit": {
    const a = find(argv[0]); const n = cellsOf(argv[1]); const want = argv.slice(2).map(find);
    const rng = cellsOf(opt.range || 36);
    if (!want.length) { console.error("덮을 대상을 하나 이상 적으세요."); process.exit(1); }
    const xs = want.map((t) => t.x), ys = want.map((t) => t.y);
    const spanX = Math.max(...xs) - Math.min(...xs) + 1, spanY = Math.max(...ys) - Math.min(...ys) + 1;
    out.push(`${n}×${n}칸 정육면체로 ${want.map((t) => t.name).join(", ")} 덮기 — 대상들 폭 ${spanX}×${spanY}칸`);
    if (spanX > n || spanY > n) { out.push(`⛔ 한 번에 못 덮음 (${n}칸보다 넓음).`); break; }
    let best = null;
    for (let x0 = Math.max(...xs) - n + 1; x0 <= Math.min(...xs); x0++) for (let y0 = Math.max(...ys) - n + 1; y0 <= Math.min(...ys); y0++) {
      const near = Math.min(...[...Array(n)].flatMap((_, i) => [...Array(n)].map((__, j) => D(a, { x: x0 + i, y: y0 + j }))));
      if (near > rng) continue;
      const inside = T.filter((t) => alive(t) && inRect(t, x0, y0, n));
      const friends = inside.filter((t) => sideOf(t) === sideOf(a)).length;
      const foes = inside.filter((t) => sideOf(t) === "enemy").length;
      const score = foes * 10 - friends * 100;
      if (!best || score > best.score) best = { x0, y0, inside, friends, foes, score };
    }
    if (!best) { out.push(`⛔ 사거리 ${opt.range || 36}m 안에 그런 자리가 없음.`); break; }
    out.push(`가능 — 모서리 (${best.x0},${best.y0}) ~ (${best.x0 + n - 1},${best.y0 + n - 1})`);
    out.push(`  안에 든 적 ${best.foes}: ${best.inside.filter((t) => sideOf(t) === "enemy").map(label).join(", ")}`);
    if (best.friends) out.push(`  ⚠ 아군도 ${best.friends}: ${best.inside.filter((t) => sideOf(t) === sideOf(a)).map(label).join(", ")}`);
    break;
  }
  case "move": {
    const a = find(argv[0]); const to = { x: Number(argv[1]), y: Number(argv[2]) };
    const d = D(a, to); const sp = a.move || 6;
    out.push(`${label(a)} → (${to.x},${to.y}) : ${m(d)} · 이동력 ${m(sp)} → ${d <= sp ? "한 번에 감" : d <= sp * 2 ? "질주(행동) 필요" : "⛔ 한 차례에 못 감"}`);
    const start = T.filter((t) => alive(t) && sideOf(t) === "enemy" && sideOf(a) !== "enemy" && D(a, t) <= 1);
    const endAdj = T.filter((t) => alive(t) && t !== a && sideOf(t) !== sideOf(a) && sideOf(t) !== "neutral" && D(to, t) <= 1);
    const leave = start.filter((t) => D(to, t) > 1);
    if (leave.length) out.push(`기회 공격 후보(붙어 있다 벗어남): ${leave.map(label).join(", ")} — 이탈 행동이면 없음.`);
    if (endAdj.length) out.push(`도착 칸 곁의 상대: ${endAdj.map(label).join(", ")}`);
    const ter = terrainAt(to.x, to.y).map((r) => r.label);
    if (ter.length) out.push(`도착 칸 지형: ${ter.join(" / ")}`);
    out.push("※ 곧은 거리 기준. 장애물·험지·폭 1칸 통로는 따로 보라.");
    break;
  }
  default:
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\s?/, "").replace(/^ \* ?/gm, ""));
    process.exit(cmd ? 1 : 0);
}
console.log(out.join("\n"));
