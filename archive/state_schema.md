# state 파일 스키마 참조

CLAUDE.md의 축약 규칙만으로 판단이 서지 않을 때만 여는 문서입니다. 평소 진행에는 필요 없습니다.
**커밋 전 `node tools/validate.js`를 돌리면 아래 규칙 위반은 대부분 자동으로 잡힙니다.**

## 공통 규칙

- 각 JSON 파일이 그 자체로 최신 상태입니다. 전체 재작성 대신 바뀐 필드만 고칩니다.
- 배열 항목은 `id`로 구분합니다. 기존 id면 갱신, 새 id면 추가. **배열 전체를 새로 쓰지 마세요.**
- HP는 항상 `{"cur":숫자,"max":숫자}`. 임시 HP는 합산하지 않고 큰 값 하나만 유지하며, 긴 휴식을 마치면 0으로 되돌립니다.
- state 파일을 고쳤으면 `state/rev.json`의 `rev`를 `S{회차}-{일련번호}` 형식으로 갱신합니다.

## state/chars/_index.json — 캐릭터 명단

```json
{ "pc": "verrix", "party": ["isabel","liv","rea"], "npcs": ["seren","vera"], "npcMinor": "_minor" }
```

핸드북은 이 파일만 보고 캐릭터를 읽습니다. **파일만 만들고 인덱스에 넣지 않으면 화면에 나오지 않습니다**(검증기가 경고합니다).
동료가 이탈하면 `party`에서 빼고 `npcs`로 옮깁니다 — 파일 자체는 그대로 두면 기록이 보존됩니다.

## state/chars/{id}.json — PC·동료

```json
{ "char": {
  "id": "liv", "name": "리브 코르사", "role": "여성 · 인간 · 로그(어쌔신) 3레벨",
  "hp": {"cur":32,"max":32}, "tag": "임시 동행", "trait": "...", "look": "...(잠긴 기본 외모)",
  "comply": "지시 순응도", "knows": "직접 목격·검증된 것", "unknown": "모르는 것",
  "susp": {"cur":1,"max":6,"note":"의심의 계기"},
  "equipment": [ {"slot":"weapon","item":"이름","desc":"겉모습","equipped":true,"combat":{...}} ],
  "sheet": {
    "race":"인간","cls":"로그 (어쌔신)","level":3,"ac":13,
    "stats":{"STR":10,"DEX":16,"CON":14,"INT":12,"WIS":13,"CHA":8},
    "resources":[ {"id":"...","n":"은신 공격","dice":"2d6","cur":1,"max":1,"recharge":"turn","note":"조건"} ],
    "abilities":[ {"id":"...","n":"교활한 행동","t":"추가 행동","d":"설명"} ]
  }
} }
```

- **`at` (선택, 문자열)**: 지금 파티와 떨어져 가게에 남아 있으면 `"상점"`을 적습니다. 핸드북 파티 창이 이 값으로 **"동행 중"과 "상점 근무"를 나눠** 보여줍니다(48회차 신설). 동료(`state/chars/`)와 관계자(`state/npcs/`) 모두에 쓸 수 있고, 가게 인원 전체가 "상점 근무" 한 묶음에 모입니다. 다시 합류하거나 가게를 떠나면 필드를 **지웁니다**(빈 값이면 동행 중으로 돌아갑니다). 다른 장소 이름은 아직 화면에서 구분하지 않습니다.
- **`equipment`는 지금 몸에 걸친 것, `items`는 들고 있는 것**입니다. 파티 보급품(물약 등)은 평소처럼 베릭스의 `items`에 두되, 누가 무엇을 맡았는지가 중요해지는 순간(파티 분리, 잠입 전 분배, 특정 인물에게 물약을 쥐여줌)에 해당 동료의 `items`로 옮겨 적습니다. 옮기면 베릭스 쪽 수량(`q`)을 반드시 함께 줄입니다 — 같은 물건이 두 곳에 동시에 있으면 안 됩니다.
- PC(`verrix.json`)는 여기에 더해 `cls`·`level`·`ac`·`stats`·`slots`·`gold`·`spells`·`feats`·`items`·`surface`·`hidden`·`goal`·`status`를 갖습니다. **베릭스의 모든 데이터는 이 파일 하나가 유일한 출처입니다.**
- `resources`는 소비하는 즉시 `cur`를 갱신합니다. 긴 휴식·짧은 휴식 때 `recharge` 주기에 맞춰 직접 되돌립니다(핸드북 자동 리필은 PC 아이템의 `charge`에만 걸려 있습니다).
- 동료 턴마다 `resources`/`abilities`를 확인하고 상황에 맞는 것을 골라 씁니다 — 매번 단순 공격으로 때우지 않습니다.

