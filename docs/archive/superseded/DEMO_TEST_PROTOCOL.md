# BOMATIC Demo Test Protocol

**Audience:** A tester who has never seen the BOMATIC codebase.
**Goal:** Walk every demo path end-to-end and surface defects before the customer demo.
**Companion artifact:** `docs/archive/superseded/DEMO_TEST_TRACKER.xlsx` — log each test result there.

## Before you start
- The app runs locally at `http://localhost:3000`.
- Use **Google Chrome** in a clean profile (or Incognito). Keep DevTools → Network and Console open while testing — flag any red `500/4xx` responses or red console errors against the test that produced them.
- Sample input files live in `tests/fixtures/boq/`:
  - `Technical Bid Requirements.pdf` — RFP narrative PDF
  - `Aramco_6000181983_ Clarification Questions - STCS_R2.docx` — RFP DOCX
  - `Aramco_4203079088.xlsx`, `Aramco_4203164336.xlsx`, `Aramco_4203193153.xlsx` — Aramco BoQ workbooks
- The dev pipeline writes artifacts to OS tempdir (`%TEMP%`) — downloads stream from there.
- Pass criteria: every numbered step's "Expected" matches what you actually see. If anything diverges, mark **FAIL** and capture a screenshot.

---

## Suite 1 — Setup & Smoke

### T-001 — Dev server boots
- **Preconditions:** Repo cloned, `npm install` has been run, no other process on port 3000.
- **Steps:**
  1. From `C:\Pre-Sales\bomatic` run `npm run dev`. **Expected:** terminal prints `▲ Next.js …` and `Local: http://localhost:3000` with no fatal errors.
  2. Open `http://localhost:3000/` in Chrome. **Expected:** auto-redirects to `http://localhost:3000/dashboard`.
- **Pass:** Both steps match; no red errors in console.

### T-002 — Dashboard renders
- **Preconditions:** T-001 passed.
- **Steps:**
  1. Navigate to `http://localhost:3000/dashboard`. **Expected:** left sidebar shows BOMatic logo + 5 nav items (Dashboard, New Estimate, Estimates, Catalog, Settings).
  2. Verify dashboard body shows KPI cards and an estimates/activity area. **Expected:** no skeletons stuck loading after ~5s.
- **Pass:** Page renders fully, no console errors.

### T-003 — Sidebar navigation
- **Preconditions:** T-002 passed.
- **Steps:**
  1. Click each sidebar item in order: Dashboard → New Estimate → Estimates → Catalog → Settings. **Expected:** each route loads its page header (Dashboard, New Estimate, Estimates list, Catalog, Settings/Admin).
  2. Collapse the sidebar with the chevron toggle, then expand. **Expected:** sidebar shrinks to icons only and back.
- **Pass:** All five routes reachable; collapse toggle works.

### T-004 — API health check
- **Preconditions:** Dev server running.
- **Steps:**
  1. Hit `http://localhost:3000/api/estimates` in a new tab (or via DevTools Network). **Expected:** JSON response with `estimates: []` (or array of estimates). HTTP 200.
- **Pass:** 200 OK with valid JSON.

---

## Suite 2 — RFP Mode (E1 → E2 → E3)

> Engine sequence for RFP mode: `e1` (parse) → `e2` (BoM) → `e3` (proposal).
> Checkpoint IDs: `e1-requirements`, `e1-compliance`, `e2-sku-confirmation`, `e2-pricing-review`, `e3-proposal`.

### T-010 — Start new RFP estimate
- **Preconditions:** Suite 1 green.
- **Steps:**
  1. Click sidebar **New Estimate** → URL is `/estimate/new`. **Expected:** "How are you starting?" with 3 mode cards.
  2. Click **RFP Response** card. **Expected:** step indicator advances to step 2 "Input", FileUpload panel appears.
- **Pass:** Wizard advances correctly.

### T-011 — Upload RFP fixtures
- **Preconditions:** T-010 left wizard on step 2.
- **Steps:**
  1. Drag-and-drop (or click + browse) all 5 files from `tests/fixtures/boq/` (PDF, DOCX, 3 XLSX). **Expected:** "5 files selected" list appears with correct names/sizes and per-row icons (PDF red, DOCX blue, XLSX green).
  2. Click **Continue**. **Expected:** advances to step 3 "Details".
