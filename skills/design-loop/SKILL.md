---
name: design-loop
description: 화면 하나의 design을 끝까지 끌어올리는 실행 protocol. 9 STEP, owner gate 4개.
disable-model-invocation: true
argument-hint: "어느 surface(파일 경로 또는 라우트)를 개선할까?"
---

surface(화면) 하나를 redesign하거나 aesthetic quality(심미성)를 끌어올릴 때의 실행 순서.

**에이전트: 아래 STEP을 순서대로 실행한다.** 각 STEP의 완료 조건을 만족하기 전에
다음으로 넘어가지 않는다. `STOP` 표시가 있는 STEP은 owner 응답 없이 진행하지 않는다.

owner가 대상 surface를 적지 않았으면 먼저 묻는다. goal·mode·보존 제약이 없으면 STEP 1에서
묻는다.

## 역할과 gate

에이전트가 전 과정을 구동하고, owner는 네 곳에서만 판단한다.

| Gate | owner가 하는 일 | 에이전트가 STOP하는 지점 |
|---|---|---|
| **G1 direction(방향)** | world(세계) 3안 중 선택 · reroll(재굴림) · 축 변경 · 정공법 요구 | STEP 3 끝 |
| **G2 composition(구성)** | production-level comp(시안) 3안 중 선택, 또는 추가 round 요구 | STEP 5 끝 |
| **G3 expression(표현)** | expression pass의 before/after를 보고 "나아졌나" 판정 | STEP 7의 각 pass 끝 |
| **G4 ship(출하)** | 최종 승인 | STEP 9 끝 |

그 사이의 모든 일 — reference 탐색, variable 도출, comp 제작, real data 확보, 구현, 측정,
defect scan, 문서화 — 은 에이전트가 owner 지시 없이 수행한다.

---

## STEP 0 — 전제조건 (gate)

`skill://impeccable`을 읽고 그 Setup의 context 명령을 대상 surface에 대해 실행한다
(`<skill-base-dir>/scripts/impeccable context --target <path>`). 출력에 `PRODUCT.md` ·
`DESIGN.md` · surface brief의 해소 결과가 들어 있어야 한다.

**완료 조건:** impeccable context의 출력을 보고에 인용했다. 인용이 없으면 STEP 1로
넘어가지 않는다.

**impeccable이 없는 머신이면** 그 사실을 보고하고 아래 대체 경로로 계속한다. 표에 없는
STEP은 impeccable을 쓰지 않으므로 그대로 수행한다 — 도구가 없어도 protocol은 완전하다.

| STEP | 쓰는 명령 | 대체 |
|---|---|---|
| 3 world 3안 | `new-work` · `concept-seed` | 후보 7개를 직접 도출해 3안을 제시하고, 무작위 배정이 없으므로 **first-rank bias(1순위 편향)**를 owner에게 고지한다 |
| 7 expression pass | `bolder` / `colorize` / `typeset` / `layout` | 실패한 acceptance criteria 항목을 하나씩 직접 닫고, 수정마다 before/after를 붙인다 |
| 8 마감 | `critique` / `polish` | acceptance criteria + accessibility + missing state 체크리스트를 손으로 돌린다 |

## STEP 1 — 과업 정의 (STOP)

`PRODUCT.md`·`DESIGN.md`·해당 surface brief·`CONTEXT.md`를 읽고, 다음 일곱 항목을 채워
owner에게 확인받는다. 근거를 못 찾은 항목은 빈칸으로 두고 owner에게 묻는다.

1. **Goal(목표)** — 이 surface가 3초 안에 전달해야 하는 한 가지
2. **Success criteria(성공 기준)** — visitor가 무엇을 할 수 있게 되면 성공인가
3. **Mode** — Operate / Persuade / Read / Experience 중 하나. **제품이 아니라 이 surface에서**
   고른다. 도구의 랜딩 페이지는 Persuade, 문서 색인은 Read다
