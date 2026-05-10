# Tender Analyzer (TA) Data Model

> Reverse-engineered from STCS Tender Analyzer workbooks across three format generations.
> Source workbooks: V34 (OP-2024-147007), V35 (OP-2025-154381), V31 (OP-010886), Mid-format/PLv13 (OP-2022-90896).

---

## 1. TA Version Comparison

### Format Generations

| Attribute | Mid-format (PLv13) | V31 (TA 2016 V31) | V34/V35 (TA 2016B V34-V35) |
|---|---|---|---|
| **Sheet count** | 9 | 43 | 24 |
| **Era** | ~2019-2022 | ~2019 | 2024-2025 (current) |
| **Main line-item sheet** | `Detailed Bid Costing` | `Bid` | `BoQ` |
| **Financial parameters sheet** | `Factors & Summary by Category` | `Factors & Summary` | `FINANCIAL SUMMARY` |
| **Config sheet** | `Type and Currencies` | `Type & Currency` | `INPUT LISTS` |
| **Presales costing** | (none) | `Cost UPL` | `PRESALES COSTING SUMMARY` |
| **Pricing output** | `CPQ` | `Proposal` | `STANDARD PRICING TABLE` |
| **Margin/Markup toggle** | No (Margin only) | Yes (`Type & Currency!B24`) | Yes (`INPUT LISTS!C24`) |
| **Embed discounts** | No | Yes (3 types) | Yes (3 types) |
| **FOC handling** | No | Yes | Yes |
| **Royalty fees (CITC/STC)** | No | No | Yes |
| **Local Content tracking** | No | No | Yes |
| **Monthly plan pricing** | No | Yes (PMT-based) | Yes |
| **Revenue Share** | No | Yes | Yes |
| **Structured Excel tables** | Yes (`DBCEnG`, `SBT`) | No | Yes (`Table3`, `Table4`) |

### Sheet Inventory by Version

**V34/V35 (24 sheets):**
1. Summary for Management
2. Analyse by Vendor
3. Analyse by Level 1
4. Analyse by Level 2
5. Analyse by Level 3
6. Analyse by Element
7. Analyse by Suppliers
8. Levels (ALL)
9. INPUT LISTS
10. Guide & RACI
11. CHARTER
12. **BoQ** (main line items)
13. **PRESALES COSTING SUMMARY**
14. **FINANCIAL SUMMARY**
15. CASH FLOW
16. STANDARD PRICING TABLE
17. Share Revenue
18. Level0
19. Level1
20. Level2
21. Level6
22. MIC
23. Suffix
24. CAPEX MIC

**V31 (43 sheets):**
1. Summary for Management
2. Bid General Info
3. **Bid** (main line items)
4. RFQ
5. Sheet2, Sheet1
6. **Factors & Summary**
7. AuthorityMatrix
8. Cost UPL
9. Proposal
10. Proposal Sign-Off
11. Opportunity Assignment Info
12. Kick-Off Meeting
13. Scope Of Work
14. Cash Flow
15. Salesforce
16. **Type & Currency**
17. Bid Template
18. Open Envelopes Results w chart
19. WIN ANNOUNCEMENT
20. Manpower Cost Calculator
21. Elementary Bid Bond
22. Performance Bid Bond
23. Bid Bond Template
24. Lessons Learned
25-30. Analyse by Level 1/2/3, Vendor, Suppliers, Element
31. Levels (ALL)
32. PM CEA
33. Handover
34. Bundle Build
35-38. Level0/1/2/6
39. MIC
40. Suffix
41. CAPEX MIC
42. Guide

**Mid-format/PLv13 (9 sheets):**
1. **Factors & Summary by Category**
2. **Detailed Bid Costing**
3. Summary by Element
4. Levels
5. Type and Currencies
6. On-Hold Suppliers
7. Suppliers
8. UPL Cost
9. CPQ

### Key Differences Between Versions

1. **Sheet consolidation**: V34/V35 removed 19 administrative sheets (Bid General Info, AuthorityMatrix, Proposal, Bid Bonds, Kick-Off, Scope Of Work, etc.) and replaced them with CHARTER + Guide & RACI. The BoQ sheet absorbed the "Bid" sheet's role.

2. **Column expansion**: V31 Bid sheet has 122 columns (A-DR); V34 BoQ has 121 columns (A-DQ) but adds Inhouse Margin, Zakat, CITC Royalty, and Local Content columns that V31 lacks.

3. **Overhead evolution**: V31 has 6 overhead types (Shipment, Custom, Insurance, WHTax, Finance, Risk). V34/V35 adds Zakat (separated from WHTax), SMS CITC Royalty Fee (11%), and STC Royalty Fee (0.25%).

4. **Pricing model**: Mid-format uses hardcoded margin-only formula (`Cost/(1-GP%)`). V31+ adds a Margin/Markup toggle. V34/V35 adds Inhouse Actual Margin as a separate layer before overhead application.

5. **Lookup keys**: V31 uses `DM` column (`Category&Vendor&Supplier`). V34/V35 uses `DK` column (`Supplier&Element&PartNumber` concatenation). Mid-format uses structured table references (`DBCEnG[Category]`).

---

## 2. Complete Cost Stack Formula

### Overview: From List Price to Net Selling Price

The TA builds selling prices bottom-up through a layered cost stack. Every line item flows through this pipeline:

```
List Price (vendor currency)
  -> Currency Conversion (to SAR)
  -> Vendor Discount (Confirmed + Additional Estimated)
  -> Inhouse Margin Deduction (V34/V35 only)
  -> Overhead Loading (Shipment + Custom + Insurance + WHTax + Zakat + Finance + Risk)
  -> Fixed Value Addition
  -> Cost w/ Overhead (unit cost)
  -> Profit % Application (Margin or Markup mode)
  -> Unit Selling Price
  -> Embed Discounts (Discount + Solution + InHouse)
  -> Royalty Fees (SMS CITC + STC)
  -> FOC Adjustments
  -> Revenue Share
  -> Net Grand Total Selling Price
```

### Line-Item Formulas (V34/V35 BoQ Sheet)

Each row in the BoQ represents a single priced item. Below is the complete formula chain using V34 column references:

#### Step 1: Base Cost Calculation

