# BOMATIC Prompts 104-125: Quick BoM Honeywell Authority Hardening Story

**Type:** Historical execution and closure record only.

**Source of truth:** `C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md` remains the
canonical product state source of truth. This file is a historical execution record for the
Prompt 104-125 sequence and must not be treated as an architecture reference or planning document.

---

## Objective

Strengthen the Honeywell Quick BoM demo beyond seeded copy/parity by:

- Allowing explicit engineer opt-in to a Honeywell demo catalog supplement for SKU resolution
  suggestions, scoped to known demo SKUs only.
- Preserving explicit human line-level SKU review after any catalog suggestion; no auto-approval.
- Carrying configuration authority provenance derived only from the approved Honeywell Batch 1,
  Batch 2, and Batch 3 structured rule pack
  (`honeywell-mvp-composed-batch1-batch2-batch3`, approved under
  `prompt-116-user-approved-honeywell-config-authority`).
- Carrying pricing authority provenance derived only from committed Honeywell demo pricing fixture
  (`committed_honeywell_demo_pricing_fixture`, approved under
  `prompt-119-user-approved-honeywell-demo-pricing-authority`,
  profile id `honeywell-mvp-demo-pricing-authority-profile`).
- Rendering lean configuration and pricing authority provenance summaries in the Project Quick BoM
  UI without exposing full artifact payloads, workbook source paths, or price maps.

---

## Current Product Behavior

1. **Catalog supplement opt-in**: If an uploaded BoQ contains SKUs covered by the explicit
   Honeywell demo catalog supplement and the engineer opts in via UI checkbox, SKU resolution
   can suggest those SKUs. The supplement is demo-only and non-authoritative beyond explicit opt-in.

2. **Explicit SKU review preserved**: Suggestions from catalog supplement are not auto-approved.
   Explicit line-level SKU review is required before any SKU enters the accepted set.

3. **Configuration authority**: Configuration expansion is driven only by the approved Honeywell
   Batch 1+2+3 structured rule pack. Unknown relationships are deferred. Optics are not
   auto-attached under switches. Runtime AI is not used for configuration decisions.

4. **Pricing authority**: Pricing uses the committed Honeywell demo pricing fixture trace and
   profile. Missing prices are reported. No production Cisco pricing claim is made.

5. **Authority separation**: Pricing authority and configuration authority are distinct. Both are
   visible as lean provenance summaries in the Quick BoM UI.

6. **UI boundaries**: The UI exposes only lean provenance summaries. Full artifact payloads,
   workbook source paths, source evidence details, accepted/rejected line history, and price maps
   are not exposed in the UI.

---

## What This Does Not Claim

- Not broad Cisco-general intelligence.
- Not runtime AI deciding SKU, configuration, or pricing.
- Not automatic discovery of all accessories, licenses, or subscriptions from arbitrary JSON
  catalog data.
- Not production Cisco pricing authority.
- No silent SKU substitution or replacement authority.
- Not a full line-level review UI for SKU, configuration, or pricing.
- Not a live/provisioned production DB or browser QA proof.

---

## Prompt-by-Prompt Summary: P104-P125

