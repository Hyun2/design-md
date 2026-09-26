A `cmd` row whose red was never run: it names a commit but carries no output
line tying the failure to the defect (process ticket #54).

```ledger
finding: fixture — red without the line of its run
class: protocol
caught-by: cmd node design-loop/scripts/ledger.mjs check 0 --file design-loop/fixtures/red-line-missing.md
red: design-md@1024976
green: design-md@62e50d6
```