| Column | Name | Formula | Description |
|--------|------|---------|-------------|
| Y | Total Qty | `=K*J` | Item Price Multiplier x Quantity |
| Z | Item List Price | `=L` | Raw vendor quote price |
| AA | Total List Price (vendor currency) | `=Z*J*K` | List price x qty x multiplier |
| X | Currency Value | `=INDEX('INPUT LISTS'!C11:C19, MATCH(W, 'INPUT LISTS'!B11:B19, 0))` | Exchange rate lookup (SAR/USD/EUR/etc.) |
| AB | Item Cost (SAR) | `=X*Z` | Convert unit price to SAR |
| AC | Total List Price Cost (SAR) | `=AB*J*K` | Total cost in SAR |

#### Step 2: Vendor Discount Application

| Column | Name | Formula | Description |
|--------|------|---------|-------------|
| AD | Supplier Disc. (%) | `=INDEX('FINANCIAL SUMMARY'!J, MATCH(DK, 'FINANCIAL SUMMARY'!AQ, 0)) + INDEX('FINANCIAL SUMMARY'!K, ...)` | Confirmed + Additional estimated discount |
| AH | Item Price After Discount | `=ROUND(Z*(1-AD), INPUT_LISTS!C8)` | Unit price after vendor discount (vendor currency) |
| AJ | Item Price After Discount (SAR) | `=ROUND(((1-AD)*AB)*(1-AM), INPUT_LISTS!C8)` | After discount AND inhouse margin (SAR) |
| AK | Total After Discount (SAR) | `=AJ*J*K` | Total after discount |

#### Step 3: Inhouse Margin (V34/V35 only)

| Column | Name | Formula | Description |
|--------|------|---------|-------------|
| AM | Inhouse Actual Margin % | `=INDEX('Levels (ALL)'!G, MATCH(U, 'Levels (ALL)'!B, 0))` | Margin from Level 3 code lookup |
| AL | Inhouse Actual Margin Value (SAR) | Derived from AM application | Deducted before overhead |

#### Step 4: Overhead Loading

All overhead percentages are pulled per-product from `FINANCIAL SUMMARY` via INDEX/MATCH on the DK lookup key:

| Column | Name | Source | Default/Typical |
|--------|------|--------|-----------------|
| AN | Shipment % | FINANCIAL SUMMARY col L | 0-5% |
| AP | Custom % | FINANCIAL SUMMARY col M | 0-5% |
| AR | Insurance % | FINANCIAL SUMMARY col N | 0% (global default) |
| AT | WHTax % | FINANCIAL SUMMARY col O | 0-7% (see special logic below) |
| AV | Zakat % | (V34+ only) | 2.5% |
| AY | Finance % | FINANCIAL SUMMARY col P | 0% (global default) |
| BA | Risk % | FINANCIAL SUMMARY col Q | 0-5% |

**WHTax Special Logic (V34/V35):**
```
IF selling outside KSA: 0%
ELSE IF supplier is Foreign:
  IF category is "Lic-" AND vendor is "Cisco": 7%
  ELSE: lookup from INPUT LISTS category overhead table
ELSE (Local supplier): 0%
```

**Overhead category defaults (from INPUT LISTS):**

| Category Prefix | Overhead % | Payment Terms (days) |
|-----------------|------------|---------------------|
| HW- | 0% | 120 |
| SW- | 0% | 120 |
| Lic- | 15% | 60 |
| TSS- | 5% | 60 |
| PS- | 5% | 90 |
| PM- | 5% | 1 |
| MS- | 5% | 1 |
| CLD- | N/A | N/A |
| CNSLT- | 15% | 1 |
| TR- | 15% | 120 |
| ESS- | N/A | 1 |
| MPO- | 5% | N/A |

#### Step 5: Total Expenses & Cost w/ Overhead

| Column | Name | Formula | Description |
|--------|------|---------|-------------|
| BD | Fixed Value (SAR) | From FINANCIAL SUMMARY col T | Per-unit fixed cost addition |
| BF | Total Expenses (SAR) | `=AO+AQ+AS+AX+AZ+BB+BE` | Sum of all overhead amounts |
| BW | Item Cost w OH (SAR) | `=ROUND((AJ + (AO+AQ+AS+AU+AW+AZ+BB+BT+BN)/(J*K)) + BD, decimals)` | Unit cost including all overheads |
| BX | Total Unit Cost w OH (SAR) | `=(BW*J*K) - IF(CY="Vendor 2 STC", (CZ*AJ*CP), 0) - (CX*AJ*CP)` | Total cost minus FOC adjustments |

**V31 equivalent (Bid sheet):**
```
BF = ROUND((AG*(1+AU)) + AV*K, decimals)
   = (Price_After_Discount_SAR * (1 + Total_Overhead_%)) + Fixed_Value
```

**Mid-format equivalent (Detailed Bid Costing):**
```
AJ = ROUND(AD * (1 + AF), decimals)
   = Cost_After_Supplier_Discount_SAR * (1 + OH%)
```

#### Step 6: Profit / Selling Price

The TA supports two pricing modes controlled by a global toggle:

| Mode | Toggle Location | Selling Price Formula |
|------|----------------|----------------------|
| **Margin** | `INPUT LISTS!C24 = "Margin"` | `Selling = Cost / (1 - Profit%)` |
| **Markup** | `INPUT LISTS!C24 = "Markup"` | `Selling = Cost * (1 + Profit%)` |

**V34/V35 BoQ formula (col BZ):**
```
BZ = IF(CE="Round 0",
       ROUND(IF(CB="",
                IF(INPUT_LISTS!C24="Margin", BW/(1-BY), BW+(BW*BY)),
                CB),
             0),
       IF(CE="Round 2",
          ROUND(..., 2),
          IF(CB="", IF(INPUT_LISTS!C24="Margin", BW/(1-BY), BW+(BW*BY)), CB)))
```

Where:
- `BY` = Profit % (from FINANCIAL SUMMARY col U)
- `BW` = Item Cost w OH
- `CB` = Manual override price (if set, bypasses formula)
- `CE` = Rounding mode (Round 0, Round 2, Default)

**Total selling price:**
```
CA = IF(CC="", BZ*CO*CP, CC*CO)
```
Where CO/CP are quantity/multiplier adjustments.

#### Step 7: Embed Discounts

Three types of embed discounts applied after base selling price:

| Type | BoQ Column | FINANCIAL SUMMARY Column | Purpose |
|------|-----------|-------------------------|---------|
| Discount Embed | BG/BH | X | General discount off selling price |
| Solution Embed | BI/BJ | Y | Solution-level discount |
| InHouse Embed | BK/BL | Z | STCS internal discount |