- **Pass:** All 5 files listed, Continue enabled.

### T-012 — Project details
- **Preconditions:** On wizard step 3.
- **Steps:**
  1. Fill **Customer name** = `Aramco`, **Country** = `Saudi Arabia`, leave **Region** = `EMEAR`, **Domain** = `Both`. **Expected:** fields accept input; Continue becomes enabled.
  2. Fill **Key needs** = `Campus refresh — 2 buildings, 500 users, Cisco preferred`, **Vendor preferences** = `Cisco preferred`, **Constraints** = `Budget cap $250k`. **Expected:** all textareas accept input.
  3. Click **Continue**. **Expected:** advances to step 4 "Pricing".
- **Pass:** All fields editable, advances to pricing.

### T-013 — Pricing defaults
- **Preconditions:** On wizard step 4.
- **Steps:**
  1. Verify defaults: FX rate (3.75), partner discount, deal-reg discount, VAT, profit mode toggle (margin/markup), profit %. **Expected:** all numeric fields editable, profit-mode pill toggles correctly.
  2. Click **Create Estimate**. **Expected:** button shows "Submitting…" briefly, then navigates to `/estimates/<id>` hub.
- **Pass:** Wizard submits, lands on estimate hub.

### T-014 — Pipeline status visible
- **Preconditions:** T-013 just submitted.
- **Steps:**
  1. On `/estimates/<id>` observe **Pipeline Stepper**. **Expected:** stages E1 / E2 / E3 visible, at least one shows `processing` or `completed`.
  2. Wait up to 2 minutes — the page auto-polls every 5 s. **Expected:** E1 reaches `completed` and CP1 (Requirements Review) checkpoint card becomes actionable. If status goes `FAILED`, **stop** and record FAIL.
- **Pass:** E1 completes without entering FAILED.

### T-015 — CP1 Requirements Review checkpoint
- **Preconditions:** T-014 — E1 completed.
- **Steps:**
  1. From hub click the **Requirements Review** checkpoint card (or sub-nav "Checkpoint"). URL = `/estimates/<id>/checkpoint`. **Expected:** page shows File Classifications, Requirements (with stats), optional Eval Criteria / Vendor Preferences / Sector Detection, Risk Flags, Deadlines, Missing Documents cards.
  2. Expand the File Classifications card. **Expected:** all 5 uploaded files listed with auto-classified type dropdowns.
  3. Click **Approve**. **Expected:** action bar shows "Approving…", then navigates back to `/estimates/<id>` and CP1 reads `approved`.
- **Pass:** Approve completes, hub reflects approval.

### T-016 — Compliance sub-page
- **Preconditions:** T-015 done.
- **Steps:**
  1. From hub sub-nav click **Compliance**. URL = `/estimates/<id>/compliance`. **Expected:** stats bar, filter bar, matrix table render. Coverage Gaps and Orphan Requirements panels expand on click.
  2. Edit any one row's status dropdown. **Expected:** Save button (in action bar) becomes enabled with "dirty" indicator.
  3. Click **Save**. **Expected:** banner clears, edits persist on reload.
- **Pass:** Matrix renders and edits save.

### T-017 — CP2 Compliance approval
- **Preconditions:** T-016 done.
- **Steps:**
  1. On Compliance page click **Approve & Continue**. **Expected:** request fires, page returns to hub, CP2 reads `approved`, E2 advances to `processing`.
  2. Wait up to 2 min for E2 to finish. **Expected:** E2 stage reads `completed`, CP3 (BoM SKU) becomes actionable.
- **Pass:** E2 completes, BoM CP appears.

### T-018 — Clarifications page
- **Preconditions:** E1 completed.
- **Steps:**
  1. Sub-nav → **Clarifications**. URL = `/estimates/<id>/clarifications`. **Expected:** stats bar + filter bar + question table render with auto-generated clarifications (may be empty if RFP was clear).
  2. Select one question via checkbox; verify Selection Actions bar appears. **Expected:** bulk-action bar slides in.
- **Pass:** Page loads, selection works.

### T-019 — BoM sub-page — SKU phase
- **Preconditions:** E2 completed.
- **Steps:**
  1. Sub-nav → **BoM**. URL = `/estimates/<id>/bom`. **Expected:** Phase tabs visible (SKU active, Pricing locked), BoM table populated.
  2. Inspect Validation Results and Anomalies cards. **Expected:** at least the 9 deterministic validation rules show pass/warn/fail counts.