4. **Data extension 허용 여부** — surface에 필요한 값이 현재 쿼리·API에 없을 때 backend를
   수정해도 되는가. 수동 배포가 필요한 변경은 여기서 미리 알린다
5. **보존 대상** — 잃으면 안 되는 기능·제약(filter·pagination·locale·theme 등)
6. **Aesthetic baseline(심미성 기준선)** — reference 제품. owner가 지정하지 않았으면 STEP 2에서
   찾아 제안한다
7. **Incumbent rule audit(기존 규칙 심사)** — `DESIGN.md`와 surface brief에 이미 적힌 rule은
   **evidence(증거)이지 constraint(제약)가 아니다.** 각 rule에 deletion test(삭제 테스트)를
   적용하고, 이번 goal·mode와 충돌하거나 test에 실패하는 항목을 **개정 후보로 지목**한다.
   rule이 나쁘다고 판단되면 그 판단을 보고한다

**완료 조건:** 일곱 항목에 owner의 확인 또는 수정이 달렸다. 7번에는 개정 후보 목록(없으면
"없음"과 그 근거)이 들어 있고, owner가 각 후보에 keep / revise / delete를 지시했다.

## STEP 2 — reference 확정

[`REFERENCE.md`](REFERENCE.md)의 「Library resolution」과 「Reference selection」을 그대로
수행한다.

**완료 조건:** property 일치도 상위 5개 표(각 행에 근거 문장 + marketing surface / app surface
구분)와 preview 스크린샷을 제출하고, 최종 1~2개를 property 일치로 추천했다. 그 reference에서
뽑아낸 운용 기준 6~10개가 수치로 적혀 있다.

## STEP 3 — world 3안 (STOP)

`impeccable`의 new-work 흐름으로 후보를 도출하고 `concept-seed`를 굴린다. `concept-seed`는
`impeccable help` 목록에 나오지 않는다 — 존재 근거는 impeccable의 `reference/new-work.md`이고,
도구가 있는지는 그 도구를 문서화한 파일로 판정한다(2026-09 G1 1라운드는 help 목록만 보고 roll
없이 만들어졌다). 그리고 **세 가지를 함께** 제출한다. 텍스트 설명만으로 제출하는 것은 실패로
간주한다.

1. `concept-seed` 출력에 인쇄된 challenger의 **QUALITY BAR board/hero URL을 열어 이미지로**
   제시. 열지 못하면 그 사실을 보고한다. 직접 도출한 후보에는 이 이미지가 없으므로 comp로
   대체한다
2. 각 안의 **comp** — [`REFERENCE.md`](REFERENCE.md) 「Comp fidelity conditions」의
   1·2·3·6·7 적용(theme·전 state·전 viewport는 이 단계에서 면제). **후보는 팔레트가 아니라
   구성까지 소유한다** — 각 안의 comp는 그 world가 요구하는 content 구성(어느 field를 보이고,
   무엇을 dominant로 두고, 무엇을 지우는가)을 스스로 갖는다. 한 레이아웃에 토큰만 바꿔 입힌
   후보들은 owner가 world를 판단할 재료가 되지 못한다: 2026-09 G1 1라운드의 불만은 색이 아니라
   행마다 찍힌 상태 라벨과 식별할 수 없게 작은 썸네일, 곧 구성이었다. preview는 후보 id로
   component를 고르고, 출하된 구성을 before 열로 둔다. STEP 5는 선택된 world 안에서 구성을
   3안으로 넓힌다
