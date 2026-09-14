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

- PC(`verrix.json`)는 여기에 더해 `cls`·`level`·`ac`·`stats`·`slots`·`gold`·`spells`·`feats`·`items`·`surface`·`hidden`·`goal`·`status`를 갖습니다. **베릭스의 모든 데이터는 이 파일 하나가 유일한 출처입니다.**
- `resources`는 소비하는 즉시 `cur`를 갱신합니다. 긴 휴식·짧은 휴식 때 `recharge` 주기에 맞춰 직접 되돌립니다(핸드북 자동 리필은 PC 아이템의 `charge`에만 걸려 있습니다).
- 동료 턴마다 `resources`/`abilities`를 확인하고 상황에 맞는 것을 골라 씁니다 — 매번 단순 공격으로 때우지 않습니다.

### 아이템 (`items`, PC 전용)

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
  "terrain":[{"x":0,"y":0,"w":0,"h":0,"type":"tree|water|pit|hazard","label":""}],
  "tokens":[{"id":"","name":"","side":"pc|ally|enemy|neutral","x":0,"y":0,"hp":"현재/최대","down":true,"note":""}]}}
```

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
