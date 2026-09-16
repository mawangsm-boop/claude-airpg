# 베릭스 핸드북 — 원격 동기화판 (v2.25)

클로드 코드가 `state/` 아래 JSON만 고쳐도, 브라우저에서 자동으로 최신 상태가 보이는 구조입니다.

```
index.html               핸드북 본체 (렌더링만 담당, 상태는 갖고 있지 않음)
state/
  rev.json               상태 버전 표식 — 이 값이 바뀌어야 브라우저가 새 상태를 채택한다
  core.json              회차 · 아크 · 현재 위치 · 체크포인트
  chars/_index.json      캐릭터 명단 — 핸드북이 읽을 대상은 여기서만 정해진다
  chars/verrix.json      베릭스 (스탯 · HP · 슬롯 · 골드 · 주문 · 특성 · 소지품)
  chars/{id}.json        동료 (시트 · 장비 · 의심도 · 지식 격리)
  npcs/{id}.json         주요 NPC / npcs/_minor.json 단역 모음
  world.json             대륙 지도 (discovered / here / customPlaces)
  clocks.json            진행 시계 (위협의 진행도)
  factions.json          세력 관계 (태도 · 평판 · 창구 · 지식)
  threads.json           실마리 (st: open | resolved)
  log.json               세션 로그
  dungeon.json           던전 (던전 안에 있을 때만 존재)
  battle.json            전투 (전투 중에만 존재)
  checkpoint.json        체크포인트 카운터
manifest.json · sw.js    PWA — 홈 화면 설치와 오프라인 표시
assets/icons/            앱 아이콘 (192 · 512)
tools/dice.js            주사위 (복합식 · 이점/불리 · 자연 20 표시 · 굴림 로그)
tools/validate.js        상태 검증기 — 커밋 전에 반드시 한 번
tools/rest.js            긴 휴식/짧은 휴식 일괄 처리 (HP · 충전 · 자원 · 휴식 횟수 · rev)
tools/seed.js            index.html 내장 기본 상태(SEED) 갱신
logs/rolls.log           모든 주사위 굴림 기록
assets/map.jpg           대륙 지도 (핸드북 배경 — 예전엔 index.html에 base64로 박혀 있었다)
.claude/hooks/           세션 시작 시 state 검증을 자동 실행하는 훅
```

## 캐릭터는 한 명 = 파일 하나

`state/chars/_index.json`이 명단의 유일한 출처입니다.

```json
{ "pc": "verrix", "party": ["isabel","liv","rea"], "npcs": ["seren","vera"], "npcMinor": "_minor" }
```

- 새 동료가 합류하면 `state/chars/{id}.json`을 만들고 이 인덱스에 id 한 줄만 추가합니다. **`index.html`은 고치지 않습니다.**
- 캐릭터 파일은 `{"char":{...}}` 한 겹으로 감쌉니다. 동료의 시트는 그 안의 `sheet` 필드에 들어갑니다.
- 파일을 만들고 인덱스에 넣지 않으면 화면에 나오지 않습니다 — `tools/validate.js`가 경고합니다.
- 개별 캐릭터 파일을 읽지 못해도 그 인물만 빠지고 나머지는 정상 표시되며, 배지에 몇 개를 못 읽었는지 알려줍니다.
- 인덱스가 아예 없으면 구형 배치(`party.json`·`npcs.json`)로 후퇴합니다.

## 갱신 규칙 (클로드 코드가 지킬 것)

**상태 파일을 고쳤으면 반드시 `state/rev.json`의 `rev`를 바꿉니다.** 빠뜨리면 브라우저는 상태가 그대로라고 판단해 갱신하지 않습니다. 형식은 `S{회차}-{일련번호}`.

```json
{ "rev": "S42-014", "updated": "2026-09-14T00:00:00Z", "note": "1라운드 종료" }
```

| 대상 | 시점 |
|---|---|
| `battle.json`, 캐릭터 파일(HP·슬롯·임시HP) | **전투 매 턴 즉시** |
| 캐릭터 파일(소지품·골드) | 획득·소모 발생 즉시 |
| `clocks.json`, `factions.json`, 캐릭터 파일(`susp`) | 칸이 차거나 관계가 변한 시점 |
| `world.json` | 새 지역 이동·발견 시 |
| `dungeon.json` | 던전 진입·구역 이동 시 |
| `threads.json` | 실마리가 생기거나 해소된 시점(지우지 말고 `st`를 `resolved`로) |
| `log.json` | 마을↔던전 등 큰 구역 전환 시 모아서 |

**던전·전투가 끝나면 해당 파일을 삭제합니다**(`rm state/battle.json`). 핸드북 v2.20부터 이 파일들이 없어도 정상 동작합니다. 삭제하기 전에 변한 HP를 각 캐릭터 파일에 먼저 옮겨 적으세요.

커밋 직전에:

```bash
node tools/validate.js      # 오류가 있으면 커밋하지 않는다
```

## 배포

1. 저장소 **Settings → Pages**에서 Source를 `main` 브랜치 / `/ (root)`로 지정합니다.
2. `https://<계정>.github.io/<저장소>/` 로 접속하면 핸드북이 열립니다. 폰 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.

> `index.html`을 파일로 직접 열면(file://) 브라우저 보안 정책 때문에 `state/`를 읽지 못합니다.
> 이때는 배지에 "로컬 모드"가 뜨고 내장된 상태로만 동작합니다. 반드시 Pages 주소로 여세요.

## 핸드북 화면

- **검색** — 상단 검색창에 입력하면 인물·소지품·특성·주문·실마리·시계·세력·지점·로그를 한 번에 찾습니다. 결과를 누르면 해당 탭으로 이동합니다. 주소에 `?q=검색어`를 붙이면 그 결과로 바로 열립니다.
- **전투** — 이니셔티브 순서 띠, 현재 차례 금색 링, 이동 흔적 점선, 상태 배지가 표시되고, 토큰을 누르면 이동 범위·사거리 원이 그려집니다(`battle.json`에 `init`/`turn`/`from`/`st`/`move`/`range`를 넣었을 때).
- **홈 화면 설치** — 안드로이드는 브라우저 메뉴의 "홈 화면에 추가", 아이폰은 사파리 공유 → "홈 화면에 추가". 앱처럼 열리고, 신호가 끊겨도 마지막으로 받은 화면이 뜹니다. 상태와 화면은 언제나 네트워크를 먼저 확인하므로 캐시 때문에 옛 수치를 보는 일은 없습니다.

## 브라우저 쪽 동작

- 헤더 배지가 동기화 상태를 보여줍니다: `최신` / `갱신됨` / `로컬 모드`
- **자동** 체크박스가 켜져 있으면 20초마다 `rev.json`을 확인해 반영합니다. 탭을 다시 활성화할 때도 즉시 한 번 확인합니다.
- **지금 불러오기** 버튼은 rev가 같아도 원격 상태를 강제로 다시 가져옵니다.
- `rev`가 이전과 같으면 로컬 저장본(수동 `@@PATCH` 적용 결과)을 유지합니다.
- GitHub Pages는 CDN을 거치므로 커밋 후 반영까지 **수십 초에서 1~2분** 걸릴 수 있습니다.