Applied to derive B2B Sale After Embed price.

#### Step 8: Royalty Fees (V34/V35 only)

| Fee | Column | Default Rate | Formula |
|-----|--------|-------------|---------|
| SMS CITC Royalty | BM/BN/BO/BP | 11% (R=0.11) | Applied to selling price |
| STC Royalty | BS/BT | 0.25% (S=0.0025) | Applied to selling price |

#### Step 9: FOC (Free of Charge) Adjustments

| Column | Name | Description |
|--------|------|-------------|
| CX | FOC Qty (STCS 2 STC) | Quantity given free by STCS |
| CY | Discount By | `"Vendor 2 STC"` or `"STCS 2 STC"` or blank |
| CZ | FOC Qty (Vendor 2 STC) | Quantity given free by vendor |

FOC reduces total cost: `Total_Cost = (BW*J*K) - FOC_vendor_adjustment - FOC_STCS_adjustment`

#### Step 10: Revenue Share (V31+)

Revenue share types (from INPUT LISTS / Type & Currency):
- MS MRC: 15%
- MS OTC Extended: 5%
- 100% STC Scope: 100%
- DIA, Custom Managed Services, VIVA BH, VIVA KW: various rates

Applied via FINANCIAL SUMMARY columns V (Revenue Share Awarding Type) and W (OTC/MRC).

#### Step 11: Aggregated Totals

**FINANCIAL SUMMARY aggregation (V34/V35):**
```
AB (Total List Price Vendor Cost SAR)  = SUMIF(BoQ!DK, AQ, BoQ!AC)
AE (Total Vendor Cost SAR)             = SUMIF(BoQ!DK, AQ, BoQ!AK)
AG (Total Cost SAR)                    = SUMIF(BoQ!DK, AQ, BoQ!BX)
AH (Total B2B Sale SAR)               = SUMIF(BoQ!DK, AQ, BoQ!CA)
AL (NET Grand Total Selling Price SAR) = AH - AJ - AK  [B2B - FOC - Discounts&RevShare]
```

**Summary for Management aggregation:**
```
Overheads Total = Shipment + Custom + Insurance + WH Tax + Finance + Risk + Fixed
                = FINANCIAL SUMMARY!L255 + M255 + N255 + O255 + P255 + Q255 + T255

Inhouse Items Discount = -(1 - Price_After_Discount / Total_List_Price)
```

### Complete Cost Stack (Canonical Formula)

```
Unit_List_Price_SAR = Unit_List_Price_Vendor_Currency * Exchange_Rate

Unit_After_Vendor_Discount = Unit_List_Price_SAR * (1 - Vendor_Discount_%)

Unit_After_Inhouse_Margin = Unit_After_Vendor_Discount * (1 - Inhouse_Margin_%)   [V34+ only]

Overhead_Amount = Unit_After_Discount * (Shipment% + Custom% + Insurance%
                  + WHTax% + Zakat% + Finance% + Risk%)

Unit_Cost_With_OH = Unit_After_Inhouse_Margin + Overhead_Amount + Fixed_Value

IF Margin mode:
    Unit_Selling_Price = Unit_Cost_With_OH / (1 - Profit_%)
ELSE (Markup mode):
    Unit_Selling_Price = Unit_Cost_With_OH * (1 + Profit_%)

Total_B2B_Sale = Unit_Selling_Price * Qty * Multiplier

B2B_After_Embed = Total_B2B_Sale * (1 - Discount_Embed - Solution_Embed - InHouse_Embed)

Net_Selling = B2B_After_Embed - FOC_Total - STC_Revenue_Share - Royalty_Fees
```

---

## 3. Discount and Margin Patterns

### Vendor Discount Structure

Vendor discounts are split into two components stored per product group in FINANCIAL SUMMARY:

| Component | Column (V34) | Column (V31) | Description |
|-----------|-------------|-------------|-------------|
| **Confirmed** | J | J | Negotiated/contracted discount from vendor |
| **Additional Estimated** | K | K | Speculative additional discount (bid strategy) |
| **Total Applied** | J + K | J + K | Combined discount applied to list price |

### Discount Routing (FOC)

The `Discount_By` field (BoQ col CY) determines who bears the discount cost:

| Value | Meaning |
|-------|---------|
| `STCS 2 STC` | STCS absorbs the discount (reduces STCS margin) |
| `Vendor 2 STC` | Vendor provides the discount (no STCS margin impact) |
| `BLANK` | No FOC discount |

### Embed Discount Types

Three layers of post-selling-price discounts:

| Type | Purpose | Typical Usage |
|------|---------|---------------|
| **Discount Embed** | Visible discount shown to customer | Competitive pricing adjustment |
| **Solution Embed** | Solution-level bundle discount | Multi-product deal sweetener |
| **InHouse Embed** | STCS internal margin sacrifice | Strategic win pricing |

### Margin Calculation Methodology

**Primary margin formula:**
```
Margin % = 1 - (Total_Cost / Total_Selling_Price)
```

This is verified at multiple levels:
- **Line item**: BoQ col BR = `1 - (Cost_w_OH / Selling_Price)`
- **Product group**: FINANCIAL SUMMARY col AG vs AH
- **Bid level**: Summary for Management row 38 = `-(1 - Price_After_Discount / List_Price)`
- **Solution level**: `Factors & Summary!AG263` (V31)

### Margin/Profit Modes

| Mode | Formula | When Cost=100, Profit=25% | Result |
|------|---------|--------------------------|--------|
| **Margin** | `Sell = Cost / (1 - Profit%)` | `100 / 0.75` | Sell = 133.33, Margin = 25% |
| **Markup** | `Sell = Cost * (1 + Profit%)` | `100 * 1.25` | Sell = 125.00, Margin = 20% |

The toggle is at `INPUT LISTS!C24` (V34/V35) or `Type & Currency!B24` (V31). Mid-format (PLv13) is hardcoded to Margin mode only.

### Approval Authority Matrix (from V31)

Margin thresholds trigger different approval levels:

