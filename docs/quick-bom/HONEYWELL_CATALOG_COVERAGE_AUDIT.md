# Honeywell Catalog Coverage Audit

Prompt 102 records read-only coverage of the Honeywell Quick BoM demo SKU sets
against the committed local SKU lookup source.

## Authority Boundary

- Catalog source: `local_stc_historical_mock`.
- This is audit evidence only.
- It does not create pricing authority.
- It does not create configuration authority.
- It does not create production Cisco GPL, Cisco API, or CCW catalog authority.
- It does not approve SKU substitution or replacement.
- Matched catalog SKUs are reported for coverage only and must not be treated as
  accepted customer SKUs.

## Customer BoQ Rows

The seven Honeywell customer BoQ rows are audited in customer input order:

| Line | SKU | Quantity | Outcome |
| --- | --- | ---: | --- |
| 1 | CW9178I-CFG | 12 | not_found |
| 2 | CISCO-NETWORK-SUB | 1 | matched |
| 3 | C9300X-48HX-A | 7 | not_found |
| 4 | C9300L-24P-4X-A | 6 | not_found |
| 5 | SFP-10G-LR-S= | 12 | matched |
| 6 | SFP-10/25G-LR-S= | 14 | matched |
| 7 | CP-7841-K9= | 59 | matched |

Customer row counts:

- total: 7
- matched: 4
- not_found: 3
- ambiguous: 0
- zero_or_negative_price_matches: 1
- exact_matches: 4
- normalized_matches: 0

Customer row missing SKUs:

- CW9178I-CFG
- C9300X-48HX-A
- C9300L-24P-4X-A

Customer row ambiguous SKUs: none.

## Broader Honeywell Demo SKU Universe

The broader Honeywell demo SKU universe is the sorted, de-duplicated set of 50
SKU identities from the committed Honeywell demo pricing fixture. The fixture is
read only as a SKU identity source for this audit; its prices do not become
catalog authority here.

Broader SKU counts:

- total: 50
- matched: 30
- not_found: 20
- ambiguous: 0
- zero_or_negative_price_matches: 19
- exact_matches: 30
- normalized_matches: 0

Broader missing SKUs:

- AIR-AP-T-RAIL-F
- C9300L-24P-4X-A
- C9300L-DNA-A-24
- C9300L-DNA-A-24-3Y
- C9300L-NW-A-24
- C9300L-STACK-A
- C9300L-STACK-KIT2
- C9300X-48HX-A
- CON-L1NBD-P7PK94P1
- CON-L1NCD-C9300XY4
- CON-L1NCD-C93024PX
- CON-L1SWT-C93A48
- CON-L1SWT-C93LA24
- CON-ROB-CW9178IC
- CW9178-SINGLE
- CW9178I-CFG
- LIC-SPACES-ADV
- S9300LUK9-1718
- SC9300UK9-1715
- STACK-T3A-50CM

Broader ambiguous SKUs: none.

## Optics Decision

`SFP-10G-LR-S=` and `SFP-10/25G-LR-S=` remain standalone customer-requested BoQ
lines. This audit does not attach optics under C9300X or C9300L switches and
does not approve any design-driven child relationship.

## Interpretation

The audit closes the Honeywell catalog-coverage visibility gap by documenting
what the current local historical/mock catalog resolves and misses. The missing
SKUs are evidence for future catalog-governance work only. Adding missing local
catalog entries, using Cisco GPL or CCW as authority, or approving replacements
requires a separate explicit approval path.
