# Honeywell Demo Catalog Fixture

Prompt 104 adds a flat Honeywell MVP demo catalog supplement projection.

## What It Is

The supplement exposes flat catalog metadata for exactly the 50 Honeywell demo SKU
identities already present in the approved Honeywell demo scope:

- approved configuration-expansion rule-pack parent SKUs
- approved configuration-expansion rule-pack child SKUs
- the two standalone customer-requested BoQ optics

Each flat item has:

- SKU
- description
- Mantle-compatible category: `product`, `service`, or `subscription`
- SAR list price copied from the already-approved Honeywell demo pricing fixture
- source metadata showing this is a Honeywell demo projection

## Why It Exists

The current local historical/mock catalog misses key Honeywell parent SKUs such as
`CW9178I-CFG`, `C9300X-48HX-A`, and `C9300L-24P-4X-A`. That gap prevents a full
uploaded Honeywell BoQ from resolving deterministically through catalog lookup.

This supplement is the explicit demo-scoped catalog metadata foundation needed before
later prompts wire full Honeywell upload resolution.

## Authority Boundary

This supplement is Honeywell MVP demo scope only.

It is not production Cisco catalog authority.

It is not broad Cisco-general authority.

It is not configuration authority. Child accessories, licenses, subscriptions, support,
software, and included components still come from approved structured configuration
rule packs only.

It is not pricing authority beyond the already-approved Honeywell demo pricing fixture.
The SAR list price field is copied from that fixture for deterministic demo use only.

It does not approve SKU replacement, current-SKU migration, or silent substitution.

It is not runtime AI and does not perform inference.

## Optics

`SFP-10G-LR-S=` and `SFP-10/25G-LR-S=` remain standalone customer-requested BoQ
lines. They are present as flat catalog items only because the customer BoQ contains
them and the Honeywell demo pricing fixture includes them.

They are not switch children and must not be auto-attached under `C9300X-48HX-A` or
`C9300L-24P-4X-A` without separate approved design/configuration authority.

## Prompt 104 Scope

Prompt 104 does not wire this supplement into runtime SKU resolution yet.

It does not modify the existing local mock catalog.

It does not add configuration expansion rules.

It does not create Project artifacts, approval records, pricing outputs, exports, UI,
routes, or runner behavior.

Later prompts may explicitly wire this supplement into Honeywell demo SKU resolution,
but only under the same demo boundary and with deterministic behavior.

## Prompt 105: Explicit Lookup Overlay

Prompt 105 adds `src/lib/projects/honeywell-demo-catalog-lookup.ts`, a small helper
that converts the supplement into a `CatalogLookupIndex` for deterministic lookup.

Key facts about the overlay:

- It is explicit opt-in only. Callers must call `getHoneywellDemoCatalogLookupIndex()`
  or `lookupHoneywellDemoCatalogSku()` to use it.
- It does not change default runtime catalog lookup. The default `lookupCatalogSku()`
  behavior and the local STC/mock catalog are unchanged.
- It does not price artifacts or create production pricing authority. The `listPrice`
  field on lookup items is carried only because `CatalogLookupItem` requires it.
- It does not create configuration authority or parent/child relationships. Items are
  flat lookup entries only; relationship structure stays in the approved rule packs.
- Optics (`SFP-10G-LR-S=` and `SFP-10/25G-LR-S=`) remain standalone flat lookup
  items. The overlay does not attach them under switches.

## Prompt 106: Lookup Provenance Fix

Prompt 106 adds `CatalogLookupSource` to `CatalogLookupIndex` and threads it through
to `CatalogLookupMatch.catalogSource`. The Honeywell overlay index carries the explicit
source constant `HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE =
"honeywell_mvp_demo_catalog_supplement"`, so matches resolved via the Honeywell overlay
now report that source instead of `local_stc_historical_mock`. Default local mock
lookup behavior is unchanged.

## Prompt 110: Subset SKU Resolution Evidence

A subset/reordered BoQ containing approved Honeywell demo SKUs resolves deterministically
through the explicit Honeywell overlay via `buildSkuResolutionDraft` with
`catalogIndex: getHoneywellDemoCatalogLookupIndex()`.

Key properties of subset resolution:

