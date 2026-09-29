# Adapters

[`SKILL.md`](SKILL.md)의 원칙은 라이브러리와 무관하다. 바뀌는 것은 **어디를 봐야 하는가**뿐이다.
쓰는 라이브러리의 절만 읽는다. 목록에 없으면 아래 「어댑터 계약」의 여섯 질문에 답해
저장소의 `substrate/report.md`에 적는다 — 프로젝트에서 관찰한 버전별 사실은 저장소에 남고,
이 공유 문서에는 여러 프로젝트에서 반복 확인된 것만 별도 작업으로 올린다.

## 어댑터 계약

1. **토큰 계약** — primitive가 읽는 **토큰 이름**의 집합, 그 선언 위치, 그리고 이 라이브러리에서
   토큰 이름이 구체적으로 무엇인지(CSS 커스텀 프로퍼티인지, theme 객체의 키인지).
2. **값이 흐르는 경로** — 토큰 선언에서 픽셀까지 몇 단계를 거치는가. 그중 **별칭 층**(한 토큰이
   다른 토큰을 가리키기만 하는 층)이 있으면 그것도 답한다 — dead token 판정 방식이 거기서 갈린다.
3. **public API 경계** — 토큰 이름을 바꾸면 무엇이 깨지는가. 바꿔도 되는 토큰 이름은 무엇인가.
4. **scoped re-point 문법** — 같은 토큰 이름을 특정 영역에서만 다시 가리키는 공식 방법.
5. **하드코딩이 숨는 자리** — STEP 1이 grep해야 할 곳.
6. **없는 토큰을 가리키면 어떻게 실패하는가** — 오류인가, 아무것도 만들지 않는가, 문자열이 그대로
   값으로 통과하는가, **라이브러리 자신의 기본값으로 해석되는가**. 그리고 **라이브러리 자신에게 "이
   참조가 무엇을 만드는가"를 묻는 방법**. 끊긴 참조 · 라이브러리 기본값 참조 · 반투명 포커스 표시(STEP 1
   목록 5·6·7)는 소스 철자로는 가려지지 않으므로, 판정은 이 답으로만 한다.

값의 정확한 목록은 라이브러리 버전과 함께 움직인다. **아래 토큰 이름은 출발점이고, 프로젝트가
실제로 선언한 것이 권위다** — STEP 1은 항상 저장소에서 전수 수집한다.

**별칭 층이 있으면 dead token 판정은 2-pass다.** 별칭 정의 안의 참조(`--color-card: var(--card)`)도
문법상 참조이므로, 한 번만 grep하면 raw 토큰은 **언제나 살아 있는 것으로** 보인다 — 별칭이
전부 쓰이지 않아도 그렇다. 그래서 ① 별칭 층 바깥(primitive · 화면 · 스타일시트의 나머지)에서
별칭과 raw 토큰의 사용을 먼저 찾고 ② raw 토큰은 **살아 있는 별칭이 가리킬 때, 또는 바깥에서
직접 쓰일 때만** 산 것으로 센다. 죽은 별칭만 가리키는 raw 토큰은 별칭과 함께 죽은 것이다.

---

## Tailwind CSS 변수 계열 (shadcn/ui · Radix 기반 vendored primitive)

**토큰 계약.** CSS 커스텀 프로퍼티. 면과 글자는 쌍으로 온다(`--background`/`--foreground`,
`--card`/`--card-foreground`, `--popover`, `--muted`, `--secondary`, `--accent`,
`--destructive`), 경계와 포커스는 `--border`/`--input`/`--ring`, 반경은 `--radius` 하나에서
`--radius-sm|md|lg|xl`이 `calc()`로 파생된다. 선언은 `:root`와 dark 스코프에 나뉘고, Tailwind
v4는 `@theme`이 그 값을 유틸리티 이름으로 노출한다.

**값이 흐르는 경로.** 변수 → `@theme` 노출 → 유틸리티 클래스(`bg-card`, `rounded-lg`) →
`cva` variant 문자열 → primitive. `@theme inline`이 `--color-card: var(--card)`처럼 raw 변수를
`--color-*` · `--radius-*` 별칭으로 다시 선언하는 것이 **별칭 층**이다. raw 변수는 그 별칭의
유틸리티가 어딘가에서 쓰이거나 `var(--card)`로 바깥에서 직접 쓰일 때만 살아 있다 — 위 2-pass로
판정한다.

