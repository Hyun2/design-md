# AGENTS.md

제품 하나당 디렉터리 하나다. `./<slug>/DESIGN.md`는 토큰·규칙 명세, `./<slug>/preview.html`은
그 명세가 렌더링된 참조 페이지(캐시된 경우).

## UI 작업 절차

1. `./<slug>/DESIGN.md`를 읽는다. 색·타입 스케일·간격·컴포넌트·모션의 source of truth다.
2. 레이아웃 리듬, 여백 비율, 컴포넌트 조합, 상태 표현 — 시각적 판단이 걸린 결정은 preview를
   눈으로 보고 정한다.

## preview 접근

preview URL의 유일한 출처는 `preview-check.sh`의 stdout이다. 이 스크립트는 제품 페이지에서
preview 경로를 매번 다시 찾아내고 실제로 열리는지까지 확인하는 **계약 검증**이다.

```bash
url="$(./preview-check.sh <slug> 2>/dev/null)"; url="${url#PREVIEW_URL=}"
```

- **종료 코드 0** — 그 URL을 브라우저로 열어 스크린샷을 찍는다. 로컬 캐시
  `./<slug>/preview.html`이 있으면 `file://`로 열어도 된다.
- **종료 코드 0이 아님** — 계약이 깨졌다. `DESIGN.md`만으로 작업하고, 보고에 "preview를
  확인하지 못했다"를 명시한다. 원인 파악은 `README.md`의 preview-check.sh 절을 따른다.

스크린샷을 실제로 본 경우에만 preview를 확인했다고 쓴다.

getdesign 사이트 코드는 수시로 바뀐다. CSS 클래스·인라인 스타일·요소 인덱스로 preview를
찾으면 조용히 깨진 뒤 빈 화면을 확인했다고 보고하게 되므로, 위 스크립트를 유일한 경로로 쓴다.

## 그 밖의 운영

스크립트 옵션, 자료 갱신, 계약이 깨졌을 때의 대응은 `README.md`에 있다.