| Scenario | Deal Size | Margin Range | Approval Required |
|----------|-----------|-------------|-------------------|
| BD-3a: Sell Direct | B2B >= 500K SAR | Varies by range | Tiered (rows 8-13) |
| BD-3b: Sell Direct | B2B < 500K SAR | Varies by range | Tiered (rows 17-22) |
| BD-4: Sell Through STC | <= 36 months | Standard | Tiered (rows 25-28) |
| BD-4: Sell Through STC | > 36 months | Any | CEO required (row 31) |
| BD-5: Sell Through NON-DIA | > 36 months | Any | Tiered (rows 34-37) |
| BD-6: Sell To STC | Any | Varies | Tiered (rows 40-45) |
| BD-7: Sell To Subsidiaries | Any | Varies | Tiered (rows 48-53) |

Correlates with playbook thresholds: >=25% (green), 15-25% (standard), 10-15% (escalation), <10% (CEO/VP approval).

### STC Revenue Share Rates

| Revenue Share Type | Rate |
|-------------------|------|
| MS MRC | 15% |
| MS OTC Extended | 5% |
| 100% STC Scope | 100% |
| DIA | Varies |
| Custom Managed Services | Varies |

### Financial Rates (from INPUT LISTS)

| Parameter | Value |
|-----------|-------|
| IRR | 9.3% |
| Discount Rate 1 (IRR) | 10% |
| Discount Rate 2 (IRR) | 15% |
| Cash Flow Rate | 9% |
| VAT | 15% |
| Zakat | 2.5% |

### Finance Selling Rates

| Term | Rate % | Sell Thru Rate % |
|------|--------|-----------------|
| 12 Months | 9.8% | 5.5% |
| 24 Months | 10.0% | 5.7% |
| 36 Months | 10.2% | 6.3% |
| 48 Months | 10.25% | 6.1% |

---

## 4. BoQ Sheet Data Model

### Column Structure (V34/V35 -- 121 columns)

#### Identification Block (A-H)

| Col | Header (EN) | Header (AR) | Description |
|-----|-------------|-------------|-------------|
| A | # | # | Auto-incrementing serial number |
| B | Item # as RFP | رقم البند حسب الطلب | Customer's RFP reference number |
| C | Category | التصنيف | Product category code (e.g., HW-HPE-PH1) |
| D | Vendor | المصنع | Vendor name (pulled from PRESALES COSTING SUMMARY) |
| E | Supplier | المورد | Supplier name (pulled from PRESALES COSTING SUMMARY) |
| F | Element | العنصر | System element / solution component |
| G | STCS Part Number | رقم القطعة | STCS internal part number |
| H | Item Description | الوصف | Full item description |

#### Quantity & Base Pricing (I-N)

| Col | Header | Description |
|-----|--------|-------------|
| I | Unit | Unit of measure (Each, Lot, Monthly, Yearly, etc.) |
| J | Qty | Quantity |
| K | Item Price Multiplier | Multiplier (for multi-year or phased pricing) |
| L | Item Price (Currency as Vendor Quote) | Raw vendor quote unit price |
| M | Decimal | Decimal validation check |
| N | Inhouse Advisor / Important Comment | Internal notes |

#### Classification (P-V)

| Col | Header | Source |
|-----|--------|-------|
| P | Supplier Price Type | FINANCIAL SUMMARY (List Price / Cost Price / Selling Price / Unknown) |
| Q | Level 1 | Business line (Cloud & Datacenter, Cyber Security, etc.) |
| R | Level 2 | Sub-category |
| S | Level 3 | Detailed classification |
| T | Level 2 Code | Numeric code from Levels (ALL) |
| U | Level 3 Code | Numeric code from Levels (ALL) |
| V | OTC / MRC | One-Time-Cost, OTC Extended, or Monthly Recurring Cost |

#### Currency Conversion (W-X)

| Col | Header | Description |
|-----|--------|-------------|
| W | Currency Logo | Currency code (SAR, USD, EUR, etc.) |
| X | Currency Value | Exchange rate to SAR |

#### Cost Calculation (Y-AK)

| Col | Header | Formula Pattern |
|-----|--------|----------------|
| Y | Total Qty | `=K*J` |
| Z | Item List Price | `=L` |
| AA | Total List Price (vendor currency) | `=Z*J*K` |
| AB | Item Cost (SAR) | `=X*Z` |
| AC | Total List Price Cost (SAR) | `=AB*J*K` |
| AD | Supplier Disc. (%) | Confirmed + Additional from FINANCIAL SUMMARY |
| AE | Supplier Disc. (SAR) | `=AC*AD` |
| AF | Project Type % | VLOOKUP from INPUT LISTS |
| AG | Project Type Value (SAR) | `=AC*AF` |
| AH | Item Price After Supplier Discount | `=ROUND(Z*(1-AD), decimals)` |
| AI | Total After Supplier Discount | `=AH*J*K` |
| AJ | Item Price After Discount (SAR) | `=ROUND(((1-AD)*AB)*(1-AM), decimals)` |
| AK | Total After Discount (SAR) | `=AJ*J*K` |

#### Inhouse Margin (AL-AM) -- V34/V35 only

| Col | Header | Formula |
|-----|--------|---------|
| AL | Inhouse Actual Margin Value (SAR) | Derived |
| AM | Inhouse Actual Margin % | `=INDEX('Levels (ALL)'!G, MATCH(U, 'Levels (ALL)'!B, 0))` |

#### Overheads (AN-BE)

| Col | Header | Source |
|-----|--------|--------|
| AN/AO | Shipment % / Total | FINANCIAL SUMMARY col L |
| AP/AQ | Custom % / Total | FINANCIAL SUMMARY col M |
| AR/AS | Insurance % / Total | FINANCIAL SUMMARY col N |
| AT/AU | WHTax % / Total | FINANCIAL SUMMARY col O |
| AV/AW | Zakat % / Total | V34+ only |
| AX | WHTax & Zakat Combined | `=AU+AW` |
| AY/AZ | Finance % / Total | FINANCIAL SUMMARY col P |
| BA/BB | Risk % / Total | FINANCIAL SUMMARY col Q |
| BC | Total Overhead % | `=AN+AP+AR+AT+AV+AY+BA` |
| BD | Fixed Value (SAR) | FINANCIAL SUMMARY col T |
| BE | Total Fixed Values | `=BD*J*K` |
| BF | Total Expenses | `=AO+AQ+AS+AX+AZ+BB+BE` |

#### Embed Discounts (BG-BL)

