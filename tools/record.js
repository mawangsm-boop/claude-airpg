#!/usr/bin/env node
/* 회차 대화 원본 녹화
 *
 * 사용법:
 *   node tools/record.js start [회차]   녹화 시작 (회차를 생략하면 state/core.json의 session)
 *   node tools/record.js stop           녹화 종료
 *   node tools/record.js status         지금 녹화 중인지
 *   node tools/record.js hook           Stop 훅 전용 — stdin으로 받은 대화 파일을 회차별로 내보낸다
 *
 * 녹화 구간은 transcripts/.recording.json에 시각으로 남는다. 훅은 매 답변이 끝날 때마다
 * 그 구간에 들어가는 메시지만 골라 transcripts/S{회차}/{날짜}_{세션}.md로 다시 쓴다(덮어쓰기라 몇 번 돌아도 같다).
 * 플레이어 발언과 GM 답변은 한 글자도 고치지 않고, 주사위 굴림(tools/dice.js)만 결과 줄로 덧붙인다.
 * transcripts/는 .gitignore로 제외한다 — 공개 저장소에 올라가지 않고 이 Mac에만 남는다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "transcripts");
const STATE = path.join(DIR, ".recording.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return { ranges: [] };
  }
}
function save(st) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2) + "\n");
}
const open = (st) => st.ranges.find((r) => !r.stoppedAt);

function localStamp(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 명령 ---------- */
function start(arg) {
  const st = load();
  const cur = open(st);
  if (cur) {
    console.log(`이미 ${cur.session}회차를 녹화 중입니다 (${localStamp(cur.startedAt)}부터).`);
    return;
  }
  let session = Number(arg);
  if (!arg) {
    session = JSON.parse(fs.readFileSync(path.join(ROOT, "state", "core.json"), "utf8")).session;
  }
  if (!Number.isInteger(session) || session <= 0) {
    console.error(`회차 번호가 올바르지 않습니다: ${arg}`);
    process.exit(1);
  }
  const now = new Date().toISOString();
  st.ranges.push({ session, startedAt: now, stoppedAt: null });
  save(st);
  console.log(`${session}회차 녹화를 시작합니다 (${localStamp(now)}). 저장 위치: transcripts/S${session}/`);
}

function stop() {
  const st = load();
  const cur = open(st);
  if (!cur) {
    console.log("녹화 중이 아닙니다.");
    return;
  }
  cur.stoppedAt = new Date().toISOString();
  save(st);
  console.log(`${cur.session}회차 녹화를 멈췄습니다 (${localStamp(cur.stoppedAt)}). 이번 답변까지 저장됩니다.`);
}

function status() {
  const cur = open(load());
  console.log(cur ? `${cur.session}회차 녹화 중 (${localStamp(cur.startedAt)}부터)` : "녹화 중이 아닙니다.");
}

/* ---------- 훅: 대화 파일 → Markdown ---------- */
function stripSystem(s) {
  return s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}

// 사용자가 고치라고 지시한 GM 서술의 낱말 — transcripts/S{회차}/fixes.json, [["바꿀 말", "고친 말"], ...].
// 원문은 대화 파일에서 매번 다시 만들어지므로 손으로 고치면 덮어써진다. GM 쪽 글에만 적용한다.
function loadFixes(outDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, "fixes.json"), "utf8"));
  } catch {
    return [];
  }
}

