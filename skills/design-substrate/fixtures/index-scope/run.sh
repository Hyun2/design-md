#!/bin/sh
# The detector reads one tree, never a mix (tubrief-v2 #140). Builds a throwaway
# repository from repo/ in which the working tree and the index disagree:
#
#   - app/screens/fresh.tsx is untracked and is the only reader of --color-fresh;
#   - app/screens/use.tsx stops reading --color-base in the index (staged) but still
#     reads it in the working tree (unstaged).
#
# Want: the default run (working tree) finds no dead token, and `--staged`
# (what the commit would hold) finds --color-base and --color-fresh dead.
# Exit 0 only when both hold.
#
#   sh ~/.agents/skills/design-substrate/fixtures/index-scope/run.sh
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
sed -i 's/--color-base: #336699;/--color-base: #336699;\n  --color-fresh: #993366;/' app/app.css
git add app/app.css
echo 'export const Fresh = () => <div className="bg-fresh" />;' > app/screens/fresh.tsx
echo 'export const Use = () => <div className="p-1" />;' > app/screens/use.tsx
git add app/screens/use.tsx
echo 'export const Use = () => <div className="bg-base" />;' > app/screens/use.tsx

echo "## working tree"
node "$detect" --config "$here/config.mjs"
tree=$?
echo "## staged"
staged_out=$(node "$detect" --config "$here/config.mjs" --staged)
echo "$staged_out"
dead_base=no
echo "$staged_out" | grep -q -- "--color-base" && echo "$staged_out" | grep -q -- "--color-fresh" && dead_base=yes
echo "index-scope: working tree exit $tree (want 0); staged finds --color-base and --color-fresh dead: $dead_base (want yes)"
[ "$tree" -eq 0 ] && [ "$dead_base" = yes ]