- **Pass:** BoM lines visible, validation rendered.

### T-020 — CP3a BoM SKU approval
- **Preconditions:** T-019 — viewing SKU phase.
- **Steps:**
  1. Edit qty on one line (use the inline input). **Expected:** Save button enables; row shows dirty marker.
  2. Click **Save** then **Approve**. **Expected:** SKU phase moves to `approved`, Pricing tab unlocks and becomes active.
- **Pass:** SKU phase approved, Pricing unlocked.

### T-021 — BoM Pricing phase + CP3b approval
- **Preconditions:** T-020 done.
- **Steps:**
  1. Verify Totals Cards (subtotal, discount, VAT, grand total) render with numeric values. **Expected:** numbers > 0 and currency formatted.
  2. Verify Similar Deals card appears (may be empty). **Expected:** card present.
  3. Click **Approve** on pricing phase. **Expected:** CP3b reads approved, E3 advances to `processing`.
- **Pass:** Pricing approved, E3 starts.

### T-022 — Pricing config sub-page
- **Preconditions:** Estimate has BoM.
- **Steps:**
  1. Sub-nav → **Pricing**. URL = `/estimates/<id>/pricing`. **Expected:** Pricing form populated from intake values; Impact Preview shows current vs proposed totals.
  2. Change FX rate from 3.75 → 3.80. **Expected:** Impact Preview updates live; Re-run button enables.
  3. Click **Reset to defaults**. **Expected:** form reverts; Re-run disabled.
- **Pass:** Form live-updates, reset works.

### T-023 — Proposal sub-page renders
- **Preconditions:** E3 completed.
- **Steps:**
  1. Sub-nav → **Proposal**. URL = `/estimates/<id>/proposal`. **Expected:** left sidebar lists all proposal sections; first section opens in the editor; commercial section shows tier panel (Good/Better/Best).
  2. Click 3 different sections in the sidebar. **Expected:** editor content updates each time.
  3. Edit one section's text. **Expected:** "edited" badge appears next to that section in the sidebar.
- **Pass:** Editor functional, edit tracking works.

### T-024 — CP4 Proposal approval + DOCX download
- **Preconditions:** T-023 done.
- **Steps:**
  1. Mark at least 2 sections as Reviewed (checkbox in editor header). **Expected:** sidebar shows green check on reviewed sections; counter increases.
  2. Click **Approve & Download**. **Expected:** browser starts a `.docx` download from `/api/estimates/<id>/proposal?download=docx`; navigates back to hub; CP4 reads approved.
  3. Open the downloaded `.docx` in Word. **Expected:** opens without "file corrupt" warning; contains customer name + tier table.
- **Pass:** Approval succeeds, DOCX opens.

### T-025 — Margin Review page
- **Preconditions:** E3 completed.
- **Steps:**
  1. Sub-nav → **Margin**. URL = `/estimates/<id>/margin`. **Expected:** gauges render (gross margin, net margin), Approval Banner, Flags list, Tier Comparison table.
  2. If "Strategic Justification required" banner appears, type a justification (5+ chars). **Expected:** Approve button enables.
  3. Click **Approve Deal**. **Expected:** banner: "Deal approved — export center is now available", status reads APPROVED.
- **Pass:** Margin approve flow succeeds.

### T-026 — Export Center unlocks after approval
- **Preconditions:** T-025 — Deal APPROVED.
- **Steps:**
  1. Sub-nav → **Export**. URL = `/estimates/<id>/export`. **Expected:** the yellow "Approve the deal" warning is gone; all artifact rows that are `ready` show enabled Download buttons.
  2. Verify groups: **Analysis** (Compliance Matrix), **Commercial** (Priced BoM Workbook), **Proposal** (Technical Proposal, Financial Proposal). **Expected:** ready badges match what E1/E2/E3 produced.
- **Pass:** Export center enabled, ready artifacts downloadable.

---

## Suite 3 — Quick BoM Mode (E2 → E3)

