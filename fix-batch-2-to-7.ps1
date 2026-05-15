# fix-batch-2-to-7.ps1
# Run from C:\Pre-Sales\bomatic
# Assumes Fix 1 (estimates list) is already committed.
# Prompt files must be in .\prompts\ directory.

$ErrorActionPreference = "Continue"

function Run-Fix {
    param(
        [int]$num,
        [string]$label,
        [string]$promptFile,
        [string]$addPaths,
        [string]$commitMsg
    )

    Write-Host "`n[Fix $num/7] $label..." -ForegroundColor Yellow

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

    Write-Host "[Fix $num/7] Done." -ForegroundColor Green
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BOMATIC Batch Fix - Items 2 through 7" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Run-Fix -num 2 `
    -label "Quick BoM pasted text server-side parsing" `
    -promptFile ".\prompts\prompt-2.txt" `
    -addPaths "src/app/api/intake/route.ts src/coordinator/intake-to-e2.ts" `
    -commitMsg "fix(quick-bom): parse pasted text server-side when uploadedBomLines not pre-parsed"

Run-Fix -num 3 `
    -label "Remove placeholder strings from proposal" `
    -promptFile ".\prompts\prompt-3.txt" `
    -addPaths "src/engines/e3/section-generators.ts src/engines/e5/lld-deterministic-sections.ts" `
    -commitMsg "fix(proposal): replace placeholder strings with professional content stubs"

Run-Fix -num 4 `
    -label "Add missing artifact types to download route" `
    -promptFile ".\prompts\prompt-4.txt" `
    -addPaths "src/app/api/estimates/[id]/download/ src/app/estimates/[id]/export/" `
    -commitMsg "fix(export): add HLD/LLD/diagram/filledBoq/componentList to download and export"

Run-Fix -num 5 `
    -label "Fix proposal margin ratio math" `
    -promptFile ".\prompts\prompt-5.txt" `
    -addPaths "src/app/api/estimates/[id]/proposal/" `
    -commitMsg "fix(proposal): correct margin ratio math in financial XLSX regeneration"

Run-Fix -num 6 `
    -label "Persist E2 bom in ArtifactRegistry" `
    -promptFile ".\prompts\prompt-6.txt" `
    -addPaths "src/coordinator/pipeline-e2.ts src/coordinator/types.ts" `
    -commitMsg "fix(artifacts): persist E2 bom array in ArtifactRegistry for re-run paths"

Run-Fix -num 7 `
    -label "Add mock mode banner" `
    -promptFile ".\prompts\prompt-7.txt" `
    -addPaths "src/app/api/health/ src/components/shared/MockModeBanner.tsx src/app/layout.tsx" `
    -commitMsg "feat(ui): add mock mode banner when CISCO_API_MODE=mock"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Final Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

claude --dangerously-skip-permissions -p "Run these two commands and report the output: 1) npx tsc --noEmit 2) npx vitest run. Report total test files, total tests, pass count, fail count, and any type errors."

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Git Log (last 15 commits)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
git log --oneline -15

Write-Host "`nBatch complete." -ForegroundColor Green
