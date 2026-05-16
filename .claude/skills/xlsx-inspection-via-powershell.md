# Skill: XLSX/DOCX Inspection via PowerShell

How to inspect or extract data from XLSX/DOCX files without installing
Python/openpyxl or pulling Node deps. Uses Windows-bundled
`System.IO.Compression` + XML parsing.

Captured from inspecting Shahid's Tender Analyzer + Aramco BoQ fixtures
during the BOMATIC catalog-extraction investigation.

---

## When to use

- One-shot extraction for catalog/test fixture work. Not for production
  parsing — production uses `src/lib/io/excel-reader.ts`.
- Investigating an unfamiliar XLSX/DOCX (sheet names, content density,
  shared-string usage).
- Confirming a customer's file format before writing a real parser.

---

## Core technique

XLSX/DOCX are zip archives of XML. Open without unzipping to disk:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader -ArgumentList @($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
```

`New-Object System.IO.StreamReader -ArgumentList @($stream)` — the `-ArgumentList`
form is required when the constructor takes a single Stream arg, otherwise
PowerShell can't pick the right overload.

---

## XLSX layout cheat sheet

| Path inside the zip | What it holds |
|---|---|
| `xl/workbook.xml` | Sheet name list (`<sheet name="…" r:id="rIdN">`) |
| `xl/worksheets/sheetN.xml` | Cell data for sheet N (rId mapping is sequential) |
| `xl/sharedStrings.xml` | All distinct text values, referenced by index from cells |
| `xl/styles.xml` | Number formats, fonts |

Cells store values as `<v>NNN</v>`; when `t="s"` the value is an index into
sharedStrings, otherwise it's a literal number.

---

## Common operations

**List sheet names:**
```powershell
$xml = ... # workbook.xml content
[regex]::Matches($xml, '<sheet[^/]+name="([^"]+)"[^/]+r:id="(rId\d+)"') |
  ForEach-Object { "$($_.Groups[2].Value)`t$($_.Groups[1].Value)" }
```

**List zip entries with sizes (find the big sheets):**
```powershell
$zip.Entries | ForEach-Object { "$($_.FullName)`t$($_.Length)" }
```

**Parse sharedStrings:**
```powershell
$siMatches = [regex]::Matches($ssXml, '<si[^>]*>(.*?)</si>',
  [System.Text.RegularExpressions.RegexOptions]::Singleline)
foreach ($m in $siMatches) {
  $tParts = [regex]::Matches($m.Groups[1].Value, '<t[^>]*>([^<]*)</t>')
  $combined = ($tParts | ForEach-Object { $_.Groups[1].Value }) -join ''
  # $combined is the full string for this <si> entry
}
```

Multi-run strings (`<si><r><t>…</t></r><r><t>…</t></r></si>`) need
the join — `[xml]` casts often lose the inner text on these.

**Find which sheet uses a shared string index:**
```powershell
$count = ([regex]::Matches($sheetN, "<v>$idx</v>")).Count
# count > 0 means this sheet references string $idx
```

**Extract DOCX body text:**
```powershell
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
# ... read ...
$text = $xml -replace '</w:p>', "`n" -replace '<w:tab/>', "`t" -replace '<[^>]+>', ''
```

---

## Rules

1. **Open files read-only** (`OpenRead`, not `Open`). The file may be open
   in Word/Excel — `OpenRead` allows concurrent read; `Open` fails with
   "file in use".
2. **`Dispose()` the zip handle.** Leaking it locks the file from other
   processes including the user's Excel.
3. **Use sheet NAMES, not indices.** Don't assume `STANDARD PRICING TABLE`
   is always sheet16 — workbook.xml maps name→`rId`, then `sheets/sheetN.xml`
   is the actual file. Names are stable across versions; indices aren't.
4. **Don't rely on `[xml]` for sharedStrings.** PowerShell's XML cast drops
   text content from `<si><r><t>` multi-run strings. Use regex.
5. **For files >5 MB don't dump the full content.** Extract sheet by sheet
   to a tmp file, then probe with `IndexOf` / line-wise regex. Reading
   a 12 MB XML into one variable + a regex matchall can hang or hit memory
   limits.
6. **Clean up tmp files in same chat turn.** `rm -f /c/.../.tmp_*.xml` —
   leaving them around clutters the repo and triggers permission prompts
   on re-runs.

---

## Anti-patterns

- ❌ Asking Python/openpyxl when the user hasn't authorized installing Python
  deps. PowerShell is always available on Windows.
- ❌ Unzipping the XLSX to disk with `Expand-Archive`. Doesn't work — XLSX
  isn't an .archive-extension file. `System.IO.Compression.ZipFile` handles
  any zip regardless of extension.
- ❌ Hard-coding column letters (B, F, M) for a parser. Read header rows
  and find the column by name first — Shahid's templates renumber columns
  between V34 and V35.
- ❌ Writing the result back into the user's XLSX. Read-only inspection;
  generating a fresh file is a different task with different rules.

---

## Reference patterns / fixtures used during BOMATIC catalog investigation

- `OP-2024-148262 -Tender Analyzer 2016B V34_13 - v2.0.xlsx` — Aramco bid
  analysis, ~30 real Cisco SKUs (C9300L/C9300X/C9500 family) in sheet12
  (`BoQ` sheet, 12.7 MB XML). Demonstrates sheet-by-name lookup pattern.
- `Aramco_4203079088.xlsx` (in `tests/fixtures/boq/`) — Aramco bid response
  template. `Commercial Envelope` sheet holds line items; PO-numbered
  filename never matched filename-rule classifiers (drove the classifier
  fallback fix).
