# 스크립트 사용법

getdesign의 제품별 `DESIGN.md`를 `./<slug>/DESIGN.md`로 내려받는 `sync-designs.sh`,
각 제품의 preview에 접근 가능한지 확인하는 `preview-check.sh` 두 개가 있습니다.
옵션 목록은 각 스크립트의 `--help`에 있습니다. 여기에는 `--help`가 말해주지 않는 것만 적습니다.

에이전트가 UI 작업에서 지켜야 할 규칙은 `AGENTS.md`에 있습니다.

## sync-designs.sh

```bash
./sync-designs.sh                  # getdesign에 새 slug이 추가되면 이 명령 하나면 됩니다
```

- `./<slug>/DESIGN.md`가 이미 있으면 네트워크 호출 없이 건너뜁니다. 그래서 몇 번을 돌려도
  기존 파일은 그대로고, 추가된 slug만 새로 받습니다.
- `--with-preview`는 `./<slug>/preview.html`까지 캐시합니다. slug마다 계약 검증 + 다운로드가
  붙어 76개 기준 5분 30초쯤 걸립니다. 평소 명령과 달리 한 번에 끝나지 않는다고 보면 됩니다.
- 어느 디렉터리에서 실행하든 스크립트가 있는 디렉터리를 기준으로 파일을 만듭니다.
- 일부 slug이 실패해도 나머지는 계속 진행하고, 끝에 실패 목록을 출력한 뒤 종료 코드 `1`.
- slug 삭제는 처리하지 않습니다. getdesign에서 slug이 없어져도 기존 디렉터리는 남습니다.
- `linear.app`, `x.ai`처럼 점이 들어간 slug은 디렉터리 이름에도 점이 그대로 들어갑니다.
- CLI 버전 고정: `GETDESIGN_CLI=getdesign@1.2.3 ./sync-designs.sh`

## preview-check.sh

성공하면 stdout은 `PREVIEW_URL=<url>` 한 줄뿐이고 진단 로그는 전부 stderr로 나가므로,
`url="$(./preview-check.sh apple 2>/dev/null)"`로 바로 받아 쓸 수 있습니다.

검사하는 **계약**은 두 가지입니다.

1. 제품 페이지 `https://getdesign.md/<slug>/design-md` HTML의 `<iframe src="...preview...">`에
   preview 경로가 서버 렌더링되어 있다. → 클래스명이 바뀌어도 깨지지 않도록, 경로는 고정값이
   아니라 매번 여기서 다시 찾습니다.
2. 그 URL이 실제로 렌더링 가능한 크기의 HTML을 돌려준다.

### 계약이 깨졌을 때

- `[DRIFT]` — iframe에서 경로를 못 찾아 알려진 경로로 폴백한 상태입니다. 폴백이 통했으면
  종료 코드는 0이지만, getdesign 쪽 구조가 바뀐 신호이므로 `discover_preview_url()`의 추출
  규칙을 실제 페이지 HTML과 맞춰 고쳐야 합니다.
- `[FAIL]` — 폴백까지 실패. URL을 추측해서 우회하지 말고, 제품 페이지를 직접 열어 preview가
  어디로 옮겨갔는지 확인한 뒤 스크립트를 고칩니다.
- `--all`로 전체 slug을 점검하면 한 slug만의 문제인지 사이트 전체 변경인지 갈립니다.

`sync-designs.sh --with-preview`는 이 검증을 통과해야 실행됩니다.
