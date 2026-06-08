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
