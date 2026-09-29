---
name: design-substrate
description: 확정된 world를 토큰과 primitive에 집행해 화면이 겉칠로 버티지 않게 만드는 1회성 protocol. STEP 0-8, owner gate 2개.
disable-model-invocation: true
argument-hint: "어느 저장소의 집행층을 정리할까? (쓰는 UI 컴포넌트 라이브러리 이름을 함께)"
---

**substrate(집행층)** 는 픽셀을 결정하는 가장 낮은 층, 곧 **토큰**과 **primitive(기본 컴포넌트)**
다. 이 protocol은 world(세계: palette·corner·elevation·type family의 역할 분담)가 확정된 뒤,
**첫 화면을 만들기 전에 프로젝트당 1회** 돌린다.

집행층이 world를 말하지 않으면 화면은 오버라이드로만 world를 흉내 내고, 그것이 곧 겉칠이다.
측정된 심미성 실패 — 면에 서열이 없다, accent가 보이지 않는다, state가 구분되지 않는다 — 는
대개 표현이 아니라 여기서 온다. 요소 하나를 보는 correctness gate는 이 실패를 전부 통과시킨다.
실패는 요소 **사이의 관계**에서 나기 때문이다.

**에이전트: 아래 STEP을 순서대로 실행한다.** 각 STEP의 완료 조건을 만족하기 전에 다음으로
넘어가지 않는다. `STOP` 표시가 있는 STEP은 owner 응답 없이 진행하지 않는다.

## 이 SKILL을 단독으로 쓰는 경우

| 프로젝트 상태 | 이 SKILL이 맞는가 |
|---|---|
| world는 마음에 드는데 화면이 싸구려로 보인다 | **그렇다. 주 사례이고 레버리지가 가장 크다** |
| 컴포넌트 라이브러리를 깔고 그 위에 우리 색을 얹어 왔다 | 그렇다. STEP 0의 판별부터 |
| world 자체가 "어디서 본 것 같다" | 아니다. world를 먼저 정한다 |
| world도 집행층도 멀쩡한데 특정 화면만 약하다 | 아니다. 화면 단위 protocol로 간다 |

## 용어

**토큰 이름(token name)** — 값에 붙은 식별자이고, primitive가 실제로 참조하는 것.
**값이 아니라 이 식별자가 public API다.** 무엇으로 구현되는지는 라이브러리마다 다르다:
Tailwind 계열은 CSS 커스텀 프로퍼티(`--card`)와 그것이 만드는 유틸리티 클래스(`bg-card`),
MUI는 theme 객체의 키(`palette.background.paper`), Chakra는 semantic token 키(`bg.subtle`)다.
쓰는 라이브러리에서 그것이 무엇인지는 [`ADAPTERS.md`](ADAPTERS.md)의 「토큰 계약」이 답한다.
이 문서는 개념을 가리킬 때 언제나 「토큰 이름」으로 쓴다.

**포커스 표시(focus indicator)** — focus 상태가 idle에 비해 **새로 칠하거나 바꾼 층**이다.
층은 칠해지는 것만 센다: `outline`은 style이 `none`이 아니고 두께 > 0일 때, `box-shadow`는 층마다,
border는 변마다 style이 `none`이 아니고 두께 > 0일 때. 요소가 지닌 가장 강한 색이 아니다 —
브라우저는 style `none`인 outline에도 색을 남기고, border는 idle에도 있다. 그 둘을 링으로 읽은
측정이 TuBrief substrate pass에서 idle과 focus를 **76행 중 75행 같은 값**으로 쟀고, 그 값으로
"5/76 → 33/76 통과"를 보고했다.

## 다섯 원칙

이 protocol의 모든 판정은 아래로 환원된다.

1. **속성 하나에 권위 하나.** 면 색 · 글자색 · 반경 · 테두리 · 그림자 · 강조색 · 타입 램프 ·
   간격. 각각에 대해 "이 값을 결정하는 파일이 어디인가"의 답이 정확히 하나여야 한다.
2. **world는 가장 낮은 층에 심는다.** 토큰 → primitive → 화면. 화면부터 고치는 redesign은
   구조적으로 겉칠이다.
3. **토큰 이름은 라이브러리 것을 유지하고 값만 바꾼다.** 라이브러리의 토큰 이름은 primitive의
   **public API**다. 이래야 ⓐ 아직 손대지 않은 화면도 따라오고 ⓑ 업스트림 업데이트에 안
   깨지고 ⓒ 새로 추가하는 primitive가 자동으로 world를 입는다.
4. **지역 예외는 scoped re-point로만.** 같은 토큰 이름을 스코프 안에서 다시 가리킨다. 두 번째
   어휘를 만들면 그 순간 원칙 1이 깨진다.
5. **측정은 합성 화면에서 한다.** 라이브러리 컴포넌트가 섞인 실제 렌더 위에서 잰다. 내가 만든
   컴포넌트만 떼어 재면 통과하고 화면은 실패한다.

## 역할과 gate

에이전트가 전 과정을 구동하고, owner는 두 곳에서만 판단한다.

| Gate | owner가 하는 일 | STOP 지점 |
|---|---|---|
| **S1 어휘 채택** | 남길 어휘와 폐기할 어휘, 값 매핑 승인 | STEP 2 끝 |
| **S2 출하** | 비회귀 수치와 예외 요청을 보고 단독 머지 승인 | STEP 8 끝 |