- The default local mock catalog still returns `not_found` for known missing Honeywell
  parent SKUs (`CW9178I-CFG`, `C9300X-48HX-A`, `C9300L-24P-4X-A`).
- The overlay resolves those same SKUs as `needs_review` suggestions only; no SKU is
  auto-accepted.
- Input row order is preserved exactly and each resolved line gets one same-SKU suggestion.
- `summary.catalogSource` is `"honeywell_mvp_demo_catalog_supplement"`.
- `acceptedCount` and `rejectedCount` are always 0 in a draft.
- No `acceptedSku`, `decidedBy`, or `decidedAt` fields are set.
- Optic `SFP-10G-LR-S=` remains a standalone input row suggestion with no parent/child
  fields attached.
- No pricing, configuration-expansion, parent/child, replacement, or substitution fields
  appear on any decision.

## Prompt 111: SKU Review Evidence

Prompt 111 proves that overlay suggestions still require explicit human review actions
to become accepted decisions.

Key facts:

- After `buildSkuResolutionDraft` with the Honeywell overlay all four input SKUs are
  `needs_review` with one same-SKU suggestion each. No SKU is auto-accepted.
- Explicit human `accept` actions (keyed by `sourceFileId` + `sourceRowNumber`) must be
  supplied to `applySkuResolutionReviewActions` to move decisions to `accepted`.
- Accepted decisions are accepted same-SKU decisions from existing suggestions, not
  silent auto-acceptance or substitution.
- Accepting a SKU that is not present in the row's suggestions throws
  `Accepted SKU must match an existing suggestion.`
- This does not create pricing authority, configuration-expansion authority,
  replacement authority, or substitution authority.
- Optic `SFP-10G-LR-S=` remains a standalone accepted decision with no parent/child
  fields attached after review.

## Prompt 112: Configuration Expansion Evidence

Prompt 112 proves that accepted Honeywell overlay SKU decisions can feed the approved
Honeywell MVP Batch 1+2+3 configuration-expansion rule pack and produce a
review-required draft.

Key facts:

- Accepted overlay decisions (from `applySkuResolutionReviewActions`) are passed
  directly to `buildConfigurationExpansionDraft` together with the original BoQ lines
  and `getHoneywellMvpConfigExpansionRulePack()`. No additional steps are required.
- Expansion is fully deterministic and rule-pack-only. No AI, catalog lookup, pricing,
  or configuration inference is performed at expansion time.
- Every expansion line has `approvalRequired: true` and `approved: false`. No expansion
  line is auto-approved. Engineer review is required for every added line.
- The composed rule pack has `status: "approved"` and `approvalRequired: false` before
  it is passed to the expansion builder, confirming only the already-approved Batch 1,
  Batch 2, and Batch 3 rules are in scope.
- Optic `SFP-10G-LR-S=` remains a standalone customer line with no expansion children.
  It is not auto-attached under the switch.
- This does not create new configuration authority beyond the already-approved Honeywell
  MVP Batch 1+2+3 rule pack.
- This does not create pricing authority, replacement authority, substitution authority,
  catalog authority, API/UI behavior, artifact records, approval records, export
  behavior, runner behavior, or broad Cisco authority.

## Prompt 113: Project Quick BoM UI Opt-In (superseded by Prompt 147)

Prompt 113 originally wired an explicit Honeywell MVP demo catalog-profile checkbox
into the Project Quick BoM workspace page.

**Superseded by Prompt 147:** The runtime catalog-profile selector (checkbox and
`catalogProfile` API field) was removed. Honeywell SKU metadata is now composed into
the default Quick BoM approved catalog path. The checkbox
(`data-testid="workflow-honeywell-demo-catalog-profile"`) no longer exists in the UI.
SKU-resolution requests always use the default catalog; any JSON request that includes
`catalogProfile` is rejected with `catalog_profile_not_supported`.

The `getHoneywellDemoCatalogLookupIndex()` function (added in Prompt 105) remains as a
lower-level fixture/projection helper used internally when composing the default
approved catalog. It is not a runtime UI/API profile selector and is not callable by
clients.

Historical key facts for Prompt 113 (before removal):

- A checkbox was required to opt in; Honeywell was never inferred from project,
  customer, or file name.
- The checkbox only selected the demo catalog overlay for SKU-resolution suggestions.
  It did not create auto-acceptance, pricing authority, configuration authority,
  replacement/substitution authority, export behavior, or broad Cisco authority.