### "쓸 수 있는 것" 카드 필드 — 주문·특성·자원·아이템 공통 (v2.32, 49회차 신설)

핸드북 캐릭터 탭과 파티 세부 보기 맨 위의 **"쓸 수 있는 것"** 카드는 아래 필드를 보고 능력을 행동 종류별로 모읍니다. 같은 능력을 여러 곳에 다시 적지 않아도 됩니다.

- **`act`**: `action`(행동) · `bonus`(보조 행동) · `reaction`(반응) · `trigger`(다른 행동에 뒤따라 붙거나 자동 발동) · `passive`(늘 켜짐). 이 값이 없으면 주문·공격은 행동으로, 동료 `abilities`는 `t`의 "추가 행동·반응·패시브" 문구로 짐작합니다. PC의 특성·아이템은 `act`가 있어야 카드에 나옵니다.
- **`sum`**: 플레이어가 보는 한 줄 요약(사거리 · 내성 · 효과). 없으면 `d`의 앞부분이 잘려 나옵니다. 자원은 `sum`을 펼쳐 두고 `note`(근거·회차 기록)는 접어 둡니다 — **`note`에는 GM 기록을, `sum`에는 지금 쓸 수 있는 내용만** 적습니다.
- **`res`**: 횟수를 다른 능력과 나눠 쓰는 자원 id(예: 영감의 말·영감의 망토 → `res_bardic_inspiration`). 카드에 그 자원의 남은 횟수가 붙고, 0이면 흐리게 표시됩니다.
- **배지(v2.33)**: 주문·특성·장착품·소지품의 모든 줄 이름 옆에 행동 종류 배지(행동·보조 행동·반응·자동·상시)가 붙습니다. 값은 위 `act`(없으면 짐작 규칙)에서 나옵니다 — `act`가 없는 아이템은 배지가 없습니다.
- **`conc`**: 집중 주문이면 `true`(주문의 `c`에 "집중"이 있으면 자동으로 잡힙니다).
- 동료 공격은 `sheet.attacks`에 적는 것이 원칙입니다. 없으면 `equipment`의 `combat` 수치를 공격으로 보여줍니다(49회차, 네리 장궁 +7이 장착품에만 있어 전투에서 +5로 굴린 사고).
- 검증기가 `act` 값 오류와 없는 자원을 가리키는 `res`를 오류로, PC의 `sum` 누락을 경고로 잡습니다.

### 아이템 (`items`) — PC·동료 공통

- `cat`: `weapon`(무기·방어구) / `accessory`(효과가 확인된 착용품) / `consumable`(물약·횃불) / `trinket`(기능 없거나 플롯이 끝난 것) / `misc`. 획득 시점에 지정하고, 애매하면 `accessory`로 넣은 뒤 확인되면 옮깁니다.
- `equipped`(착용 중), `passive`+`acBonus`(상시 효과), `charge`(`{"cur","max","recharge":"long|short|turn"}`).
- 전투 수치는 `combat`에 구조화합니다 — 서술에만 적어두면 다음 전투 때 다시 찾아야 합니다.

```json
"combat": {"atkBonus":1,"dmgBonus":1,"dmgDice":"1d6+CHA",
  "extraDamage":{"dice":"1d4","type":"광휘","condition":"명중 시"},
  "vsCondition":{"target":"악마·언데드","extraDamage":{"dice":"1d6","type":"광휘"}},
  "onFirstHitEachTurn":{"effect":"가한 피해의 절반 자가회복","cap":"최대 HP 초과 불가"},
  "onKill":{"effect":"1라운드 은신 이점","note":"직접 처치 시"},
  "advantageOn":["은신"]}
```

- 겉모습이 바뀌는 장비는 `desc`를 적고 `equipped:true`로 둡니다. 장면 묘사 프롬프트는 잠긴 `look`을 다시 쓰지 않고, 그 시점 `equipped:true` 항목의 `desc`만 델타로 붙입니다. 벗으면 자동으로 빠집니다.
- 긴 휴식·짧은 휴식은 패치에 `{"rest":"long"}` / `{"rest":"short"}`를 보내면 핸드북이 해당 주기 아이템을 리필합니다.