| Col | Header | Source |
|-----|--------|--------|
| BG/BH | Embed Disc. % / SAR | FINANCIAL SUMMARY col X |
| BI/BJ | Solution Embed % / Total | FINANCIAL SUMMARY col Y |
| BK/BL | InHouse Embed % / Total | FINANCIAL SUMMARY col Z |

#### Royalties (BM-BT) -- V34/V35 only

| Col | Header | Default |
|-----|--------|---------|
| BM | SMS CITC Royalty Fee % | 11% |
| BN | Total CITC Royalty (Highest) | Calculated |
| BO | Total Selling for CITC | Calculated |
| BP | Total CITC Royalty | Calculated |
| BQ | Total Selling Price (SAR) | Calculated |
| BR | Margin % (without Royalties) | `=1 - Cost/Sell` |
| BS | STC Royalty Fee % | 0.25% |
| BT | Total STC Royalty Fee (SAR) | Calculated |

#### Final Pricing (BU-CB)

| Col | Header | Description |
|-----|--------|-------------|
| BU | Max Price Currency Value | Maximum allowable price |
| BV | Total PR Cost (SAR) | Purchase requisition cost |
| BW | Item Cost w OH (SAR) | Complete unit cost with all overheads |
| BX | Total Unit Cost w OH (SAR) | Total cost with FOC adjustments |
| BY | Profit % | From FINANCIAL SUMMARY col U (Margin or Markup) |
| BZ | Item Price (SAR) | Calculated selling price |
| CA | Total Price (SAR) | `=BZ * Qty * Multiplier` |
| CB | Max/Manual Sales Price | Manual override selling price |

#### Extended Columns (CC-DQ)

| Range | Purpose |
|-------|---------|
| CC-CE | Manual price overrides, rounding control |
| CJ | Bid currency (for multi-currency proposals) |
| CO/CP | Quantity/multiplier adjustments |
| CQ/CR | Customer-facing price (feeds STANDARD PRICING TABLE) |
| CS-CZ | FOC handling (STCS 2 STC / Vendor 2 STC) |
| DH | Additional validations |
| DK | **Lookup key** = `E&F&G` (Supplier&Element&PartNumber) |
| DN | Level1 & OTC/MRC concatenation (for Summary pivot) |

### Item Grouping

Items are grouped using **HEADER codes** in the Category column:

| Code | Level | Purpose |
|------|-------|---------|
| HEADER0 | Highest | Major section divider |
| HEADER1 | High | Solution/system group |
| HEADER2 | Medium | Vendor group |
| HEADER3 | Low | Sub-component group |
| HEADER4 | Lower | Detail level |
| HEADER5 | Lower | Detail level |
| HEADER6 | Lowest | Detail level |

Actual items use category codes: `{Type}-{Vendor}-{Phase}`, e.g.:
- `HW-HPE-PH1` = Hardware from HPE, Phase 1
- `TSS-CSCO-PH1` = Technical Support Services from Cisco, Phase 1
- `MS-STCS-3YR` = Managed Services from STCS, 3-year term
- `CLD-DTV-Electricity` = Cloud DataVault Electricity costs

### Category Prefix Reference

| Prefix | Full Name |
|--------|-----------|
| CLD- | Cloud |
| CNSLT- | Consulting |
| ESS- | Standard Services |
| HW- | Hardware |
| Lic- | License |
| MPO- | Manpower Outsourcing |
| MS- | Managed Services |
| PM- | Project Management |
| PS- | Professional Services |
| SW- | Software (bundled with HW) |
| TR- | Training |
| TSS- | Technical Support Services |

### Level 1 Business Lines

| Level 1 Value |
|---------------|
| Cloud & Datacenter Services |
| Communication & Internet |
| Cyber Security |
| Digital Services |
| Digital Transformation |
| Managed Services |
| Management Consultancy |
| Outsourcing Services |
| System Integration |

### Data Validations

| Column(s) | Validation Type | Values |
|-----------|----------------|--------|
| C (Category) | Named list | `Category_Presales` |
| D (Vendor) | Named list | `Vendors_List` |
| E (Supplier) | Named list | `Suppliers` |
| I (Unit) | Named list | `Unit` (Each, Lot, Monthly, Yearly, etc.) |
| P (Price Type) | List | List Price, Cost Price, Selling Price, Unknown, Blank |
| V (OTC/MRC) | List | OTC, OTC Extended, MRC, Blank |
| CE (Rounding) | List | Round 0, Round 2, Default |
| CJ (Currency) | Named list | `Currencies` |
| CY (Discount By) | Named list | `Discount_By` |

### Units of Measure

Bi-Weekly, Daily, Each, Half Yearly, Kilogram, Litre, Lot, Metre, Monthly, Quarterly, Roll, Weekly, Yearly

### Bilingual Headers

The STANDARD PRICING TABLE uses bilingual column headers via formula concatenation:
```
="Item Price" & CHAR(10) & 'INPUT LISTS'!$B$22
```
Where `INPUT LISTS!B22` contains the Arabic currency label. This pattern produces headers like:
```
Item Price
سعر الوحدة ريال
```

---

## 5. Cross-Sheet Data Flow

### Data Flow Diagram

