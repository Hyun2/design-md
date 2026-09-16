#!/usr/bin/env bash
#
# sync-designs.sh — getdesign의 모든 slug을 ./<slug>/{DESIGN.md,preview.html} 로 내려받는다.
#
#   ./sync-designs.sh            빠진 파일만 생성 (기본)
#   ./sync-designs.sh --refresh  이미 있는 파일까지 전부 다시 내려받음
#   ./sync-designs.sh --dry-run  무엇이 생성될지만 출력하고 아무것도 쓰지 않음
#
set -euo pipefail

CLI="${GETDESIGN_CLI:-getdesign@latest}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

refresh=0
dry_run=0
for arg in "$@"; do
  case "$arg" in
    --refresh) refresh=1 ;;
    --dry-run) dry_run=1 ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg (사용법은 --help)" >&2; exit 2 ;;
  esac
done

cd "$ROOT"

# preview를 받으려면 먼저 계약(제품 페이지 → iframe src → 실제 응답)이 살아 있는지 확인한다.
# 여기서 실패하면 URL을 추측하지 않고 즉시 멈춘다.
if [ "$dry_run" -eq 0 ] && ! "$ROOT/preview-check.sh" >/dev/null; then
  echo "preview 계약 검증 실패 — ./preview-check.sh 출력을 확인하세요." >&2
  exit 1
fi

# `getdesign list`는 "slug - 설명" 형식으로 한 줄씩 출력한다.
mapfile -t slugs < <(npx -y "$CLI" list | sed -n 's/^\([^ ]\+\) - .*/\1/p')

if [ "${#slugs[@]}" -eq 0 ]; then
  echo "slug을 하나도 읽지 못했습니다. 'npx -y $CLI list' 출력을 확인하세요." >&2
  exit 1
fi

designs=0 previews=0 skipped=0
failed_slugs=()

for slug in "${slugs[@]}"; do
  design_out="./$slug/DESIGN.md"
  preview_out="./$slug/preview.html"
  fresh_design=0 fresh_preview=0

  [ -f "$design_out" ] && [ "$refresh" -eq 0 ] || fresh_design=1
  [ -f "$preview_out" ] && [ "$refresh" -eq 0 ] || fresh_preview=1

  if [ "$fresh_design" -eq 0 ] && [ "$fresh_preview" -eq 0 ]; then
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$dry_run" -eq 1 ]; then
    [ "$fresh_design" -eq 1 ] && echo "생성 예정: $design_out"
    [ "$fresh_preview" -eq 1 ] && echo "생성 예정: $preview_out"
    continue
  fi

  ok=1

  if [ "$fresh_design" -eq 1 ]; then
    if npx -y "$CLI" add "$slug" --out "$design_out" --force >/dev/null 2>&1; then
      echo "생성: $design_out"
      designs=$((designs + 1))
    else
      echo "실패: $design_out" >&2
      ok=0
    fi
  fi

  if [ "$fresh_preview" -eq 1 ]; then
    # preview URL은 preview-check.sh가 제품 페이지에서 매번 다시 찾아낸다.
    if url="$("$ROOT/preview-check.sh" "$slug" 2>/dev/null)" \
       && curl -fsSL --max-time 30 "${url#PREVIEW_URL=}" -o "$preview_out"; then
      echo "생성: $preview_out"
      previews=$((previews + 1))
    else
      echo "실패: $preview_out" >&2
      rm -f "$preview_out"
      ok=0
    fi
  fi

  [ "$ok" -eq 1 ] || failed_slugs+=("$slug")
done

echo "---"
echo "전체 ${#slugs[@]}개 slug / DESIGN.md ${designs} / preview.html ${previews} / 건너뜀 ${skipped} / 실패 ${#failed_slugs[@]}"

if [ "${#failed_slugs[@]}" -gt 0 ]; then
  echo "실패한 slug: ${failed_slugs[*]}" >&2
  exit 1
fi
