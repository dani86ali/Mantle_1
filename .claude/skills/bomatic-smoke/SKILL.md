---
name: bomatic-smoke
description: Walks the operator through a structured end-to-end manual UI smoke test of the BOMatic RFP pipeline. Covers pre-flight setup (DB wipe, dev server check), step-by-step approval-gate walkthrough, and post-smoke debrief that drafts a Critical Fix prompt if any gate failed.
---

# BOMatic Smoke Test Walkthrough

You are guiding the operator through a structured manual UI smoke test of BOMatic's RFP pipeline. The pipeline currently has these approval gates (post-Critical-Fix-#4):

  e1-requirements → e1-compliance → e5-design-approach → e5-hld → e2-sku-confirmation → e2-pricing-review → e3-proposal

LLD generation is paused per memory `project-lld-deferred`. No e5-lld checkpoint exists for the demo.

Be patient. Each step might take the operator 30-60 seconds in the browser. Don't rush. After each step, wait for their observation before moving on.

---

## Phase 1 — Pre-flight (run before opening browser)

Walk these one at a time. Wait for confirmation between steps.

1. **Confirm latest main.** Ask the operator to run `git log --oneline -5` and paste the output. Look for the most recent Critical Fix commit. Flag if anything looks behind (e.g., Fix #4 not landed yet, or uncommitted WIP that shouldn't be in the smoke).

2. **Wipe stale DB.** Tell the operator to run in their DB tool:
   ```sql
   DELETE FROM pipelines;
   DELETE FROM intakes;
   ```
   Required because previous smoke runs leave rows with possibly-renamed `documentType` strings or partial-state pipelines. Ask the operator to confirm done.

3. **Dev server.** Ask the operator to confirm `npm run dev` is running and `http://localhost:3000` is reachable.

4. **Smoke fixture files.** Recommend a mix that exercises the new PileUpload UI:
   - One `.xlsx` tagged **BoQ** — e.g., `G:\.shortcut-targets-by-id\1Kq5k2BgSspSB8Lnssy49zHoxroYTwYmi\STC\STC w o DWG\OGF - All\2020\OP-167515 - UCaaS\Quotes\CISCO IP PHONES\Aramco_UCaaS__STC_BOM_V2.xlsx`
   - One `.pdf` or `.docx` tagged **RFP**
   - One `.pdf` tagged **Compliance**
   - Optionally a `.zip` tagged **Other** (tests permissive validation)

   Ask the operator to confirm files are ready before moving to Phase 2.

---

## Phase 2 — Walkthrough (interactive)

Walk these ONE AT A TIME. After each step ask the operator "what did you see?" and capture their observation as one of: ✓ worked / ✗ broke (+ what went wrong) / 🟡 partial. Do not move on until they respond.

### Step 1 — Intake
**Do:** New estimate → RFP mode → upload the fixture files via PileUpload → tag each → submit.
**Expected:** upload succeeds, lands on estimate detail page.
**Watch for:** per-file tag dropdown works, 500MB limit honored, soft warnings on tag/extension mismatch shown but don't block submit, submit enabled with mixed-tag set.

### Step 2 — e1-requirements
**Do:** Click Requirements tab in sidebar → Approve & Continue.
**Expected:** lands on hub (per Critical Fix #1).
**Watch for:** NOT auto-routed to `/clarifications`.

### Step 3 — e1-compliance
**Do:** Click Compliance tab → Approve & Continue.
**Expected:** lands on hub. E5 starts in background.
**Watch for:** sidebar Design tab shows a visible "review needed" badge within ~10 seconds (post-Fix #4).

### Step 4 — e5-design-approach + e5-hld
**Do:** Click Design tab → review Design Approach → Approve. Then review HLD → Approve.
**Expected:** after both approvals, E2 starts in background.
**Watch for:** NO LLD tab visible (per `project-lld-deferred`). Sidebar BoM tab shows "review needed" within ~10 seconds.

### Step 5 — e2-sku-confirmation
**Do:** Click BoM tab → review SKU list → Approve.
**Expected:** progresses to pricing review.
**Watch for:** BoM lines show non-$0 prices for ~35% of SKUs (catalog-covered, post-A3+A4); $0 with operator-override note for the rest.

### Step 6 — e2-pricing-review
**Do:** Pricing tab → Approve.
**Expected:** E3 starts.

### Step 7 — e3-proposal
**Do:** Proposal tab → Approve → download TP DOCX.
**Expected:** TP DOCX downloads, looks like STC TP format (post-B5; see memory `project-stc-output-format-fidelity`).
**Watch for:** customer name appears correctly in §1, §2, §4.3 etc. but NOT in §8 References (per F3 of TP recon, memory `project-tp-template-recon-findings`).

### Step 8 — Drawbridge close
If Steps 1–7 all green, the operator can mark Drawbridge tasks #1 + #2 (BoM-pricing tasks) as done in `.moat/moat-tasks-detail.json`.

---

## Phase 3 — Debrief

Once all 8 steps are walked:

1. **Summarize the smoke outcome.** Tabulate:
   - ✓ steps that passed
   - ✗ steps that broke + observations
   - 🟡 partial / unexpected behavior

2. **If ANY step broke, propose the next Critical Fix:**
   - Identify the layer (UI / backend / engine / data).
   - Draft a SPOKE prompt covering the fix, following the pattern of prior Critical Fixes (Fix #1–#4 in `git log`).
   - Show it to the operator for review before they hand it to a spoke session.
   - Prefer a single Critical Fix if observations point to one root cause; only split into multiple if the issues are genuinely independent.

3. **If everything passed,** surface the readiness state: "smoke clean — ready for T2 in the priority queue."

---

## Notes for the assistant invoking this skill

- If the operator gets stuck mid-step (e.g., a page won't load), help them investigate — read relevant source files, check the dev server log. Don't just defer back to "try again."
- Cite memory files when relevant:
  - `project-lld-deferred` — LLD paused
  - `project-stc-output-format-fidelity` — TP/BOM/FS format expectations
  - `project-stc-demo-strategic-frame` — broader demo framing
  - `project-tp-template-recon-findings` — TP recon gotchas (e.g., References ignores customer)
- Don't modify source code as part of this walkthrough. If a fix is needed, it becomes the next Critical Fix spoke prompt — not inline edits.