## Prompt 114: Explicit Opt-In Full App Chain Evidence

Prompt 114 proves app-level explicit opt-in full-chain evidence for a non-seeded
uploaded Honeywell subset through the complete current workflow:

```
upload -> normalize -> sku_resolution draft -> explicit SKU review -> approval
-> configuration_expansion draft -> explicit configuration review -> approval
-> deterministic pricing -> pricing approval -> export package -> export approval
-> download
```

Key facts:

- The test creates an arbitrary Quick BoM Project (not the seeded Honeywell demo
  fixture). The Honeywell catalog overlay is selected only by the explicit engineer
  checkbox tick; nothing is inferred from project, customer, or file name.
- The demo catalog overlay (`honeywell_mvp_demo`) is used only for SKU-resolution
  suggestions. It does not carry forward to configuration expansion, pricing, or export.
- Configuration expansion still comes only from the already-approved Honeywell
  Batch 1+2+3 rule pack (`honeywell-mvp-composed-batch1-batch2-batch3`). Every
  expansion line has `sourceRuleId` prefixed with that pack id.
- Pricing still comes only from the existing deterministic demo/pricing path.
- The test uses a four-line Format #2 CSV subset:
  `C9300X-48HX-A` (qty 2), `CW9178I-CFG` (qty 10), `CP-7841-K9=` (qty 5),
  `SFP-10G-LR-S=` (qty 4).
- Expansion summary for that subset: `customerLineCount: 4`, `addedLineCount: 27`,
  `totalLineCount: 31`, `requiresReviewCount: 27`, `includedItemCount: 10`.
- Parent/child: switch gets 22 expansion children, AP gets 4, phone gets 1, optic
  gets 0 (remains standalone; not auto-attached under a switch).
- No silent substitution or replacement fields appear in SKU or config payloads.
- No runtime AI authority, no production Cisco catalog/pricing authority, no
  replacement/substitution authority, and no broad Cisco-general behavior is added.
- The SKU-resolution draft starts `needs_review` and requires explicit engineer
  line-level review before any downstream step is available.
- The configuration_expansion draft starts `needs_review` and requires explicit
  engineer line-level review before approval.
- No artifact payloads or uploaded SKU details are exposed in the page UI.

## Prompt 115: SKU Capability Profile

Prompt 115 adds `src/lib/projects/honeywell-demo-sku-capability.ts`, a pure read-only
capability profile for the approved Honeywell MVP demo SKU set.

Key facts:

- The profile joins the existing Honeywell demo catalog supplement, the approved
  Batch 1+2+3 rule pack, and the demo pricing fixture to report per-SKU coverage.
  It does not change runtime behavior and creates no new authority.
- For every known Honeywell MVP demo catalog SKU the profile reports catalog coverage,
  pricing coverage, configuration-expansion parent coverage, child coverage, and
  standalone optic status.
- Parent expansion coverage and standalone optic treatment remain exactly as already
  approved and proven in Prompts 112-114. The two standalone optics (`SFP-10G-LR-S=`
  and `SFP-10/25G-LR-S=`) are `standalone_customer_boq_line` with no expansion
  children; they are not attached under switches.
- Unknown or out-of-scope SKUs are explicitly deferred: `kind: "unknown_deferred"`,
  `catalogCovered: false`, `pricingCovered: false`, `deferred: true`. No silent
  substitution or normalization is performed.
- No pricing math (sell price, margin, markup, VAT), replacement, substitution,
  accepted-SKU, review-decision, or approval fields appear on any capability row.
- The module imports only the three approved demo sources and contains no DB, API/UI,
  engine, coordinator, adapter, AI/LLM, workbook/export, artifact store, route,
  or filesystem code. It is ASCII-only.

## Prompt 116: Approved Configuration Authority Profile

Prompt 116 adds `src/lib/projects/honeywell-demo-config-authority.ts`, which records
the user-approved Honeywell MVP configuration authority boundary as an explicit pure
profile.

Key facts:

- The authority is limited to approved structured catalog/rule artifacts and Honeywell
  MVP scope only. It does not create pricing authority or production Cisco/broad Cisco
  authority.
