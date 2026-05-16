# fix-ml-batch.ps1
# Run from C:\Pre-Sales\bomatic
# Fixes: M3, M1, M6, M11, M12, L3, L6, L7

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
Write-Host "  BOMATIC Batch Fix M/L Tier" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Run-Fix -num 1 -total 8 `
    -label "M3: Wire fuzzy SKU matcher" `
    -promptFile ".\prompts\prompt-m3.txt" `
    -addPaths "src/engines/e2/orchestrator.ts" `
    -commitMsg "fix(e2): wire fuzzy SKU matcher using listPrices keys as catalog source"

Run-Fix -num 2 -total 8 `
    -label "M1: requirementsBaseline Zod schema" `
    -promptFile ".\prompts\prompt-m1.txt" `
    -addPaths "src/engines/e5/orchestrator-types.ts src/coordinator/pipeline-e5.ts" `
    -commitMsg "fix(types): replace requirementsBaseline any with Zod-validated schema at E4-E5 boundary"

Run-Fix -num 3 -total 8 `
    -label "M6: Persist validationResults in E2Artifacts" `
    -promptFile ".\prompts\prompt-m6.txt" `
    -addPaths "src/coordinator/pipeline-e2.ts src/coordinator/types.ts" `
    -commitMsg "fix(artifacts): persist validationResults in E2Artifacts for re-run and regen paths"

Run-Fix -num 4 -total 8 `
    -label "M11: Remove double-casts at pipeline seams" `
    -promptFile ".\prompts\prompt-m11.txt" `
    -addPaths "src/coordinator/types.ts src/coordinator/pipeline-e4.ts src/coordinator/pipeline-e5.ts" `
    -commitMsg "fix(types): remove double-casts at E4/E5 pipeline seams with proper typed inputData"

Run-Fix -num 5 -total 8 `
    -label "M12: Forward compliance matrix rows to E3" `
    -promptFile ".\prompts\prompt-m12.txt" `
    -addPaths "src/coordinator/pipeline-e3.ts src/engines/e3/" `
    -commitMsg "fix(e3): forward full compliance matrix rows to proposal section instead of stats only"

Run-Fix -num 6 -total 8 `
    -label "L3: Flip INTAKE_INLINE switch with Redis fallback" `
    -promptFile ".\prompts\prompt-l3.txt" `
    -addPaths "src/app/api/intake/route.ts .env" `
    -commitMsg "feat(queue): flip INTAKE_INLINE switch with graceful Redis fallback"

Run-Fix -num 7 -total 8 `
    -label "L6: Wire customers page to real data" `
    -promptFile ".\prompts\prompt-l6.txt" `
    -addPaths "src/app/customers/page.tsx src/app/api/customers/" `
    -commitMsg "fix(customers): wire customers page to real intake data instead of hardcoded mocks"

Run-Fix -num 8 -total 8 `
    -label "L7: Fix 14 vs 15 section spec drift" `
    -promptFile ".\prompts\prompt-l7.txt" `
    -addPaths "src/engines/e3/" `
    -commitMsg "docs: align proposal section count from 14 to 15 in comments and documentation"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Final Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

claude --dangerously-skip-permissions -p "Run these two commands and report the output: 1) npx tsc --noEmit 2) npx vitest run. Report total test files, total tests, pass count, fail count, and any type errors. If anything fails, list the failing test names and file paths."

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Git Log (last 20 commits)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
git log --oneline -20

Write-Host "`nBatch complete." -ForegroundColor Green