**public API 경계.** 위 토큰 이름은 upstream이 생성하는 컴포넌트 소스가 그대로 참조한다. 토큰 이름을 바꾸면
다음에 추가하는 컴포넌트가 정의되지 않은 색으로 렌더된다. **값만 바꾼다.**

**scoped re-point.** 같은 변수를 클래스나 `data-*` 스코프 안에서 다시 선언한다:
`[data-panel="inverted"] { --background: …; --foreground: …; }`. 새 토큰 이름을 만들지 않는다.

**하드코딩이 숨는 자리.** primitive의 `cva` 문자열이 1순위다 — `rounded-lg` 같은 반경 유틸리티,
`shadow-*`, `border-*`가 토큰이 아니라 클래스로 박혀 있다. 그다음이 임의 값 대괄호 구문
(`bg-[#…]`, `rounded-[…]`)과 `dark:` 변형에만 걸린 색이다.

**없는 토큰을 가리키면.** 오류 없이 **CSS를 만들지 않는다** — `@theme`에 `--color-accent-solid`가 없으면
`bg-accent-solid`는 빈 클래스이고 요소는 투명하다. 묻는 방법은 `tailwindcss` 패키지의
`__unstable__loadDesignSystem(css, { loadStylesheet, loadModule })`로 빌드가 읽는 같은 스타일시트를
올린 뒤 `designSystem.candidatesToCss([...])`가 `null`을 돌려주는지 보는 것이다(플러그인과 import된
시트까지 반영된다). 임의 값 `bg-(--x)` · `bg-[var(--x)]`는 무엇이든 컴파일되므로 `--x`의 선언 여부를
따로 본다. 라이브러리가 런타임에 요소에 써 넣는 변수(Base UI의 `--anchor-width` 등)는 어느 시트도
선언하지 않으므로 사유와 함께 제외 목록에 둔다. VERIFIED(tailwindcss 4.2.0 · TuBrief
저장소 detector · 2026-09-25 · 끊긴 참조 16건 재현).

**라이브러리 기본값.** `@import "tailwindcss"`는 `tailwindcss/theme.css`의 기본값(`--font-mono` ·
`--font-serif` · 팔레트 색 · 간격 · 글자 크기 …)을 함께 선언한다. 그래서 world가 `--font-mono`를
선언하지 않아도 `font-mono`는 CSS를 만들고, 요소는 기본 monospace stack — 곧 OS 글꼴 — 로 그려진다.
판정은 `candidatesToCss`가 돌려준 CSS가 읽는 변수를 그 시트만 선언하고 프로젝트는 선언하지 않았는지로
한다. world가 소유하는 축은 어댑터의 `WORLD_OWNED_NAMESPACES`이고 지금은 글꼴 family(`font`)
하나다. VERIFIED(tailwindcss 4.2.0 · TuBrief detector · 2026-09-29 · `font-mono` 3곳, 오탐 0).

**포커스 표시 색.** 클래스를 변형째 `candidatesToCss`에 넣으면 포커스 변형(`focus-visible:` ·
`focus-within:` · `has-[…:focus-visible]:` …)은 `:focus*` 선택자로, α 표기 `/50`은
`color-mix(in oklab, var(--ring) 50%, transparent)`로 나온다. 색을 싣는 선언은 `--tw-ring-color` ·
`--tw-inset-ring-color` · `--tw-shadow-color` · `outline-color` · `border-*-color`다(어댑터
`INDICATOR_COLOR`). VERIFIED(tailwindcss 4.2.0 · TuBrief detector · 2026-09-29 · `d7ad85b` 26건, HEAD 오탐 0).

**코드.** 이 절의 답은 [`scripts/adapters/tailwind.mjs`](scripts/adapters/tailwind.mjs)에 있다.
MUI · Chakra는 아직 코드가 없다 — 첫 적용이 이 절의 답을 확인하면서 같은 모양의 어댑터 파일을 추가한다.

## MUI (Material UI)

**토큰 계약.** `createTheme({ cssVariables: true, colorSchemes, palette, shape, typography })`.
면은 `palette.background.default|paper`, 글자는 `palette.text.*`, 강조는
`palette.primary|secondary|error…`의 `main`/`light`/`dark`/`contrastText`, 반경은
`shape.borderRadius` 하나, 타입 램프는 `typography.h1…body2`. `cssVariables: true`면 같은
값이 `--mui-palette-*` CSS 변수로도 나온다.