- It uses no runtime AI and authorizes no silent SKU replacement or substitution.
- Unknown SKU relationships are deferred; they return `"defer_unknown_relationship"` and
  the original requested SKU is preserved exactly.
- The two standalone optics (`SFP-10G-LR-S=` and `SFP-10/25G-LR-S=`) remain standalone
  customer-requested BoQ lines with disposition `"preserve_standalone_customer_line"`.
  They are not attached under switches (`attachesOpticsUnderSwitches: false`).
- The module validates that the Honeywell composed rule pack has `status: "approved"`
  before returning any profile or disposition. A non-approved pack throws immediately to
  prevent accidental authority drift.
- Runtime service wiring is intentionally deferred to the next prompt so this prompt
  remains auditable on its own.
- The module imports only `honeywell-demo-sku-capability` and
  `honeywell-config-expansion-rule-pack`. No pricing, DB, API/UI, engine, coordinator,
  adapter, AI/LLM, workbook/export, artifact store, route, or filesystem code is present.
  It is ASCII-only.

## Prompt 117: Configuration Authority Trace in Drafts

Prompt 117 wires the Prompt 116 approved Honeywell MVP configuration authority profile
into the Project Quick BoM configuration-expansion DRAFT service as explicit trace
metadata.

Key facts:

- Draft creation now records the Prompt 116 approved configuration authority trace as
  a `configurationAuthority` field inside the `ConfigurationExpansionDraftArtifactPayload`
  and in the returned `payloadSummary`.
- The trace is configuration authority only. It carries no pricing, catalog-lookup,
  sell-price, discount, margin, markup, VAT, currency, or amount fields. Pricing
  authority remains strictly separate.
- The trace records a lean `dispositionSummary` derived from the accepted SKUs in the
  source `sku_resolution` decisions: counts for `expandByApprovedRulePackCount`,
  `preserveKnownRulePackChildCount`, `preserveStandaloneCustomerLineCount`, and
  `deferUnknownRelationshipCount`.
- Unknown or out-of-scope SKUs increment `deferUnknownRelationshipCount` and never
  throw. The original accepted SKU is preserved verbatim with no substitution.
- Standalone optics such as `SFP-10G-LR-S=` increment
  `preserveStandaloneCustomerLineCount`. They are not attached under switches
  (`attachesOpticsUnderSwitches: false` in the trace).
- Runtime expansion behavior is unchanged. The existing approved Honeywell MVP
  Batch 1+2+3 rule pack and the deterministic builder (`buildConfigurationExpansionDraft`)
  still produce every expansion line. The trace records what governed draft creation;
  it does not alter the expansion output.
- No runtime AI, no silent SKU substitution, no optics-under-switch attachment.
- No new artifacts, approval records, stage updates, pricing, export, UI, or route
  changes are made. Exactly one `needs_review` `configuration_expansion` artifact is
  still created on success, as before.

## Prompt 118: Configuration Authority Trace Carried Into Reviewed Artifacts

Reviewed configuration-expansion artifacts now preserve the draft's configuration
authority trace.

Key facts:

- When a `configuration_expansion` DRAFT artifact payload carries a
  `configurationAuthority` trace (written by Prompt 117), the
  `project-quick-bom-config-expansion-review` service validates and copies that trace
  into the reviewed/accepted `configuration_expansion` artifact payload and into the
  lean `payloadSummary` returned to the caller.
- This is provenance only. The trace records which approved configuration authority
  profile governed draft creation. It does not create pricing authority, catalog
  authority, production Cisco authority, or any replacement or substitution authority.
- Review behavior and expansion behavior are unchanged. The same gates apply: the
  draft must be a valid `needs_review` artifact, `reviewedBy` must be nonblank, the
  source `sku_resolution` must be approved, and the rule pack must be approved.
- Drafts without a trace remain backward-compatible: the reviewed artifact and its
  payload summary simply omit `configurationAuthority`.
- A draft carrying a malformed present trace (wrong types, wrong literals, missing
  fields) returns `invalid_configuration_expansion_draft_payload` before delegating.
- Unknown relationships remain deferred in the trace (`unknownRelationshipsDeferred:
  true`). No runtime AI, no SKU replacement or substitution, no optic attachment.
- No new artifacts, approval records, stage updates, pricing, export, UI, or route
  changes are made.