**owner 응답을 기다리는 지점은 이 둘뿐이다.** 표본 범위 제안, 라이브러리 어휘로 표현되지 않는
속성, 예외 요청 — 전부 S1 제출물이나 S2 보고에 싣는다. 중간에 따로 묻고
멈추면 gate 수가 실행마다 달라지고, 다음 세션은 어디서 재개해야 하는지 알 수 없다. 조사 ·
치환 · 측정 · detector 작성은 owner 지시 없이 수행한다.

**예외 요청.** 어떤 STEP의 완료 조건을 만족시킬 수 없다고 판단하면, 그 항목을 통과로
적지 말고 `report.md`의 **예외 요청** 절에 `항목 · 현재 수치 · 임계 · 종류 · 이유`로 올린 뒤 다음
STEP을 계속한다. 종류는 둘이고, 섞어 올리면 owner가 무엇을 결정하는지 알 수 없다.

| 종류 | 뜻 | S2에서 owner가 고르는 것 |
|---|---|---|
| `unfixable` | 이 pass의 수단(토큰 · primitive · scoped re-point)으로 고칠 수 없다 | 승인 / 반려 |
| `out-of-authority` | 고칠 수는 있으나 **값의 권위가 world를 정한 앞 공정에 있다** | ⓐ 지금 world를 amend ⓑ 다음 공정으로 이월 ⓒ 알려진 위반으로 출하 |

`out-of-authority`가 따로 있는 이유: world는 대표 화면 한둘을 보고 정해지고, 이 protocol은 그
값을 **전 화면 · 전 theme · 전 state에 처음으로 적용하는 단계**다. 그래서 한 theme · 한 state · 한
script에서만 무너지는 값(커버리지 결함)은 구조적으로 여기서 처음 드러난다. 이 protocol은 그
값을 **고치지 않는다** — 스스로 고치면 권위 문서와 코드가 다른 world를 말하게 된다. 발견은
분류해서 올리고, ⓑ·ⓒ로 출하된 위반은 STEP 7의 detector가 계속 본다. 이월처(이슈 · 지도 ·
다음 라운드의 입력 파일)는 프로젝트마다 다르므로 예외 요청에 적는다.

판정은 S2에서 owner가 한다 — **owner가 판정하지 않은 예외가 하나라도 있으면 머지하지 않는다.**
이것이 "고치지 못한 것"과 "고칠 권한이 없는 것"을 처리하는 유일한 경로다.

## impeccable이 없는 머신

이 protocol이 소유하는 impeccable 동사는 `extract` · `audit` · `hooks` 세 개다. 호출 형식은
`$impeccable <동사> <대상 경로>`이고(`hooks`는 `on|off|status`를 인자로 받는다), 각 동사가
무엇을 출력하는지는 impeccable 자신의 문서가 권위다 — **여기서 되풀이하지 않는다.** 없으면
그 사실을 보고하고 아래 대체 경로로 계속한다. 표에 없는 STEP은 도구를 쓰지 않으므로 그대로
수행한다 — **도구가 없어도 protocol은 완전하다.**

| STEP | 쓰는 명령 | 대체 |
|---|---|---|
| 1 어휘 조사 | `extract` | 토큰 선언 파일과 primitive를 전수 grep해 속성×권위 표를 손으로 만든다 |
| 5 비회귀 게이트 | `audit` | 대비·포커스·반응형을 `scripts/capture.mjs`로 직접 측정한다 |
| 7 detector | `hooks` | `scripts/detect.mjs` 호출을 pre-commit 또는 CI에 직접 등록한다 |

## 산출물

S1에서 세션이 끊기므로 **다음 세션은 대화가 아니라 파일을 읽고 시작한다.** 전부 저장소의
문서 디렉터리 아래 한 폴더(`substrate/`)에 모은다.

| 파일 | 내용 | 쓰는 STEP | 읽는 STEP |
|---|---|---|---|
| `report.md` | world 출처와 판별 근거 · 권위 표 · 승인된 매핑 표 · 측정 대상 manifest · 예외 요청 · 각 STEP의 수치 | 0·1·2·3·4·5·6·7 | 1·2·5·6·8 |
| `baseline/<화면>-<theme>-<viewport>.png` | before 캡처 | 1 | 5 |
| `after/<같은 이름>.png` | after 캡처 | 5 | 5·8 |

캡처 파일명이 before와 after에서 같아야 대조가 기계적으로 된다.

## 실행 수단

명령과 경로는 **환경이 권위다.** 앱 기동 명령은 프로젝트의 스크립트 매니페스트에서, 화면
목록은 라우터 설정에서 뽑는다 — 이 문서가 그것을 캐시하면 프로젝트마다 틀린다.

캡처 · computed style 읽기 · state 유발은 브라우저 자동화로 한다. **hover와 focus는 CSS
클래스를 흉내 내지 말고 실제로 발생시킨다**(포인터 이동 · 키보드 포커스, 또는 디버깅
프로토콜의 pseudo-state 강제 — Chromium은 CDP `CSS.forcePseudoState`). 클래스를 손으로 붙여
재면 primitive가 실제로 그 state에서 무엇을 하는지가 아니라 내가 붙인 것을 재게 된다.

**강제하는 pseudo-class 집합은 실제 입력이 만드는 집합과 같아야 한다.** 키보드 포커스는
`:focus`와 `:focus-visible`을 **동시에** 만든다. `focus-visible`만 강제하면 `:focus` 옆에 적힌
선언이 매칭되지 않아, 키보드 사용자가 보지 않는 렌더를 재게 된다. focus는 언제나
`["focus", "focus-visible"]`로 함께 강제한다.

