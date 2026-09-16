# AGENTS.md

제품 하나당 디렉터리 하나다. `./<slug>/DESIGN.md`는 토큰·규칙 명세, `./<slug>/preview.html`은
그 명세가 렌더링된 참조 페이지(캐시된 경우).

## UI 작업 절차

1. `./<slug>/DESIGN.md`를 읽는다. 색·타입 스케일·간격·컴포넌트·모션의 source of truth다.
2. 레이아웃 리듬, 여백 비율, 컴포넌트 조합, 상태 표현 — 시각적 판단이 걸린 결정은 preview를
   눈으로 보고 정한다.

## preview 접근

`./<slug>/preview.html`을 `file://`로 열어 스크린샷을 찍는다. 76개 제품 전부 저장소에 들어
있고 각 파일은 JS 없는 독립 문서라, 네트워크도 브라우저 조작도 필요 없다.

파일이 없는 slug(= getdesign에 새로 추가된 제품)이면 먼저 캐시를 채운다.

```bash
./sync-designs.sh --with-preview
```

그래도 받지 못하면 `DESIGN.md`만으로 작업하고, 보고에 "preview를 확인하지 못했다"를
명시한다. 원인 파악은 `README.md`의 preview-check.sh 절을 따른다.

스크린샷을 실제로 본 경우에만 preview를 확인했다고 쓴다.

getdesign 사이트에서 preview를 직접 받아야 할 때, URL의 유일한 출처는
`./preview-check.sh <slug>`의 stdout이다. CSS 클래스·인라인 스타일·요소 인덱스로 찾으면
사이트 코드가 바뀔 때 조용히 깨진 뒤 빈 화면을 확인했다고 보고하게 된다.

## 그 밖의 운영

스크립트 옵션, 자료 갱신, 계약이 깨졌을 때의 대응은 `README.md`에 있다.