function render(entries, fixes = []) {
  // 연속된 같은 화자의 조각을 한 덩어리로 묶는다.
  const out = [];
  let last = null;
  const pending = new Map(); // tool_use id → 주사위 식
  for (const e of entries) {
    const c = e.message && e.message.content;
    if (e.type === "user") {
      if (typeof c === "string") {
        if (c.startsWith("<bash-input>") || c.startsWith("<command-")) continue;
        const text = stripSystem(c);
        if (!text) continue;
        out.push(`\n## 플레이어 · ${localStamp(e.timestamp)}\n\n${text}\n`);
        last = "user";
      } else if (Array.isArray(c)) {
        for (const b of c) {
          if (b.type === "text" && !e.isMeta) {
            const text = stripSystem(b.text || "");
            if (!text) continue;
            out.push(`\n## 플레이어 · ${localStamp(e.timestamp)}\n\n${text}\n`);
            last = "user";
          } else if (b.type === "tool_result" && pending.has(b.tool_use_id)) {
            const res = Array.isArray(b.content)
              ? b.content.map((x) => x.text || "").join("")
              : String(b.content || "");
            // 다른 명령과 이어 붙여 실행했을 때를 대비해 dice.js의 결과 줄(→)만 남긴다.
            const rolls = res.split("\n").filter((l) => l.includes("→")).map((l) => l.trim());
            if (!rolls.length) continue;
            if (last !== "gm") out.push(`\n## GM\n`);
            out.push(`\n> 🎲 ${rolls.join(" / ")}\n`);
            last = "gm";
          }
        }
      }
    } else if (e.type === "assistant" && Array.isArray(c)) {
      for (const b of c) {
        if (b.type === "text" && b.text.trim()) {
          if (last !== "gm") out.push(`\n## GM\n`);
          let text = b.text.trim();
          for (const [from, to] of fixes) text = text.split(from).join(to);
          out.push(`\n${text}\n`);
          last = "gm";
        } else if (b.type === "tool_use" && b.name === "Bash") {
          const cmd = (b.input && b.input.command) || "";
          const m = cmd.match(/tools\/dice\.js\s+(["'])(.*?)\1/);
          if (m) pending.set(b.id, m[2]);
        }
      }
    }
  }
  return out.join("");
}

function hook() {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {}
  let info;
  try {
    info = JSON.parse(input);
  } catch {
    return;
  }
  const st = load();
  if (!st.ranges.length || !info.transcript_path || !fs.existsSync(info.transcript_path)) return;

  const entries = [];
  for (const line of fs.readFileSync(info.transcript_path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if ((e.type === "user" || e.type === "assistant") && e.timestamp && !e.isSidechain) entries.push(e);
    } catch {}
  }
  if (!entries.length) return;
  const first = entries[0].timestamp;
  const lastTs = entries[entries.length - 1].timestamp;

  // 이 대화 파일과 시간이 겹치는 녹화 구간만, 회차별로 모은다.
  const bySession = new Map();
  for (const r of st.ranges) {
    if (r.stoppedAt && r.stoppedAt < first) continue;
    if (r.startedAt > lastTs) continue;
    if (!bySession.has(r.session)) bySession.set(r.session, []);
    bySession.get(r.session).push(r);
  }

  const sid = (info.session_id || path.basename(info.transcript_path, ".jsonl")).slice(0, 8);
  for (const [session, ranges] of bySession) {
    // 녹화를 멈추는 답변까지는 담는다: stop 이후에도 같은 차례(멈춘 직후의 GM 답변)는 포함되도록,
    // 멈춘 시각 다음에 온 첫 플레이어 발언 전까지를 구간으로 본다.
    const inRange = (e) =>
      ranges.some((r) => {
        if (e.timestamp < r.startedAt) return false;
        if (!r.stoppedAt || e.timestamp <= r.stoppedAt) return true;
        const nextUser = entries.find(
          (x) => x.type === "user" && typeof x.message.content === "string" && x.timestamp > r.stoppedAt
        );
        return !nextUser || e.timestamp < nextUser.timestamp;
      });
    const picked = entries.filter(inRange);
    if (!picked.some((e) => e.type === "user" && typeof e.message.content === "string")) continue;

    const day = localStamp(picked[0].timestamp).slice(0, 10);
    const outDir = path.join(DIR, `S${session}`);
    const body = render(picked, loadFixes(outDir));
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${day}_${sid}.md`);
    const head =
      `# ${session}회차 대화 원본\n\n` +
      `- 세션: ${info.session_id || sid}\n` +
      `- 구간: ${localStamp(picked[0].timestamp)} ~ ${localStamp(picked[picked.length - 1].timestamp)}\n` +
      `- 손대지 않은 원문입니다. 소설화는 archive/sessions/를 보세요.\n`;
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, head + body);
    fs.renameSync(tmp, file);
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "start") start(arg);
else if (cmd === "stop") stop();
else if (cmd === "status") status();
else if (cmd === "hook") {
  try {
    hook();
  } catch (e) {
    // 녹화 실패로 대화가 막히면 안 된다 — 알리기만 한다.
    console.error(`[녹화] 저장 실패: ${e.message}`);
  }
} else {
  console.log("사용법: node tools/record.js start [회차] | stop | status");
}
