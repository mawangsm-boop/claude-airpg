#!/usr/bin/env node
/* characters.md 재생성 — 외모 잠금 문서를 캐릭터 파일의 look 필드에서 다시 만든다.
 *
 *   node tools/looks.js            characters.md를 다시 생성
 *   node tools/looks.js --check    지금 문서가 캐릭터 파일과 어긋나는지만 확인
 *
 * 예전에는 같은 영문 프롬프트가 characters.md와 캐릭터 파일 양쪽에 있어서 한쪽만 고치면
 * 갈라졌다. 이제 캐릭터 파일이 유일한 출처이고 이 문서는 그것을 읽기 좋게 모아둔 사본이다.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const S = (...p) => path.join(ROOT, "state", ...p);
const rj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const check = process.argv.includes("--check");

const idx = rj(S("chars", "_index.json"));
const rows = [];
const push = (c, note) => { if (c && c.look) rows.push({ name: c.name, note, look: c.look }); };

push(rj(S("chars", idx.pc + ".json")).char, "PC");
(idx.party || []).forEach((id) => push(rj(S("chars", id + ".json")).char, "동료"));
(idx.npcs || []).forEach((id) => push(rj(S("npcs", id + ".json")).char, "NPC"));

const out =
`# 캐릭터 외모 잠금

> **이 파일은 \`node tools/looks.js\`가 생성합니다. 직접 고치지 마세요.**
> 외모의 유일한 출처는 각 캐릭터 파일의 \`look\` 필드입니다(\`state/chars/{id}.json\`, \`state/npcs/{id}.json\`).
> 외모를 바꾸려면 그 파일을 고치고 이 도구를 다시 돌리세요.

장면 묘사·이미지 프롬프트를 만들 때만 참조합니다. **기본 외모는 여기 문구를 그대로 재사용하고, 그 위에 장비 변화만 델타로 덧붙입니다** — 그 시점에 \`equipped:true\`인 항목의 \`desc\`만 이어 붙이고, 벗으면 자동으로 빠집니다.

` + rows.map((r) => `## ${r.name} (${r.note})\n${r.look}\n`).join("\n");

const target = path.join(ROOT, "characters.md");
if (check) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (cur === out) console.log("characters.md — 캐릭터 파일과 일치합니다.");
  else { console.log("characters.md — 캐릭터 파일과 어긋납니다. node tools/looks.js 로 다시 생성하세요."); process.exit(1); }
} else {
  fs.writeFileSync(target, out);
  console.log("characters.md 재생성 —", rows.length, "명:", rows.map((r) => r.name).join(", "));
}