### T-030 — Quick BoM intake
- **Preconditions:** App running.
- **Steps:**
  1. New Estimate → click **Quick BoM** card. **Expected:** step 2 shows BomUpload panel (file dropzone + paste textarea side-by-side).
  2. In the **Or paste lines** textarea paste exactly:
     ```
     C9300-48P, 2
     C9300-24P, 4
     C9500-24Y4C, 1
     C9120AXI-B, 20
     FPR3110-NGFW-K9, 2
     ```
     **Expected:** Preview table updates: 5 rows, quantities 2/4/1/20/2.
  3. Click **Continue**. **Expected:** advances to Project Details. Customer = `QuickBoM Demo`, Country = `Saudi Arabia`. Click **Continue** → set BoM-specific toggles if shown, then **Create Estimate**.
- **Pass:** Estimate created, lands on hub.

### T-031 — Quick BoM pipeline runs E2 only first
- **Preconditions:** T-030 just submitted.
- **Steps:**
  1. On hub observe stepper. **Expected:** only E2 + E3 stages visible (no E1), E2 enters `processing`.
  2. Wait for E2 to finish (≤2 min). **Expected:** E2 `completed`, CP3 BoM SKU appears.
- **Pass:** E2 completes for paste-only input.

### T-032 — Quick BoM checkpoints
- **Preconditions:** T-031 done.
- **Steps:**
  1. Approve CP3a (SKU phase) on BoM page. **Expected:** Pricing phase unlocks.
  2. Approve CP3b (Pricing phase). **Expected:** E3 starts; wait for `completed`.
  3. Approve CP4 (Proposal). **Expected:** estimate moves toward APPROVED.
- **Pass:** Full Quick BoM happy path completes.

### T-033 — Quick BoM proposal download
- **Preconditions:** CP4 just approved.
- **Steps:**
  1. Click **Approve & Download** (re-trigger if needed via Export Center). **Expected:** Technical Proposal `.docx` downloads.
  2. Open in Word. **Expected:** mentions customer name `QuickBoM Demo` and 5 SKUs.
- **Pass:** Proposal generates from BoM-only intake.

### T-034 — Quick BoM file upload variant
- **Preconditions:** App running.
- **Steps:**
  1. New Estimate → Quick BoM → drop `tests/fixtures/boq/Aramco_4203079088.xlsx` into the file dropzone. **Expected:** file chip appears with size; Continue enables.
  2. Continue through wizard; submit. **Expected:** estimate created without errors.
- **Pass:** File path of Quick BoM works.

---

## Suite 4 — RFI Mode (E4 → E5 → E2 → E3)

> Engine sequence for RFI: `e4` (discovery questionnaire + responses) → `e5` (design) → `e2` (BoM from components) → `e3` (proposal).

### T-040 — RFI intake
- **Preconditions:** App running.
- **Steps:**
  1. New Estimate → click **RFI / Proactive** card. **Expected:** wizard skips the file/BoM step, jumps to Project Details (step 3).
  2. Fill: Customer = `RFI Demo Co`, Country = `Saudi Arabia`, Key needs = `Campus refresh, 500 users, 2 buildings, Cisco preferred`, Constraints = `Cisco only`. Submit. **Expected:** estimate created.
- **Pass:** Lands on hub with E4 stage visible.

### T-041 — Questionnaire generation
- **Preconditions:** T-040 just submitted.
- **Steps:**
  1. Sub-nav → **Questionnaire**. URL = `/estimates/<id>/questionnaire`. **Expected:** either pre-generated section cards, OR an empty state with **Generate Now** button.
  2. If empty, click **Generate Now**. **Expected:** within ~30 s sections (Sites, Users, Network, etc.) render with question cards.
- **Pass:** Questionnaire generated.

### T-042 — Approve questionnaire
- **Preconditions:** T-041 done.
- **Steps:**
  1. Click **Approve** in action bar. **Expected:** Status badge updates to `approved`; success notice "Questionnaire approved."
- **Pass:** Status flips to approved.

### T-043 — Submit free-text responses
- **Preconditions:** T-042 done.
- **Steps:**
  1. Sub-nav → **Responses**. URL = `/estimates/<id>/responses`. **Expected:** UploadPanel shows (since none submitted yet).
  2. Paste the following into the text area:
     ```
     We have 2 buildings, 500 users total, 12 access switches today (mostly Cisco 3850 EoL).
     Wireless coverage is poor — need new APs for both floors. Budget around $200k.
     Must finish by Q4. Standardize on Cisco.
     ```
     and click **Process**. **Expected:** processing spinner; after up to 60 s, page switches to tab view with Responses / Gaps / Baseline tabs.
