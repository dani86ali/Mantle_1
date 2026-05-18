# fix-demo-bugs.ps1
# Run from C:\Pre-Sales\bomatic
# Fixes the 6 demo-critical bugs identified in the audit:
#   P0 -> B5: List prices not loaded for SKUs in RFP BoQ file
#   P1 -> B2: XLSX content not fed into E1 requirements extractor
#   P2a -> B1 backend: documentType per uploaded file
#   P2b -> B1 frontend: 6 typed upload slots in RFP intake
#   P3 -> B3: E3 silent skip surfaced as visible error
#   P4 -> B4: E5 wired into RFP engine sequence
#
# Each fix runs in its own Claude session and auto-commits its expected paths.
# Stop with Ctrl+C between fixes to insert manual smoke tests at the checkpoints.

$ErrorActionPreference = "Continue"

function Run-Fix {
    param(
        [int]$num,
        [int]$total,
        [string]$label,
        [string]$promptFile,
        [string]$addPaths,
        [string]$commitMsg
    )

    Write-Host "`n[Fix $num/$total] $label..." -ForegroundColor Yellow

    $prompt = Get-Content $promptFile -Raw
    claude --dangerously-skip-permissions -p $prompt

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] CLI exited with code $LASTEXITCODE" -ForegroundColor Red
    }

    Invoke-Expression "git add $addPaths"
    git commit -m $commitMsg

    $leftover = git status --short
    if ($leftover) {
        Write-Host "  -> Committing additional files from CLI..." -ForegroundColor DarkYellow
        git add -A
        git commit -m "chore: additional files from $commitMsg"
    }

    Write-Host "[Fix $num/$total] Done." -ForegroundColor Green
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BOMATIC Demo-Critical Bug Fixes (6)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Run-Fix -num 1 -total 6 `
    -label "P0 (B5): Load list prices for RFP BoQ file SKUs" `
    -promptFile ".\prompts\prompt-p0.txt" `
    -addPaths "src/coordinator/pipeline-engine-dispatcher.ts src/coordinator/pipeline-e2-pricing.ts tests/coordinator/ tests/fixtures/" `
    -commitMsg "fix(e2): load list prices for SKUs in RFP BoQ file before pricing run"

Run-Fix -num 2 -total 6 `
    -label "P1 (B2): Feed XLSX content into E1 textMap" `
    -promptFile ".\prompts\prompt-p1.txt" `
    -addPaths "src/coordinator/intake-file-loader.ts src/engines/e1/file-classifier.ts tests/engines/e1/ tests/coordinator/" `
    -commitMsg "fix(e1): feed XLSX cell content into requirements extractor textMap"

Write-Host "`n*** SMOKE TEST CHECKPOINT 1 ***" -ForegroundColor Magenta
Write-Host "After P0+P1: upload RFP files in the UI, verify BoM shows non-zero prices." -ForegroundColor Magenta
Write-Host "Press Ctrl+C now to pause, or wait 5 seconds to continue with P2a..." -ForegroundColor Magenta
Start-Sleep -Seconds 5

Run-Fix -num 3 -total 6 `
    -label "P2a (B1 backend): documentType per uploaded file" `
    -promptFile ".\prompts\prompt-p2a.txt" `
    -addPaths "src/types/document-type.ts src/lib/middleware/validate.ts src/app/api/upload/route.ts src/coordinator/intake-file-loader.ts src/coordinator/intake-to-pipeline-input.ts src/engines/e1/orchestrator-types.ts src/engines/e1/orchestrator-helpers.ts src/coordinator/pipeline-e2.ts tests/" `
    -commitMsg "feat(upload): add documentType per file, route through E1 classifier and selectBoQFilePath"

Run-Fix -num 4 -total 6 `
    -label "P2b (B1 frontend): 6 typed upload slots in RFP intake" `
    -promptFile ".\prompts\prompt-p2b.txt" `
    -addPaths "src/app/estimate/new/ src/components/intake/ tests/components/ package.json package-lock.json" `
    -commitMsg "feat(ui): replace single upload with 6 typed document slots in RFP intake"

Write-Host "`n*** SMOKE TEST CHECKPOINT 2 ***" -ForegroundColor Magenta
Write-Host "After P2b: upload via the new typed slots, verify pipeline runs end-to-end." -ForegroundColor Magenta
Write-Host "Press Ctrl+C now to pause, or wait 5 seconds to continue with P3..." -ForegroundColor Magenta
Start-Sleep -Seconds 5

Run-Fix -num 5 -total 6 `
    -label "P3 (B3): Surface E3 silent skip as visible error" `
    -promptFile ".\prompts\prompt-p3.txt" `
    -addPaths "src/coordinator/pipeline-engine-dispatcher.ts src/coordinator/types.ts src/coordinator/pipeline-e3.ts src/app/ tests/coordinator/" `
    -commitMsg "fix(e3): surface E3 silent skip as artifact error visible in UI"

Run-Fix -num 6 -total 6 `
    -label "P4 (B4): Wire E5 into RFP engine sequence" `
    -promptFile ".\prompts\prompt-p4.txt" `
    -addPaths "src/coordinator/router.ts src/coordinator/pipeline-e5.ts src/coordinator/pipeline-engine-dispatcher.ts tests/coordinator/" `
    -commitMsg "feat(coordinator): wire E5 into RFP engine sequence for HLD/LLD generation"

Write-Host "`n*** SMOKE TEST CHECKPOINT 3 (FINAL) ***" -ForegroundColor Magenta
Write-Host "Full end-to-end: upload via typed slots -> BoM with prices -> proposal -> HLD/LLD wiring." -ForegroundColor Magenta

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Final Verification (tsc + vitest)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

claude --dangerously-skip-permissions -p "Run these two commands and report the output: 1) npx tsc --noEmit 2) npx vitest run. Report total test files, total tests, pass count, fail count, and any type errors. If anything fails, list the failing test names and file paths."

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Git Log (last 20 commits)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
git log --oneline -20

Write-Host "`nBatch complete." -ForegroundColor Green
