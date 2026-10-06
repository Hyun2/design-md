# Reference

## Library resolution (라이브러리 위치 해소)

reference library(`design-md`)는 머신마다 다른 곳에 있다. 경로를 문서에 박지 않고
**매번 해소**한다. 아래를 그대로 실행하고, 출력된 경로를 이후 모든 단계에서
`$DESIGN_MD_HOME`으로 쓴다.

```bash
specs() { n=0; for f in "$1"/*/DESIGN.md; do [ -f "$f" ] && n=$((n+1)); done; echo "$n"; }
for c in "$DESIGN_MD_HOME" "$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/design-md/home" 2>/dev/null)" \
         ./design-md ../design-md "$HOME/design-md" "$HOME/dev/design-md" \
         "$HOME/dev/apps/design-md" "$HOME/src/design-md" "$HOME/projects/design-md"; do
  [ -n "$c" ] && [ -d "$c" ] || continue
  n=$(specs "$c"); echo "checked: $c ($n specs)" >&2
  [ "$n" -ge 3 ] && { (cd "$c" && pwd); exit 0; }
done
exit 1
```

검증은 이름이 아니라 **library의 정체**로 한다 — 제품별 하위 디렉터리에 `DESIGN.md`가
3개 이상 있는 corpus만 library로 인정한다. 그 구조가 곧 library의 존재 이유라서, 저장소
안의 스크립트나 문서 파일이 이름을 바꾸거나 사라져도 해소는 계속 맞는다.

실패해도 조용히 넘어가지 않는다. 스니펫은 검사한 후보와 각 후보의 spec 개수를 stderr에
찍는다. `exit 1`이면 그 목록을 보고에 그대로 붙인다 — "후보가 하나도 없었다"와 "디렉터리는
있는데 spec이 0개였다"는 원인이 다르고, 후자는 library가 깨졌다는 신호다.

해소에 실패하면(exit 1) 순서대로 처리한다.

1. 홈 아래 3단계 깊이까지 `design-md` 디렉터리를 한 번 탐색하고, 위 검증을 적용한다
2. 그래도 없으면 **owner에게 한 번 묻는다**. 받은 경로는 `${XDG_CONFIG_HOME:-$HOME/.config}/design-md/home`에
   한 줄로 기록한다. 머신당 한 번만 묻게 된다. **owner 지정은 검증을 이긴다** — 받은 경로의
   spec 개수가 3 미만이어도 거부하지 않고, 그 개수를 보고한 뒤 그대로 쓴다
3. library가 그 머신에 아예 없으면 owner에게 기준 제품명을 직접 받거나 공개 자료로
   reference를 정하고, 보고에 "library 미사용"과 그 대체 근거를 명시한다. **reference
   단계는 어느 경우에도 수행한다**

library를 새로 받아야 하는 경우의 명령·동작은 그 저장소의 `README.md`에 있다.

## Reference selection (레퍼런스 선정)

**`$DESIGN_MD_HOME/AGENTS.md`를 먼저 읽고 그 절차를 그대로 따른다.** library 사용 규칙 —
두 함정, property 추출과 전수 scan, marketing surface / app surface 구분, 가져올
discipline과 버릴 clothes의 구분 — 의 단일 출처는 그 파일이다. 여기서는 이 protocol이
얹는 것만 적는다.

- 후보에 가중치를 줄 **mode**는 STEP 1에서 확정한 값을 쓴다
- 선정이 끝나면 그 reference의 `DESIGN.md`에서 이 surface에 적용할 **운용 기준 6~10개를
  수치로** 뽑는다. 이 수치가 STEP 5 comp와 STEP 7 측정의 기준이 된다

library가 그 머신에 없어 공개 자료로 대체한 경우에도 판단 기준은 같다: **discipline을
가져오고 clothes(색조·폰트 이름·로고·hero 같은 marketing 구조)는 버린다.**

## Comp fidelity conditions (시안 충실도 조건)

채택된 comp는 거의 그대로 출하된다. **comp의 fidelity 상한이 제품의 상한이다.**