3. 각 안이 STEP 1의 goal을 전달하는 방식을 한 문장으로
4. **제출 증거** — owner가 여는 URL로 `scripts/measure-surface.mjs`를 돌린 출력(exit 0). 운영
   화면이 있으면 `--baseline`에 그 URL을 넘긴다. 그
   `_provenance.commit`을 제출에 명시하고, `operability.inert`(비동작 컨트롤과 사유) ·
   `correspondence.new` · `correspondence.dropped`(새로 넣은 · 뺀 컨트롤과 사유) ·
   `relational.exempted` · `sweep.exempted`(관계 기준 8~12 · 14 · 15의 예외와 사유 — owner가 한 줄씩 승인하거나 반려한다)와
   조작 결과 대응표를 붙인다. 제출 측정은 폭 훑기를 포함한다 — 출력의 `sweep`이 null이 아니다.
   [`REFERENCE.md`](REFERENCE.md) 「Operability check」 · 「Correspondence
   check」 · 「Relational acceptance criteria」. 측정 뒤에 파일을 한 줄이라도 쓰면 다시 잰다

STEP 1의 7번이 개정 후보를 남겼거나 이 단계에서 기존 rule이 goal을 막는다고 판단되면,
**world 유지안 옆에 amendment(개정안)를 함께 올린다.** amendment에는 `DESIGN.md`의 어느
문장을 무엇으로 바꾸는지, 그 변경이 다른 rule·component에 미치는 파급을 적는다. world를
통째로 바꾸는 안도 여기서 제시한다 — rule 개정은 G1의 결정이고, STEP 5에서는 다룰 수 없다.

