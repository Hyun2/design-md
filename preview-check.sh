#!/usr/bin/env bash
#
# preview-check.sh — getdesign preview에 접근 가능한지 "계약"을 검증하고 URL을 출력한다.
#
#   ./preview-check.sh [slug]   한 slug 검증 (기본: claude)
#   ./preview-check.sh --all    ./<slug>/ 디렉터리가 있는 모든 slug 검증
#
# CSS 클래스 selector를 하드코딩하지 않는다. 제품 페이지의 <iframe src>에서 preview
# 경로를 매번 다시 찾아내고(=discovery), 그 URL이 실제로 열리는지까지 확인한다.
# 성공하면 stdout에 `PREVIEW_URL=<url>` 한 줄을 출력하고 0으로 종료한다.
#
set -euo pipefail

BASE="${GETDESIGN_BASE:-https://getdesign.md}"

usage() { sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# 제품 페이지에서 preview URL을 찾아낸다. stdout: 절대 URL, stderr: 진단 로그.
discover_preview_url() {
  local slug="$1" page html src
  page="$BASE/$slug/design-md"

  # RSC 페이로드에 널 바이트가 섞여 있어 그대로 담으면 bash가 경고를 낸다.
  if ! html="$(curl -fsSL --max-time 30 "$page" | tr -d '\0')"; then
    echo "  [FAIL] 제품 페이지를 열 수 없음: $page" >&2
    return 1
  fi

  # 계약 1: 제품 페이지 HTML 안에 preview를 가리키는 iframe이 서버 렌더링되어 있다.
  #         (Live Preview 버튼이 기본 활성 상태라 클릭/JS 실행이 필요 없다.)
  src="$(printf '%s' "$html" \
    | grep -oE '<iframe[^>]*src="[^"]*preview[^"]*"' \
    | grep -oE 'src="[^"]*"' \
    | sed 's/^src="//; s/"$//' \
    | head -1 || true)"

  if [ -z "$src" ]; then
    echo "  [DRIFT] iframe src에서 preview 경로를 찾지 못함 — 사이트 구조가 바뀐 것으로 보임" >&2
    # 계약 2(폴백): 알려진 직접 경로. 이것마저 실패하면 접근 보장을 할 수 없다.
    src="/design-md/$slug/preview.html"
    echo "  [DRIFT] 폴백 경로로 재시도: $src" >&2
  fi

  case "$src" in
    http*) printf '%s' "$src" ;;
    /*)    printf '%s%s' "$BASE" "$src" ;;
    *)     printf '%s/%s' "$BASE" "$src" ;;
  esac
}

# 찾아낸 URL이 실제로 열리고, 내용이 렌더링 가능한 HTML 문서인지 확인한다.
validate_preview_url() {
  local url="$1" body size
  if ! body="$(curl -fsSL --max-time 30 "$url")"; then
    echo "  [FAIL] preview URL을 열 수 없음: $url" >&2
    return 1
  fi
  size="${#body}"
  if [ "$size" -lt 5000 ]; then
    echo "  [FAIL] preview 응답이 너무 작음(${size}B) — 실제 페이지가 아닐 수 있음: $url" >&2
    return 1
  fi
  case "$body" in
    *"<html"*|*"<HTML"*) : ;;
    *) echo "  [FAIL] HTML 문서가 아님: $url" >&2; return 1 ;;
  esac
  echo "  [OK] ${size}B HTML" >&2
}

check_slug() {
  local slug="$1" url
  echo "== $slug" >&2
  url="$(discover_preview_url "$slug")" || return 1
  echo "  [URL] $url" >&2
  validate_preview_url "$url" || return 1
  echo "PREVIEW_URL=$url"
}

main() {
  case "${1:-}" in
    -h|--help) usage; exit 0 ;;
    --all)
      local root failed=() slug
      root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      cd "$root"
      for slug in */; do
        slug="${slug%/}"
        [ -f "$slug/DESIGN.md" ] || continue
        check_slug "$slug" || failed+=("$slug")
      done
      if [ "${#failed[@]}" -gt 0 ]; then
        echo "검증 실패: ${failed[*]}" >&2
        exit 1
      fi
      echo "모든 slug의 preview 접근 가능" >&2
      ;;
    "") check_slug claude ;;
    *)  check_slug "$1" ;;
  esac
}

main "$@"
