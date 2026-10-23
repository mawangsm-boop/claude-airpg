#!/usr/bin/env node
/* 턴 마무리 도우미 — 매 턴 되풀이되던 상태 갱신 껍데기를 한 줄로 줄인다(53회차 최적화 검사).
 *
 *   node tools/turn.js log "사용자에게 보이는 로그 한 줄"
 *       state/log.json 맨 앞에 현재 회차 항목을 넣는다(rev는 건드리지 않는다).
 *   node tools/turn.js done "커밋 메시지" ["핸드북 메모"] [--nopush]
 *       rev를 올리고(S{회차}-{일련번호}) → validate → state·logs·gm_notes·체크포인트를 git add → 커밋 → main 푸시.
 *       검증에 오류가 있으면 아무것도 커밋하지 않는다. --nopush면 커밋만 한다(푸시는 전투 중 베릭스 차례·장면 전환·화면 확인 요청 때만 — CLAUDE.md '푸시 방침').
 *   node tools/turn.js push
 *       밀린 커밋을 main에 푸시한다.
 *
 * 이전에는 매 턴 파이썬 스크립트를 새로 써서 rev·log·커밋을 했다(그 문자수가 GM 서술만큼 쌓였다).
 * 파일의 '내용'을 고치는 일(HP·골드·인물 메모)은 여전히 직접 하고, 껍데기만 이 도구가 맡는다.
 * 커밋 꼬리말은 아래 TRAILER를 쓴다 — 모델이 바뀌면 시스템이 알려 주는 꼬리말로 고친다.
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TRAILER = "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>";
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const write = (rel, o) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(o, null, 2) + "\n");

const [cmd, ...rest] = process.argv.slice(2);
const nopush = rest.includes("--nopush");
const args = rest.filter((a) => a !== "--nopush");

if (cmd === "log") {
  const text = args.join(" ").trim();
  if (!text) { console.log('사용법: node tools/turn.js log "내용"'); process.exit(1); }
  const core = read("state/core.json");
  const l = read("state/log.json");
  l.log.unshift({ t: `세션 ${core.session}`, x: text });
  write("state/log.json", l);
  console.log(`로그 추가 (세션 ${core.session}, ${l.log.length}항목)`);
} else if (cmd === "done") {
  const [msg, note] = args;
  if (!msg) { console.log('사용법: node tools/turn.js done "커밋 메시지" ["핸드북 메모"] [--nopush]'); process.exit(1); }
  const core = read("state/core.json");
  const r = read("state/rev.json");
  const m = String(r.rev).match(/^S(\d+)-(\d+)$/);
  const n = m && Number(m[1]) === core.session ? Number(m[2]) + 1 : 1;
  r.rev = `S${core.session}-${String(n).padStart(3, "0")}`;
  r.updated = new Date().toISOString().replace(/\.\d+Z$/, ".000Z");
  if (note) r.note = note;
  write("state/rev.json", r);
  const v = spawnSync("node", ["tools/validate.js"], { cwd: ROOT, encoding: "utf8" });
  const tail = v.stdout.trim().split("\n").slice(-6).join("\n");
  if (v.status !== 0 || /오류 \d+건/.test(v.stdout)) {
    console.log("검증 오류 — 커밋하지 않았습니다.\n" + v.stdout.trim());
    process.exit(1);
  }
  const paths = ["state", "logs", "gm_notes", "characters.md", "archive/sessions/_checkpoints"].filter((p) => fs.existsSync(path.join(ROOT, p)));
  execSync(`git add -A ${paths.join(" ")}`, { cwd: ROOT });
  const msgFile = path.join(ROOT, ".git", "TURN_MSG");
  fs.writeFileSync(msgFile, `${msg}\n\n${TRAILER}\n`);
  const c = spawnSync("git", ["commit", "-q", "-F", msgFile], { cwd: ROOT, encoding: "utf8" });
  if (c.status !== 0) { console.log("커밋할 변경이 없거나 실패:\n" + (c.stdout + c.stderr).trim()); process.exit(c.status || 1); }
  let pushed = "푸시 생략";
  if (!nopush) {
    const p = spawnSync("git", ["push", "-q", "origin", "HEAD:main"], { cwd: ROOT, encoding: "utf8" });
    pushed = p.status === 0 ? "main 푸시 완료" : "푸시 실패:\n" + (p.stdout + p.stderr).trim();
  } else {
    let n = "?";
    try { n = execSync("git rev-list --count origin/main..HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch {}
    pushed = `푸시 안 함 (밀린 커밋 ${n}개)`;
  }
  const head = execSync("git log --oneline -1", { cwd: ROOT, encoding: "utf8" }).trim();
  console.log(`${r.rev} · ${head} · ${pushed}${/경고/.test(tail) ? "\n" + tail : ""}`);
} else if (cmd === "push") {
  const p = spawnSync("git", ["push", "-q", "origin", "HEAD:main"], { cwd: ROOT, encoding: "utf8" });
  console.log(p.status === 0 ? "main 푸시 완료 (밀린 커밋 없음)" : "푸시 실패:\n" + (p.stdout + p.stderr).trim());
} else {
  console.log('사용법: node tools/turn.js log "내용" | done "커밋 메시지" ["메모"] [--nopush] | push');
}
