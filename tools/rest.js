#!/usr/bin/env node
/* 휴식 처리 — 긴 휴식/짧은 휴식으로 회복되는 것을 한 번에 되돌린다.
 *
 *   node tools/rest.js long          긴 휴식
 *   node tools/rest.js short         짧은 휴식
 *   node tools/rest.js long --dry    실제로 고치지 않고 무엇이 바뀔지만 출력
 *
 * 손으로 파일을 하나씩 고치다 보면 동료의 자원(레아 두 번째 숨, 이자벨·리브 은신 공격)이
 * 소진된 채로 다음 전투에 들어가기 쉬워서 만든 도구다.
 *
 * 긴 휴식: 전원 HP 최대, 임시HP 0, 주문 슬롯 최대, 모든 충전·자원 회복, 짧은 휴식 횟수 0으로.
 * 짧은 휴식: recharge가 short/turn인 충전·자원만 회복(HP는 건드리지 않는다 — 히트 다이스는 수동),
 *            checkpoint.json의 short_rest_count를 1 올리고 2가 되면 체크포인트 생성을 알린다.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const S = (...p) => path.join(ROOT, "state", ...p);

const kind = process.argv[2];
const dry = process.argv.includes("--dry") || process.argv.includes("--dry-run");
if (!["long", "short"].includes(kind)) {
  console.log('사용법: node tools/rest.js long|short [--dry]');
  process.exit(1);
}
const isLong = kind === "long";

const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const wj = (p, o) => { if (!dry) fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };
const changes = [];

/* 이 휴식으로 회복되는 주기인가 */
const refills = (recharge) => recharge === "turn" || recharge === "short" || (isLong && recharge === "long");

function restoreCharges(list, who, label) {
  (list || []).forEach((x) => {
    const c = x.charge;
    if (!c || !refills(c.recharge)) return;
    if (c.cur < c.max) { changes.push(`${who}: ${x.item || x.n} 충전 ${c.cur}→${c.max}`); c.cur = c.max; }
  });
}

const idx = rj(S("chars", "_index.json"));

/* --- PC --- */
{
  const p = S("chars", idx.pc + ".json");
  const d = rj(p), c = d.char;
  if (isLong) {
    if (c.hp.cur < c.hp.max) { changes.push(`${c.name}: HP ${c.hp.cur}→${c.hp.max}`); c.hp.cur = c.hp.max; }
    if (c.hp.tmp) { changes.push(`${c.name}: 임시HP ${c.hp.tmp}→0`); c.hp.tmp = 0; }
  }
  /* 슬롯 회복 주기: slots가 단일 객체(팩트 매직처럼 한 레벨만 쓰는 캐스터)면 그 객체의
   * recharge 표시를 본다("short"면 짧은 휴식에도 회복, 없으면 긴 휴식에만).
   * slots가 배열(레벨별 표준 주문 슬롯을 쓰는 풀 캐스터)이면 각 항목을 그 항목의
   * recharge(기본값 "long")에 따라 개별로 회복한다. */
  if (Array.isArray(c.slots)) {
    c.slots.forEach((sl) => {
      if (sl.cur < sl.max && refills(sl.recharge || "long")) {
        changes.push(`${c.name}: ${sl.lvl}레벨 슬롯 ${sl.cur}→${sl.max}`);
        sl.cur = sl.max;
      }
    });
  } else if (c.slots && c.slots.cur < c.slots.max && refills(c.slots.recharge || "long")) {
    changes.push(`${c.name}: 슬롯 ${c.slots.cur}→${c.slots.max}`);
    c.slots.cur = c.slots.max;
  }
  (c.resources || []).forEach((r) => {
    if (!refills(r.recharge)) return;
    if (r.cur < r.max) { changes.push(`${c.name}: ${r.n} ${r.cur}→${r.max}`); r.cur = r.max; }
  });
  restoreCharges(c.items, c.name);
  wj(p, d);
}

/* --- 동료 --- */
(idx.party || []).forEach((id) => {
  const p = S("chars", id + ".json");
  const d = rj(p), c = d.char;
  if (isLong && c.hp && c.hp.cur < c.hp.max) { changes.push(`${c.name}: HP ${c.hp.cur}→${c.hp.max}`); c.hp.cur = c.hp.max; }
  if (isLong && c.hp && c.hp.tmp) { changes.push(`${c.name}: 임시HP ${c.hp.tmp}→0`); c.hp.tmp = 0; }
  restoreCharges(c.items, c.name);
  restoreCharges(c.equipment, c.name);
  ((c.sheet && c.sheet.resources) || []).forEach((r) => {
    if (!refills(r.recharge)) return;
    if (r.cur < r.max) { changes.push(`${c.name}: ${r.n} ${r.cur}→${r.max}`); r.cur = r.max; }
  });
  wj(p, d);
});

/* --- 체크포인트 카운터 --- */
const cpPath = S("checkpoint.json");
const cp = rj(cpPath);
let cpNotice = "";
if (isLong) {
  if (cp.short_rest_count) changes.push(`짧은 휴식 횟수 ${cp.short_rest_count}→0`);
  cp.short_rest_count = 0;
  cpNotice = "긴 휴식 → 체크포인트를 생성하세요 (archive/sessions/_checkpoints/S" + cp.session + "/cp" + String(cp.next_cp_index).padStart(2, "0") + ".md)";
} else {
  cp.short_rest_count = (cp.short_rest_count || 0) + 1;
  changes.push(`짧은 휴식 횟수 →${cp.short_rest_count}`);
  if (cp.short_rest_count >= 2)
    cpNotice = "짧은 휴식 2회 누적 → 체크포인트를 생성하고 short_rest_count를 0으로 되돌리세요";
}
wj(cpPath, cp);

/* --- rev 갱신 (핸드북 동기화) --- */
const revPath = S("rev.json");
const rev = rj(revPath);
const m = String(rev.rev).match(/^S(\d+)-(\d+)$/);
const session = rj(S("core.json")).session;
rev.rev = m ? `S${session}-${String(Number(m[2]) + 1).padStart(3, "0")}` : `S${session}-001`;
rev.updated = new Date().toISOString().replace(/\.\d+Z$/, "Z");
rev.note = (isLong ? "긴 휴식" : "짧은 휴식") + " 처리";
wj(revPath, rev);

/* --- 결과 --- */
console.log((isLong ? "긴 휴식" : "짧은 휴식") + (dry ? " (미리보기 — 파일은 그대로)" : "") + "\n");
console.log(changes.length ? changes.map((c) => "  · " + c).join("\n") : "  회복할 것이 없었습니다.");
if (!dry) console.log(`\n  rev → ${rev.rev}`);
if (cpNotice) console.log("\n  ▶ " + cpNotice);
