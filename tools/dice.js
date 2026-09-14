#!/usr/bin/env node
/* 주사위 — 서술로 지어내지 말고 반드시 이 스크립트로 굴린다.
 *
 * 사용법:
 *   node tools/dice.js "1d20+5"              단일 식
 *   node tools/dice.js "2d6+1d4+3"           복합식 (항을 여러 개 더하고 뺄 수 있다)
 *   node tools/dice.js "adv:1d20+7"          이점 — 첫 d20을 두 번 굴려 높은 값
 *   node tools/dice.js "dis:1d20+7"          불리점 — 낮은 값
 *   node tools/dice.js "1d20+5" "2d6+3"      여러 식을 한 번에
 *
 * d20 단독 판정에서 자연 20/1이 나오면 표시한다.
 * 모든 굴림은 logs/rolls.log에 남는다 (검증용). 남기고 싶지 않으면 --no-log.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(ROOT, "logs", "rolls.log");

const d = (sides) => 1 + Math.floor(Math.random() * sides);

/* "2d6+1d4+3" → [{count:2,sides:6,sign:1}, {count:1,sides:4,sign:1}, {flat:3,sign:1}] */
function parse(expr) {
  const body = expr.replace(/\s+/g, "");
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(body)) return null;
  const terms = [];
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)(?![d\d])/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[3] !== undefined) {
      terms.push({ sign: m[1] === "-" ? -1 : 1, count: m[2] ? parseInt(m[2], 10) : 1, sides: parseInt(m[3], 10) });
    } else {
      terms.push({ sign: m[4] === "-" ? -1 : 1, flat: parseInt(m[5], 10) });
    }
  }
  return terms.length ? terms : null;
}

function rollExpr(raw) {
  let expr = raw.trim();
  let mode = null;
  const mm = expr.match(/^(adv|dis)\s*:\s*(.+)$/i);
  if (mm) { mode = mm[1].toLowerCase(); expr = mm[2]; }

  const terms = parse(expr);
  if (!terms) return { raw, error: "형식 오류 (예: 1d20+5, 2d6+1d4+3, adv:1d20+7)" };
  for (const t of terms) {
    if (t.sides !== undefined && (t.count < 1 || t.count > 100 || t.sides < 2 || t.sides > 1000))
      return { raw, error: "주사위 개수·면수가 범위를 벗어납니다" };
  }

  const parts = [];
  let total = 0;
  let advNote = "";
  let natural = null;
  let firstDiceDone = false;

  for (const t of terms) {
    if (t.flat !== undefined) {
      total += t.sign * t.flat;
      parts.push((t.sign < 0 ? "-" : "+") + t.flat);
      continue;
    }
    let rolls = Array.from({ length: t.count }, () => d(t.sides));
    let shown;
    if (mode && !firstDiceDone) {
      const second = Array.from({ length: t.count }, () => d(t.sides));
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      const keepFirst = mode === "adv" ? sum(rolls) >= sum(second) : sum(rolls) <= sum(second);
      const kept = keepFirst ? rolls : second;
      const dropped = keepFirst ? second : rolls;
      shown = `[${kept.join(", ")} | ${dropped.join(", ")}]`;
      rolls = kept;
      advNote = mode === "adv" ? " (이점)" : " (불리점)";
    } else {
      shown = `[${rolls.join(", ")}]`;
    }
    if (!firstDiceDone && t.sides === 20 && t.count === 1) natural = rolls[0];
    firstDiceDone = true;
    const sub = rolls.reduce((a, b) => a + b, 0);
    total += t.sign * sub;
    parts.push((t.sign < 0 ? "-" : parts.length ? "+" : "") + `${t.count}d${t.sides}${shown}`);
  }

  let critNote = "";
  if (natural === 20) critNote = " · 자연 20(치명타)";
  else if (natural === 1) critNote = " · 자연 1(대실패)";

  return { raw, detail: parts.join(""), total, note: advNote + critNote };
}

function appendLog(lines) {
  try {
    let session = "?";
    const core = path.join(ROOT, "state", "core.json");
    if (fs.existsSync(core)) session = JSON.parse(fs.readFileSync(core, "utf8")).session ?? "?";
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    fs.appendFileSync(LOG, lines.map((l) => `${stamp}\tS${session}\t${l}`).join("\n") + "\n");
  } catch (e) {
    console.error("(굴림 로그 기록 실패: " + e.message + ")");
  }
}

const args = process.argv.slice(2);
const noLog = args.includes("--no-log");
const exprs = args.filter((a) => a !== "--no-log");
if (exprs.length === 0) {
  console.log('사용법: node tools/dice.js "1d20+5" | "2d6+1d4+3" | "adv:1d20+7"');
  process.exit(1);
}

const logLines = [];
let bad = false;
for (const e of exprs) {
  const r = rollExpr(e);
  if (r.error) { console.log(`${r.raw} → 오류: ${r.error}`); bad = true; continue; }
  const line = `${r.raw} → ${r.detail} = ${r.total}${r.note}`;
  console.log(line);
  logLines.push(line);
}
if (!noLog && logLines.length) appendLog(logLines);
process.exit(bad ? 1 : 0);