**색을 읽는 권위는 [`scripts/color-kernel.mjs`](scripts/color-kernel.mjs) 한 곳이다.** 이 공정의
측정기와 `design-loop/scripts/measure-surface.mjs`는 그 파일의 `COLOR_KERNEL`을 페이지에 심고
`globalThis.__colorKernel`을 호출만 한다. 파싱 · 배경 합성 · OKLCH L · WCAG 휘도 · `box-shadow` 층
분해 · 읽지 못한 값 카운터가 전부 거기 있고, 호출하는 쪽에 색 변환 코드를 두면 결함이다. 프로젝트
호출부는 `DESIGN_SUBSTRATE_HOME`(기본 `~/.agents/skills/design-substrate`)으로 찾는다.

- **래스터화이고 산술 변환이 아니다.** 커널은 값을 1×1 캔버스에 칠하고 그 픽셀을 읽는다. 색공간을
  손으로 변환하면 가르쳐 준 문법만 읽고, 나머지에서는 **조용히** 틀린다. Chromium 145에서 실측한
  결과, 산술 변환기는 `lab()` · `lch()`에 `null`을 돌려줬고, `color(display-p3 0.5 0.3 0.2)`를
  sRGB로 오독해 127/76/51을 냈다(실제로 칠해진 값은 136/73/45). `ctx.fillStyle`을 다시 읽는 것은
  답이 아니다. `oklch(…)`를 그대로 돌려줄 뿐이다. 답은 칠해진 픽셀이다.
- **float16 캔버스가 없으면 측정하지 않는다.** 8-bit 캔버스는 채널을 1/255 단위로 반올림한다.
  그래서 α 0.6 오버레이에서 L이 0.006까지 어긋났고, 이는 ΔL 임계 0.06의 10%다. 브라우저가
  `colorType: "float16"`을 주지 못하면 `ready === false`가 되고, 그 행은 측정 실패다. 8-bit로
  조용히 내려가는 경로는 두지 않는다.
- **못 읽은 값을 센다.** 캔버스가 받아들이지 못한 문자열(예: 길이가 붙은 그림자 조각)과
  `currentcolor`(캔버스 요소를 기준으로 해석된다)는 `null`이 되고 `stats().unread`에 들어간다.
  두 측정기는 `unread`가 1 이상인 행을 측정 실패로 출력하고 0이 아닌 코드로 종료한다.
- **불투명한 바닥을 가정하지 않는다.** 불투명한 조상이 없으면 root의 `Canvas` 시스템 색(color-scheme을
  따른다)을 읽는다. dark 문서에서는 흰색이 아니라 18/18/18이다.
- **포커스 표시는 커널이 판정한다.** idle에서 `paintedLayers(el)`을 읽고, focus를 강제한 뒤
  `focusIndicator(el, idle 층)`을 호출한다. 두께는 outline·border의 폭, 그림자의 spread다. blur는
  점점 옅어지는 가장자리라 선이 아니므로, blur만 있는 그림자(입체감 그림자)의 두께는 0이다.
  대비는 **인접 바탕**에 대해 잰다: 바깥 층은 부모의 바닥, 안쪽(inset) 층은 요소 자신의 바닥,
  border처럼 경계에 걸친 층은 둘 중 나쁜 쪽. 강제한 state는 transition을 시작시키므로, 읽기 전에
  요소의 animation을 끝 상태로 보낸다.

