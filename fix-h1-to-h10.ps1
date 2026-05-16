# fix-h1-to-h10.ps1
# Run from C:\Pre-Sales\bomatic
# Prompt files must be in .\prompts\ directory.

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
Write-Host "  BOMATIC Batch Fix H1-H10" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Run-Fix -num 1 -total 10 `
    -label "H9: Relocate mock fixtures from tests/ into src/" `
    -promptFile ".\prompts\prompt-01-h9.txt" `
    -addPaths "src/lib/adapters/" `
    -commitMsg "fix(adapters): relocate mock data from tests/mocks into src to prevent production import of test fixtures"

Run-Fix -num 2 -total 10 `
    -label "H8: Block unresolved boilerplate placeholders" `
    -promptFile ".\prompts\prompt-02-h8.txt" `
    -addPaths "src/engines/e3/" `
    -commitMsg "fix(proposal): return unresolved placeholders from renderBoilerplate and add STRICT_PROPOSAL guard"

Run-Fix -num 3 -total 10 `
    -label "H4: Replace EoX stub with curated CSV lookup" `
    -promptFile ".\prompts\prompt-03-h4.txt" `
    -addPaths "data/cisco-eox.csv src/lib/data/ src/lib/validation/ src/engines/e2/orchestrator-helpers.ts" `
    -commitMsg "fix(validation): replace EoX stub with curated CSV lookup for common Cisco and Fortinet SKUs"

Run-Fix -num 4 -total 10 `
    -label "H10: Prompt injection sanitization" `
    -promptFile ".\prompts\prompt-04-h10.txt" `
    -addPaths "src/lib/ai/ src/engines/e1/ src/engines/e3/ai-sections/ src/engines/e4/" `
    -commitMsg "fix(security): wrap customer document text in tagged delimiters to mitigate prompt injection"

Run-Fix -num 5 -total 10 `
    -label "H5: Replace HLD/LLD narrative stubs with real data" `
    -promptFile ".\prompts\prompt-05-h5.txt" `
    -addPaths "src/engines/e5/" `
    -commitMsg "fix(e5): replace HLD/LLD narrative stub paragraphs with real migration/cable/rack data"

Run-Fix -num 6 -total 10 `
    -label "H6: Thread E1 signals into E2" `
    -promptFile ".\prompts\prompt-06-h6.txt" `
    -addPaths "src/coordinator/pipeline-e2.ts src/engines/e2/orchestrator.ts" `
    -commitMsg "fix(e2): thread E1 signals into E2 input for anomaly detection context"

Run-Fix -num 7 -total 10 `
    -label "H3: BoQ template writeback for Types B-E" `
    -promptFile ".\prompts\prompt-07-h3.txt" `
    -addPaths "src/engines/e2/fill-from-priced.ts src/engines/e2/writers/" `
    -commitMsg "feat(e2): add BoQ template writeback for Types B-E with generic fallback"

Run-Fix -num 8 -total 10 `
    -label "H2: E4 phase1 writes preliminary baseline" `
    -promptFile ".\prompts\prompt-08-h2.txt" `
    -addPaths "src/engines/e4/" `
    -commitMsg "fix(e4): generate preliminary requirementsBaseline from phase1 so E5 has sizing context"

Run-Fix -num 9 -total 10 `
    -label "H1: RFI pipeline checkpoint pause and resume" `
    -promptFile ".\prompts\prompt-09-h1.txt" `
    -addPaths "src/coordinator/ src/app/api/estimates/[id]/responses/ src/app/api/intake/route.ts" `
    -commitMsg "feat(rfi): pause pipeline after E4 phase1 questionnaire and resume after client responses"

Run-Fix -num 10 -total 10 `
    -label "H7: BullMQ pipeline durability" `
    -promptFile ".\prompts\prompt-10-h7.txt" `
    -addPaths "src/lib/queue/ worker.ts src/app/api/intake/route.ts" `
    -commitMsg "feat(queue): route intake pipeline through BullMQ with INTAKE_INLINE=1 dev escape hatch"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Final Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

claude --dangerously-skip-permissions -p "Run these two commands and report the output: 1) npx tsc --noEmit 2) npx vitest run. Report total test files, total tests, pass count, fail count, and any type errors. If anything fails, list the failing test names and file paths."

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Git Log (last 20 commits)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
git log --oneline -20

Write-Host "`nBatch complete." -ForegroundColor Green