## state/npcs/{id}.json · _minor.json

- 재등장하거나 관계가 걸린 인물은 개별 파일 `{"char":{...}}`, 단역은 `_minor.json`의 `{"npcs":[...]}`.
- 단역이 다시 등장하면 개별 파일로 승격하고 인덱스 `npcs`에 추가합니다.
- 필수 필드: `id`, `name`, `role`, `trait`, `knows`, `unknown`.
- `sum`(선택): 파티 카드에 보이는 한두 문장 요약. `trait`가 경과 기록으로 길어진 인물에 적는다 — 없으면 핸드북이 `trait` 첫 문장들을 잘라 쓰고, 전문은 세부 정보의 "이력"에 나온다(v2.40).

## state/clocks.json — 진행 시계

```json
{"clocks":[{"id":"clock_x","n":"이름","cur":0,"max":6,"vis":"open|gm","st":"open|done","note":"무엇이 채우는가"}]}
```

`vis:"gm"`은 화면에 나오지 않습니다. 가득 차면 그 사건을 실제로 발생시키고 `st`를 `done`으로 바꿉니다.

## state/factions.json — 세력

```json
{"factions":[{"id":"...","n":"이름","stance":"적대|경계|중립|우호|동맹|소멸","rep":-3~3,
  "contact":"창구 인물","knows":"...","unknown":"...","note":"...","st":"active|ended"}]}
```

## state/world.json

```json
{"world":{"here":"현재위치id","discovered":["id",...],
  "customPlaces":[{"id":"","n":"","t":"유형","x":0,"y":0,"d":"","cat":"settlement|dungeon|terrain|waypoint","tier":"city|village"}]}}
```

- `here`는 덮어쓰기가 맞습니다. **`discovered`는 추가만 합니다(합집합).**
- 좌표계 4050(동서) x 3000(남북) 고정. `cat`은 직접 명시합니다(핸드북 지도가 이 필드를 최우선으로 읽습니다). 정착지는 `tier`도 함께.
- 방향을 서술하기 전에 기존 좌표·서술과 어긋나지 않는지 `archive/world_geography.md`와 대조합니다.

## state/dungeon.json (던전 안에 있을 때만)

```json
{"dungeon":{"name":"","here":"방id","note":"",
  "rooms":[{"id":"","name":"","x":0,"y":0,"w":0,"h":0,"state":"done|found|hidden","danger":true,"note":""}],
  "doors":[["방id1","방id2"]]}}
```

던전을 완전히 벗어나면 파일을 삭제합니다(`rm state/dungeon.json`). 없어도 핸드북은 정상 동작합니다.

## state/battle.json (전투 중에만)

```json
{"battle":{"name":"","cols":16,"rows":12,"round":1,
  "init":["토큰id 순서대로"], "turn":"지금 차례인 토큰id",
  "terrain":[{"x":0,"y":0,"w":0,"h":0,"type":"tree|water|pit|hazard","label":""}],
  "tokens":[{"id":"","name":"","side":"pc|ally|enemy|neutral","x":0,"y":0,"hp":"현재/최대","down":true,"note":"",
             "from":{"x":0,"y":0},"st":["집중","출혈"],"move":6,"range":24}]}}
```

- `init`·`turn`: 이니셔티브 순서와 현재 차례. 화면 위쪽 띠에 순서가 뜨고 차례인 토큰에 금색 링이 생깁니다.
- `from`: **그 턴에 움직이기 전 좌표.** 넣어두면 이동 흔적이 점선으로 그려져 "근접 공격인데 멀리 있다" 같은 모순이 바로 보입니다. 이동하지 않은 턴에는 뺍니다.
- `st`: 집중·출혈·은신·엄폐 같은 상태 배열. 토큰 아래에 표시됩니다.
- `move`/`range`: 칸 단위 이동력·사거리(1칸 = 1.5 m). 토큰을 누르면 그만큼의 원이 그려집니다. 베릭스는 `move:6`(9 m), 이드리치 블래스트 `range:24`(36 m).

- 매 턴 위치·HP를 즉시 반영합니다. **근접 공격을 서술했으면 좌표도 인접 칸까지 실제로 옮깁니다.**
- 전투가 끝나면 **먼저** 변한 HP를 각 캐릭터 파일에 옮겨 적고, 그다음 파일을 삭제합니다.