**검사 코드는 이 SKILL에 있고, 프로젝트에는 설정 하나만 남는다.** 저장소에만 있는 검사는 그
저장소만 지키고, 다음 프로젝트는 같은 결함을 처음부터 다시 만든다(TuBrief에서 corner 단 수를
철자로 세던 결함이 저장소 detector에서 고쳐져 전해지지 않았다 — tubrief-v2 #56).

| 스크립트 | STEP | 하는 일 |
|---|---|---|
| [`scripts/detect.mjs`](scripts/detect.mjs) | 1 · 7 · 8 | STEP 1 결함 목록 탐지 + 이월 목록 출력. findings가 있으면 exit 1 |
| [`scripts/capture.mjs`](scripts/capture.mjs) | 1 · 5 | manifest 행마다 캡처와 기준 2·3·4 측정. 측정 실패 또는 4b 미달이면 exit 1 |
| [`scripts/font-attribution.mjs`](scripts/font-attribution.mjs) | 1 · 5 | 출하 locale × manifest 행 × viewport마다 글리프를 그린 face(STEP 5 항목 6). 허용 밖 OS 글리프가 있거나 측정 실패면 exit 1 |
| [`scripts/adapters/<라이브러리>.mjs`](scripts/adapters/tailwind.mjs) | — | [`ADAPTERS.md`](ADAPTERS.md) 여섯 질문의 답을 코드로. 목록에 없는 라이브러리는 새 어댑터 파일을 이 SKILL에 추가한다 |

프로젝트 루트에서 `node ~/.agents/skills/design-substrate/scripts/<detect|capture|font-attribution>.mjs --config <설정 파일>`로
부른다. 패키지(Playwright · 라이브러리 컴파일러)는 부르는 프로젝트의 `node_modules`에서 찾는다.
설정 파일은 ES 모듈(`.mjs`, 또는 Node ≥ 22.18이면 `.ts`)이고 default export가 이 모양이다:

- `adapter` — `scripts/adapters/` 아래 파일 이름(예: `"tailwind"`).
- `detect` — `tokensFile`(토큰 선언 시트) · `sources`(렌더되는 모든 파일의 git glob, 시안 포함) ·
  `primitives`(primitive 파일 glob) · `designDoc`(권위 문서) · `stylesheetBase` ·
  `declarationSheets`(선언을 인정할 `node_modules` 시트) · `runtimeOwned`(라이브러리가 런타임에 쓰는
  변수) · `utilityExempt`(파일 · 쓰인 그대로의 클래스 문자열 · 사유 — 목록 5·6·7이 그 파일의 그 문자열을
  건너뛴다) · `vocabularies`(어휘 이름 → 토큰 목록) ·
  `deferred`(이월 목록: `what · measured · threshold · authority · carriedTo`).
- `capture` — `rows`(각 행 `id · container · smoke`와 그 밖의 서술 필드) · `themes` · `viewports`
  (`name · width · height`) · `lang` · `base` · `out` · `statesAt`(state를 재는 viewport 이름) ·
  `scroller`(문서 대신 스크롤되는 요소, 없으면 생략) · `setup()`(행 렌더에 필요한 계정·데이터를 읽는다.
  `fixture`만 출력에 기록된다) · `session(row)` · `storageState(session, setup)` ·
  `url(row, { base, lang, theme }, setup)` · 선택 `stateTargets`(기준 4 대상 이름 → selector, 기본은 어댑터).
- `fonts` — `locales`(출하하는 전 locale) · `installedAllowed`(OS face가 그려도 되는 글자: `scripts`는
  `Han` · `Hiragana` · `Katakana` · `CJK-punct` · `Emoji` 등 문자 분류 이름, `selector`는 그 조상 안의
  글자 전부. 근거는 권위 문서의 행) · 선택 `theme`(기본은 `capture.themes`의 첫째). 한 theme으로 재는
  근거는 theme 스코프가 글꼴(`font-family` · `--font-*` · `@font-face`)을 선언하지 않는다는 것이다 —
  선언하는 프로젝트는 theme마다 `theme`과 `--out`을 바꿔 한 번씩 돌린다. 행 · viewport · URL은
  `capture`의 것을 그대로 쓴다.

호출부가 URL을 만들어 넘기는 일 이상을 하거나, 프로젝트 `scripts/`에 판정 코드가 생기면 결함이다.
ledger의 asset 행은 이 SKILL 안의 스크립트만 잡는 장치로 받는다(`design-loop` 「asset의 경계」).

---

## STEP 0 — 진입 판별

world의 출처를 확정한다. **권위 문서가 있다는 사실이 world가 있다는 뜻은 아니다.**

`DESIGN.md`(또는 그에 해당하는 디자인 권위 문서)를 펼치고 묻는다:

> **"컴포넌트 라이브러리를 통째로 다른 것으로 바꿔도 이 문서가 거의 그대로 성립하는가?"**

성립하면 그 문서는 world의 명세가 아니라 **라이브러리 기본값의 기록**이다. 파일 이름 때문에
권위로 취급되는 순간 generic world가 "문서화된 우리 디자인 시스템"으로 승격되고 겉칠이
영구화된다. 코드에서 문서를 생성하는 도구(`impeccable document` 등)의 산출물은 정의상 여기에
해당한다. 그런 문서는 **권위가 아니라 증거로 강등하고** 그 사실을 보고에 적는다.

권위 문서 후보가 **여러 개면**(예: 디자인 문서 · README의 스타일 절 · 기여 가이드) 전부에
같은 질문을 적용해 표로 답하고, **하나도 통과하지 못하면 world가 없는 것이다.** 후보가
**하나도 없어도** 결론은 같다 — 문서의 부재가 아니라 판별 통과 여부가 기준이다.

- 통과한 문서가 하나 → 그것이 world의 출처다.
- 통과한 문서가 둘 이상 → **world가 확정되지 않은 것이다.** 두 권위는 원칙 1 위반이므로 이
  protocol을 멈추고, 어느 쪽이 권위인지 정해진 뒤 다시 호출한다.
- 통과한 문서가 없다 → 이 protocol을 멈추고 world를 먼저 정한다(world 결정은 3안 비교와
  owner 선택으로 이뤄지는 별개 공정이고, 이 protocol은 그 결과를 입력으로 받는다).
- owner가 "지금 world로 간다"고 지시 → 그 지시가 world의 출처다. 한 줄로 기록하고 계속한다.

**완료 조건:** ⓐ world의 출처가 파일·행 번호 또는 owner 지시 한 줄로 적혔다 ⓑ 판별 질문의
답과 그 근거 문장 인용이 보고에 있다 ⓒ 강등이 일어났으면 그 사실이 보고에 적혔다.

## STEP 1 — 어휘 조사와 기준선

저장소에서 픽셀을 결정하는 선언을 전수 수집한다. 표본이 아니라 전수다. 라이브러리별로
어디를 봐야 하는지는 [`ADAPTERS.md`](ADAPTERS.md)에 있다 — **쓰는 라이브러리의 절을 먼저
읽는다.**

속성마다 **권위 표**를 만든다.

| 속성 | 선언 위치 | 토큰 이름 | 값 | 권위 수 |
|---|---|---|---|---|
| 면 색 · 글자색 · 반경 · 테두리 · 그림자 · 강조색 · 타입 램프 · 간격 | … | … | … | … |

그리고 아래 결함 목록을 따로 작성한다. **이 목록이 STEP 7 detector의 범위이기도 하다.**

**스캔 범위는 렌더되는 모든 코드다** — 출하 화면, primitive, 그리고 시안·preview·개발 전용 라우트까지.
제외는 파일과 사유를 적은 목록으로만 한다. 이 정의 하나를 STEP 1 · STEP 7 · STEP 8이 같이 쓴다.
2026-09 TuBrief에서 detector가 시안 코드(`app/comp/`)를 스캔에서 빼 두었는데, 이 pass가 지운
토큰을 가리키던 시안의 재생·로그인 버튼이 한 라운드 내내 투명하게 나갔다.

1. **split-brain(어휘 병존)** — 같은 속성을 결정하는 토큰 접두사가 2개 이상인 행. 이것이
   원칙 1 위반이며 명도 사다리가 둘로 갈라지는 지점이다.
2. **dead token(미사용 토큰)** — 어느 화면·primitive에서도 참조되지 않는 토큰. 색만이 아니라
   반경·간격·타입 토큰까지 같은 범위로 센다.
3. **하드코딩** — primitive 소스에 남은 색 · 반경 · 테두리 · 그림자 리터럴. **반경은 리터럴이
   0건이어도 끝나지 않는다.** primitive가 쓰는 반경을 철자(유틸리티 이름)가 아니라 **해석된
   값**으로 모아 단 수를 센다. 전부 토큰에서 파생돼도 단이 여섯일 수 있고, 토큰을 참조하는
   것처럼 보이는 철자가 라이브러리 자신의 기본값으로 해석될 수도 있다(예: Tailwind의 bare
   `rounded`는 `--radius`가 아니라 0.25rem). 거꾸로 철자가 여섯이어도 한 값으로 해석되면 1단이다.
4. **drift(불일치)** — 권위 문서가 적은 반경·면 정책과 primitive의 실제 값이 다른 지점.
5. **끊긴 참조(dangling reference)** — 아무도 선언하지 않은 토큰을 가리키는 스타일 참조. 소스에는
   멀쩡히 적혀 있지만 **오류 없이 아무것도 칠하지 않는다.** 토큰을 지우거나 이름을 바꾸는
   이 pass가 가장 많이 만든다. 판정은 철자가 아니라 **그 라이브러리가 실제로 무엇을 만드는가**로
   한다(어댑터 계약 질문 6). 예: Tailwind v4에서 `@theme`에 `--color-accent-solid`가 없으면
   `bg-accent-solid`는 CSS를 하나도 만들지 않는다. `var(--x)`와 `bg-(--x)`는 무엇이든 컴파일되므로
   질문이 한 단 내려가 `--x`를 선언하는 곳이 있는지가 된다.
6. **라이브러리 기본값 참조(library-default reference)** — world가 소유한 축의 유틸리티가 world가
   아니라 **라이브러리 자신의 기본 시트만 선언한 값**으로 해석되는 참조. CSS가 만들어지므로 목록 5를
   통과하고, 요소는 오류 없이 라이브러리 기본값을 칠한다. 예: world가 `--font-mono`를 선언하지 않은
   Tailwind v4에서 `font-mono`는 `tailwindcss/theme.css`의 monospace stack으로 해석되고, 글자는 OS
   글꼴로 떨어진다(2026-09 TuBrief 자막 타임코드 1,848 글리프가 Liberation Mono). 판정은 목록 5와
   같이 라이브러리가 만든 CSS가 읽는 변수로 하고, 어느 축을 world가 소유하는지는 어댑터가 적는다.
   축은 결함이 관찰될 때 하나씩 늘린다 — 간격·글자 크기처럼 라이브러리 기본값을 의도해서 쓰는 축에
   걸면 출력이 의미를 잃는다.
7. **반투명 포커스 표시(translucent focus indicator)** — **포커스 표시**(「용어」)를 칠하는 링 · outline ·
   테두리 · 그림자 색의 α가 1보다 작은 곳. 합성 대비는 그 색이 놓인 바탕마다 다르므로, 렌더 표본
   하나가 4b를 통과해도 다른 바탕에서는 떨어진다(2026-09 TuBrief dark `--ring` α 0.5: 기본 바탕 3.43,
   popover 2.96. 76표본에 popover 위 포커스 대상이 없어 통과로 보고됐다). 그래서 대비를 계산하지 않고
   α < 1이면 결함이다. 대상은 포커스 변형이 붙은 클래스, 그리고 변형 없는 outline 색이다 — outline은
   포커스가 style을 줄 때만 칠해진다(TuBrief 기본층 `* { @apply outline-ring/50 }`). 판정은 목록 5와
   같이 클래스를 변형째 라이브러리에 컴파일시켜, 만든 CSS의 선택자와 색 선언으로 한다.

**기준선을 지금 뜬다.** STEP 3이 값을 바꾸기 전에 재현 가능한 before를 확보한다. 라우터에서
**전 화면**을 뽑아 manifest를 만들고(화면이 20개를 넘으면 표본안을 S1 제출물에 넣되, 승인
전까지는 전 화면을 대상으로 둔다), 출하하는 모든 theme × 대표 viewport 2개(모바일·데스크톱)로
캡처하고 STEP 5의 2·3·4 항목을 **지금 측정해 기록한다.** 같은 manifest를 **출하하는 모든 locale**로
다시 돌려 항목 6(렌더 폰트 귀속)의 before를 뜬다(`font-attribution.mjs`). face 결손은 locale마다
다른 문자에서 나므로, 한 locale로 뜬 기준선은 나머지 locale의 before가 되지 못한다 — TuBrief는
face를 교체하면서 before와 after를 모두 `ko`로만 떠서 다국어 확인을 별도 재측정으로 미뤘다.

manifest의 각 행은 STEP 5가 그대로 다시 쓰는 계약이므로, 화면마다 **측정할 컨테이너를
selector로**, **스모크 흐름을 시작 상태 · 동작 · 기대 결과로** 확정해 적는다. "주요"를 STEP
5에서 고르면 그때 쉬운 것만 고르게 된다.

렌더에 조건이 붙는 화면(로그인 뒤 · 시드 데이터 필요 · 빈 상태 · 에러 상태)은 접근 방법을
확보해 목록에 넣는다. 확보하지 못하면 **그 화면을 blocker로 보고한다** — 가짜 데이터로
우회하면 기준선이 거짓이 되고 STEP 5의 비교가 무의미해진다.

**측정 규약.** lightness는 **OKLCH의 L(0~1)** 로 적는다. 다른 색공간으로 쟀으면 환산값을
함께 적는다. 값은 선언된 토큰이 아니라 **실제 렌더된 요소의 computed style**에서 뽑는다 —
반투명·그라디언트·겹친 오버레이는 합성된 결과 위에서 읽는다.

**측정기는 읽지 못한 값을 버리지 않고 센다.** 브라우저는 computed style을 선언된 색공간
그대로 돌려줄 수 있고(`oklch(...)`, `oklab(...)`), 그것을 못 읽는 파서는 그 요소를 조용히
건너뛴다. 그러면 "대비 쌍 0개, 면 0단"이 나오는데, 이것은 **결함 0건과 같은 모양의 측정
실패**다. 그래서 모든 측정 출력에 ⓐ 읽으려 한 값의 수 ⓑ 읽지 못한 값의 수를 함께 싣는다.
읽지 못한 값이 1개 이상이거나, 화면에 요소가 있는데 측정 대상이 0개이면 그 행은 통과가
아니라 **측정 실패**이고 기준선으로 쓸 수 없다.

**완료 조건:** ⓐ 8개 속성 전부가 표에 있고, 권위 수 2 이상인 행마다 두 어휘의 토큰 이름과 값이
나란히 적혔다 ⓑ 위 결함 목록 전부가 파일·행 번호와 함께
작성됐고 개수가 수치로 보고됐다. 반경은 리터럴 수와 해석된 값의 단 수를 따로 적었다 ⓒ manifest에 라우터에서 뽑은 전 화면과 조건부 상태가 들어 있고, **각 행마다** 모든
출하 theme × viewport 2개 캡처 · 측정 컨테이너 selector · 스모크 흐름 · STEP 5 항목 2·3·4의
before 수치, 그리고 출하 locale 전부 × viewport 2개의 항목 6 before 수치가 있다 ⓓ 렌더하지 못한 행은 blocker로 표시됐다 ⓔ 모든 행의 측정 출력에 읽지 못한
값의 수가 적혔고 전부 0이다.

## STEP 2 — 단일화 계획 (STOP · S1)

살아남을 어휘를 정한다. **원칙 3에 따라 기본값은 "라이브러리가 정한 토큰 이름을 남기고
이 저장소가 추가한 토큰 이름을 폐기한다"** — 라이브러리의 토큰 이름이 primitive의 public
API이기 때문이지, 그쪽이 더 나아서가 아니다. 우리 토큰 이름을 남기려면 라이브러리 primitive 전부를 우리가 소유한다는 뜻이고, 그 비용을
owner에게 적는다.

제출물은 다섯이다.

1. **매핑 표** — `폐기할 토큰 이름 → 남길 토큰 이름 → 새 값`. world가 각 값을 어떻게 결정했는지 한 줄씩.
2. **표현 못 하는 것** — world가 요구하는데 라이브러리 어휘에 자리가 없는 속성(예: 면의 3번째
   단). 새 토큰 이름을 추가할지, 기존 토큰 이름을 재해석할지 제안한다.
3. **파급 범위** — 이 치환이 건드리는 파일 수와, 그중 아직 재설계하지 않은 화면 수.
4. **표본안** — STEP 1의 manifest가 20행을 넘으면 어느 화면을 표본으로 쓸지와 그 근거.
5. **기준선 결손** — STEP 1에서 렌더하지 못해 blocker로 표시된 행과 그 사유.

**완료 조건:** owner가 최종 매핑 표를 명시적으로 승인했다. 수정 지시를 받으면 반영해 다시
제출하고, 승인 전에는 STEP 2에 머문다.

## STEP 3 — primitive 집행

primitive가 **토큰만** 읽게 만든다. 승인된 매핑을 토큰 선언에 붓고, primitive 소스의
하드코딩을 토큰 참조로 치환한다.

- 라이브러리 primitive를 저장소가 소유하고 있으면(vendoring) 소스를 직접 고친다.
- 소유하지 않으면 라이브러리의 theme·override 계약을 통해 고친다. 그 계약이 어디인지는
  [`ADAPTERS.md`](ADAPTERS.md)에 있다.

**완료 조건:** ⓐ 승인된 매핑 표의 **모든 행**이 적용됐고 폐기한 토큰 이름의 코드 참조가 0건이다
ⓑ primitive 전수에 색·반경·테두리·그림자 리터럴 0건, 그리고 반경의 해석된 값 단 수가 권위
문서의 corner 정책과 같다 ⓒ STEP 1의 dead token이 전부 삭제됐다
ⓓ drift 목록이 0건이 됐다 ⓔ 개수 변화를 before/after 수치로 보고했다. 만족시킬 수 없는
항목은 예외 요청으로 올린다.

## STEP 4 — 지역 예외 정리

특정 영역만 다르게 보여야 하는 곳(오버레이, 반전 영역, 강조 패널)을 **scoped re-point**로
바꾼다: 같은 토큰 이름을 안쪽 스코프에서 다시 가리킨다. 라이브러리마다 공식 문법이 다르므로
[`ADAPTERS.md`](ADAPTERS.md)의 현재 라이브러리 절에서 **scoped re-point** 항목을 읽고 그
문법을 쓴다.

화면 파일에 남아 있던 world 오버라이드 — 클래스로 덮어쓴 색·반경·그림자 — 를 이 단계에서
걷어낸다. 걷어냈더니 화면이 달라 보인다면 그것이 바로 primitive가 world를 집행하지 않았다는
증거이고, 고칠 자리는 STEP 3이다. 후속 화면 작업에서 같은 것이 발견돼도 화면에서 덮지 말고
여기로 돌아와 같은 분류를 적용한다.

**완료 조건:** 화면 파일의 world 오버라이드가 0건이고, scoped re-point는 전부 기존 토큰 이름을
재지정하는 형태다. 남은 오버라이드는 원인이 primitive이므로 파일·행과 함께 기록해 **STEP
3으로 돌아간다** — 그것을 꼬리표만 붙여 통과시키지 않는다.

## STEP 5 — 비회귀 게이트

기준은 **"예뻐졌다"가 아니라 "아직 재설계하지 않은 화면이 깨지지 않았다"** 이다. STEP 1의
manifest를 그대로 다시 돌린다 — 같은 행, 같은 theme, 같은 viewport, 같은 컨테이너 selector,
같은 스모크 흐름, 같은 측정 규약.

| # | 항목 | 통과 조건 |
|---|---|---|
| 1 | 빌드·typecheck·test·콘솔 | 실패 0, 신규 콘솔 에러 0 |
| 2 | 텍스트 대비 | 모든 텍스트/배경 쌍이 WCAG AA(본문 4.5:1, large 3:1). before에서 이미 실패한 쌍은 before 값 이상 |
| 3 | 레이아웃 보존 | manifest가 지정한 컨테이너의 bounding box 폭·높이 변화 ±2% 이내, 문서 세로 길이 변화 ±5% 이내, 신규 가로 overflow 0 |
| 4a | state 구분 — 면 | hover · selected · disabled가 각 primitive에서 바탕 대비 **면의** ΔL ≥ 0.06으로 구분된다 |
| 4b | state 구분 — focus | **포커스 표시**(「용어」 — focus가 idle에 비해 새로 칠하거나 바꾼 층)가 있고, 그 층이 **인접 바탕 대비 ≥ 3:1**(WCAG 2.2 SC 1.4.11 non-text contrast)이며 두께가 0보다 크다. idle에도 있는 색은 통과 근거가 아니다. 판정은 커널 `focusIndicator`(「실행 수단」). 반투명 포커스 표시는 표본 바탕에서 통과해도 결함이다 — STEP 1 목록 7 |
| 5 | 기능 보존 | manifest의 스모크 흐름 전부가 기대 결과에 도달 |
| 6 | 렌더 폰트 귀속 | 출하 locale 전부 × viewport 2개에서 OS face(페이지가 싣지 않은 face)가 그린 글리프가 설정 `installedAllowed` 밖에 0개. 기본 상태만이 아니라 보이는 탭을 하나씩 고르고 닫힌 disclosure(`[aria-expanded="false"][aria-controls]`)를 하나씩 연 상태까지 센다 — 닫힌 자막 패널 안의 1,848 글리프가 기본 상태에서 0으로 읽혔다. 문자는 Unicode Script가 아니라 블록으로 가른다(`ー` U+30FC는 Script=Common인 가나 부호) |

**4를 둘로 나눈 이유:** focus는 대개 면이 아니라 **링**으로 표현된다. 면의 ΔL로 재면 링이 아무리
잘 보여도 구조적으로 0이 나오므로, 그 기준으로는 링 기반 라이브러리의 focus가 영구히 통과할 수
없다. 반대로 hover·selected를 링 대비로 재면 면이 바뀌지 않는 실패를 놓친다.

**"깨졌다"의 정의:** 읽을 수 없는 텍스트, 보이지 않는 컨트롤, 잘린 콘텐츠, 사라진 state 구분,
동작하지 않는 흐름. 그 외의 변화는 의도된 결과다.

**완료 조건:** manifest의 **모든 행**에 대해 6개 항목의 수치가 적혔고 실패 0건이다. 고칠 수
없다고 판단한 실패는 예외 요청으로 올린다. before/after 캡처가 같은 파일명으로 짝지어졌다.

## STEP 6 — 합성 측정

primitive만 모은 화면이 아니라 **라이브러리 컴포넌트가 섞인 합성 화면** 하나를 만들어(전용
preview 라우트가 가장 싸다) 그 위에서 잰다. lightness와 측정 방법은 STEP 1의 측정 규약을
따른다.

기준은 둘로 갈린다. **material** 기준은 화면이 어떤 재료로 칠해지는가이고 집행층이 결정한다.
**composition** 기준은 화면이 그 재료를 어디에 얼마나 쓰는가이고 화면이 결정한다. 집행층은
40px 활자와 signal 색 면을 **쓸 수 있게** 만들 뿐, 화면이 그것을 쓰게 만들지 못한다.

| # | 기준 | 종류 | 기본 threshold |
|---|---|---|---|
| 1 | 면의 단 수와 인접 단 사이 lightness gap | material | ≥ 3 layers, 인접 ΔL ≥ 0.06 |
| 2 | 가장 큰 활자 ÷ body 크기 | composition | ≥ 2.5 |
| 3 | accent가 차지하는 면적 | composition | 12px 미만 element에만 나타나면 실패 |
| 4 | corner family 수(해석된 값 기준) | material | 1. 한 화면에 각진 면과 둥근 컨트롤이 섞이면 실패 |
| 5 | type family 수와 각 family의 역할 | material | 선언된 family 전부에 역할이 있다. 번들되는데 어디에도 안 쓰이면 실패 |

**threshold는 기본값이다.** 프로젝트 권위 문서가 다른 값을 적었으면 그 값이 이긴다.

**이 STEP이 판정하는 것은 material(1·4·5)뿐이다.** 실패하면 원인이 토큰인지 primitive인지
지목해 해당 STEP에서 고친 뒤 **material 전 항목을 다시 측정한다** — 실패 0건이 되기 전에는
완료하지 않는다. 화면에서 고쳐 통과시키는 것은 이 protocol이 고치고 있는 병 자체다.

**composition(2·3)은 재서 넘긴다.** 수치를 기록해 화면 단위 protocol의 before로 넘기고, 통과로도
실패로도 적지 않으며 예외 요청으로도 올리지 않는다 — 이 protocol의 수단이 닿지 않는 것은
예외가 아니라 범위 밖이다. 단 **재료가 없어서** 못 쓰는 경우는 material 결함이다: world가
요구하는 dominant 크기가 타입 램프에 없거나, signal의 면 값이 토큰에 없으면 STEP 3으로 돌아간다.

**완료 조건:** 1·4의 측정값과 5의 family 수·역할 표가 적혔고 전부 threshold를 만족한다. 2·3의
측정값이 화면 단위 protocol이 읽을 자리에 before로 적혔고, 그 재료(타입 램프의 dominant 단 ·
signal 면 토큰)가 존재함이 확인됐다.

## STEP 7 — detector 등록

STEP 1이 손으로 찾은 것을 기계가 다시 찾게 만든다. **탐지 범위는 STEP 1의 결함 목록 전부와 스캔
범위 그대로다** — 범위가 갈라지면 STEP 1이 결함으로 센 것이 다음 커밋부터 조용히 들어온다.
**스캔 대상에서 디렉터리를 빼는 코드가 detector에 있으면 그 자체가 결함이다** — 제외는 파일·사유
목록으로만 하고, 목록은 실행마다 읽힌다.

**규칙의 source of truth는 이 SKILL의 [`scripts/detect.mjs`](scripts/detect.mjs)다**(「실행 수단」).
프로젝트는 설정 파일에 탐지 범위 · 제외 목록 · 이월 목록만 적는다. 훅 도구가 있으면 그 스크립트를
**호출만** 하도록 등록한다. 규칙을 훅 도구 안에 직접 쓰면 그 도구의 버전에 결합되고, 도구가 없는
머신에서 규칙 자체가 사라진다. 같은 이유로 **훅은 이 SKILL이 없는 머신에서 커밋을 막는다** — 경고하고
건너뛰면 규칙이 설치가 없는 머신에서 조용히 사라진다.

**완료 조건:** 설정 파일이 저장소에 있고, 그 설정으로 `detect.mjs`를 현재 코드에 대해 실행한 findings
0건 출력이 보고에 인용됐다. 예외 요청 중 `unfixable` 승인 항목은 **제외 목록**(설정의 `utilityExempt`)에 사유와 함께, `out-of-authority`
중 ⓑ 이월 · ⓒ 출하 항목은 **이월 목록**(설정의 `deferred`)에 `측정 · 임계 · 권위 · 이월처`와 함께 등록한다. 이월
목록은 **매 실행마다 출력되고 종료 코드에는 영향을 주지 않는다** — 문서에만 적힌 이월은 곧
기억되지 않는다. pre-commit 또는 CI 중 **하나가 실제로 그 스크립트를 호출하고 있고**(SKILL이 없으면
실패한다), 그 등록 경로가 적혔다.

## STEP 8 — 출하 (STOP · S2)

substrate pass는 **단독으로** 머지한다. 화면 재설계와 같은 커밋에 실으면 비회귀 게이트의
수치가 무엇 때문에 움직였는지 판별할 수 없다.

권위 문서를 갱신한다: 폐기된 어휘의 잔존 언급을 걷어내고, 살아남은 토큰 이름 · corner 정책 ·
면의 단 · type family 역할을 실제 값으로 맞춘다. **문서와 코드가 다른 world를 말하면 이
protocol은 실패한 것이다.**

**완료 조건:** 폐기된 토큰 이름의 잔존 언급 0건 — STEP 1의 스캔 범위 전체에서 센다(시안·preview
포함), 그리고 detector의 끊긴 참조 0건. STEP 5·6의 수치와 예외 요청 목록이 머지 설명에
들어 있다. owner가 모든 예외 요청에 판정을 지시했고(`unfixable`은 승인·반려, `out-of-authority`는
ⓐ·ⓑ·ⓒ), 반려된 항목은 고쳐졌고 ⓐ 항목은 world가 amend된 뒤 반영됐으며, owner가 머지를 승인했다.

