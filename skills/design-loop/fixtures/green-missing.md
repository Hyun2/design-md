A `cmd` row with a red and no green: a command that fails on everything also
fails on the defect, and only a pass on the fix tells the two apart (process
ticket #50).

```ledger
finding: fixture — red without green
class: protocol
caught-by: cmd node design-loop/scripts/ledger.mjs check 0 --file design-loop/fixtures/green-missing.md
red: design-md@1024976
red-line: fixture line
green: design-md@62e50d6
```