| Prompt | Title | What Changed |
|--------|-------|--------------|
| P104 | Honeywell demo catalog supplement | Added demo-only catalog supplement fixture scoped to known Honeywell SKUs. |
| P105 | Honeywell demo catalog lookup overlay | Wired catalog lookup to consult supplement when enabled, without overriding default behavior. |
| P106 | Catalog lookup source provenance | Lookup results carry a source provenance field indicating which catalog contributed each entry. |
| P107 | Explicit SKU resolution catalog index injection | SKU resolution engine receives an explicit catalog index parameter; no implicit global state. |
| P108 | Honeywell SKU resolution catalog opt-in | Opt-in flag on resolution call; supplement consulted only when explicitly enabled. |
| P109 | SKU resolution route catalog profile opt-in | The SKU-resolution POST route accepts only an explicit, validated `catalogProfile: "honeywell_mvp_demo"` body; default no-body behavior is unchanged. |
| P110 | Honeywell SKU resolution overlay evidence | Tests proved a subset/reordered Honeywell-shaped BoQ resolves through the explicit overlay as review-gated suggestions only; default local mock gaps remain visible. |
| P111 | Honeywell SKU review remains explicit | Confirmed no path bypasses line-level SKU review; supplement suggestions enter review queue. |
| P112 | Honeywell subset expansion draft evidence | Tests proved explicitly accepted overlay SKU decisions feed the approved Honeywell Batch 1+2+3 rule pack and produce a review-required expansion draft. |
| P113 | UI opt-in checkbox for Honeywell demo catalog supplement | Engineer-facing checkbox in Project Quick BoM UI to enable supplement before resolution. |
| P114 | App-level explicit Honeywell catalog opt-in flow | App action/server path wires opt-in flag through to resolution engine from UI gesture. |
| P115 | Honeywell SKU capability profile | Structured profile object captures which SKU families are covered by the supplement. |
| P116 | Honeywell configuration authority profile, based on user approval | Config authority profile created (`prompt-116-user-approved-honeywell-config-authority`); scope: approved Batch 1+2+3 rule pack only, no runtime AI, no silent substitution, unknown deferred. |
| P117 | Configuration authority trace added to expansion drafts | Expansion draft payload carries config authority profile reference. |
| P118 | Reviewed/accepted configuration expansion preserves configuration authority | Accepted expansion records copy config authority trace from draft; authority survives approval gate. |
| P119 | Honeywell demo pricing authority profile, based on user approval | Pricing authority profile created (`honeywell-mvp-demo-pricing-authority-profile`, `prompt-119-user-approved-honeywell-demo-pricing-authority`); scope: committed demo fixture only, missing prices reported, no production claim. |
| P120 | Priced BoQ carries pricing authority trace | Priced BoQ payload includes pricing authority profile reference and fixture id (`committed_honeywell_demo_pricing_fixture`). |
| P121 | Priced BoQ also carries copied configuration authority trace | Priced BoQ copies config authority from the accepted expansion used; both authorities travel together. |
| P122 | Quick BoM workspace read model exposes lean authority provenance summaries | Read model adds lean summary fields for config and pricing authority: authority id, approval reference, scope label. No full payloads. |
| P123 | Project Quick BoM UI renders the lean authority provenance summaries | UI displays lean config and pricing authority summary cards. Payload internals, source paths, evidence detail not shown. |
| P124 | App-level Honeywell catalog opt-in flow proves authority provenance is visible and payload/workbook internals do not leak | App-flow test proves: opt-in roundtrip works, provenance summaries appear, no payload/path/evidence leakage at read-model boundary. |
| P125 | Close Quick BoM Honeywell authority/catalog hardening record | This closure document and its doc regression test. Closes the P104-P125 sequence without changing architecture source of truth, runtime behavior, or UI. |

---

## Bugs and Corrections

- **Prompt 104 timeout cleanup**: The first catalog-supplement run produced draft source but timed
  out before tests and documentation. Cleanup finished the fixture tests/docs and locked the
  demo-only, non-authoritative boundary before it was accepted.

- **SKU review remained explicit (P111)**: The review evidence was tightened with direct assertions
  that human accept actions target the exact source file and row numbers before applying review
  decisions. Supplement suggestions still enter the same explicit review path as all other
  candidates.

- **App E2E assertion cleanup (P114)**: A test initially read payload details from a lean route
  response. Cleanup switched the assertion to the in-memory persisted artifact in the test harness,
  preserving the no-replacement/no-substitution checks without weakening the product boundary.

- **App E2E stability tightened during authority provenance UI proof (P123-P124)**: Export-approval
  waits in the app E2E were made explicit so authority provenance assertions run against stable app
  state.

- **UI/read model exposes only lean provenance summaries (P122-P124)**: Tests now guard that only
  lean authority summaries are exposed. Full payloads, workbook source paths, source evidence,
  accepted/rejected line detail, and price maps are not exposed at the read-model or UI boundary.

---

## Future Roadmap

- Full uploaded Honeywell BoQ through app-level flow and/or browser QA with a live/provisioned DB.
- Line-level SKU review UI (accept/reject individual suggestion lines in browser).
- Line-level configuration review UI (approve/reject individual expansion lines in browser).
- Line-level pricing review UI (inspect line pricing, missing-price warnings, and approve/reject
  the exact priced artifact; any manual price override policy requires separate design).
- Real/provisioned DB execution proof replacing fixture-backed integration tests.
- Production pricing authority design (separate from committed demo fixture scope).
- Broader Cisco configuration authority family-by-family, each requiring human approval before
  runtime use.
- Staleness propagation when upstream artifacts, approved rule references, or approved pricing
  references change.
- Marafiq and EnergyTech real-input proofs with their own catalog/pricing fixtures.
- RFP evidence-chain work later, using approved Project artifacts and evidence IDs only.

---

## Future Human Approval Gates

The following capabilities require explicit human approval before they may be added to runtime
product authority. They are not approved under this sequence.

1. Any configuration rule pack beyond the approved Honeywell Batch 1+2+3
   (`honeywell-mvp-composed-batch1-batch2-batch3`).
2. Any Batch 4 runtime configuration authority (optics and replacement mappings are currently
   deferred).
3. Any replacement or substitution mapping of any kind.
4. Any production Cisco pricing source or claim.
5. Any runtime source switch from committed demo fixture to another price source beyond the already
   approved Honeywell demo scope.
6. Any AI-assisted candidate extraction before it becomes an approved runtime structured authority
   artifact.
