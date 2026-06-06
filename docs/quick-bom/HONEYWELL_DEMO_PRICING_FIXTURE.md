# Honeywell MVP Demo Pricing / Category Fixture

Status: approved demo fixture (Honeywell MVP demo only)

This document describes the temporary Honeywell MVP demo price/category fixture:

- Data: `data/quick-bom/honeywell-demo-pricing-fixture.json`
- Loader: `src/lib/projects/honeywell-demo-pricing-fixture.ts`
- Tests: `tests/lib/projects/honeywell-demo-pricing-fixture.test.ts`

## What this is

A small, committed fixture that supplies, for exactly the 50 Honeywell MVP target
SKUs:

1. `unitListPriceSarBySku` - a per-SKU SAR list price compatible with
   `buildPricedExpandedBoqDraft`, and
2. `categoryByAcceptedSku` - a per-SKU Mantle total-bucket category
   (`product` / `service` / `subscription`) compatible with
   `buildMantlePriceEstimateModel`.

It exists so the Quick BoM demo path can produce a priced expanded BoM and a Mantle
price estimate end to end, using real Honeywell-configured evidence, before a
production pricing integration exists.

## Authority boundary (read this first)

This is **temporary demo fixture authority only**. It is explicitly:

- **not** permanent Cisco pricing authority,
- **not** broad Cisco-general pricing,
- **not** runtime AI pricing,
- **not** runtime catalog lookup,
- **not** replacement authority, and it authorizes
- **no** silent SKU substitution.

Configuration authority (which lines belong together) stays strictly separate from
pricing authority (what a line costs). This fixture carries only price and Mantle
category; it carries no expansion rules and approves no new configuration behavior.

The fixture JSON makes this boundary explicit through the metadata flags
`demoFixtureAuthority: true`, `productionPricingAuthority: false`,
`runtimeAiPricing: false`, `runtimeCatalogLookup: false`,
`replacementAuthority: false`, and `silentSkuSubstitution: false`.

## SKU scope (the 50)

The 50 SKUs are:

- every unique parent and child SKU from `getHoneywellMvpConfigExpansionRulePack()`
  (the composed Batch 1 + Batch 2 + Batch 3 approved rule pack) - 48 SKUs, plus
- the two **standalone customer BoQ optics** `SFP-10G-LR-S=` and
  `SFP-10/25G-LR-S=`.

The optics are standalone customer BoQ lines. Per the Prompt 64 decision, they are
priced/exported only because the customer provided them and deterministic CCW
pricing evidence exists; they are **never auto-added as expansion children**.

The price map and the category map contain exactly the same 50 SKU keys.

## Where the prices come from

The single source of evidence is the configured / priced CCW estimate:

- Workbook: `C:\Pre-Sales\Benchmarck_Files\Estimate_NB167337237YA.xlsx`
- Sheet: `EstimateDetails_NB167337237YA`

This CCW estimate is the primary Honeywell MVP configured/priced reference, and it
covers all 50 target SKUs, so every committed price uses CCW estimate evidence. The
local Cisco GPL CSV may be used only as optional supplemental existence/category
evidence; GPL prices are **not** used when the CCW estimate has a price for the SKU
(which, here, is all 50).

### Term / effective unit price derivation

For each SKU the demo `unitListPriceSar` is derived as:

```
unitListPriceSar = round2(Extended ListPrice / Quantity)
```

This deliberately captures the **effective / term unit price** from the CCW
estimate rather than the raw single-period `ListPrice` cell. For term-based lines
the extended price reflects the full term, so dividing by quantity yields the
effective per-unit price the demo should show.

Worked example: `LIC-CW-A` (worksheet row 9, CCW line `2.1`) has raw `ListPrice`
78.11, `Quantity` 12, and `Extended ListPrice` 33743.52, so the fixture
`unitListPriceSar` is `33743.52 / 12 = 2811.96` - not 78.11.

Per-SKU evidence is stored in `priceSourceEvidenceBySku`, each entry carrying:
source type `ccw_estimate`, the workbook path, the sheet name, the worksheet row
number, the CCW line number, the source quantity, the raw `ListPrice`, raw
`Extended ListPrice`, raw `Selling Price`, and the derivation note
`extended_list_price_divided_by_quantity`. When a SKU appears more than once in the
estimate, the generator requires the derived unit prices to be identical before
collapsing to one entry, and records the first occurrence as evidence.

The price map carries no discount, margin, markup, VAT, FX/USD conversion, or
sell-price authority - only an explicit SAR list price per SKU.

## Categories

Each SKU is assigned exactly one Mantle category, used only for Mantle total
buckets (it does not affect rule or configuration authority):

- `service` - service/support lines (`CON-*`, `SVS-*`),
- `subscription` - licenses / software subscription lines (`LIC-*`,
  `CISCO-NETWORK-SUB`, DNA Advantage term licenses, ThousandEyes, DNA Spaces,
  Network Advantage licenses, Network PnP, and the universal IOS-XE image lines),
- `product` - physical hardware, accessories, optics, phones, switches, and
  power / cable / fan / stacking / mounting / rack-kit lines.

Zero-price included lines still receive a category; category affects only the
Mantle total buckets, never rule authority.

## What must replace this later

Production pricing must come from an approved **Cisco API / CCW / catalog pricing
integration** or a separately approved pricing source. When that lands, this demo
fixture must be replaced: it is scope-bound to the Honeywell MVP demo, bound to one
CCW estimate snapshot, and is not a general pricing source. No replacement and no
silent SKU substitution are approved by this fixture.
