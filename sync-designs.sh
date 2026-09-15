#!/usr/bin/env bash
#
# sync-designs.sh — getdesign의 모든 slug을 ./<slug>/DESIGN.md 로 내려받는다.
#
#   ./sync-designs.sh                 새로 추가된 slug만 생성 (기본)
#   ./sync-designs.sh --refresh       이미 있는 DESIGN.md까지 전부 다시 내려받음
#   ./sync-designs.sh --dry-run       무엇이 추가될지만 출력하고 아무것도 쓰지 않음
#   ./sync-designs.sh --with-preview  ./<slug>/preview.html 도 함께 캐시
#
set -euo pipefail

CLI="${GETDESIGN_CLI:-getdesign@latest}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

refresh=0
dry_run=0
with_preview=0
for arg in "$@"; do
  case "$arg" in
    --refresh) refresh=1 ;;
    --dry-run) dry_run=1 ;;
    --with-preview) with_preview=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg (사용법은 --help)" >&2; exit 2 ;;
  esac
done

cd "$ROOT"

# preview를 캐시하려면 먼저 계약(제품 페이지 → iframe src → 실제 응답)이 살아 있는지 확인한다.
# 여기서 실패하면 URL을 추측하지 않고 즉시 멈춘다.
if [ "$with_preview" -eq 1 ] && [ "$dry_run" -eq 0 ]; then
  if ! "$ROOT/preview-check.sh" >/dev/null; then
    echo "preview 계약 검증 실패 — ./preview-check.sh 출력을 확인하세요." >&2
    exit 1
  fi
fi

# `getdesign list`는 "slug - 설명" 형식으로 한 줄씩 출력한다.
mapfile -t slugs < <(npx -y "$CLI" list | sed -n 's/^\([^ ]\+\) - .*/\1/p')

if [ "${#slugs[@]}" -eq 0 ]; then
  echo "slug을 하나도 읽지 못했습니다. 'npx -y $CLI list' 출력을 확인하세요." >&2
  exit 1
fi

added=0 skipped=0 failed=0 previews=0
failed_slugs=()

for slug in "${slugs[@]}"; do
  out="./$slug/DESIGN.md"

  if [ -f "$out" ] && [ "$refresh" -eq 0 ]; then
    skipped=$((skipped + 1))
  elif [ "$dry_run" -eq 1 ]; then
    echo "생성 예정: $out"
    added=$((added + 1))
  elif npx -y "$CLI" add "$slug" --out "$out" --force >/dev/null 2>&1; then
    echo "생성: $out"
    added=$((added + 1))
  else
    echo "실패: $slug" >&2
    failed_slugs+=("$slug")
    failed=$((failed + 1))
  fi

  if [ "$with_preview" -eq 1 ] && [ "$dry_run" -eq 1 ]; then
    [ -f "./$slug/preview.html" ] || echo "preview 캐시 예정: ./$slug/preview.html"
    continue
  fi

  if [ "$with_preview" -eq 1 ]; then
    preview_out="./$slug/preview.html"
    if [ ! -f "$preview_out" ] || [ "$refresh" -eq 1 ]; then
      if url="$("$ROOT/preview-check.sh" "$slug" 2>/dev/null)" \
         && curl -fsSL --max-time 30 "${url#PREVIEW_URL=}" -o "$preview_out"; then
        previews=$((previews + 1))
      else
        echo "preview 실패: $slug" >&2
        rm -f "$preview_out"
      fi
    fi
  fi
done

echo "---"
echo "전체 $((${#slugs[@]}))개 slug / 생성 ${added} / 건너뜀 ${skipped} / 실패 ${failed} / preview 캐시 ${previews}"

if [ "$failed" -gt 0 ]; then
  echo "실패한 slug: ${failed_slugs[*]}" >&2
  exit 1
fi
