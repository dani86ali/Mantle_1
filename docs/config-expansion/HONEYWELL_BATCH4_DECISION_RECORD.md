# Honeywell Batch 4 Decision Record (Optics Standalone / Replacements Deferred)

> WARNING: This is a DECISION RECORD, not runtime expansion authority. It is NOT
> an approved Batch 4 runtime expansion rule pack and it creates none. It records
> a configuration-scope decision only: the two optics are standalone customer BoQ
> / pricing / export lines (not expansion children), and the 11 historical-to-
> current replacement candidates remain deferred with no silent substitution. The
> configuration-expansion composer/selector remains Batch 1 + Batch 2 + Batch 3
> only. No runtime evaluator, pricing, catalog, API, UI, DB, or export behavior is
> added, and no unit prices are encoded. Pricing/catalog authority and
> configuration-expansion authority stay separate.

## 1. Status

Companion to the JSON decision record
`data/config-expansion/honeywell-batch4-decision-record.json` (recordId
`honeywell-batch4-decision-record`, status `decision_recorded`). It captures the
human/business decision made after reviewing the Batch 4 approval packet
(`honeywell-batch4-approval-packet`, which remains `pending_human_approval`). It
is a decision record, not runtime authority. The source v2 candidate pack
(`honeywell-candidate-rules-v2`) stays candidate, and the already-approved Batch
1, Batch 2, and Batch 3 runtime packs are unchanged.

This is Honeywell MVP only. It is NOT broad Cisco-general approval.

## 2. The Business Decision

Optics appeared in the Batch 4 review because the Honeywell input BoQ listed them
as standalone customer-requested SKUs, not because they are children of a switch.
In the CCW exercise they were validated separately:

- SFP-10G-LR-S= : standalone 10GBASE-LR SFP module, quantity 12
- SFP-10/25G-LR-S= : standalone 10/25GBASE-LR SFP28 module, quantity 14

So the decision is:

- The two optics are valid standalone Honeywell customer BoQ / pricing / export
  lines when customer-provided or accepted in scope. Each is a standalone
  customer BoQ line, not an expansion child.
- The optics are NOT expansion children. Do not auto-attach the optics to
  C9300X-48HX-A, C9300L-24P-4X-A, or any parent without a separate design/evidence
  approval that says which port or uplink consumes which optic.
- When the optics are priced, deterministic catalog/pricing input is required;
  this record encodes no price values and runtime AI makes no pricing or
  configuration decision.
- The configuration-expansion composer remains Batch 1+2+3 only. No Batch 4
  runtime expansion rule pack is created.
- All 11 replacement candidates remain deferred, with no silent substitution.

That is why optics were kept deferred/out of scope for the approved
configuration-expansion batches: they are valid SKUs to price if the customer
provides them, but they are not approved expansion children to invent or auto-add.

## 3. Optics (Standalone Customer BoQ Lines)

Each optic is recorded as `relationshipType: standalone_customer_boq_line` with
`notConfigurationExpansionChild: true`, `allowedWhenCustomerProvided: true`,
`deterministicPricingRequired: true`, `noPriceValuesEncoded: true`, and
`doNotAutoAttachToParentSkus: [C9300X-48HX-A, C9300L-24P-4X-A]`. GPL/catalog
evidence is SKU existence/description only, not pricing or configuration authority.

| SKU | Description | Quantity | Decision | Do-not-auto-attach |
| --- | --- | --- | --- | --- |
| SFP-10G-LR-S= | 10GBASE-LR SFP Module, Enterprise-Class | 12 | standalone customer BoQ line; price/export from deterministic input when in scope | C9300X-48HX-A, C9300L-24P-4X-A |
| SFP-10/25G-LR-S= | 10/25GBASE-LR SFP28 Module | 14 | standalone customer BoQ line; price/export from deterministic input when in scope | C9300X-48HX-A, C9300L-24P-4X-A |

The optics can be priced and exported when present in the accepted customer
Honeywell scope, using deterministic catalog/pricing inputs only. They must not be
invented or auto-added under a switch/module without separate design/evidence
approval.

## 4. Replacement Candidates (Deferred)

All 11 historical-to-current SKU replacement candidates carried in
`honeywell-candidate-rules-v2.replacementCandidates` remain deferred. Each is
recorded with `status: deferred`, `noSilentRuntimeSubstitution: true`, and
`allowedAtRuntime: false`. The replacements remain deferred; a replacement is a
separate, explicit, human-approved decision and is never applied silently at
runtime. A current SKU that is already an approved Batch 2 or Batch 3 child line
is NOT thereby authorized to be substituted for its historical SKU.

| Historical SKU | Current SKU(s) | Decision |
| --- | --- | --- |
| C9300-DNX-A-48-3Y | C9300-DNA-A-48-3Y | deferred; no silent substitution |
| C9300L-DNX-A-24-3Y | C9300L-DNA-A-24-3Y | deferred; no silent substitution |
| SC9300UK9-1712 | SC9300UK9-1715 | deferred; no silent substitution |
| S9300LUK9-1712 | S9300LUK9-1718 | deferred; no silent substitution |
| SPACES-EXT-S | D-DNAS-EXT-S-T, D-DNAS-EXT-S-3Y | deferred; no silent substitution |
| CON-L1NBX-C9300XY4 | CON-L1NCD-C9300XY4 | deferred; no silent substitution |
| CON-L1SWX-93XA48MY | CON-L1SWT-C93A48 | deferred; no silent substitution |
| CON-L1NBX-C93024PX | CON-L1NCD-C93024PX | deferred; no silent substitution |
| CON-L1SWX-3LXA24MY | CON-L1SWT-C93LA24 | deferred; no silent substitution |
| CON-SNT-P7PK94P1 | CON-L1NBD-P7PK94P1 | deferred; no silent substitution |
| C9300L-STACK-BLANK | C9300L-STACK-KIT2, C9300L-STACK-A, STACK-T3A-50CM | deferred; no silent substitution |

## 5. Boundary and Caveats

- Honeywell MVP only; not broad Cisco-general approval.
- No Batch 4 runtime expansion rule pack is created; the composer remains
  Batch 1+2+3 only.
- No auto-added optics: the two optics are standalone customer BoQ lines, not
  expansion children, and are not auto-attached under any parent.
- No replacement approval: all 11 replacements remain deferred.
- No silent substitution: no silent runtime SKU substitution is approved or
  modeled.
- No pricing authority beyond deterministic pricing inputs when a line is
  present in the accepted customer scope.
- No runtime AI pricing or configuration decisions; runtime AI does no math,
  pricing, SKU replacement, validation, catalog lookup, or configuration decision.
- Configuration-expansion authority and pricing/catalog authority stay separate;
  this record encodes no unit prices, totals, discounts, margins, markups, VAT,
  currency amounts, or price maps.

## 6. What This Record Does Not Do

It approves no optic as an expansion child, approves no replacement, creates no
Batch 4 runtime expansion rule pack, modifies no approved Batch 1/Batch 2/Batch 3
pack, and adds no pricing, catalog, API, UI, DB, export, or runtime evaluator
behavior. The composer remains Batch 1+2+3 only. Any future Batch 4 runtime pack,
if ever approved, is authored as a separate new artifact by a separate later
prompt.