- **Pass:** Responses ingested.

### T-044 — Verify gaps + baseline tabs
- **Preconditions:** T-043 done.
- **Steps:**
  1. Click **Gaps** tab. **Expected:** GapsList renders (may be empty if all questions answered).
  2. Click **Baseline** tab. **Expected:** BaselineView shows derived requirements (count, sample list).
  3. Click **Validate**. **Expected:** status flips to `validated`.
- **Pass:** All three tabs render; validation succeeds.

### T-045 — Design page — 5 tabs
- **Preconditions:** T-044 — baseline validated.
- **Steps:**
  1. Sub-nav → **Design**. URL = `/estimates/<id>/design`. **Expected:** if not started, DesignInputForm shown; click **Submit** with defaults to start E5.
  2. Wait for design generation (≤3 min). **Expected:** PhaseBadge shows current phase; tabs populate in order: **Approach** → **Sizing** → **HLD** → **LLD Details** → **LLD Document**.
  3. Click each of the 5 tabs once they appear. **Expected:** all 5 tabs render content (approach narrative, sizing table, HLD sections, IP/VLAN plan + components, LLD sections).
- **Pass:** All 5 tabs visible and render content.

### T-046 — Approve Design / HLD / LLD
- **Preconditions:** T-045 — all tabs present.
- **Steps:**
  1. On **Approach** tab click **Approve Design**. **Expected:** success notice; design phase advances.
  2. On **HLD** tab click **Approve HLD**. **Expected:** success notice; HLD phase advances.
  3. On **LLD Document** tab click **Approve LLD**. **Expected:** success notice; design fully approved.
- **Pass:** All three approve buttons succeed.

### T-047 — Download HLD DOCX
- **Preconditions:** HLD tab populated.
- **Steps:**
  1. On HLD tab click **Download HLD**. **Expected:** `.docx` downloads from `/api/estimates/<id>/design/documents?type=hld`. Open in Word. **Expected:** no corruption warning.
- **Pass:** HLD opens cleanly.

### T-048 — Download LLD DOCX + diagram XML
- **Preconditions:** LLD Document tab populated.
- **Steps:**
  1. Click **Download LLD** on LLD Document tab. **Expected:** `.docx` downloads, opens in Word.
  2. Click **Download Diagram** on HLD tab. **Expected:** an XML file downloads; open in any text editor and confirm it starts with `<mxfile…` or similar draw.io XML.
- **Pass:** Both files download and open.

### T-049 — RFI BoM from components
- **Preconditions:** Design approved.
- **Steps:**
  1. Return to hub. **Expected:** E2 stage enters `processing` (BoM is generated from the component list, not user upload).
  2. Wait for E2 to complete. Visit BoM page. **Expected:** SKUs match Cisco line items implied by the design's component list (switches + APs + licenses).
- **Pass:** BoM populated from design components.

### T-050 — RFI proposal with design context
- **Preconditions:** T-049 + CP3 approved.
- **Steps:**
  1. Approve CP3a + CP3b on BoM page; wait for E3.
  2. Visit Proposal page. **Expected:** proposal sections reference the design approach + sizing (e.g., site count, user count).
- **Pass:** Proposal incorporates design-derived facts.

---

## Suite 5 — Revision Flows

### T-060 — Revision at CP1 (Requirements)
- **Preconditions:** Create a fresh RFP estimate (or reuse one paused at CP1).
- **Steps:**
  1. On checkpoint page click **Request Revision**. **Expected:** prompt asks "What revisions are required?". Type `Re-classify file X as BoQ` and submit.
  2. Hub reloads. **Expected:** CP1 reads `revision_requested`; pipeline goes back to E1 (or shows pending re-run).
- **Pass:** CP1 revision recorded, pipeline restarts E1.

### T-061 — Revision at CP2 (Compliance)
- **Preconditions:** Estimate has CP1 approved, sitting at CP2.
- **Steps:**
  1. On Compliance page note current rows. Edit one row.
  2. Action bar shows Save + Approve. Reload — verify behavior:
     - Instead of approve, in the action bar press **Save** then return to hub.
     - From hub, manually mark CP2 as revision_requested via the checkpoint card if available (else skip this step and record SKIP).
- **Pass:** Save persists; revision flow recorded.