amendment는 문장과 함께 **규칙이 바꾸는 토큰 목록**(토큰 이름 · theme별 before → after)을 싣는다.
owner에게 묻는 질문은 규칙이 닿는 범위보다 좁게 쓰이기 쉽다 — 2026-09 TuBrief(tubrief-v2 #33)의
1라운드는 「배경 단」만 물었는데 규칙 문장은 「모든 neutral」이라 글자색까지 바꿨고, 범위 확인이
2라운드로 넘어갔다.

제안하는 값이 판정 기준을 가진 수치(ΔL · 대비 등)를 움직이면 **렌더해서 잰 값**을 함께 싣고, 실측이
기준을 넘는 값만 제안한다. 렌더할 화면이 없어 계산만 했으면 「추정」으로 적어 제안하고, 첫 렌더
실측이 기준에 못 미치면 값을 다시 제안해 승인을 받는다 — 같은 라운드의 hover 단은 기준과 같은 ΔL
0.06으로 승인된 뒤 light 렌더가 0.0599여서, 승인 뒤에 0.07로 바뀌었다. world 후보와 amendment의 색
값은 sRGB 안에 둔다(`design-substrate` STEP 1 목록 8이 선언을 잡는다).

**완료 조건:** owner가 하나를 택했거나, reroll·축 변경·정공법·steer 중 하나를 지시했다.
지시가 reroll이면 이미 제시한 direction을 후보에서 제외하고 STEP 3을 다시 수행한다.
amendment가 채택되면 바뀔 `DESIGN.md` 문장 목록과 토큰 목록에 owner의 승인이 달렸다.

## STEP 4 — direction contract 기록

선택된 direction을 surface brief의 `## Direction contract`에 기록한다. 탈락한 challenger에서
가져온 것은 **discipline(규율)**로 적는다 — "무엇을 어떻게 하는가"를 바꾸는 문장으로.
surface에 element를 추가하는 형태로 적지 않는다. element로 번역하면 근거 없는 widget이
생기고, 그것이 2026-09 실패의 직접 원인이었다.

contract는 world 값(색 · lightness · 반경 등 `DESIGN.md`가 정한 값)을 옮겨 적지 않고 `DESIGN.md`의
**이름**으로 가리킨다. 사본은 amendment가 값을 바꾸면 옛 값으로 남는다 — 2026-09 TuBrief(tubrief-v2
#33) 뒤 videos-list brief의 OWN-WORLD가 바뀌기 전 signal `oklch(0.8 0.14 200)`을 적고 있었다.

**완료 조건:** 여섯 블록(THESIS · OWN-WORLD · STORY · FIRST VIEWPORT · FORM ·
MEMORABLE MOMENT)이 기록되고, contract 안의 모든 항목이 deletion test를 통과한다.

## STEP 5 — composition 3안 (STOP · 가장 중요한 관문)

world는 고정하고 layout만 세 가지로 만든다. world와 composition의 구분은
[`REFERENCE.md`](REFERENCE.md) 「Glossary」에 있다. world rule을 깨야 더 나은 composition이
나온다고 판단되면 그 composition을 만들지 말고 **판단 근거와 함께 G1으로 돌려보낸다**
(STEP 3의 amendment). rule을 조용히 따르는 것과 조용히 어기는 것은 둘 다 실패다.

1. 이 surface의 **composition variable 3~4개를 직접 도출**해 owner에게 제시한다. 도출 규칙:
   - 각 variable은 이 surface의 content와 task에서 나온다(일반론 금지)
   - 각 variable은 값이 3개 이상이고, 값마다 **기기 4종 각각에서의 관찰값을 수치로** 적는다
     (계산이면 「추정」). 어떤 기기에서 두 값의 수치가 같으면 그 기기에서는 비교 재료가 아니라고
     제안에 적고, 4종 모두에서 같으면 한 값이다 — 2026-09 G2에서 V1의 셋째 값이 1440×900에서
     값 a와 같은 takeaway top ≈953을 냈는데 제안은 그것을 알리지 않았다
   - 최소 하나는 "무엇을 dominant element(지배 요소)로 둘 것인가"
   - 최소 하나는 "information density(정보 밀도)"
   - world(palette·type family·corner·elevation)는 variable이 아니다
2. variable 승인 후 3안을 만든다. **「Comp fidelity conditions」를 전부** 만족시키고,
   STEP 3의 4번(제출 증거)을 같은 형식으로 붙인다. world가 집행층에 들어가 있으면 `--shipped-world`를
   함께 준다([`REFERENCE.md`](REFERENCE.md) 「Shipped-world check」)
3. 각 안에서 **지워도 되는 element를 스스로 지목**한다 — 테두리·배경을 가진 컨테이너도
   element다([`REFERENCE.md`](REFERENCE.md) 체크리스트 13)

**두 번 고쳐도 안 맞으면 세 번째 전에 쿼리를 읽는다.** 같은 영역의 배치를 두 번 바꿔도 균형이
맞지 않으면, 세 번째 배치 전에 그 영역에 데이터를 공급하는 쿼리·API 응답을 읽는다. 디자인이
요구하는 데이터를 응답이 싣지 않으면 바뀔 것은 응답이다 — "백엔드는 건드리지 않는다" 같은
제약이 있으면 그 사실을 근거로 owner에게 해제를 요청한다. 2026-09 G1에서 lead card를 세 번
다시 짰는데, 원인은 목록 RPC가 breakdown 제목을 3개로 자르고 claim bullet을 빼서 두 번째 열에
채울 내용이 없던 것이었다. SQL의 상한과 `COALESCE`는 레이아웃 세 층 밖에서 내려진 레이아웃
결정이고 CSS로는 이기지 못한다.

**형태:** 실제 component + preview 라우트로 만든다. world가 하나로 확정된 뒤이므로 채택안이
곧 production 코드가 되고 탈락안만 버려진다. throwaway HTML로 만들면 구현에서 같은 일을
두 번 한다.

**완료 조건:** owner가 하나를 택했거나 추가 round를 지시했다. 추가 round 지시의 형태는
`+N안 더` / `축을 바꿔서 N안` / `하나만 fidelity 최대로 다시` 세 가지다.

**Round 종료는 owner가 정한다.** 에이전트는 지시받은 round를 만들어 제출하고 다음 지시를
기다린다. 예산·중복·효율을 근거로 종료를 제안하거나 선택을 압박하는 것은 금지다(NEVER).
`impeccable`의 bounded-passes 상한은 **빌드된 산출물의 self-QA**에만 적용된다.

## STEP 6 — 구현

채택된 composition으로 구현한다. real data로 동작시키고, 접근 정보가 없으면 **그것을 blocker로
보고**한다. 가짜 데이터로 우회하지 않는다.

**완료 조건:** real data 캡처(주요 viewport 전부, 출하하는 모든 theme)를 제출하고, comp와
다른 지점이 있으면 그 이유를 설명했다. 수동 배포가 필요한 후속 단계를 명시했다.

## STEP 7 — expression pass (STOP × pass 수)

correctness 검증 통과는 배송이 아니다. 순서대로 수행하고 **각 pass마다 before/after를
나란히** 제출한다.

1. [`REFERENCE.md`](REFERENCE.md) 「Acceptance criteria」를 **수치로** 측정해 보고
2. `$impeccable bolder <target>` — composition과 accent 증폭
3. `$impeccable colorize <target>` — surface layers·lightness 배분·accent 배치
4. `$impeccable typeset` / `layout <target>` — type ramp·density·spacing rhythm

**완료 조건:** 각 pass에서 owner가 "나아졌다"를 확인했다. "나아지지 않았다"면 그 pass를
되돌린다. 모든 criteria 항목이 threshold를 만족하거나, 만족하지 못하는 항목에 owner가 승인한
예외 사유가 달렸다.

## STEP 8 — correctness와 마감

```
$impeccable critique <target>   ← backlog 생성
$impeccable polish <target>     ← 스냅샷을 소진하며 최종 교정
```

`critique`는 heuristic UX review다. hierarchy·consistency·missing state·accessibility·contrast를
점수화하며, **aesthetic quality는 판정하지 않는다.** 그 일은 STEP 7에서 끝나 있어야 한다.

**완료 조건:** critique의 P0/P1이 해소되고 스냅샷이 닫혔다. typecheck·test가 통과한다.

## STEP 9 — 문서화·커밋 (STOP)

`DESIGN.md`와 sidecar, surface brief를 갱신한다. **기존 `DESIGN.md`가 있으면 덮어쓰기 전에
owner에게 보여준다.** G1에서 승인된 rule 개정은 여기서 반영한다 — 폐기된 rule은 `DESIGN.md`
전체에서 걷어낸다. Named Rules, Colors, Components, Do's and Don'ts, 그리고 sidecar의
`narrative`가 같은 문장을 나눠 갖고 있으므로 한 곳만 고치면 나머지가 낡는다.

**출하 범위.** 시안·문서 브랜치를 배포 브랜치로 fast-forward하는 프로젝트는 push 절차에
[출하 범위 검사](scripts/ship-scope.mjs)를 연결하고, 목록이 비어 있지 않으면 owner의 출하
결정을 받는다. 호출과 판정은 스크립트 머리말을 따른다.

**완료 조건:** 폐기된 rule의 잔존 언급이 `DESIGN.md`·sidecar·surface brief에서 0건이고, surface
brief에 옮겨 적힌 world 값이 0건이다(STEP 4). owner가 ship을 승인했고, 커밋이 만들어졌다.

## 일반화 loop (매 gate마다 강제)

이 protocol은 프로젝트에서 돌면서 **자기 자신이 고쳐지는** 물건이다. 그 되먹임이 기억에
의존하면 반드시 샌다 — 2026-09 TuBrief 라운드에서 owner 지적 12건 중 공정에 반영된 것은
1건이었고, 나머지는 프로젝트 파일 안에만 남았다.

그래서 **모든 STOP gate의 완료 조건에 ledger 한 줄씩이 추가된다.** gate에서 owner가 낸 지적은
하나도 빠짐없이 아래 셋 중 하나로 분류되고, 분류되지 않은 지적이 있으면 그 gate는 닫히지
않는다.

| 분류 | 뜻 | 어디로 가는가 |
|---|---|---|
| **protocol** | 다른 프로젝트에서도 같은 결함이 난다 | 이 파일 또는 `REFERENCE.md`의 기준/체크리스트 |
| **asset** | 규칙이 아니라 실행 코드가 필요하다 | `scripts/` 아래 프로젝트 무관 스크립트 (호출부만 프로젝트에 둔다) |
| **project** | 이 제품의 사실에만 해당한다 | 프로젝트 저장소. 공정은 건드리지 않는다 |

**ledger 형식** — 라운드 보고 끝에 표로 붙인다.

```
| owner 지적 | 분류 | 반영 위치 | 다음 라운드에서 무엇이 이것을 잡는가 |
```

**asset의 경계.** 검사는 **규칙(REFERENCE.md)과 실행(scripts/)으로 나눠 이 SKILL 안에** 둔다.
프로젝트에는 URL을 만들어 넘기는 호출부만 남긴다. 저장소 안에만 있는 검사는 그 저장소만
지키고, 다음 프로젝트는 같은 결함을 처음부터 다시 만난다. 이 경계는 명령이 지킨다 —
`ledger.mjs check`는 asset 행의 `caught-by: cmd`가 **SKILL 안의 스크립트**(링크를 따라간 실제 경로가
`design-md/skills` 아래)를 실행하지 않으면 거부한다. 호출부를 거쳐 돌렸어도 행에는 호출부가 실행하는
SKILL 명령을 적는다 — 호출부와 검사 코드는 파일을 읽어서는 가를 수 없기 때문이다.

**배선은 규칙이 아니라 명령이다.** ledger를 문장으로만 적어두면 다시 샌다 — 이미 한 번 샜고,
샌 방식이 정확히 "사람이 기억해야 하는 단계"였다. 그래서 세 명령이 배선을 대신한다
(`scripts/ledger.mjs`, GitHub 기준).

```
# gate를 닫는 유일한 방법 — check → 해결 코멘트 → close → sync를 한 명령이 순서대로 하고, 첫 실패에서 멈춘다
node <skill>/scripts/ledger.mjs close <gate-issue> --map <process-map> --comment <file> [--dry-run]

# 다음 gate에 착수하기 전 선행 조건 — 이전 ledger 줄이 전부 티켓이 됐는지 대조, 아니면 exit 1
node <skill>/scripts/ledger.mjs audit --map <process-map> --product <product-map> \
  --since <제품 채택일> --process-since <공정 채택 시각>

# 개별 명령 (진단용)
node <skill>/scripts/ledger.mjs check <gate-issue> [--file <draft>]
node <skill>/scripts/ledger.mjs sync  <gate-issue> --map <process-map>
```

**`close`가 하나의 명령인 이유.** 이전 설계는 "gate를 닫는다"와 "지적을 공정으로 옮긴다"가 두
행위였고, 두 행위이면 두 번째는 건너뛸 수 있다. 실제로 그렇게 샜다. 이제 첫 번째만 하고 두
번째를 빠뜨린 상태는 **명령으로 도달할 수 없다**.

**`audit`이 다음 gate의 착수 조건인 이유.** `close`에도 우회로는 남는다 — `gh issue close`를
직접 치는 경우, 그리고 생성된 티켓을 나중에 지우는 경우. `audit`은 ledger 줄과 공정 지도의
티켓을 **대조**하므로 두 경우 모두 다음 gate 전에 드러난다.

**두 방어선이 못 잡는 것.** ledger에 애초에 적히지 않은 지적. `check`는 "적힌 줄이 분류됐는가"만
판정한다. 그러므로 **ledger는 gate가 끝난 뒤에 몰아 쓰지 않고, owner 지적이 나올 때마다 즉시 그
gate 이슈에 추가한다.** 이것이 이 loop에서 유일하게 자동화할 수 없는 규율이다.

- ledger는 gate 이슈의 코멘트 안 ```` ```ledger ```` 블록이며 `finding` / `class` / `where`
  세 줄이 한 항목이다. 항목은 빈 줄이 아니라 `---`로 나누며, 한 항목 안에서 `finding` · `class` ·
  `where` · `ticket` · `caught-by` · `red-line` · `red` · `green`이 중복되면 `check`와 `close`가 거부한다.
  `class`는 `protocol` | `asset` | `project`.
- **gate 안에서 이미 반영했다고 적는 줄은 다음 라운드에서 무엇이 잡는지를 적는다.** 위 표의 넷째
  열이 기계가 읽는 `caught-by:`다. `ticket: <commit>`은 변경이 들어간 곳일 뿐 집행의 증거가
  아니다 — G1에서 「chrome이 실제 옵션을 갖춘다」가 `985752e`로 반영됐다고 적혔지만 언어
  컨트롤은 정적 라벨이었고, 「읽지 못한 값을 센다」는 SKILL 문장으로 닫혔지만 두 측정기 모두
  세지 않았다(n=2). 그래서 `check`는 `caught-by:` 없이 반영을 주장하는 줄을 거부한다.
  - `caught-by: cmd <명령>` + `red: <commit>` + `red-line: <출력 한 줄>` + `green: <commit>` —
    red는 그 명령이 **이 결함에서 실패한** commit, green은 결함이 고쳐져 **같은 명령이 exit 0인**
    commit이다. 둘은 달라야 한다. red만으로는 모자란다: 아무것도 읽지 못하는 명령은 고쳐진
    산출물을 통과시키고, 무엇이든 실패하는 명령(서버 없음·오타)은 결함에서도 실패한다 — 둘을
    가르는 것은 red와 green의 짝뿐이다. #51이 그 사례다: 오판 수정이라 증거의 본체가
    green(`9ad0834`에서 이제 exit 0)이었다.
  - red/green은 **기록**이고, `check`는 명령을 다시 돌리지 않는다. 재현은 commit 하나에
    14~41분이 들었고(n=4), 처음 적힌 `cmd` 14줄 중 9줄은 자리표시자(`<port>`) 때문에 적힌 대로
    실행되지도 않았다(#54). 대신 **`red-line:`에 red 실행 출력 중 이 결함을 가리키는 줄을 원문
    그대로** 적는다. exit 1만으로는 red가 아니다 — #49에서 다시 돌린 red 3건 모두 무관한
    실패(fit 1440×1400, 다른 dead 컨트롤)가 함께 났고, 결함에 귀속시킨 것은 출력의 한 줄이었다.
    돌려 보지 않고 적은 red(#55의 `e841abb`, 이미 고쳐진 뒤)는 붙일 줄이 없어 적는 단계에서
    드러난다. 이 규칙은 거짓 기록을 막지 못하고, 추정 기록만 막는다.
  - red와 green은 **HEAD의 조상**이어야 한다(`check`가 거부). 원격은 `main`만 가지므로 곁가지
    (`red/popup-scope`)의 commit은 다른 clone에서 확인할 수 없다. 결함을 일부러 되살리는 변이는
    작업 브랜치에서 **변이 commit → 바로 다음 revert commit**으로 만든다 — red는 변이, green은
    revert다. 통합은 해시를 보존하는 merge여야 한다. `audit`은 `red-line`이 있는 줄의 두 commit이
    `origin/main`에 없으면 로컬 브랜치에 있을 때 `UNPUSHED`(목록만), 어디에도 없으면
    `UNREACHABLE`(exit 1)로 보고한다. close와 push 사이의 간격은 정상이고(#44에서 26시간),
    그때 실패시키면 배포를 강제하게 된다.
  - **결함이나 잡는 장치가 공정 자산(스킬) 쪽에 있으면** red/green을 `design-md@<sha>`로 적는다.
    두 스킬(`design-loop`·`design-substrate`)의 원본은 `design-md` 저장소의 `skills/`이고
    `~/.agents/skills/<이름>`은 symlink다. 접두사는 `ledger.mjs`가 들어 있는 checkout의 폴더
    이름과 같아야 하고, HEAD 조상·`UNPUSHED`/`UNREACHABLE` 판정은 그 저장소에서 한다. red와
    green은 **같은 저장소**, 두 실행 사이에 **바뀐 쪽**이다(바뀌지 않은 쪽의 버전은 기록되지
    않는다 — 기록이지 재현이 아니므로 받아들인다). 이 형식이 생기기 전 스킬 안의 잡는 장치는
    `doc`으로만 적혔다(#50·#54 4행, #63).
  - **결함이 명령의 코드가 아니라 입력에 있으면**(`check`에 넣는 ledger 초안, `audit`이 읽는
    tracker 상태) 그 입력을 `design-loop/fixtures/`의 fixture로 두고 변이 → revert를 fixture에
    한다. tracker 상태는 `audit --tracker <snapshot.json>`으로 넣는다 — 세 읽기(이슈 본문·코멘트,
    지도의 하위 이슈, 제품 지도의 `blocked_by`)를 파일로 바꾸고, 쓰는 `close`·`sync`는 이 옵션을
    거부한다.
  - `asset` 줄은 `cmd`만 받는다.
  - `caught-by: doc <경로> — <절>` — 사람이 읽고 적용해야 하는 문장. `check` 출력에
    「document only」로 따로 세어, 문서 반영이 집행으로 보고되지 않게 한다. `protocol` 줄의
    문서는 다음 프로젝트가 읽는 것이어야 한다 — 스킬 아래이거나 저장소 밖의 전역 에이전트
    파일. 현재 저장소 안의 문서면 `check`가 거부한다(2026-09 G1 5행이 저장소의
    learnings 문서를 가리켰다).
  - `ticket: #<n>` — 공정 티켓으로 넘긴 줄. 잡는 장치는 그 티켓의 해결이 정한다.
- `sync`가 만든 티켓에는 `<!-- ledger-source: <gate> :: <finding> -->` 표시가 박히고,
  `audit`은 그 표시로 **누락을 역방향으로** 찾는다. 즉 두 지도의 연결은 사람의 기억이 아니라
  **대조 가능한 사실**이다.
- `--file <path>`로 게시 전 초안을 검사할 수 있다. `close`는 이슈의 코멘트와 `--comment`
  파일을 함께 읽으므로 해결 코멘트가 ledger 블록을 직접 담아도 된다.
- **gate 마감 절차**: `check` 통과 → 해결 코멘트 → 이슈 close → `sync` → 주기적으로 `audit`.
- **공정 티켓도 같은 `close`로 닫는다**(`--map`은 그 공정 지도). 해결은 "고쳤다"는 주장이므로
  위와 같은 `caught-by:`를 적는다. 결함이 아니라 규칙 결정인 해결도 최저선은 `caught-by: doc`
  이며 「document only」로 세어진다 — 「잡는 장치 없음」이라는 종류는 없다. 아직 잡을 수 없는
  줄은 `caught-by` 없이 두면 `sync`가 새 공정 티켓으로 만든다. `gh issue close`로 우회하면
  `audit`이 `UNRECORDED … (process ticket)`로 보고한다. `--process-since` 이전에 닫힌 티켓과
  not planned(범위 밖)로 닫힌 티켓은 대상이 아니다. 근거: 2026-09-26까지 닫힌 공정 티켓 21개 중
  13개가 잡는 장치를 적지 않았고, 적은 8개는 전부 작성자의 기억이었다.

**loop가 도는 방향.** 공정 → 적용 → 피드백 → **공정** → 적용. 프로젝트에 먼저 고치고 "효과가
있으면 나중에 공정에 반영"하는 순서는 금지다. 그 순서는 마지막 단계가 선택적이 되고, 선택적인
단계는 잊힌다.