```
                    +-----------------+
                    |  INPUT LISTS /  |
                    | Type & Currency |
                    +--------+--------+
                             |
            Config: Currency rates, Profit mode,
            Rounding, VAT, Category overhead %,
            Finance rates, Revenue share rates
                             |
            +----------------+----------------+
            |                                 |
            v                                 v
+---------------------+           +-------------------------+
| PRESALES COSTING    |           |   FINANCIAL SUMMARY /   |
|     SUMMARY         |           |   Factors & Summary     |
|---------------------|           |-------------------------|
| Aggregates BoQ by   |<--vendor--| Per-product-group       |
| category. Currency  |  lookup   | parameters: Discount %  |
| conversion. Presales|           | Overheads, Profit %,    |
| cost estimation.    |           | Embed %, Revenue Share  |
+----------+----------+           +------+------+-----------+
           |                             |      ^
     Vendor/Supplier                     |      |
     names per category            Parameters   | SUMIF aggregation
           |                       per product  | (BoQ!DK -> FS!AQ)
           v                             |      |
+----------+----------------------------+------+-----------+
|                        BoQ / Bid                         |
|----------------------------------------------------------|
| Main line-item sheet. ~1000 rows.                        |
| Pulls: Vendor/Supplier from PRESALES COSTING SUMMARY     |
| Pulls: All financial params from FINANCIAL SUMMARY       |
| Calculates: Cost stack per item (discount -> overhead    |
|   -> margin -> selling price -> embeds -> royalties)     |
| Key column: DK (concatenated lookup key)                 |
+-----+-----+-----+-----+-----+-----+-----+--------------+
      |     |     |     |     |     |     |
      v     v     v     v     v     v     v
+-----+  +--+--+ +-+--+ +--+-+ +--+-+ +--+--+ +--------+
|STND |  |Summ | |A.L1| |A.L2| |A.L3| |A.Vnd| | CASH   |
|PRICE|  |Mgmt | |    | |    | |    | |     | | FLOW   |
|TABLE|  +-----+ +----+ +----+ +----+ +-----+ +--------+
|     |  Pulls from      All Analyse sheets pull from
|     |  FINANCIAL        BoQ via SUMIF by Level/Vendor
|     |  SUMMARY &
|     |  BoQ for
|     |  P&L view
+-----+
 Pulls from
 BoQ cols
 C,B,D,F,G,
 H,I,CO,CP,
 CQ,CR
 (customer-
 facing
 output)

+------------------+          +------------------+
|   Levels (ALL)   |--------->|  Level0-Level6   |
|------------------|  Level   |  MIC / Suffix /  |
| Level 1/2/3      |  codes   |  CAPEX MIC       |
| hierarchy with    |          +------------------+
| codes & margins   |          Reference/lookup
+------------------+          tables for MIC codes
                              and asset categories

+------------------+
|  CHARTER /       |
|  Bid General Info|
|------------------|
| Project metadata:|
| SF#, Client,     |
| Dates, Contacts, |
| Bid Bonds        |
+------------------+
  Referenced by Summary for Management,
  FINANCIAL SUMMARY (WHTax logic),
  BoQ (Project Type %)
```

### Key Cross-Sheet Reference Pairs

| From Sheet | To Sheet | Mechanism | Purpose |
|-----------|----------|-----------|---------|
| BoQ | FINANCIAL SUMMARY | `INDEX/MATCH` on DK->AQ | Pull discount%, overhead%, profit%, embeds per product |
| FINANCIAL SUMMARY | BoQ | `SUMIF` on AQ->DK | Aggregate totals (list price, cost, B2B sale, net sell) |
| BoQ | PRESALES COSTING SUMMARY | `INDEX/MATCH` on C (Category) | Pull Vendor and Supplier names |
| PRESALES COSTING SUMMARY | BoQ | `SUMIF` on Category->C | Aggregate list prices by category |
| BoQ | Levels (ALL) | `INDEX/MATCH` on U->B | Pull Inhouse Margin % per Level 3 code |
| BoQ | INPUT LISTS | `INDEX/MATCH` on W->B11:B19 | Currency exchange rate lookup |
| FINANCIAL SUMMARY | INPUT LISTS | Direct cell refs | Global config (profit type, rounding, VAT) |
| FINANCIAL SUMMARY | CHARTER | Direct cell refs | Project metadata (sell location, project type) |
| Summary for Management | FINANCIAL SUMMARY | `SUMIF` on B->C25:C34 | Rollup by Level 1 |
| Summary for Management | BoQ | `SUMIF` on Q/C/DN | Rollup by Level 1, Category, OTC/MRC |
| STANDARD PRICING TABLE | BoQ | Direct cell refs (row offset -4) | Customer-facing pricing view |
| Analyse by * | BoQ | `SUMIF` by respective dimension | Pivot analysis views |
| CASH FLOW | FINANCIAL SUMMARY | Cell references | Payment schedule generation |

### Version-Specific Sheet Name Mapping

| V34/V35 Sheet | V31 Equivalent | Mid-format Equivalent |
|---------------|----------------|----------------------|
| BoQ | Bid | Detailed Bid Costing |
| FINANCIAL SUMMARY | Factors & Summary | Factors & Summary by Category |
| INPUT LISTS | Type & Currency | Type and Currencies |
| PRESALES COSTING SUMMARY | Cost UPL | (none) |
| CHARTER | Bid General Info | (none) |
| STANDARD PRICING TABLE | Proposal | CPQ |
| Levels (ALL) | Levels (ALL) | Levels |

---

## 6. JSON Schema for BOMATIC

### Design Principles

1. **Version-agnostic**: Schema normalizes all TA versions into a single structure
2. **Formula-aware**: Calculated fields are marked; BOMATIC recomputes rather than storing stale values
3. **Lookup keys preserved**: The concatenated product keys (DK/DM/AR) are first-class fields
4. **Bilingual support**: String fields accept both EN and AR values

### Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bomatic.stcs.io/schemas/tender-analyzer/v1",
  "title": "BOMATIC Tender Analyzer Model",
  "description": "Normalized data model for STCS Tender Analyzer financial engine",
  "type": "object",
  "required": ["metadata", "config", "financial_summary", "line_items"],
  "properties": {

    "metadata": {
      "type": "object",
      "description": "Bid/project identification (from CHARTER / Bid General Info)",
      "required": ["salesforce_serial", "ta_version"],
      "properties": {
        "salesforce_serial": { "type": "string", "description": "OP-XXXX-XXXXXX" },
        "salesforce_reference": { "type": "string" },
        "ta_version": {
          "type": "string",
          "enum": ["PLv13", "V31", "V32", "V34", "V35"],
          "description": "TA format version"
        },
        "client_name": {
          "type": "object",
          "properties": {
            "en": { "type": "string" },
            "ar": { "type": "string" }
          }
        },
        "end_customer": { "type": "string" },
        "tender_number": { "type": "string" },
        "bid_name": {
          "type": "object",
          "properties": {
            "en": { "type": "string" },
            "ar": { "type": "string" }
          }
        },
        "region": { "type": "string" },
        "sector": { "type": "string" },
        "engagement_type": { "type": "string" },
        "opportunity_type": { "type": "string" },
        "awarding_type": { "type": "string" },
        "opportunity_complexity": { "type": "string" },
        "sell_location": {
          "type": "string",
          "enum": ["Inside KSA", "Sell Outside KSA"],
          "description": "Affects WHTax calculation"
        },
        "revenue_share_type": { "type": "string" },
        "project_period_days": { "type": "integer" },
        "contract_period_days": { "type": "integer" },
        "rfp_price_sar": { "type": "number" },
        "customer_budget_sar": { "type": "number" }
      }
    },

    "config": {
      "type": "object",
      "description": "Global configuration (from INPUT LISTS / Type & Currency)",
      "required": ["profit_mode", "bid_currency", "rounding"],
      "properties": {
        "profit_mode": {
          "type": "string",
          "enum": ["Margin", "Markup"],
          "description": "Controls selling price formula: Margin=Cost/(1-%), Markup=Cost*(1+%)"
        },
        "bid_currency": {
          "type": "string",
          "default": "SAR",
          "description": "Currency for customer-facing prices"
        },
        "rounding": {
          "type": "object",
          "properties": {
            "selling_price_decimals": { "type": "integer", "default": 2 },
            "cost_price_decimals": { "type": "integer", "default": 2 }
          }
        },
        "exchange_rates": {
          "type": "object",
          "description": "Currency code -> SAR rate",
          "additionalProperties": { "type": "number" },
          "examples": [{ "SAR": 1, "USD": 3.75, "EUR": 4.10 }]
        },
        "tax_rates": {
          "type": "object",
          "properties": {
            "vat_pct": { "type": "number", "default": 0.15 },
            "zakat_pct": { "type": "number", "default": 0.025 }
          }
        },
        "financial_rates": {
          "type": "object",
          "properties": {
            "irr": { "type": "number" },
            "cash_flow_rate": { "type": "number" },
            "discount_rate_1": { "type": "number" },
            "discount_rate_2": { "type": "number" }
          }
        },
        "finance_selling_rates": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "term_months": { "type": "integer" },
              "rate_pct": { "type": "number" },
              "sell_thru_rate_pct": { "type": "number" }
            }
          }
        },
        "revenue_share_rates": {
          "type": "object",
          "description": "Revenue share type -> percentage",
          "additionalProperties": { "type": "number" }
        },
        "royalty_rates": {
          "type": "object",
          "properties": {
            "sms_citc_pct": { "type": "number", "default": 0.11 },
            "stc_royalty_pct": { "type": "number", "default": 0.0025 }
          }
        },
        "category_overheads": {
          "type": "object",
          "description": "Category prefix -> default overhead %",
          "additionalProperties": { "type": "number" }
        },
        "category_payment_terms_days": {
          "type": "object",
          "description": "Category prefix -> payment terms in days",
          "additionalProperties": { "type": "integer" }
        }
      }
    },

    "financial_summary": {
      "type": "array",
      "description": "Per-product-group financial parameters (from FINANCIAL SUMMARY / Factors & Summary)",
      "items": {
        "type": "object",
        "required": ["product_key", "category", "vendor", "supplier"],
        "properties": {
          "product_key": {
            "type": "string",
            "description": "Concatenated lookup key (Supplier&Element&PartNumber in V34, Category&Vendor&Supplier in V31)"
          },
          "level_1": { "type": "string" },
          "level_2": { "type": "string" },
          "level_3": { "type": "string" },
          "level_2_code": { "type": "string" },
          "level_3_code": { "type": "string" },
          "category": { "type": "string" },
          "vendor": { "type": "string" },
          "supplier": { "type": "string" },
          "currency": { "type": "string" },
          "supplier_price_type": {
            "type": "string",
            "enum": ["List Price - Local", "Cost Price - Local", "List Price - Foreign", "Cost Price - Foreign", "Selling Price", "Unknown", "Blank"]
          },
          "discount": {
            "type": "object",
            "properties": {
              "vendor_confirmed_pct": { "type": "number" },
              "vendor_additional_pct": { "type": "number" },
              "total_pct": { "type": "number", "description": "= confirmed + additional" }
            }
          },
          "overheads": {
            "type": "object",
            "properties": {
              "shipment_pct": { "type": "number" },
              "custom_pct": { "type": "number" },
              "insurance_pct": { "type": "number" },
              "whtax_pct": { "type": "number" },
              "zakat_pct": { "type": "number" },
              "finance_pct": { "type": "number" },
              "risk_pct": { "type": "number" },
              "fixed_value_sar": { "type": "number" }
            }
          },
          "profit_pct": { "type": "number", "description": "Applied as Margin or Markup per config.profit_mode" },
          "embed_discounts": {
            "type": "object",
            "properties": {
              "discount_pct": { "type": "number" },
              "solution_pct": { "type": "number" },
              "inhouse_pct": { "type": "number" }
            }
          },
          "royalties": {
            "type": "object",
            "properties": {
              "sms_citc_pct": { "type": "number" },
              "stc_royalty_pct": { "type": "number" }
            }
          },
          "revenue_share": {
            "type": "object",
            "properties": {
              "awarding_type": { "type": "string" },
              "otc_mrc": { "type": "string", "enum": ["OTC", "OTC Extended", "MRC", "Blank"] }
            }
          },
          "show_vendor_discount_in_proposal": { "type": "boolean" },
          "totals": {
            "type": "object",
            "description": "Computed aggregates (BOMATIC recalculates these)",
            "properties": {
              "list_price_vendor_currency": { "type": "number" },
              "list_price_sar": { "type": "number" },
              "vendor_discount_sar": { "type": "number" },
              "vendor_cost_sar": { "type": "number" },
              "total_cost_sar": { "type": "number" },
              "b2b_sale_sar": { "type": "number" },
              "b2b_after_embed_sar": { "type": "number" },
              "foc_total_sar": { "type": "number" },
              "discount_revenue_share_sar": { "type": "number" },
              "net_selling_price_sar": { "type": "number" }
            }
          },
          "local_content": {
            "type": "object",
            "description": "V34/V35 only",
            "properties": {
              "ksa_registration": { "type": "string" },
              "sector": { "type": "string" },
              "audited_score_pct": { "type": "number" },
              "selected_score_pct": { "type": "number" },
              "contribution_sar": { "type": "number" }
            }
          }
        }
      }
    },

    "line_items": {
      "type": "array",
      "description": "Individual BoQ line items (from BoQ / Bid / Detailed Bid Costing)",
      "items": {
        "type": "object",
        "required": ["item_number", "category", "product_key"],
        "properties": {
          "item_number": { "type": "integer" },
          "item_rfp_ref": { "type": "string" },
          "is_header": { "type": "boolean", "description": "True if category starts with HEADER" },
          "header_level": {
            "type": "integer",
            "minimum": 0,
            "maximum": 6,
            "description": "HEADER0-HEADER6 hierarchy level"
          },
          "category": { "type": "string", "description": "E.g., HW-HPE-PH1, TSS-CSCO-3YR" },
          "category_prefix": {
            "type": "string",
            "enum": ["CLD", "CNSLT", "ESS", "HW", "Lic", "MPO", "MS", "PM", "PS", "SW", "TR", "TSS"]
          },
          "vendor": { "type": "string" },
          "supplier": { "type": "string" },
          "element": { "type": "string" },
          "stcs_part_number": { "type": "string" },
          "description": { "type": "string" },
          "unit": { "type": "string" },
          "qty": { "type": "number" },
          "multiplier": { "type": "number", "default": 1 },
          "product_key": {
            "type": "string",
            "description": "Links to financial_summary[].product_key for parameter lookup"
          },
          "level_1": { "type": "string" },
          "level_2": { "type": "string" },
          "level_3": { "type": "string" },
          "otc_mrc": { "type": "string", "enum": ["OTC", "OTC Extended", "MRC", "Blank"] },
          "pricing": {
            "type": "object",
            "properties": {
              "currency": { "type": "string" },
              "unit_list_price_vendor": { "type": "number", "description": "Raw vendor quote" },
              "unit_cost_sar": { "type": "number", "description": "After currency conversion" },
              "total_list_price_sar": { "type": "number" },
              "vendor_discount_pct": { "type": "number" },
              "inhouse_margin_pct": { "type": "number", "description": "V34+ only" },
              "unit_after_discount_sar": { "type": "number" },
              "overhead_total_sar": { "type": "number" },
              "fixed_value_sar": { "type": "number" },
              "unit_cost_with_oh_sar": { "type": "number" },
              "profit_pct": { "type": "number" },
              "unit_selling_price_sar": { "type": "number" },
              "total_selling_price_sar": { "type": "number" },
              "manual_override_price": { "type": ["number", "null"] },
              "rounding_mode": { "type": "string", "enum": ["Round 0", "Round 2", "Default"] },
              "margin_pct_without_royalties": { "type": "number" }
            }
          },
          "foc": {
            "type": "object",
            "properties": {
              "discount_by": { "type": "string", "enum": ["STCS 2 STC", "Vendor 2 STC", "Blank"] },
              "foc_qty_stcs": { "type": "number" },
              "foc_qty_vendor": { "type": "number" }
            }
          },
          "supplier_price_type": {
            "type": "string",
            "enum": ["List Price", "Cost Price", "Selling Price", "Unknown", "Blank"]
          }
        }
      }
    },

    "analysis_views": {
      "type": "object",
      "description": "Pre-computed pivot aggregations (BOMATIC can regenerate these from line_items)",
      "properties": {
        "by_level_1": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "level_1": { "type": "string" },
              "total_cost_sar": { "type": "number" },
              "total_b2b_sale_sar": { "type": "number" },
              "net_selling_price_sar": { "type": "number" },
              "weight_pct": { "type": "number" }
            }
          }
        },
        "by_vendor": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "vendor": { "type": "string" },
              "total_cost_sar": { "type": "number" },
              "total_b2b_sale_sar": { "type": "number" },
              "net_selling_price_sar": { "type": "number" }
            }
          }
        },
        "by_category": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "category": { "type": "string" },
              "total_cost_sar": { "type": "number" },
              "total_b2b_sale_sar": { "type": "number" },
              "net_selling_price_sar": { "type": "number" }
            }
          }
        },
        "by_otc_mrc": {
          "type": "array",
          "description": "Breakdown by Level 1 x OTC/MRC",
          "items": {
            "type": "object",
            "properties": {
              "level_1": { "type": "string" },
              "otc_total": { "type": "number" },
              "otc_extended_total": { "type": "number" },
              "mrc_total": { "type": "number" }
            }
          }
        },
        "overheads_summary": {
          "type": "object",
          "properties": {
            "shipment_sar": { "type": "number" },
            "custom_sar": { "type": "number" },
            "insurance_sar": { "type": "number" },
            "whtax_sar": { "type": "number" },
            "finance_sar": { "type": "number" },
            "risk_sar": { "type": "number" },
            "fixed_sar": { "type": "number" },
            "total_sar": { "type": "number" }
          }
        },
        "performance_obligations": {
          "type": "array",
          "description": "Product + Support+MS + Services breakdown",
          "items": {
            "type": "object",
            "properties": {
              "obligation": { "type": "string" },
              "total_cost_sar": { "type": "number" },
              "total_b2b_sale_sar": { "type": "number" },
              "net_selling_price_sar": { "type": "number" }
            }
          }
        }
      }
    },

    "bid_summary": {
      "type": "object",
      "description": "Top-level bid financials (from Summary for Management)",
      "properties": {
        "total_list_price_sar": { "type": "number" },
        "price_after_discount_sar": { "type": "number" },
        "total_b2b_sale_sar": { "type": "number" },
        "total_stcs_sale_sar": { "type": "number" },
        "inhouse_items_discount_pct": { "type": "number" },
        "inhouse_margin_amount_sar": { "type": "number" },
        "solution_margin_pct": { "type": "number" },
        "giza_share_pct": { "type": "number", "description": "Partner (Giza) revenue share" },
        "giza_share_sar": { "type": "number" }
      }
    }
  }
}
```

### Schema Usage Notes

1. **Importing a TA workbook**: Parse the Excel file, map sheets to the appropriate version's naming convention (see Section 5 mapping table), extract `config`, `financial_summary`, and `line_items`. BOMATIC recomputes all `totals` and `analysis_views` using the formulas from Section 2.

2. **Product key resolution**: When importing V34/V35, build product keys as `Supplier + Element + PartNumber`. For V31, use `Category + Vendor + Supplier`. For Mid-format, use `Category` alone (structured table join).

3. **Margin vs Markup**: Always check `config.profit_mode` before computing selling prices. The same `profit_pct` value produces different results depending on the mode.

4. **Header rows**: Line items with `is_header: true` are section dividers (no pricing). They establish the visual hierarchy in the BoQ but carry no financial data. Filter them out before aggregation.

5. **Currency handling**: All SAR amounts are computed values. The source of truth is the vendor-currency price plus the exchange rate. When regenerating, always convert from vendor currency.

6. **Local Content**: Only populated in V34/V35 workbooks. The `local_content.contribution_sar` is computed as `b2b_sale * selected_score_pct`, where `selected_score_pct` is the higher of `audited_score_pct` (from supplier lookup table) and the sector default.