### T-062 — Revision at CP3 (BoM)
- **Preconditions:** BoM SKU phase loaded.
- **Steps:**
  1. On BoM page action bar click **Revise**. **Expected:** prompt for revision notes. Type `Add 4 more APs for floor 2`. Submit. **Expected:** request returns 200, pipeline state shows `revision_requested` for `e2-sku-confirmation`.
- **Pass:** BoM revision request recorded.

### T-063 — Revision at CP4 (Proposal)
- **Preconditions:** Proposal page loaded.
- **Steps:**
  1. Click **Request Revision**. **Expected:** prompt for change notes. Type `Tighten executive summary to 1 page`. Submit. **Expected:** navigates back to hub; CP4 reads `revision_requested`.
- **Pass:** Proposal revision recorded.

---

## Suite 6 — Cross-page Pages

### T-070 — Dashboard recent activity
- **Preconditions:** At least one estimate exists from prior suites.
- **Steps:**
  1. Visit `/dashboard`. **Expected:** KPI counters reflect recent estimates; activity feed lists newest first; clicking an item links to its `/estimates/<id>` hub.
- **Pass:** Counts non-zero; links work.

### T-071 — Estimates list filters + tenant isolation
- **Preconditions:** Multiple estimates exist.
- **Steps:**
  1. Visit `/estimates`. **Expected:** table shows your estimates only (tenant isolation — should not see estimates created by other tenants on a fresh dev DB; trust the auth header to confirm only one tenant exists in dev).
  2. Apply Status filter = `Approved`. **Expected:** rows filter; count chip updates.
  3. Apply Search = customer name fragment (e.g., `Aramco`). **Expected:** rows filter further.
  4. Clear filters; click an estimate ID link. **Expected:** navigates to its hub.
- **Pass:** All filters narrow rows; navigation works.

### T-072 — Estimates list delete
- **Preconditions:** A throwaway estimate exists.
- **Steps:**
  1. Click trash icon on the throwaway row. Confirm in modal. **Expected:** row disappears; list refreshes.
- **Pass:** Delete succeeds.

### T-073 — Catalog page
- **Preconditions:** App running.
- **Steps:**
  1. Visit `/catalog`. **Expected:** Cisco tab active by default. SKU table renders.
  2. Type `C9300` in search box. **Expected:** rows narrow to C9300 SKUs (300 ms debounce).
  3. Switch to **Fortinet** tab. **Expected:** Fortinet SKUs render; search box clears.
- **Pass:** Both tabs render; search filters.

### T-074 — Settings (Admin) page
- **Preconditions:** App running.
- **Steps:**
  1. Visit `/admin`. **Expected:** three cards: Company Profile, Boilerplate, Pricing Defaults.
  2. Edit Company Profile → City = `Jeddah`. Save. **Expected:** PATCH to `/api/admin` succeeds, success indicator shown.
  3. Reload the page. **Expected:** new value persists.
- **Pass:** Edit + persist works.

---

## Suite 7 — Downloads

> Each download must (a) complete the network request with 200, (b) save a file to disk, (c) open without "file corrupt" warning. Use a completed RFP estimate from Suite 2 unless noted.

### T-080 — Download Priced BoM workbook
- **Steps:** Export Center → click **Download** on "Priced BoM Workbook". **Expected:** `.xlsx` downloads (filename like `BoM_Aramco.xlsx`); opens in Excel; SKU, qty, prices, totals visible.

### T-081 — Download Compliance Matrix
- **Steps:** Export Center → click **Download** on "Compliance Matrix". **Expected:** `.xlsx` downloads (`Compliance_Matrix_*.xlsx`); opens; framework columns visible.

### T-082 — Download Technical Proposal DOCX
- **Steps:** Export Center → click **Download** on "Technical Proposal". **Expected:** `.docx` downloads; opens in Word; customer name + tier table present.

### T-083 — Download Financial Proposal XLSX
- **Steps:** Export Center → click **Download** on "Financial Proposal". **Expected:** `.xlsx` downloads; opens; cost build-up sheet present.

### T-084 — Download HLD DOCX (RFI flow)
- **Preconditions:** Suite 4 estimate with HLD generated.
- **Steps:** Design page → HLD tab → **Download HLD**. **Expected:** `.docx` downloads; opens; HLD sections present.