| # | 조건 | 적용 |
|---|---|---|
| 1 | real data를 corpus에서 **sampling**한다. 작성 금지. **라벨도 data다** — 컨트롤의 문구는 운영 화면에서 **같은 역할**의 컨트롤이 쓰는 **라벨 출처**에서 온다. 손으로 옮긴 문자열 표는 작성이다 | STEP 3·5 |
| 2 | **worst case 포함**: 최장 제목, 값이 없는 항목, 한 field가 전부 같은 값인 경우. **활자 크기**를 정할 때 최장 제목 한 건은 판정의 단독 근거가 아니라 표본이다 — 가장 좁은 기기에서 코퍼스 전수를 넣어 줄 수 · 높이의 p50 · p90 · 최대와 FIRST VIEWPORT 요소가 첫 화면 안에 드는 비율로 판정한다. 2026-09 TuBrief(tubrief-v2#65)의 40px 제목은 최장 1건(390에서 9줄)으로 올라와 드문 문제처럼 보였지만, 제목 1,197개 중 탭 줄이 첫 화면 안에 든 것은 11.1%였다 | STEP 3·5 |
| 3 | rhythm이 보이는 개수: desktop 8개 이상, mobile 4개 이상 | STEP 3·5 |
| 4 | 제품이 출하하는 **모든 theme** | STEP 5 |
| 5 | **모든 state**가 comp 안에 존재: empty·loading·error·예외 | STEP 5 |
| 6 | **실제 font·token**. 임시 CDN 대체 금지. world가 집행층에 들어간 뒤(substrate pass 이후)에는 시안 범위가 토큰을 **다시 선언하지 않고** 운영 값을 그대로 읽는다 — 다른 값이 필요하면 G1 amendment다. 운영 값과 다른 토큰은 「Shipped-world check」가 잡고, 같은 값의 재선언은 시안 범위의 CSS에서 지운다 | STEP 3·5 |
| 7 | 화면에 **보이는 컨트롤은 전부 동작**한다. 동작시키지 않을 컨트롤은 `data-comp-inert="<사유>"` — 「operability check」가 판정. 컨트롤이 여는 **popup(select · menu · popover)도 후보 world로 그려진다** — preview 라우트는 portal이 붙는 컨테이너까지 world 범위를 싣는다(TuBrief: frame의 `<body>`에 `data-comp-world`). 운영 화면이 있으면 시안의 컨트롤은 운영 컨트롤과 **짝**을 이룬다. 새 컨트롤은 `data-comp-new="<사유>"`, 뺀 컨트롤은 사유를 달아 선언 — 「correspondence check」가 판정 | STEP 3·5 |
| 8 | 캡처 후 defect를 **스스로 scan**해 목록을 붙여 제출 | STEP 5 |
| 9 | 「Acceptance criteria」 표를 **comp 단계에서** 채움 | STEP 5 |
| 10 | 기기는 **폭×높이 쌍**이다: 390×844 / 768×1024 / 1440×900 / 1920×1080(`measure-surface.mjs --devices`의 기본값과 같다). frame 안의 `100dvh`는 이 높이로 풀린다. preview 셸은 frame 하나를 **창 안에 통째로** 들어오게 축소하고, 스크롤은 frame 안에서만 일어난다 — 「fit check」가 판정한다. 판정 창은 owner의 화면을 옮긴 값이 아니라 셸의 축소·배치를 시험하는 조건이다. 기기 **사이의** 폭은 측정기가 **폭 훑기**로 본다 — owner가 판단하는 기기는 네 개 그대로다 | STEP 5 |
| 11 | 측정기가 여는 **모든 문서**(셸 · 각 frame · 운영 화면 · 매 reload)는 핸들러가 붙은 뒤 `<html>`에 `data-comp-ready`를 단다. `networkidle`은 hydration 완료가 아니다. 30초 안에 없으면 측정 실패로 run이 멈춘다 — 「못 쟀다」이지 결함 0이 아니다. TuBrief는 `app/root.tsx`가 development에서만 단다 | STEP 5 |
| 12 | **폭을 grid·flex가 정하는 요소**(목록의 카드, 나란한 열)는 내부 배치를 화면 폭(`@media`, Tailwind `sm:` 등)이 아니라 **자기 폭**(`@container`)으로 정한다. 열 수가 늘어나는 화면 폭에서 요소는 좁아지는데 화면 폭 조건은 넓은 배치를 고른다 — 폭 훑기의 관계 기준 15는 그중 글자가 6em 미만의 칸에서 꺾이거나 잘린 경우를 잡는다 | STEP 3·5 |

9번이 핵심 장치다. ratio·surface layers·accent 면적·deletion test 실패가 owner가 고르기 전에
드러나므로, owner는 "촌스럽다"를 설명할 필요 없이 실패한 comp를 반려하면 된다.

1번의 라벨 문장은 2026-09 G1에서 왔다. 시안의 메인 검색창에 채널 드롭다운 **안의** 검색칸 문구
(`videos.channels.searchPlaceholder`, 「채널 검색...」)가 실려 owner가 검색 범위를 오인했다.
문구는 옳은 파일에서 왔고, 틀린 것은 **컨트롤**이었다. 같은 라운드의 다른 실패도 원인이 같다 —
「로케일 파일에서 라벨을 복사하라」는 지시가 라벨을 담을 요소를 발명하게 했다
(TuBrief `docs/design/direction-round-learnings.md` 5번). 라벨의 출처는 파일이 아니라 운영 화면의
컨트롤이다.

10번은 2026-09 G2에서 왔다. 셸이 frame을 기기 폭으로만 흉내 내고 높이를 1400px로 고정해서,
frame이 owner의 창보다 길었다. 그 결과 frame 안의 `100dvh`가 실제 화면보다 커졌고, 스크롤은
frame이 아니라 셸 페이지에서 일어났다. 기기 높이에 맞춘 배치(스크립트 패널 · 고정 탭 줄)는
붙지 않았고, owner는 판단할 수 없었다. 에이전트 검증은 frame URL을 직접 열었기 때문에 통과했다.
셸 페이지 자체가 스크롤되는 것은 금지하지 않는다. 셸 아래에 증거 영역을 둘 수 있다.
금지하는 것은 **frame이 창을 넘치는 것**이다.

12번은 2026-09 TuBrief 목록에서 왔다(tubrief-v2#64). 카드가 200px 썸네일을 `sm:flex-row`로 화면
폭 640px부터 제목 옆에 붙였는데, 목록이 1536px에서 2열 → 4열로 바뀌자 카드는 좁아지고 배치는
그대로였다. 제목 칸은 1535px에서 21.2em, 1536px에서 4.7em(22px 한 줄에 4~5자)이었다. 가장 좁은
칸(640px, 26px · 1.2em)은 기기 네 개 중 어느 폭에도 없었다. 수정은 카드 폭 560px 미만에서
썸네일을 제목 위로 올리는 `@container` 조건이다.

**폭 훑기(width sweep).** 측정기는 frame마다 frame URL을 따로 열어 창 폭을 `--sweep`(기본
390~1920px 사이 16의 배수 폭, 높이 900 — rem으로 쓴 breakpoint(`sm` 640 · `2xl` 1536)가 정확히 걸린다)으로 바꿔 가며 관계 기준 8~12 · 15 · 16을 판정한다. 컨트롤은 조작하지
않는다(동작 · 대응 · fit check는 기기 run이 한다). 결함은 나타난 폭 구간과 함께 한 줄로 실린다.
시작 폭이 390인 이유는 owner가 판단하는 가장 작은 기기이기 때문이다. breakpoint 값만 여는 방식은
쓰지 않는다: `@container` 값은 요소 폭이라 화면 폭으로 바꿀 수 없고, `minmax()` grid는 선언 없이
열 수를 바꾼다. `--sweep off`는 출력에 `sweep: null`을 남긴다 — 검사하지 않음이다.

### Operability check (동작 검사)

2026-09 G1에서 언어 필터·정렬·채널·GNB 언어가 핸들러 없는 정적 요소로 제출됐다. 당시 7번은
「concept이 **의존하는** interaction」만 요구했고, 그것을 검사하는 장치가 없었다. owner는
concept과 무관하게 **보이는 것을 누른다.** 이어진 라운드에서는 핸들러가 있었는데도 dev 서버가
빈 모듈을 서빙해 hydration이 실패했고 전 컨트롤이 죽은 채로 넘어갔다 — 검증이 SSR HTML만
봤고, 브라우저 검증은 마지막 파일 쓰기 **이전**이었다.

그래서 7번은 규칙이 아니라 `scripts/measure-surface.mjs`의 한 단계다. 측정과 같은 실행에서 돈다.

| 항목 | 규약 |
|---|---|
| 입력 | **owner가 여는 URL.** 페이지 URL과 origin이 같고 `null`이 아닌 iframe이 있으면(preview 셸) 각 frame 안에서 측정·조작한다. frame URL을 직접 열어 통과한 것은 통과가 아니다. 나머지 iframe(URL origin이 `null`인 `data:` · `srcdoc` 포함)은 surface가 품은 embed(영상 플레이어)다 — ready를 기다리거나 안을 조작하지 않고 surface의 일부로 재며, URL을 출력 `embeds`에 싣는다. 2026-10 TuBrief #113에서 YouTube embed를 품은 운영 화면이 셸로 오인되어, embed의 `data-comp-ready`를 30초 기다리다 멈췄다 |
| 대상 | 보이는 대화형 요소(`button` · `a[href]` · `input` · `select` · `textarea` · 대화형 ARIA role) **∪ `data-comp-control` ∪ `aria-current` 항목과 그 형제**. 뒤의 둘이 컨트롤처럼 칠해진 `<span>`(가짜 테마 토글, 가짜 GNB 메뉴)을 잡는다. 컨트롤을 품은 그룹은 그 안의 컨트롤로 판정한다. **셋 다 없는 칠해진 span은 보이지 않는다** — 컨트롤로 보이게 칠했으면 `data-comp-control`을 단다 |
| 조작 | 텍스트 입력은 한 글자 입력, 나머지는 클릭. 반응이 있었던 대상 뒤에는 frame을 다시 로드한다 — 열린 popup이 다음 판정을 오염시키지 않게. 그 사이 셸 문서가 통째로 바뀌면(dev 서버의 전체 새로 고침) 새 셸에서 같은 순번의 frame을 다시 찾아 이어 재고, 횟수를 `operability.shellReloads`에 싣는다. 다시 찾지 못하면 그때까지의 출력을 쓰고 「못 쟀다」로 exit 1 — 2026-10 TuBrief #116에서 옛 셸의 iframe으로 reload하다 `Execution context was destroyed`로 출력 없이 죽었다 |
| 판정 | `document` 전체의 DOM 변경 · URL 변경 · 스크롤 중 하나라도 있으면 live. portal popup은 surface 루트 밖에 그려지므로 루트만 보면 놓친다. 텍스트 입력의 `value` 변화는 핸들러 없이도 생기므로 세지 않는다. **읽는 시점**: 누른 뒤 600ms(텍스트 입력 1500ms)를 기다리고, 이어서 그 frame에서 누르기 직전 이후 시작된 요청(fetch · xhr · script)이 전부 끝나거나 실패하고 그 frame의 요청이 200ms 동안 시작도 끝도 하지 않을 때까지 기다린다. 이 추가 대기는 최대 10초이고, 상한에 닿으면 요청이 남아 있어도 읽는다. client-side route 변경은 loader 요청이 돌아온 뒤에야 URL과 선택을 옮긴다 — 2026-10 TuBrief #111에서 언어 링크의 loader가 0.6~0.9초 걸려, 고정 600ms 판독이 실행마다 다른 후보를 dead로 냈다 |
| 선택된 컨트롤 | **selected control**은 다시 눌러도 그대로인 것이 정상이므로, 첫 클릭에 변화가 없으면 frame을 다시 로드해 **같은 그룹의 선택되지 않은 형제**를 먼저 누르고 대상을 다시 판정한다(재시도). 그룹: tab → `tablist`, option → `listbox`, radio → `radiogroup` 또는 같은 `name`, menuitemradio → `menu`/`menubar`/`group`, `aria-current` → 다른 대상을 품은 가장 가까운 조상(3단 이내). 형제가 없으면 dead(`selected, no sibling to leave by`), 형제가 선택을 가져가지 않으면 dead, 형제가 페이지를 떠나면 — frame의 URL이 바뀌면, query만 바뀌어도 — 면제(`sibling navigates away` — nav의 현재 항목). 결과는 전부 `operability.reselected`에 `via`(누른 형제)와 `verdict`(live · dead · exempt)로 실린다. 2026-09 TuBrief Reader 시안의 「요약」 탭이 핸들러가 있는데도 매 실행 dead로 exit 1을 내서, 다른 실패를 exit 코드로 판정할 수 없었다(#51) |
| 재판정 | dead 판정, 그리고 문서가 같은 URL에서 통째로 바뀌었거나 frame이 떨어져 나간 live 판정은 frame을 다시 로드해 **한 번 더** 판정한다. 둘이 같으면 그 판정, 다르면 `operability.unstable`(첫째·둘째 판정)에 싣는다 — 결함도 통과도 아닌 측정 실패다. 2026-09 TuBrief #79에서 의존성을 아직 묶지 않은 dev 서버가 검사 도중 페이지를 새로 고쳐, 같은 commit이 live 컨트롤 2~4개를 한 번은 dead, 다음 실행은 live로 냈다. 한 번의 판정은 컨트롤과 환경을 가르지 못한다. 재판정은 같은 브라우저 세션 · 같은 서버에서 하므로 원인이 몇 초 이어지면 둘 다 dead다(2026-10 TuBrief #124, 다음 실행은 live). 그래서 dead · `unstable` 항목은 판정마다 `judgements`(ready 뒤 누르기까지 ms · 누른 뒤 읽기까지 ms · 읽을 때 끝나지 않은 요청 · 그 문서의 콘솔 오류와 경고, 반응이 없던 판정은 스크린샷 id)를 싣는다 — 환경 탓인지 컨트롤 탓인지는 이 기록으로 가린다 |
| 면제 | `data-comp-inert="<사유>"`(요소 또는 조상). 출력의 `operability.inert`가 곧 제출용 비동작 목록이다. 사유가 비면 dead |
| popup의 world | live인 컨트롤이 연 popup이 surface 루트 **밖**에 있으면, 루트가 `<html>`과 다르게 해석하는 커스텀 프로퍼티 전부를 popup의 **컨테이너**(portal이 붙은 요소)에서 다시 읽어 루트 값과 비교한다. 하나라도 다르면 `operability.unscopedPopups`에 실린다. 토큰 이름은 스타일시트에서 모으므로 프로젝트 어휘를 쓰지 않는다. 컨테이너에서 읽는 이유: popup이 자기 위에서 토큰을 다시 가리키는 것은 정당한 scoped re-point다. 2026-09 TuBrief #39에서 C 열의 정렬 메뉴가 운영 팔레트와 글꼴로 떴다 |
| 실패 | dead 1개 이상 · `unstable` 1개 이상 · pageerror 1건 이상 · `unscopedPopups` 1건 이상 → JSON은 끝까지 쓰고 exit 1. 실패한 run은 `--out` 옆 `<out>.failed-<시각>.json`(실패 줄 `_failed` · 스크린샷 `_screenshots` 포함)에도 남아, 같은 `--out`으로 다시 돌려도 지워지지 않는다. 읽은 뒤 증거로 commit하거나 지운다 — commit되지 않은 채 HEAD가 바뀌면 다음 측정이 dirty로 거부된다 |

**「마지막 쓰기 뒤」는 약속이 아니라 대조 가능한 사실이다.** 출력의 `_provenance`에 측정한
`commit`과, dirty에서 제외한 경로의 `ignored`가 실린다. 현재 commit을 `_provenance.commit`에 기록한
JSON 측정 출력만 dirty로 세지 않는다. 그 밖에 commit되지 않은 변경(미추적 파일 포함)이 하나라도 있으면
측정기는 브라우저를 띄우기 전에 그 경로들을 출력하고 exit 1로 멈춘다 — 아무것도 재지 않고 JSON도
쓰지 않는다. 공정 단계가 남긴 파일도 같으므로 commit한 뒤 잰다: 2026-10 TuBrief(tubrief-v2 #129)에서
STEP 8 critique snapshot이 미추적으로 남아, 측정 4개가 run을 다 돈 뒤에야 dirty로 실패했다. 제출은
그 commit을 명시하고, 제출물의 commit과 측정 commit이 다르면 측정은 무효다. 포맷터가 측정 뒤에 파일을
쓰면 commit이 바뀌거나 다음 측정이 거부되어 드러난다.

**기계가 못 보는 절반.** 이 검사는 「죽었다」만 잡는다. 「엉뚱하게 동작한다」는 제출에 **조작 결과
대응표**를 붙여 owner가 본다 — 컨트롤마다 1번째/2번째 조작의 결과와, 운영 화면에서 같은 조작의
결과를 나란히(2026-09 TuBrief #39 구현 보고의 형식).

### Correspondence check (대응 검사)

1번의 라벨 출처와 7번의 짝은 규칙이 아니라 `measure-surface.mjs --baseline <운영 URL>`의 한
단계다. 동작 검사와 같은 실행에서, 같은 컨트롤 목록으로 돈다.

| 항목 | 규약 |
|---|---|
| 입력 | `--urls`마다 운영 화면 하나. 운영 화면은 frame과 **같은 상태**를 연다: 같은 locale · 같은 레코드 · 같은 콘텐츠 언어 · 같은 theme. UI 언어와 콘텐츠 언어가 따로 있는 제품은 호출부가 둘 다 맞춘다 — 2026-09 G2에서 `/ar` 운영 화면이 ar 요약을 열어, ko 요약을 읽는 frame의 타임라인 라벨이 짝을 잃었다. frame은 자기 크기로 운영 화면과 비교한다. 로그인이나 데이터가 있어야 그려지는 컨트롤이 있으면 운영 화면을 **여러 상태**로 연다 — `|`로 잇고, 로그인 상태는 `signed-in:<URL>`로 적어 `--storage-state` 파일로 연다. 어느 한 상태에라도 있는 컨트롤은 시안이 짝짓거나 선언한다. 상태마다 다른 컨트롤(로그인 버튼 · 사용자 메뉴)은 시안에 없는 쪽을 `data-comp-dropped`로 선언한다. 출력 `correspondence.baseline`이 연 상태 목록이다 — 2026-10 TuBrief #114에서 운영 화면을 로그인 없이만 열어, 재생목록 권한과 문맥이 있어야 그려지는 재생목록 시트를 뺀 G2 시안이 통과했다 |
| 목록 | 쉴 때 surface에 있는 컨트롤 + 동작 검사가 누른 뒤 새로 보인 컨트롤: 연 **popup 안의** 컨트롤(dialog · listbox · menu · `[popover]`)과, URL이 그대로일 때 탭 · 접힌 영역이 제자리에서 펼친 surface 컨트롤. 둘 다 reload 전에 읽는다. 2026-10 TuBrief #114에서 토글이 펼치는 스크립트 패널 안의 「내려받기」가 운영 목록에 없어, 그것을 뺀 G2 시안이 통과했다 |
| 짝 | (종류, 자리, 라벨)이 맞으면 짝이다. 종류는 `text`(입력칸)와 `action`(나머지) 둘뿐이다. 자리는 `surface` / `popup`. 라벨은 aria-label · placeholder · title · 글자 중 하나라도 같으면 맞다 |
| 목록형 | 한 자리에 5개 이상 반복된 **링크**, 또는 누른 뒤 제자리에서 펼쳐진 **반복 행**이고 라벨이 서로 다르면 data(상세로 가는 카드 · 스크립트 행)다. 시안은 corpus에서 뽑고 운영은 DB에서 가져오므로 **목록이 있는지**만 짝짓는다. 쉴 때 보이는 링크가 아닌 반복(주제 칩 · 필터 · 언어 메뉴)은 하나씩 짝짓는다. G1 시안에서는 손으로 쓴 주제 칩 · 필터 셋 · 검색칸이 형제 `span` 12개였고, 라벨이 다양한 반복을 data로 치는 규칙은 어떤 형태든 검색칸을 「12개짜리 목록」에 숨겼다. 펼쳐진 행을 하나씩 짝지으면 2026-10 TuBrief #114에서 스크립트 탭의 재생 버튼 행이 시안 312 · 운영 159건의 불일치로 나왔다 |
| 안을 볼 수 없는 영역 | 운영 화면에서 보이는 다른 origin의 iframe(embed — 영상 플레이어 · 지도 · 결제 위젯)과 브라우저가 컨트롤을 그리는 `video[controls]` · `audio[controls]`. 그 안의 조작은 목록에 들어오지 않으므로, 시안이 영역마다 무엇을 유지하고 무엇을 뺐는지 선언한다. 영역 이름은 embed URL의 host(`www.youtube.com`), host가 없으면 protocol(`data:` · `about:`), 브라우저 미디어는 `video` · `audio`다 — 2026-10 TuBrief #115에서 G2 구성이 플레이어의 재생 막대 · 전체화면 · 음량 · 자막 메뉴를 없앴는데, 검사도 gate도 owner에게 묻지 않았다 |
| 선언 | 새 컨트롤 `data-comp-new="<사유>"`(요소 또는 조상). 뺀 운영 컨트롤 `<i hidden data-comp-dropped="<운영 라벨>">사유</i>`. 안을 볼 수 없는 영역 `<i hidden data-comp-opaque="<영역 이름>">유지하고 뺀 조작과 사유</i>`. 출력의 `correspondence.new` · `.dropped` · `.opaque`가 곧 제출용 목록이다. 어느 운영 상태에도 대응하는 컨트롤 · 영역이 없는 dropped · opaque 선언은 `correspondence.unchecked`에 실린다 — 실패는 아니지만 어떤 명령도 읽지 않은 문장이라, owner는 미검사임을 알고 한 줄씩 승인한다. 그 상태를 열 수 있게 되면 `--baseline`에 더해 목록을 비운다. 2026-10 TuBrief #120에서 Reader 시안이 YouTube와 Local `video` 두 영역을 선언했는데, baseline이 YouTube 레코드 하나라 `video` 문장은 출력에 나오지 않은 채 승인됐다 |
| 실패 | 짝 없고 선언 없는 시안 컨트롤(`unpaired`) · 시안에 없고 선언 없는 운영 컨트롤(`missing`) · 선언 없는 안을 볼 수 없는 영역(`undeclaredOpaque`) · 사유가 빈 선언 → exit 1 |
| 비교 대상 없음 | `--baseline` 없이 돌면 `correspondence.baseline: null`. **검사하지 않음**이지 불일치 0건이 아니다. 운영 화면이 없는 새 프로젝트는 제출에 그 사실을 적는다 |

**역할은 ARIA role이 아니다.** 역할은 컨트롤이 **무엇에 작용하는가**다. G1의 메인 검색칸과 채널
드롭다운 안 검색칸은 둘 다 검색칸이었고, 걸러 내는 대상만 달랐다. 기계는 작용 대상을 모르므로
(종류, 자리)로 근사한다. 이 사례에서는 운영 화면의 「채널 검색...」이 popup 안에만 있으므로 surface에
놓인 시안의 「채널 검색...」은 짝을 얻지 못한다. **알려진 한계:** 같은 자리에 대상만 다른 같은
종류의 컨트롤이 둘 있고 두 라벨이 서로 바뀌면 잡지 못한다. 종류를 ARIA role보다 거칠게 두는 것은
의도다. TuBrief에서 같은 로그인 컨트롤이 시안에서는 `span`, 운영에서는 `a[role=button]`이었다. 채널
선택도 한쪽은 button, 다른 쪽은 combobox였다.

### Shipped-world check (출하 world 검사)

world가 집행층에 들어간 뒤의 시안(STEP 5)은 `--baseline`에 더해 `--shipped-world`로 잰다. 측정기는
스타일시트의 커스텀 프로퍼티를 전부 모아 시안의 `--root`와 운영 화면의 `<body>`에서 해석하고, 운영
화면에 값이 있는 이름 중 하나라도 값이 다르면 exit 1이다(`tokens.drift`). 운영 화면에서 비어 있는
이름은 시안 전용이라 비교하지 않는다. 플래그 없이 돌면 `tokens: null` — 검사하지 않음이다. G1의
후보는 운영과 일부러 다르므로 이 플래그를 주지 않는다. 운영 화면을 여러 상태로 열면 토큰은 **첫 상태**에서만 읽고
`tokens.baseline`에 그 URL을 싣는다 — 토큰은 세션이 아니라 world의 값이다.

2026-09 G2에서 시안 범위가 substrate 이전의 `--font-sans` 사본을 다시 선언해, 시안의 한글이 운영
화면과 다른 글꼴로 그려졌다. 「Operability check」의 popup 검사는 surface와 popup이 **서로** 같은지만
보므로, 낡은 사본을 popup에까지 강제한 수정도 통과했다. 어느 쪽이 운영 값인지는 이 검사가 본다.

## Acceptance criteria (수용 기준)

모든 UI 배송은 아래를 **수치로** 보고한다. "통과했다"는 보고가 아니다.

| # | 기준 | 기본 threshold |
|---|---|---|
| 1 | Dominant-element ratio: 이 surface에서 가장 큰 활자 ÷ body 크기 | ≥ 2.5 |
| 2 | Surface layers: surface가 쓰는 면의 단 수와 인접 단 사이 lightness gap | ≥ 3 layers, ΔL ≥ 0.06 |
| 3 | 선택·활성 state의 lightness gap — 가장 중요한 구분에 가장 큰 lightness를 쓴다 | ΔL ≥ 0.10 |
| 4 | Accent가 region을 갖는다. accent 면을 소유하는 요소마다 `data-comp-accent="1"`을 달고, 측정기는 **그 요소들의 computed 배경색**을 accent로 읽는다 — 토큰 이름으로 찾지 않는다 | 12px 미만 element에만 나타나면 실패. **보이는 owner 0개 · 배경이 투명한 owner · owner끼리 색이 다름은 측정 실패**(exit 1): 2026-09 TuBrief에서 지운 토큰이 owner를 투명하게 만들었고, 토큰으로 찾던 측정기는 면적 0을 조용히 냈다 |
| 5 | Information entropy | 단일 값이 행의 90% 이상을 덮는 field는 표시하지 않는다 |
| 6 | Deletion test를 모든 element가 통과 | 추상어 답변은 실패 |
| 7 | Reference comparison | 가져온 discipline과 버린 것을 나열(`$DESIGN_MD_HOME/AGENTS.md`의 보고 의무) |

**threshold는 기본값이다.** 프로젝트가 다른 값을 써야 하면 그 프로젝트 `DESIGN.md`에 해당
항목만 적고, 그 값이 기본값을 이긴다. 값이 화면 폭에 따라 다르면 폭 구간별로 적고, 보고는 run의
폭에 해당하는 값과 비교한다(TuBrief 기준 1: 640px 미만 2.0, 이상 2.5). 적힌 것이 없으면 위 표가
그 프로젝트의 기준이다.

**줄당 글자 수(line length)는 재서 보고하고, 판정은 문장 대조표가 한다.** 측정기는 제목이 아닌 보이는 글
블록마다 완전 줄(블록의 마지막 줄을 뺀 줄 — 그 줄은 글이 끝나서 짧다)의 grapheme(공백 포함)을 렌더에서
세어 블록의 `lang`별로 p50 · p90 · 최대를 내고, 한글 음절 · CJK 글자는 p50을, 문자 체계는 비율을
보고하며, grapheme p50이 큰 블록 5개를 함께 낸다(출력 `lineLength`, 콘솔 `line length [<lang>]` 줄. 폭
훑기에서는 재지 않는다). 기본 threshold는 없다 — 프로젝트 `DESIGN.md`의 행폭 문장이 기준이고, STEP 5의
문장 대조표가 이 수를 그 문장과 대조한다. 블록의 문자 체계 비율이 그 `lang`과 어긋나면(`ko` 묶음에 라틴
1.0) 그 블록에 명시되거나 상속된 `lang`을 확인한다.

threshold가 무엇을 잡아내는지 보여주는 실패 사례 수치(2026-09 비디오 목록, 교정 전):
dominant-element ratio **1.2배**(24÷20px) · surface 2 layers(0.963/0.908) · 활성 state
ΔL **0.055**인데 card↔ground에는 0.143을 씀 · accent 면적 1% 미만 · state 값 100% 동일 ·
deletion test 3건 실패(legend·state stamp·thumbnail chip). correctness gate는 전부 통과한
상태였다.

## Glossary (용어)

| 용어 | 뜻 |
|---|---|
| **world(세계)** | 재료와 문법: palette·재질, corner 정책, elevation 정책, type family의 역할 분담, state 표현 방식. STEP 3에서 확정되고 이후 고정. 바꾸면 다른 제품처럼 보인다 |
| **composition(구성)** | 그 재료를 어디에 얼마나 크게 놓는가: element의 위치, dominant element의 크기, 한 surface 항목 수, column 수, 이미지 유무와 크기. STEP 5에서 탐색. 바꾸면 같은 제품의 다른 버전처럼 보인다 |
| **the roll(주사위)** | `impeccable concept-seed`. 정렬된 후보 중 몇 번을 빌드할지 무작위 배정한다. 목적은 모델의 ranking bias 차단 |
| **owner 지정** | owner가 direction·미감·소재를 못 박는 것. **항상 the roll을 이긴다** |
| **QUALITY BAR** | `concept-seed`가 딜한 카탈로그 challenger의 완성도 기준 렌더(`impeccable.style/worlds/cards/<source-id>.webp`). 빌드가 도달해야 할 마감 수준이며, 베낄 mockup이 아니다. 직접 도출한 후보에는 존재하지 않는다 |
| **deletion test(삭제 테스트)** | element마다 "지우면 사용자가 무엇을 잃는가"를 한 줄로 답한다. 답이 "일관성"·"완성도" 같은 추상어면 지운다 |
| **operability check(동작 검사)** | 보이는 컨트롤을 실제로 조작해 반응이 있는지 보는 제출 전 검사. 「Comp fidelity conditions」 7번의 판정 수단이며, 면제는 `data-comp-inert="<사유>"` |
| **selected control(선택된 컨트롤)** | 다시 눌러도 상태가 바뀌지 않는 것이 정상인 컨트롤: `aria-selected="true"` · `aria-current`(값이 `false`가 아님) · `aria-checked="true"`인 `radio`/`menuitemradio` · 체크된 `input[type=radio]`. `aria-pressed` · checkbox · switch는 누르면 뒤집혀야 하므로 **해당하지 않는다**. operability check는 이것을 형제로 한 번 떠났다가 다시 누른다 |
| **label source(라벨 출처)** | 운영 화면이 컨트롤의 문구를 가져오는 참조. 라이브러리마다 다르다: react-i18next는 번역 키(`t("videos.search.placeholder")`), FormatJS는 메시지 ID, i18n이 없으면 소스 리터럴의 위치. 「Comp fidelity conditions」 1번의 대상 |
| **correspondence check(대응 검사)** | 시안의 컨트롤을 운영 화면의 컨트롤과 짝짓고, 안을 볼 수 없는 영역은 선언으로 확인하는 제출 전 검사. 「Comp fidelity conditions」 1·7번의 판정 수단이며, 입력 · 짝짓기 · 선언 규약은 「Correspondence check」를 따른다 |
| **fit check(맞춤 검사)** | 조작 전에 frame마다 두 가지를 보는 제출 전 검사: 크기(`innerWidth`×`innerHeight`)가 `--devices`의 기기 쌍 중 하나인가, 축소가 반영된 화면상 사각형이 창 안에 전부 들어오는가. 「Comp fidelity conditions」 10번의 판정 수단이다. 창(`--viewport` × `--height`)은 시험 조건이다 — 창에 맞춰 축소하는 셸은 어떤 창에도 들어가므로, 이 검사가 잡는 것은 축소·배치가 틀린 셸이다(2026-09: RTL에서 frame이 창 왼쪽 밖에 그려짐, 1280×720·1440×900 둘 다) |
| **shipped-world check(출하 world 검사)** | 시안 루트에서 해석된 토큰 값을 운영 화면의 값과 비교하는 제출 전 검사(`--shipped-world`). 「Comp fidelity conditions」 6번의 판정 수단이며, world가 집행층에 들어간 뒤에만 쓴다 |

## Owner feedback templates (오너 피드백 템플릿)

기본은 acceptance criteria의 자기 보고다. 아래는 그것으로 잡히지 않을 때 owner가 쓴다.

**Element별 지적**

```
[위치] 파일 / 화면상 위치
[현상] 무엇이 보이는가
[왜 문제] 정보가 없다 / 의미 불명 / hierarchy 파괴 / 촌스럽다
[기대] 어떻게 되길 원하는가
[판정] kill / redesign / keep
```

`[판정]`이 있으면 에이전트는 되묻지 않고 실행한다.

**Comp 평가**

```
A안: 좋음 - … / 나쁨 - … / 지울 것 - …
B안: 좋음 - … / 나쁨 - … / 지울 것 - …
결론: A의 composition + B의 <element>. <element>는 없애거나 크게.
```

**Aesthetic 지적 3문장**

```
1. 무엇이 촌스러운가:   (element 이름)
2. 무엇과 비교해서:     (design-md/<slug> 또는 실제 제품 이름)
3. 무엇을 포기해도 되나: (density / 정보량 / 기능 중 하나)
```

3번이 결정적이다. aesthetic 개선은 거의 항상 무언가를 포기해야 얻어진다. 포기 대상이
지정되지 않으면 에이전트는 아무것도 버리지 못하고 덧붙이기만 한다.

**Round 종료 압박을 받았을 때**

> "이건 decision round다. 종료는 내가 정한다. 다음 round를 만들어라."

## Relational acceptance criteria (관계 기준 8~12 · 14~16)

위 「Acceptance criteria」 7개는 전부 **요소 하나**의 속성이다(얼마나 큰가, 얼마나 밝은가,
얼마나 진한가). 그런데 owner가 먼저 알아채는 결함은 거의 항상 **요소 사이**에 있다. 2026-09
TuBrief G1 라운드에서 기준 1~7을 전부 통과한 상태로 owner가 지적한 결함 6건이 모두 관계적
이었다. 그래서 아래 기준을 라운드마다 함께 **수치로** 보고하고, 결함을 가른다고 실측된 것은
run을 실패시킨다.

| # | 기준 | threshold | 판정 | 무엇을 잡는가 |
|---|---|---|---|---|
| 8 | **Control height spread** — **한 줄**(세로 범위가 겹치는 컨트롤)마다, 그 줄의 **화면에 보이는** 컨트롤의 높이 분산. disabled는 보이므로 센다. 숨겨서 뺀 개수는 `controls.hiddenExcluded`로 함께 나온다. 보이는 `data-comp-control`이 **0개면 측정 실패**다 | 줄마다 **0px** | **exit 1** | 30px 테마 그룹 옆의 36px 언어 칩. 390px에서 숨긴 테마 그룹을 0px로 세어 spread 36을 냈던 오보(2026-09 TuBrief #39)는 「보이는」 정의로, 표식 없는 chrome이 spread 0으로 통과하던 것은 0개 = 실패로 사라진다 |
| 9 | **Media crop** — 화면에 **보이는** 너비 200px 초과 그림마다 **보이는 그림 비율** = fit × clip × 가려지지 않은 몫. fit: `object-fit` cover/none인 그림의 박스 비 ÷ **선언 비율**(그림이나 감싼 박스의 CSS `aspect-ratio`, 선언이 없을 때만 원본 파일 비). clip: `overflow` hidden/clip 조상 안에 남은 넓이. 가려지지 않은 몫: 그림 위 20×20 점 중 그 위에 칠해진 것(배경·배경 이미지·글자·이미지·SVG)이 없는 점. 측정 전에 그림을 화면 안으로 스크롤한다. 선언 비율도 로딩된 파일도 없으면 **측정 실패** | **≥ 95%** | **exit 1** | 그림 위에 얹은 제목 띠(목록 대표 카드 21~50%, 수정 후 96~100%). `aspect-*` 박스에 높이 상한을 걸어 넓어진 박스가 위아래를 자르는 것. 원본 파일 비로 재던 옛 정의는 4:3 파일에 16:9 영상과 검은 띠가 든 YouTube 썸네일을 늘 75%로 읽어 결함과 수정본을 가르지 못했다 |
| 10 | **Column void** — **같은 행**(세로 범위가 겹치고 가로 범위가 겹치지 않는 형제, 부모는 grid 또는 가로 flex)에 놓인 **칠해진 상자**(바탕을 바꾸는 배경색 · 배경 이미지 · 테두리 · 그림자)마다, 상자 안에서 **글자 줄 · 그림 · 칠해진 하위 상자가 하나도 닿지 않는 가장 긴 세로 구간**(빈 띠). 위치는 가리지 않는다 — 중간이든 바닥이든. 높이 차이는 재지 않는다. 칠하지 않은 컬럼이 짧게 끝나면 그 아래는 페이지 바탕이지 빈 상자가 아니다 | 빈 띠 **≥ 4rem 그리고 ≥ 상자 높이의 15%**면 실패 | **exit 1** | 옆 무대 높이로 늘린 요약 상자 가운데의 350px(53%) 빈 띠 — `flex-1` 목록이 메타 줄을 바닥에 붙여 바닥 여백은 2.7%뿐이었다. 수정본은 상자를 내용에서 끝내 19px(4.8%). grid가 형제 카드 높이로 늘린 카드의 바닥 빈 띠(1920 목록 170~331px)도 같은 결함이다. 옛 정의(높이 분산 + `scrollHeight ÷ 높이`)는 결함을 통과시키고 수정본을 실패시켰다(tubrief-v2#62) |
| 11 | **Heading fill** — display 크기(≥ 28px) 제목 중 **두 줄 이상으로 꺾인 것**의 가장 긴 줄 ÷ **제목 자신의 content box 폭**(기준 15의 칸과 같다). 한 줄로 끝나는 제목은 단어만큼 긴 것이므로 판정하지 않는다. 실패는 **줄바꿈 방식이 줄을 덜 채운 것**뿐이다 — 같은 칸에서 일반 `wrap`으로 다시 배치하면 가장 긴 줄이 길어질 때. 일반 `wrap`은 다음 끊을 수 있는 단위가 들어갈 때까지 줄을 채우므로 `wrap` 제목은 이 기준에 걸리지 않는다. 실패 줄은 제목의 `text-wrap`과 일반 `wrap`으로 다시 잰 줄 수 · 사용률을 싣는다(출력 `headings[].plainWrap`) | **≥ 70%** | **exit 1** | `text-balance`가 만든 짧은 4줄. 2026-09 TuBrief(tubrief-v2#65)는 이 실패를 제목 크기 탓으로 돌렸는데, balance를 끄면 실패율이 모든 폭에서 0.4% 이하였고 크기를 줄이면 8.0% → 29.9%로 늘었다. 옛 정의(부모의 padding 포함 폭 · 줄바꿈 방식 무관)는 다음 어절을 붙이면 455px로 426px 칸을 넘는 이미 꽉 찬 `wrap` 제목을 68.7%로 실패시켰다(tubrief-v2#108). `<br>`로 짧게 끊은 줄과 제목 자체의 `max-width`로 줄인 칸은 보지 않는다 |
| 12 | **Duplicate text** — 화면에 **보이는** 요소의 24자 이상 동일 문자열의 중복 출현. CSS로 잘라 보인 사본은 같은 문자열이므로 잡히고, 코드에서 잘라 붙인 접두어는 다른 문자열이라 잡히지 않는다 | **0건** | **exit 1** | 아래 블록이 할 말을 위에서 잘라 보여주기 |
| 14 | **Control kind mix** — 동작 검사가 컨트롤을 눌러 본 결과로 **종류**를 가른다: 경로가 바뀌면 `leave`(페이지를 떠남), 스크롤·해시만 바뀌면 `in-page`, popup이 열리면 `opens`, 경로는 같고 query나 화면 내용이 바뀌면 `setting`. 같은 줄이고 가장 가까운 flex/grid 조상이 같은 컨트롤 중 **종류가 다른데 모양이 같은** 쌍. 모양은 높이 · 네 변의 테두리 폭과 색 · 합성된 배경색 · 모서리 · 글자 굵기와 크기. 출력 `operability.kinds` · `relational.kindMix` | **0쌍** | **exit 1** | 「목록으로 돌아가기」(leave) · 「설명」(in-page) · 언어 칩(setting)이 한 묶음에서 같은 테두리 + 36px(2026-09 G2, owner 지적). 기준 8의 「한 줄은 같은 높이」는 같은 줄에 무엇이든 놓아도 된다는 뜻이 아니다 — 종류가 다르면 자리나 테두리·채움으로 가른다 |
| 15 | **Text measure** — 화면에 **보이는** 글자 중 칸이 부러뜨린 것: **두 줄 이상으로 꺾였거나**, 말줄임(`text-overflow: ellipsis`)·`line-clamp`로 **한 줄에서 잘린** 것. 칸 폭 = 그 글자가 놓인 블록의 content box 폭, **em** = 칸 폭 ÷ 그 글자의 크기. 한 줄에 다 들어간 라벨은 칸이 좁아도 판정하지 않는다. 기기 run과 폭 훑기 둘 다에서 판정한다. 출력 `textMeasure.narrowest` · `sweep.narrowest` | **≥ 6em** | **exit 1** | 썸네일 옆 22px 목록 제목 칸 640px 26px(1.2em) · 768px 90px(4.1em) · 1536~1920px 104px(4.7em). 카드를 늘리지 않는 수정만으로 기준 10은 0건이 됐지만 빈자리는 카드 사이로 옮겨 갔다(tubrief-v2#64). 수정본의 390px 이상 최솟값은 7.6em(40px 상세 제목) · 잘린 한 줄 12.5em. 6em은 이 둘 사이, n=1 프로젝트 |
| 16 | **Word split** — 화면에 **보이는** 제목(`h1`~`h6`, 크기 무관 — 카드 제목도 제목이다)과 **16px보다 큰 글자**(태그 무관. 16px은 브라우저 기본 본문 크기이자 측정기 `dominant.ratioTo16`의 기준선)의 줄이 바뀐 자리 중, 양옆 글자가 둘 다 문자나 숫자이고 사이에 공백 · `<br>` · 블록 경계가 없으며 **하나 이상이 한글**인 자리(「물어보세 ⏎ 요」). 16px 이하 본문은 판정하지 않는다. `lang`이 아니라 그려진 글자로 가리므로 영어 페이지의 한국어 제목도 잡힌다. 기기 run과 폭 훑기 둘 다에서 판정한다. 출력 `relational.wordSplits`(자리별 앞뒤 글자) | **0건** | **exit 1** | `word-break: normal`이 음절 사이에서 끊은 한국어 제목. 2026-10 TuBrief Reader 1안 제목(`balance` · `normal`)은 ko 제목 1,213개의 37.9%(390px에서 83.3%)를 어절 안에서 끊었는데 모든 측정이 통과했다. 고치는 수단은 `word-break: keep-all`(tubrief-v2#107). 대상을 태그로만 고르던 때는 제목 크기(22px)로 올린 `<p>` 핵심 요약의 「부담 ⏎ 은」을 통과시켰다(tubrief-v2#122) |

**판정.** 기준 8~12 · 14~16은 **결함 commit에서 실패하고 수정 commit에서 통과하는 것을 실측한 뒤**
gate가 되었다(2026-09 TuBrief). 새 관계 기준도 같은 순서를 밟는다: red/green을 재기 전에는
보고만 한다.

**예외.** 의도한 예외는 요소(또는 조상)에 `data-comp-exempt="<8|9|10|11|12|14|15|16>: <사유>"`를 단다. 여럿이면
`;`로 잇는다. 컨트롤이 하나도 없는 화면은 루트에 `8: <사유>`. 예외 요소는 판정에서 빠지고 출력
`relational.exempted`에 사유와 함께 실린다. 단, 12번은 화면에서 24자 이상 요소 고유 텍스트를 예외 여부와
무관하게 센 뒤, 중복 그룹에 속한 예외 요소만 싣는다. **run은 통과하지만 승인은 owner가 한다** — 제출은 이
목록을 수용 기준 표에 싣고, owner가 gate에서 한 줄씩 승인하거나 반려한다(STEP 7 완료 조건의
「owner가 승인한 예외 사유」와 같은 것이다). 기준 번호가 8~12 · 14~16이 아니거나 사유가 빈 선언은
그 자체로 exit 1이다. 예외의 개수는 곧 임계값의 오탐 표본이다.

**구현.** `scripts/measure-surface.mjs`가 렌더된 DOM에서 읽는다(TuBrief 호출부:
`scripts/comp-measure.ts`). 마크업 계약은 둘이다 — 8번의 `data-comp-control="<이름>"`, 4번의
`data-comp-accent="1"`. 나머지는 마크업 없이 측정된다. 같은 실행이 「Operability check」도 돌리며,
거기서 `data-comp-control`은 검사 대상에 포함된다. 「보이는가」(8번 · 12번 · 4번)와 「조작할 수
있는가」(operability check)는 한 함수 위에 쌓는다 — 판정이 두 벌이면 어긋난다.

**기준 13은 스크립트가 아니라 체크리스트다.** *지워도 되는 요소가 남아 있는가* — 화면 이름을
반복하는 라벨, 눈으로 셀 수 있는 개수, 목적어 없는 섹션 명사, 그리고 **컨테이너**: 테두리나
배경을 가진 상자도 요소로 친다. 한 대상을 상자 둘이 감싸면 바깥 상자부터 시험한다(2026-09 G1:
한 대상에 테두리 상자가 둘). 자동화하지 않는 이유는 판정이 문맥에 달려 있기 때문이고 — 카드
안의 입력창도 상자 속 상자다 — 대신 comp 제출 때 **요소별 deletion test 한 줄**을 첨부한다.

**두 긴 본문이 한 surface를 다툴 때는 배치 전에 두 가지를 잰다.** ① 각 본문의 렌더된 줄당 글자 수
(위 「줄당 글자 수」의 출력). 칸 폭(px · em · ch)에서 글자 수를 계산하지 않는다 — 한 자의 폭은 글꼴과
문자 체계마다 다르다. ② 제품이 정한 읽는 순서 — 순차(A를 읽고 B로)인가 병렬(A와 B를 대조)인가.
순차인데 두 본문을 나란히 두면 행폭과 무관하게 실패다. 2026-09 G1 Reader는 Brief와 Transcript를 1440에서
2열로 놓았다가 탭으로 바꿨는데, 바뀐 것은 행폭이 아니라 순서였다: 탭 뒤의 폭은 오히려 좁아졌다 — Brief
37.4em → 35.8em(완전 줄 p50 51 → 48자), Transcript 36.7em → 32.1em(42 → 37자). 렌더 측정, Noto Sans KR
16px, `8516dbb` → `7a009e2`(tubrief-v2 #137).

**관계 기준을 고르는 법.** 위 기준은 이 사례들에서 나온 것이다. 새 프로젝트는 **그 화면이 반복하는
것**에서 최소 하나를 추가한다 — 바 위의 컨트롤, 그리드의 카드, 표의 행, 목록의 아이템.
