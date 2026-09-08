
// 여러 식을 한 번에 넘기면 각각 굴려서 결과를 보여줍니다.

function rollExpr(expr) {
  const m = expr.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return { expr, error: "형식 오류 (예: 1d20+5)" };
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  return { expr, rolls, mod, total: sum };
}

const exprs = process.argv.slice(2);
if (exprs.length === 0) {
  console.log('사용법: node tools/dice.js "1d20+5"');
  process.exit(1);
}
for (const e of exprs) {
  const r = rollExpr(e);
  if (r.error) { console.log(`${r.expr} → 오류: ${r.error}`); continue; }
  const modTxt = r.mod ? (r.mod > 0 ? `+${r.mod}` : `${r.mod}`) : "";
  console.log(`${r.expr} → [${r.rolls.join(", ")}]${modTxt} = ${r.total}`);
}