### T-085 — Download LLD DOCX (RFI flow)
- **Preconditions:** Suite 4 estimate with LLD generated.
- **Steps:** Design page → LLD Document tab → **Download LLD**. **Expected:** `.docx` downloads; opens; LLD sections present.

### T-086 — Download Diagram XML (RFI flow)
- **Preconditions:** HLD tab has a diagram.
- **Steps:** Design page → HLD tab → **Download Diagram**. **Expected:** XML file downloads; opens in text editor as draw.io XML.

### T-087 — Download Compliance export from sub-page
- **Preconditions:** Compliance page loaded.
- **Steps:** Compliance page → action bar → **Export XLSX** (same as Export Center entry). **Expected:** identical `.xlsx` saves; opens cleanly.

### T-088 — Coming-soon artifacts are disabled
- **Steps:** On Export Center inspect rows tagged "coming soon" (Requirements Baseline, Distributor Export, Filled Client BoQ, Submission PDF). **Expected:** Download buttons are disabled or show "Coming soon" badge — clicking them does **not** start a request.

---

## Suite 8 — Error Handling

### T-090 — Corrupt file upload
- **Preconditions:** Wizard on RFP upload step.
- **Steps:**
  1. Create a file `bad.pdf` containing the literal text `not a real pdf` (any text editor). Drag into uploader. **Expected:** file appears in list (upload itself accepts anything).
  2. Continue through wizard and submit. **Expected:** intake creates, E1 starts, then E1 reports a parse failure → pipeline stage shows `FAILED` (or graceful skip with warning) within ~2 min; UI surfaces the error.
- **Pass:** Failure is surfaced — UI does **not** show a stuck `processing` state indefinitely.

### T-091 — Missing required field
- **Preconditions:** Wizard on Project Details step (any mode).
- **Steps:**
  1. Clear **Customer name** and **Country**. **Expected:** Continue button is disabled.
- **Pass:** Continue stays disabled until both filled.

### T-092 — Approve without pipeline (defensive)
- **Preconditions:** Open an estimate hub for a record whose pipeline failed to initialize (rare — skip if none).
- **Steps:**
  1. Try to Approve on any checkpoint page. **Expected:** error banner: "No pipeline associated with this estimate." Page does not crash.
- **Pass:** Graceful error; record SKIP if no such estimate exists.

### T-093 — FAILED status display
- **Preconditions:** Cause a failure (e.g., from T-090) or use the Estimates list.
- **Steps:**
  1. On Estimates list locate the failed row. **Expected:** status pill reads `Failed` in red/destructive color.
  2. Open that estimate's hub. **Expected:** pipeline stepper shows the failed stage in red with an error note (no infinite spinner).
- **Pass:** Failed state visible in list and hub.

### T-094 — Approve deal without strategic justification
- **Preconditions:** Margin page where `requiresStrategicJustification` is true.
- **Steps:**
  1. Leave the justification textarea empty. **Expected:** Approve button is disabled.
  2. Type 5+ chars. **Expected:** Approve enables.
- **Pass:** Gating works as designed.

### T-095 — 404 on unknown estimate
- **Steps:** Visit `/estimates/00000000-0000-0000-0000-000000000000`. **Expected:** UI shows an error card "Failed to load" (not a white screen). Network tab shows 404 on `/api/estimates/<that-id>`.
- **Pass:** Graceful empty/error state.

---

## Recording results
For every test:
1. Note **PASS / FAIL / BLOCKED / SKIP** in `docs/archive/superseded/DEMO_TEST_TRACKER.xlsx` column **E**.
2. On FAIL: capture a screenshot and a Network/Console log snippet. Drop the screenshot in `docs/test-screenshots/T-NNN.png` and reference the filename in column J.
3. Fill **Bug Description** (col H) with reproduction steps + observed behavior. Be precise: "Click 'Approve Deal' on `/estimates/<id>/margin`, banner shows 'Approve failed (500)', Network tab shows `PATCH /api/estimates/<id>` 500 with body `{...}`." That is what Claude CLI needs.
4. Tag **Severity** (col K): Critical = blocks demo, High = visible bug in demo flow, Medium = cosmetic/edge case, Low = polish.
5. Use **CLI Prompt Notes** (col M) to record any fix prompt you want to feed back to Claude later (e.g., "Fix: design page hangs on phase transition between sizing and hld — check /api/estimates/[id]/design polling").