## state/threads.json · log.json · checkpoint.json · rev.json

```json
{"threads":[{"id":"thread_x","t":"제목","x":"내용","st":"open|resolved"}]}
{"log":[{"t":"세션 42","x":"사용자에게 보이는 기록"}]}
{"session":42,"short_rest_count":0,"next_cp_index":2}
{"rev":"S42-014","updated":"ISO8601","note":"무엇이 바뀌었는지"}
```

실마리가 해소되면 지우지 말고 `st`를 `resolved`로 바꿉니다 — 핸드북이 종결분을 따로 묶어 보여줍니다.

- `state/base.json`의 `annexes`(v2.46): 가게에 딸린 다른 건물들 `[{id,name,short,note,rooms:[{id,floor(0=지하),label,kind}]}]`. 방 id는 전체에서 유일해야 하고, 인물 파일의 `room`에 적으면 거점 탭의 그 건물 그림에 이름이 뜬다. 그림 속 자리는 index.html `BASE_ARTS`에 적는다(방을 더하면 그림과 자리도 함께).
- 전투판 2.5D(v2.48) — `battle.json`에 넣을 수 있는 선택 필드. 없어도 그려진다(없으면 label 낱말로 모양을 짐작한다: 탑·방앗간·집·창고=건물, 성벽·돌담=벽, '허리 높이'·울타리=낮은 벽, 짐·상자·수레=짐 더미, 나무·숲=나무, 둔덕·언덕·단=올라설 수 있는 높은 땅).
  - terrain 항목: `kind` `"building|wall|lowwall|crate|rock|high|tree|water|pit|hazard|mark"`(짐작이 틀릴 때 직접 지정), `elev` 높이(칸 단위 숫자, 예: 낮은 벽 0.5·벽 2·탑 3). `high`만 토큰이 올라선다. 토큰이 들어가 있는 building·wall은 지붕을 걷고 낮은 벽으로 그린다.
  - token 항목: `elev` 서 있는 높이(이층 창가면 1.5 등 — 공중에 띄워 그리고 바닥까지 점선), `img` 캐릭터 그림 주소(있으면 말 대신 그 그림을 발 기준으로 세운다 — 세로로 긴 투명 PNG, 2:3).
- 전투판 2.5D 높낮이·층·캐릭터(v2.49) — 모두 선택 필드. 높이 단위는 칸(1 = 1.5 m), 0.5 단위로 써도 된다.
  - 판: `ground` 기본 바닥 재질(`grass|dirt|stone|sand|snow|wood`), `heights` 칸마다 높이 표(`[[행0…],[행1…]]`, 없어도 된다).
  - terrain: `kind:"high"`+`elev`(올라설 수 있는 높은 땅·절벽·단, `surf`로 재질), `kind:"stairs"`+`elev`(계단 한 칸씩 높이를 달리 준다), `kind:"bridge"`+`elev`(아래가 비는 널다리), `kind:"water"`(+`elev`면 높은 곳의 물), `kind:"building"`+`floors`(층수).
  - token: `floor`(건물 안 층, 2면 이층 바닥 위에 선다. 없으면 note의 '이층'으로 짐작), `elev`(임의 높이), `face`(`n|e|s|w` 보는 방향, 없으면 가장 가까운 맞은편), `sprite`(그림 이름), `look:{hair,skin,cloth}`(그림이 없는 인형의 빛깔).
  - 캐릭터 그림표는 `assets/sprites/*.png`와 index.html `BT_SHEETS`. 지금 있는 그림: verrix·isabel·liv·neri·idra·nadin(토큰 id로 자동), bandit·crossbow·brute·officer·clerk·archer(이름·메모 낱말로 자동, 또는 `sprite`로 지정).
- 전투판 v2.50: 캐릭터 그림은 네 방향(`f` 왼쪽 아래·`fr` 오른쪽 아래·`b` 오른쪽 위·`bl` 왼쪽 위). 파티·적 열둘 모두 네 장 따로(v2.52에서 손 위치를 못 박아 다시 받음 — party_c·foes_c). battle.json이 없거나 토큰이 없으면 전투 탭은 `at`이 없는(=동행 중인) 파티를 빈 들판에 세워 보인다.