**값이 흐르는 경로.** theme 객체 → `theme.vars.palette.…`(→ `var(--mui-palette-…)`) →
`styled`/`sx` → primitive. theme 바깥에서는 `var(--mui-palette-…)`로 직접 참조한다.

**public API 경계.** primitive는 저장소가 소유하지 않는다. 고치는 자리는 소스가 아니라
`components.MuiButton.styleOverrides` / `defaultProps`이고, `palette`·`shape`·`typography`의
**키 이름은 바꿀 수 없다** — 새 의미가 필요하면 palette에 키를 추가하고 타입을 augment한다.
dark 분기는 `theme.applyStyles('dark', …)`로 쓴다.

**scoped re-point.** 중첩 `ThemeProvider`로 그 영역만 값을 갈아 끼운다. 같은 키, 다른 값.

**하드코딩이 숨는 자리.** 호출부의 `sx` prop이 압도적 1순위다 — theme을 거치지 않고 화면에서
색과 반경을 직접 쓰는 통로이며, 이 라이브러리에서 오버라이드는 여기로 샌다. 그다음이
`styled()` 안의 리터럴과 `Paper elevation={n}`로 표현된 그림자다.

**없는 토큰을 가리키면.** `sx`의 palette 경로 문자열(`bgcolor: "accent.solid"`)은 palette에서 찾지
못하면 **문자열 그대로 CSS 값으로 통과**하고, 브라우저가 무효 값으로 버려 투명이 된다.
`theme.vars.palette.x.y`는 `undefined`가 되어 선언 자체가 빠진다. 라이브러리에게 묻는 방법은
`sx`를 theme과 함께 `unstable_styleFunctionSx`로 풀어 나온 값이 palette 값인지 보는 것이다.
likely(MUI 문서 기준, 적용 사례 없음) — 첫 적용에서 확인하고 VERIFIED로 바꾼다.

## Chakra UI (v3)

**토큰 계약.** `createSystem(defaultConfig, defineConfig({ theme: { tokens, semanticTokens,
recipes } }))`. `tokens`는 원시값(팔레트·반경·간격), `semanticTokens`는 그 위의 의미
계층(`bg`, `fg`, `border`, `bg.subtle` …)이며 `{colors.gray.100}` 참조 구문으로 원시 토큰을
가리킨다. **world를 붓는 자리는 `semanticTokens`다.**

**값이 흐르는 경로.** tokens → semanticTokens → recipe(`defineRecipe`)의 `base`/`variants` →
컴포넌트 style prop. `semanticTokens`의 `{colors.gray.100}` 참조가 **별칭 층**이므로 원시
토큰의 dead 판정은 위 2-pass를 따른다.

**public API 경계.** `defaultConfig`가 제공하는 semantic token 이름을 유지한다. 토큰 이름을 추가·변경하면
`@chakra-ui/cli typegen`을 다시 돌려야 타입이 따라온다 — 이 재생성 필요 자체가 public API를 건드렸다는
신호다.

**scoped re-point.** semantic token의 조건부 값(`{ base: …, _dark: … }`)과 조건 selector. 조건은
at-rule 또는 부모 selector여야 한다. 영역 단위 예외는 새 토큰이 아니라 조건 추가로 표현한다.

**하드코딩이 숨는 자리.** 컴포넌트의 style prop에 원시 토큰을 직접 쓴 자리(`bg="gray.100"`)가
1순위다. 문법상 토큰이라 grep으로 하드코딩처럼 보이지 않지만 **semantic 계층을 건너뛰므로
효과는 하드코딩과 같다** — 의미 계층이 바뀌어도 따라오지 않는다.

**없는 토큰을 가리키면.** style prop의 토큰 경로(`bg="accent.solid"`)가 토큰에 없으면 **문자열이
그대로 CSS 값으로 통과**해 무효 값이 된다. typegen을 쓰면 타입 오류로 먼저 잡히지만, 문자열로
조합된 값과 `css` prop은 타입 검사를 지나간다. 라이브러리에게 묻는 방법은 `system.token(path)`가
값을 돌려주는지 보는 것이다. likely(Chakra v3 문서 기준, 적용 사례 없음) — 첫 적용에서 확인한다.
