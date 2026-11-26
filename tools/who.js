#!/usr/bin/env node
// 인물 대사·행동을 쓰기 전에 그 인물의 개성 필드를 통째로 읽는다.
// grep으로 voice를 자르면 따옴표에서 끊겨 말투 설명이 사라진다(60회차 — 이드라를 아이 말투로 쓴 원인).
// 사용: node tools/who.js idra [shak ...]   (state/chars, state/npcs, _minor에서 찾는다)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function load(id) {
  for (const dir of ['state/chars', 'state/npcs']) {
    const f = path.join(root, dir, id + '.json');
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      return d.char || d.npc || d;
    }
  }
  const m = JSON.parse(fs.readFileSync(path.join(root, 'state/npcs/_minor.json'), 'utf8'));
  const list = Array.isArray(m) ? m : (m.npcs || m.list || Object.values(m));
  return list.find(x => x && (x.id === id || x.name === id || x.n === id)) || null;
}

const tail = (s, n) => (s && s.length > n ? '…' + s.slice(-n) : s);
const args = process.argv.slice(2);
if (!args.length) { console.log('사용: node tools/who.js <id> [id ...]'); process.exit(1); }

for (const id of args) {
  const c = load(id);
  if (!c) { console.log(`[${id}] 없음`); continue; }
  console.log(`=== ${c.name || c.n || id} (${id}) ===`);
  for (const k of ['role', 'at', 'room', 'align', 'stance', 'voice', 'drive', 'fear', 'spotlight']) {
    if (c[k] !== undefined) console.log(`${k}: ${typeof c[k] === 'string' ? c[k] : JSON.stringify(c[k])}`);
  }
  if (c.code) console.log(`code.does: ${c.code.does}\ncode.wont: ${c.code.wont}`);
  if (c.knows) console.log(`knows: ${typeof c.knows === 'string' ? c.knows : JSON.stringify(c.knows)}`);
  if (c.unknown) console.log(`unknown: ${typeof c.unknown === 'string' ? c.unknown : JSON.stringify(c.unknown)}`);
  if (c.bond) console.log(`bond(최근): ${tail(c.bond, 700)}`);
  if (c.susp !== undefined) console.log(`susp: ${JSON.stringify(c.susp)}`);
  const items = [...(c.items || []), ...(c.equipment || [])].filter(x => x.equipped);
  if (items.length) console.log('장착: ' + [...new Set(items.map(x => x.item || x.n))].join(' · '));
  if (c.look) console.log(`look: ${c.look}`);
  console.log('');
}
