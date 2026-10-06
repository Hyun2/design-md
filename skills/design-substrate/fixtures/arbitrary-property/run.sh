#!/bin/sh
# A custom property declared only by a Tailwind arbitrary property
# (`[--gap:1rem]`, and `@min-[40rem]:[--gap:2rem]` under a container query) is
# declared (tubrief-v2 #145): the reader `p-(--gap)` must not be reported as
# dangling. Builds a throwaway repository from repo/.
#
# Want: detect exits 0 and names no `--gap`.
#
#   sh ~/.agents/skills/design-substrate/fixtures/arbitrary-property/run.sh
#
# Run from a project root whose node_modules resolves tailwindcss; the
# throwaway repository links it.
set -u
here=$(cd "$(dirname "$0")" && pwd)
detect="$here/../../scripts/detect.mjs"
modules="$(pwd)/node_modules"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -R "$here/repo/." "$work"
ln -s "$modules" "$work/node_modules"
cd "$work" || exit 2
git init -q
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m base
out=$(node "$detect" --config "$here/config.mjs")
code=$?
echo "$out"
named=no
echo "$out" | grep -q -- "--gap" && named=yes
echo "arbitrary-property: detect exit $code (want 0); names --gap: $named (want no)"
[ "$code" -eq 0 ] && [ "$named" = no ]
