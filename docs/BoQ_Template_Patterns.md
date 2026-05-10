# Client BoQ Template Patterns
**For BOMATIC — Parser Strategy Library**
*Extracted from STCS knowledge base: NCD, Aramco Ariba (×4), NesmaKent, Sindalah/NEOM, STC Kuwait, ARO*
*Read-only extraction — no source files modified*

---

## Files Analyzed

| File | Client | Date | Type |
|------|--------|------|------|
| `NCD/RFQ Document/BOQ/BOQ.xlsx` | Diriyah NCD (DGDA) | 2022 | Type B |
| `NCD/RFQ Document/BOQ/P3 Carpark Add-Omit BOQ_R01.xlsx` | Diriyah NCD (DGDA) | 2022 | Type B (Add/Omit variant) |
| `OGF/2022/.../Aramco_4203079088.xlsx` | Saudi Aramco | 2022 | Type A |
| `OGF/2024/.../Aramco_4203164336.xlsx` | Saudi Aramco (Juniper, 75 items) | 2024 | Type A |
| `OGF/2024/.../Aramco_4203165713.xlsx` | Saudi Aramco (Cisco, 420 items) | 2024 | Type A |
| `OGF/2025/.../Aramco_4203193153.xlsx` | Saudi Aramco (Storage, 4 items) | 2025 | Type A |
| `NesmaKent/NKJV-IT Infrastructure_BOQ.xlsx` | NesmaKent JV | 2022 | Type C |
| `Nesma/OP-2021-12370 Sindalah/Documents/...BOQ v3.1.xlsx` | NEOM / Sindalah | 2021 | Type D |
| `STC Kuwait/RFP/BoQ _MMSC.xls` | STC Kuwait | ~2021 | Type E |

---

## Type A — Aramco e-Procurement (SAP Ariba Sourcing)

### Example File Paths
- `STC-20260508T061039Z-3-005/STC/OGF - All/2022/ARAMCO FRAME AGREEMENT/Aramco_4203079088/RFP/Aramco_4203079088.xlsx`
- `STC-20260508T061039Z-3-005/STC/OGF - All/2024/RFP/OP-2024-147717.../RFP/Aramco_4203164336.xlsx`
- `STC-20260508T061039Z-3-005/STC/OGF - All/2024/RFP/OP-2024-147843.../Aramco_4203165713.xlsx`
- `STC-20260508T061039Z-3-011/STC/OGF - All/2025/RFP/OP-2025-154381.../Documents/Aramco_4203193153.xlsx`

### Sheet Structure (Consistent Across All 4 Files)

```
Sheet 1: "Intend To Respond Instructions"   — read-only boilerplate instructions
Sheet 2: "Submit Response Instructions"     — read-only boilerplate instructions
Sheet 3: "DV_sheet_"                        — hidden dropdown validation data
Sheet 4: "2 Bidding Instructions and C..."  — Q&A format (T&C acceptance)
Sheet 5: "3 General Requirement"            — Q&A (bid validity, packing)
Sheet 6: "4 Technical Envelope"             — Q&A (tech docs, part compliance)
Sheet 7: "5 Incoterms Details"              — Q&A (delivery terms selection)
Sheet 8: "6 Commercial Envelope" or         — THE BoQ SHEET (see below)
          "7 Commercial Envelope"
Sheet 9: "Sheet1" or "Sheet2"               — simplified duplicate view (no pricing)
Sheet 10: "Currency Conversion"             — SAR→USD and other rates (2024+ only)
```

### Row Header Structure (Rows 1–4, All Sheets)

| Row | Content | Editable |
|-----|---------|----------|
| 1 | Column headers | LOCKED |
| 2 | "Help And Options" instructions | LOCKED |
| 3 | Field purpose / description | LOCKED |
| 4 | Example placeholder row | LOCKED |
| 5+ | Actual line items | Selectively editable |

*Critical: Rows 1–4 are system rows. "Do not modify or import will fail."*

### Commercial Envelope Column Schema (2024 version, 42 columns A–AP)

```json
{
  "sheet": "7 Commercial Envelope",
  "total_columns": 42,
  "header_row": 1,
  "data_start_row": 5,
  "numbering_pattern": "7.1, 7.2, ... 7.N (section prefix matches sheet number)",
  "item_structure": "flat list (no sub-lots or alternates)",
  "columns": {
    "A":  {"header": "Number",                           "editable": false, "notes": "Ariba section number"},
    "B":  {"header": "Name",                             "editable": false, "notes": "Item name (OEM part encoded in description)"},
    "C":  {"header": "Alternative",                      "editable": false, "notes": "Blank in most files"},
    "D":  {"header": "Bundle or Tier Name",              "editable": false},
    "E":  {"header": "Tier Range",                       "editable": false},
    "F":  {"header": "Description",                      "editable": false, "notes": "Full item description; Aramco-specified OEM part# embedded here"},
    "G":  {"header": "Intend To Respond",                "editable": true,  "color": "indexed:42 (green)", "type": "dropdown (DV_area_0: Yes/No)", "notes": "Pre-filled 'Yes' in 2022; 'No' in 2024"},
    "H":  {"header": "Reason for not bidding",           "editable": true,  "color": "indexed:42 (green)", "type": "dropdown", "options": ["We don't carry a compatible part", "We don't supply at the requested quantity", "Discontinued Item", "We are currently at full capacity", "Missing information / not enough information provided", "Other"]},
    "I":  {"header": "Currency",                         "editable": false, "values": ["USD", "SAR"]},
    "J":  {"header": "Unit of Measure",                  "editable": false, "values": ["each"]},
    "K":  {"header": "Material Number",                  "editable": false, "notes": "SAP material ID (e.g. 6000016207)"},
    "L":  {"header": "Quantity",                         "editable": false, "notes": "Pre-set by Aramco; typically 1 or exact qty"},
    "M":  {"header": "Please Enter Unit Price Below Excluding VAT", "editable": true, "color": "indexed:9 (white)", "notes": "Helper/instruction label — free-entry mirror of N"},
    "N":  {"header": "* Price",                          "editable": true,  "color": "indexed:43 (yellow)", "required": true, "notes": "UNIT price excl. VAT; NO total price column — Ariba calculates"},
    "O":  {"header": "Discount Percentage",              "editable": true,  "color": "indexed:9 (white)", "required": false, "notes": "2024+ only (not in 2022 template)"},
    "P":  {"header": "China VAT Rate (%)",               "editable": true,  "color": "indexed:9 (white)", "required": false, "notes": "2024+ only"},
    "Q":  {"header": "Requested Delivery Date",          "editable": false, "notes": "Pre-filled by Aramco (e.g. 2025-07-18)"},
    "R":  {"header": "* Lead Time (Days)",               "editable": true,  "color": "indexed:43 (yellow)", "required": true},
    "S":  {"header": "* Lead Time (Days) Comments",      "editable": true,  "color": "indexed:43 (yellow)", "required": false},
    "T":  {"header": "Manufacturer Reference",           "editable": false},
    "U":  {"header": "* MPN",                            "editable": true,  "color": "indexed:43 (yellow)", "required": true, "type": "dropdown (DV_area_4 / DV_area_3)", "notes": "Enter OEM part number; select 'OTHERS' then enter below"},
    "V":  {"header": "Manufacturer",                     "editable": true,  "color": "indexed:9 (white)"},
    "W":  {"header": "Manufacturer Comments",            "editable": true,  "color": "indexed:9 (white)"},
    "X":  {"header": "Model / Part Number",              "editable": true,  "color": "indexed:9 (white)"},
    "Y":  {"header": "Model / Part Number Comments",     "editable": true,  "color": "indexed:9 (white)"},
    "Z":  {"header": "Country Of Origin",                "editable": true,  "color": "indexed:9 (white)", "type": "dropdown (DV_area_3: 246 countries)"},
    "AA": {"header": "Hazardous Indicator",              "editable": false, "values": ["No", "Yes"]},
    "AB": {"header": "Handling Priority",                "editable": false},
    "AC": {"header": "Inspection Flag",                  "editable": false},
    "AD-AG": {"header": "Inspection/Packing fields",    "editable": false},
    "AH": {"header": "SASO Indicator",                  "editable": false, "values": ["No", "Yes"]},
    "AI": {"header": "Saudi Customs",                    "editable": false, "values": ["D - Dutible"]},
    "AJ-AK": {"header": "Shelf Life / Storage",         "editable": false},
    "AL": {"header": "Delivery Priority",               "editable": false, "values": ["Normal", "Urgent", "staged delivery"]},
    "AM": {"header": "Unloading Point",                 "editable": false, "notes": "SAP plant code (e.g. 'AM02-903 DHAHRAN B-728 EXPEC')"},
    "AN": {"header": "Transportation Mode",             "editable": false},
    "AO": {"header": "Remarks",                         "editable": true,  "color": "indexed:9 (white)"},
    "AP": {"header": "Remarks Comments",                "editable": true,  "color": "indexed:9 (white)"}
  }
}
```

### DV_sheet_ Dropdown Reference

| Column | Named Range | Values |
|--------|-------------|--------|
| A | DV_area_0 | Yes, No |
| B | — | Comply with Saudi Aramco packing / Deliver using own packing standards |
| C | DV_area_2 | Incoterms: SAT, SAC, FOB, VTC, VTD, FCA (×6), POE (×2) |
| D | DV_area_3 | 246 ISO country codes |
| E | DV_area_4 | "OTHERS — ENTER MANUFACTURER AND PART NUMBER DETAILS BELOW" |
| F | DV_area_5 | 6 reasons for not bidding |

### Currency Conversion Sheet (2024+ Only)

- 93–94 currency-to-USD pairs; all rows use same Ariba System ID
- SAR → USD rate: **0.26667** (= 1/3.75)
- Base currency: USD (all items priced in USD)

### Editable Cell Detection Rules

```python
def is_ariba_editable(cell):
    color = cell.fill.fgColor.indexed   # or .rgb
    return color in [42, 43, 9]         # green, yellow, white-light

def is_ariba_required(cell):
    color = cell.fill.fgColor.indexed
    return color in [42, 43]             # green or yellow

def is_ariba_locked(cell):
    color = cell.fill.fgColor.indexed
    return color in [31, 51]            # dark grey, blue-grey = system rows
```

### Version Differences

| Attribute | 2022 (4203079088) | 2024 (4203164336, 165713) | 2025 (4203193153) |
|-----------|------------------|--------------------------|-------------------|
| Commercial sheet label | "6 Commercial Envelope" | "7 Commercial Envelope" | "7 Commercial Envelope" |
| Total columns | 41 | 42 | 42 |
| Discount % column | No | Yes (col O) | Yes (col O) |
| China VAT % column | No | Yes (col P) | Yes (col P) |
| HS Code column | Yes (col O) | No | No |
| Currency Conversion sheet | No | Yes | Yes |
| Currency | SAR | USD | USD |
| Line items | 1 | 75 | 4 |
| Intend to Respond pre-fill | "Yes" | "No" | — |

### Section Structure

No multi-level schedule (no Schedule A/B/C). All items under a single flat numbered list:
- `6.x` or `7.x` format; `.1`, `.2` … `.N` — no sub-hierarchy
- Large RFPs (4203165713 Cisco = 420 items) embed OEM part numbers directly in col F Description
- Description encoding: `"Part# QFX5120-48YM\n[full description]"` (Juniper) or `"Category - Type\nPart Number;\nPN\nDescription;\nText"` (Cisco)

### Parser Strategy

1. **Skip rows 1–4** — system rows, not data
2. **Find the "7 Commercial Envelope" sheet** (or "6 Commercial Envelope" in 2022)
3. **Identify version** by checking total column count (41 = 2022, 42 = 2024+) or presence of col O "Discount Percentage"
4. **Extract columns:** A (item #), F (description), I (currency), J (UOM), K (material #), L (qty), N (price), Q (delivery date), R (lead time), U (MPN), V (manufacturer), X (model/part#), Z (country of origin)
5. **Editable detection:** Check `cell.fill.fgColor.indexed` — 42/43/9 = editable; 31/51 = locked
6. **Parse item numbers** by regex: `r"^\d+\.\d+$"` — skip rows 1–4 (system rows)
7. **OEM extraction:** Parse col F description for `"Part# {SKU}"` pattern or embedded part number before `\n`
8. **No TOTAL column** — only unit price; Ariba calculates total server-side

---

## Type B — Diriyah / Government Quantity Surveyor BoQ (NRM2/BCIS)

### Example File Paths
- `STC-20260508T061039Z-3-004/STC/NCD/RFQ Document/BOQ/BOQ.xlsx`
- `STC-20260508T061039Z-3-004/STC/NCD/RFQ Document/BOQ/P3 Carpark Add-Omit BOQ_R01.xlsx`

### Sheet Structure (BOQ.xlsx — Base BoQ)

```
Sheet 1: "General Requirments"  — Bill 1 (preliminaries, 716 rows)
Sheet 2: "MAIN BOQ"             — Bills 0–8 (main works, 1,536 rows, 9 active cols A–I)
Sheet 3: "DAY Work BOQ"         — Rate schedule only — Labour/Plant/Materials (628 rows)
Sheet 4: "Provisional Sum BOQ"  — 15 client-defined provisional sums (49 rows)
```

### Column Schema — MAIN BOQ (Primary Sheet)

```json
{
  "sheet": "MAIN BOQ",
  "total_columns_with_data": 9,
  "phantom_columns": 291,
  "header_row": 9,
  "data_start_row": 17,
  "columns": {
    "A": {"header": "REF.",        "editable": false, "notes": "Hierarchical ref: 1.00, 1.01, 'a', 'b', 'aa', 'ab'"},
    "B": {"header": "DESCRIPTION", "editable": false, "notes": "Level 1: Major element name (e.g. SUBSTRUCTURE)"},
    "C": {"header": "(none)",      "editable": false, "notes": "Level 2: Sub-element name (e.g. Frame, Upper Floors)"},
    "D": {"header": "(none)",      "editable": false, "notes": "Level 3/4: Work group and line item description"},
    "E": {"header": "QTY",         "editable": false, "notes": "Pre-filled by employer/QS — do not change"},
    "F": {"header": "UNIT",        "editable": false},
    "G": {"header": "RATE (SAR)",  "editable": true,  "notes": "USER FILLS — entirely blank, contractor inserts rate"},
    "H": {"header": "TOTAL (SAR)", "editable": false, "formula": "=E*G"},
    "I": {"header": "SPECIFICATION NOTES", "editable": false, "notes": "Sparse comments (~30 rows)"}
  }
}
```

### Column Schema — Add/Omit Variant (Bill02a Main Works)

```json
{
  "sheet": "Bill02a Main Works",
  "total_columns_with_data": 12,
  "header_rows": [9, 10],
  "columns": {
    "A": {"header": "REF.",        "editable": false},
    "B": {"header": "(section)",   "editable": false, "notes": "Level 1 element"},
    "C": {"header": "(subsection)","editable": false, "notes": "Level 2 element"},
    "D": {"header": "(item)",      "editable": false, "notes": "Line item description"},
    "E": {"header": "OLD QTY",     "editable": false, "notes": "Negative = omit; null = pure add"},
    "F": {"header": "NEW QTY",     "editable": false, "notes": "Positive = add; null = pure omit"},
    "G": {"header": "UNIT",        "editable": false},
    "H": {"header": "RATE (SAR)",  "editable": true,  "notes": "USER FILLS — blank; one rate per item"},
    "I": {"header": "OMISSION (SAR)", "editable": false, "formula": "=E*H"},
    "J": {"header": "ADDITION (SAR)", "editable": false, "formula": "=F*H"},
    "K": {"header": "TOTAL (SAR)", "editable": false, "formula": "=I+J"},
    "L": {"header": "(blank)",     "editable": false}
  }
}
```

### Editable Cell Detection Rules

```python
def is_nrm2_editable_column(col_letter):
    # In base BoQ: only RATE column is editable
    # In add/omit: only RATE column is editable
    return col_letter in ['G', 'H']  # G=RATE in base, H=RATE in add/omit

def detect_rate_column(headers):
    for col, header in headers.items():
        if 'RATE' in str(header).upper():
            return col
    return None
```

*Note: No cell-level protection markers — editability is implied by blank vs formula/text cells.*

### Section Structure

Follows NRM2/BCIS element coding (UK cost management standard):

```
0.00 FACILITATING WORKS
1.00 SUBSTRUCTURE
  1.01 Substructure
2.00 SUPERSTRUCTURE
  2.01 Frame
  2.02 Upper Floors
  2.03 Roof
  2.04 Stairs and Ramps
  2.05 External Walls
  2.06 Windows and External Doors
  2.07 Internal Walls and Partitions
  2.08 Internal Doors
3.00 INTERNAL FINISHES
  3.01 Wall Finishes
  3.02 Floor Finishes
  3.03 Ceiling Finishes
4.00 FITTINGS FURNISHINGS AND EQUIPMENT (FF&E)
5.00 SERVICES
  5.01 Sanitary Installations
  5.03 Disposal Installations
  5.04 Water Installations
  5.05 Heat Source
  5.06 Space Heating and Air Conditioning
  5.07 Ventilation
  5.08 Electrical Installations
  5.09 Fuel Installations
  5.10 Lift and Conveyor Installations
  5.11 Fire and Lightning Protection
  5.12 Communication, Security and Control
  5.14 Builder's Work in Connection
8.00 EXTERNAL WORKS
  8.01 Site Preparation
  8.02 Roads, Paths and Pavings
  8.04 Site Furniture and Equipment
  8.06 External Drainage
  8.07 External Services
```

### Units Observed

`m2, m3, m, t, kg, kW, kVA, nr, No., set, week, lm, lump sum, Item, item, %`

### Key Characteristics

- **No Arabic content** — English only despite Saudi Arabia location (DGDA uses international QS standards)
- **Description split across 3 columns** (B, C, D) at different hierarchy levels — parser must concatenate with correct separator
- **Header row repeats** every ~30–40 rows within Bill 1 (General Requirements)
- **Sub-total rows** identified by "Carried to Collection" or "AMOUNT CARRIED TO SUMMARY" in col B
- **DAY Work BoQ** = rate schedule only (no qty, no total column) — Labour/Plant/Materials, each section ends with "Addition for Profit and Overheads (%)"
- **Phantom columns**: MAIN BOQ dimension reported as 300 columns but only A–I contain data
- **Add/Omit convention**: negative OLD QTY = omission; positive NEW QTY = addition; both present = substitution

### Parser Strategy

1. **Sheet identification**: `"MAIN BOQ"` for primary works; `"General Requirments"` for Bill 1; `"DAY Work BOQ"` for rates; `"Provisional Sum BOQ"` for PS
2. **Find header row**: Scan for row containing `"REF."` and `"RATE"` — repeat header rows are common
3. **Section detection**: Row where col A matches `r"^\d+\.\d+$"` and col B is non-empty = section header. Row where col A matches `r"^[a-z]+$"` = line item
4. **Hierarchy reconstruction**: B = L1, C = L2, D = L3/L4; merge into single description path
5. **Rate column**: Col G (base BoQ) or col H (add/omit) — always blank (zero/empty) in client-issued templates
6. **Formula detection**: col H formula `=E*G` confirms TOTAL pattern
7. **Sub-total rows**: col B contains "Carried to Collection" or col H contains `=SUM(...)` — skip these for line-item extraction
8. **Add/Omit mode detection**: Header row contains both "OLD QTY" and "NEW QTY" columns

---

## Type C — IT Vendor Quotation Template (NesmaKent / STCS Internal)

### Example File Paths
- `STC-20260508T061039Z-3-001/STC/NesmaKent/NKJV-IT Infrastructure_BOQ.xlsx`
- `STC-20260508T061039Z-3-001/STC/NesmaKent/New requirment/NKJV-IT Infrastructure_AMAAD_ BOQ.xlsx`

### Sheet Structure

```
Sheet 1: "Infrastructure Details - BOM"  — full pricing BoQ (154 rows, 7 cols A–G)
Sheet 2: "CyberSecurity - BOM"          — subscription/SaaS items (29 rows)
```

### Column Schema

```json
{
  "sheet": "Infrastructure Details - BOM",
  "total_columns": 7,
  "header_row": "Repeats at start of each section (col B='S.No', C='Description', D='QTY', E='U. Price (SAR)', F='T. Price (SAR)', G='Delivery ETA')",
  "currency": "SAR",
  "columns": {
    "A": {"header": "(unused)",        "editable": false},
    "B": {"header": "S.No / #",        "editable": false, "notes": "Item number (decimal: 1.01, 2.01) or section title text"},
    "C": {"header": "Description",     "editable": false, "notes": "Product/service description; OEM name embedded"},
    "D": {"header": "QTY",             "editable": true,  "notes": "Integer; some rows derive qty via formula from base item"},
    "E": {"header": "U. Price (SAR)",  "editable": true,  "notes": "ALL BLANK — vendor fills unit price"},
    "F": {"header": "T. Price (SAR)",  "editable": false, "formula": "=E*D for line items; =SUM(...) for sub-totals"},
    "G": {"header": "Delivery ETA",    "editable": true,  "notes": "Free text or date; sometimes merged across rows"}
  }
}
```

### Section Structure

```
Row 1:   "Pricing Summary" (title)
Rows 3–19: Summary table (top-level section totals, linked via formula to detail sections)
           Sections numbered 1–10; USD conversion row: SAR/3.75

Rows 21–55:  Section 1 — CyberSecurity Infrastructure
  Sub-groups: Fortigate Perimeter FW (1.01–1.03), FortiAuthenticator (1.04–1.07),
              Trend Micro (1.08–1.09), Wallix (1.10), Professional Services (1.11–1.12)

Rows 57–134: Section 2 — Data Center and Network
  Sub-groups: HCI + VMware + Backup (2.01–2.25), Network + Wireless (2.5–2.65),
              DC Cabinet/UPS/APC (2.8–2.93), Professional Services

Rows 136–152: Section 3 — Laptops / PCs / Accessories (3.01–3.04, 3.1, 3.2)

Row 154: GRAND TOTAL (formula: =F152+F134+F55)
```

### Editable Cell Detection Rules

```python
def is_type_c_editable(row, col_letter, value, formula):
    if col_letter == 'E':  # Unit Price column
        return value in [None, 0, '']  # blank = user fills
    if col_letter == 'D':  # QTY column
        return formula is None          # no formula = manually set
    if col_letter == 'G':  # ETA column
        return True                     # always editable
    if col_letter == 'F':  # Total
        return False                    # always formula
    return False
```

### Key Characteristics

- **SAR currency** throughout; SAR→USD conversion row at 3.75
- **No sheet protection** — all cells accessible
- **OEM names in description** — not in separate column (Fortinet, Supermicro, VMware, Veeam, APC, Lenovo, Trend Micro, Wallix, ManageEngine, GTB)
- **Formula derivation for accessories**: accessory qty = `=D{base_row}` or `=D{base_row}+(D{other}*2)` — derived from hardware qty
- **Section total back-links**: Summary table (rows 3–19) uses `=F55`, `=F134`, `=F152` to pull section totals
- **Professional services line items**: Description contains multi-line text (newlines within cell) with bullet-point scope items
- **No explicit protection markers** — editability determined by blank vs formula content

### Parser Strategy

1. **Find header row**: scan for row where D='QTY' and E contains 'Price' and F contains 'Price'
2. **Section detection**: merged cell row or bold text row with no price values = section header
3. **Sub-group detection**: row where B and C contain product group name and D/E/F are blank
4. **Line item rows**: B contains decimal number (1.01), C has description, D has integer qty, E is blank/zero
5. **Sub-total rows**: D/E blank, F contains SUM formula
6. **Grand total**: last row where F contains multi-SUM formula
7. **OEM extraction**: parse C (description) for known vendor keywords or product SKU patterns
8. **ETA field**: G column — free text, may be merged vertically across product group rows

---

## Type D — Parts List / BOM Without Pricing (Cisco CCW Export + Supplementary)

### Example File Paths
- `STC-20260508T061039Z-3-001/STC/Nesma & Partners/OP-2021-12370 Sindalah/Documents/Copy of Sindalah_Mainland_BOQ v3.1.xlsx`

### Sheet Structure

```
Sheet 1: "Active BoQ"       — full BOM parts list (207 rows, 5 cols A–E) — NO PRICING
Sheet 2: "SOW and office bdown" — room-by-room outlet counts + scope items
```

### Column Schema

```json
{
  "sheet": "Active BoQ",
  "total_columns": 5,
  "pricing": false,
  "columns": {
    "A": {"header": "Line Number",         "editable": false, "notes": "Hierarchical: 1.0, 1.13, 3.9.0.1; or group header text"},
    "B": {"header": "Part Number",         "editable": false, "notes": "OEM/manufacturer part number; or CCW subscription metadata string; or Huawei catalog code"},
    "C": {"header": "Description",         "editable": false, "notes": "Item description; for GPON: manufacturer tag 'Manufacturer: Huawei'"},
    "D": {"header": "Service Duration (Months)", "editable": false, "notes": "'---' = hardware (no term); integer = subscription months (36=3yr)"},
    "E": {"header": "Qty",                 "editable": false, "notes": "Pre-populated by client"}
  }
}
```

### Section Structure

```
Group Name: Internet and WAN Router      → items 1.0–2.9  (Cisco C-series routers)
Group Name: Internet Switch              → items 3.0–3.10 (Cisco Catalyst)
Group Name: Access Switches              → items 4.0–4.19
Group Name: Transceivers                 → items 5.0, 7.0
Group Name: Wireless                     → items 8.0–9.10  (Cisco APs + controllers)
Group Name: GPON connectivity switch     → items 12.0–12.13
Patch Cords                              → items 1–6     (Systimax)
Perimeter Firewall                       → items 1–10    (Palo Alto PAN-*)
Professional Services                    → items 1–2
GPON for residential units               → items 1–23    (Huawei H90* OLT, ONTs)
GPON Professional Services               → item 1
```

*Note: Item numbering resets to 1 at each major section group — not globally unique.*

### Key Characteristics

- **No price columns** — pure BOM for vendor quoting; STCS uses this to request pricing from Cisco, Palo Alto, Huawei
- **CCW subscription metadata** embedded in col B for Cisco licensed items: `"Initial Term - 36.00 Months | Auto Renewal Term - 0 Months | Billing Model - Prepaid Term | Requested Start Date - 03-Apr-2021 | Requested End Date - 02-Apr-2024"`
- **Service Duration column** distinguishes hardware (`---`) from software/subscription (`36`)
- **GPON section** uses different column layout: col B = internal catalog code, col C = mfr part# + "Manufacturer: Huawei" annotation
- **Group headers**: string `"Group Name: {name}"` in col A, all other cols blank

### Parser Strategy

1. **Detect group header rows**: col A matches `r"^Group Name:"` — extract group name
2. **Detect subscription rows**: col D is a numeric value (not `---`) — tag as subscription
3. **CCW metadata detection**: col B contains `"|"` characters and `"Term"` keyword — parse as CCW subscription blob; extract `Initial Term`, `Billing Model`, `Start/End Date`
4. **GPON row detection**: col C contains `"Manufacturer: Huawei"` — alternate column layout
5. **Item number reset**: numbering resets at each group — use group + local number as composite key
6. **No pricing to extract** — output is line item list for requesting vendor quotes

---

## Type E — Telecom Vendor RFQ Template (STC Kuwait)

### Example File Path
- `STC-20260508T061039Z-3-001/STC/STC Kuwait/RFP/BoQ _MMSC.xls`

### Sheet Structure

```
Sheet 1: (main RFQ template — 6,673 rows, 12 cols A–L)
Sheet 2: (UOM reference list — 169 unit codes)
```

### Column Schema

```json
{
  "sheet": "Sheet1",
  "format": ".xls (legacy)",
  "total_rows": 6673,
  "data_rows_stc_defined": 1,
  "blank_rows_for_vendor": 6666,
  "currency": "KWD (implied — STC Kuwait)",
  "columns": {
    "A": {"header": "(unused)",                "editable": false},
    "B": {"header": "Item Code",               "editable": true,  "notes": "Vendor fills their internal item/part code"},
    "C": {"header": "Item Description",        "editable": true,  "notes": "Vendor fills their product description"},
    "D": {"header": "Unit of measurement",     "editable": true,  "notes": "Vendor selects from Sheet2 UOM code list"},
    "E": {"header": "Unit Price",              "editable": true,  "notes": "Vendor fills their unit price"},
    "F": {"header": "STC Requested Qty",       "editable": false, "notes": "Pre-filled by STC"},
    "G": {"header": "Qty provided by Vendor",  "editable": true,  "notes": "Vendor fills how much they can supply"},
    "H": {"header": "Total Gross Amount",      "editable": false, "formula": "=E*F"},
    "I": {"header": "Discount Amount",         "editable": true,  "notes": "Vendor fills discount"},
    "J": {"header": "Payable Price (Net Amount)", "editable": false, "formula": "=H-I"},
    "K": {"header": "Net Unit Price",          "editable": false, "formula": "=J/F"},
    "L": {"header": "STC ITEM DESCRIPTION FOR REFERENCE", "editable": false, "notes": "STC reference description (read-only)"}
  }
}
```

### UOM Reference (Sheet 2 — 169 Entries)

```
Physical units:   EA (Each), BOX, M (Metre), KG, M2 (Square Metre), M3, L (Litre)
Time units:       PMH (Per Month), PYR (Per Year), PDY (Per Day)
Telecom-specific: PBT (Per BTS), PRU (Per RRU), PGP (Per GPON Port),
                  PLT (Per LTE Subscriber), PEB (Per eNodeB), PMB (Per Mbps)
Commercial units: LOT (Lot), LPS (LumpSum), SYS (System), STE (Site),
                  PKG (Package)
```

### Key Characteristics

- **Nearly blank template**: STC defines only 1 line item (MMSC system, qty=1), rest are 6,666+ blank rows for vendor expansion
- **Vendor-driven structure**: Vendor defines their own item codes, descriptions, and UOM
- **Dual pricing columns**: Gross (H=E×F) and Net after discount (J=H-I), plus Net Unit Price (K=J/F)
- **STC reference column**: Col L contains STC's own description for reference alignment
- **KWD currency** (implied — no explicit currency column)
- **File format**: Legacy `.xls` (xlrd library required, not openpyxl)

### Parser Strategy

1. **Use xlrd** for `.xls` format (openpyxl cannot read binary .xls)
2. **Find header row**: scan for row containing "Item Code" and "Unit Price"
3. **STC-defined items**: col L is non-blank and col B/C/D/E are blank = STC reference item (vendor to fill)
4. **Vendor items**: col B and C are both non-blank = vendor-populated line item
5. **UOM validation**: cross-reference col D against Sheet2 col B (3-letter codes)
6. **Formula error handling**: J and K columns may return error codes (xlrd type=5) if formulas not evaluated

---

## Section 3: Parser Strategy Recommendation by Type

| Detection Signal | Type | Confidence |
|-----------------|------|------------|
| Sheet named "Intend To Respond Instructions" | Type A (Ariba) | 100% |
| File named `Aramco_42031xxxxx.xlsx` | Type A (Ariba) | 95% |
| Sheet named "MAIN BOQ" + headers REF/QTY/UNIT/RATE | Type B (NRM2) | 95% |
| NRM2 element codes (1.00, 2.01, 5.12) in col A | Type B (NRM2) | 90% |
| Headers "U. Price (SAR)" + "T. Price (SAR)" | Type C (STCS internal) | 90% |
| No price columns + "Line Number" + "Service Duration" | Type D (CCW BOM) | 85% |
| "STC ITEM DESCRIPTION FOR REFERENCE" in header + `.xls` | Type E (Telecom RFQ) | 95% |

### Recommended Python Parser Architecture

```python
class BoQParser:
    def detect_type(self, filepath: str, workbook) -> str:
        sheets = workbook.sheetnames  # or xlrd sheet names
        
        # Type A: Ariba
        if "Intend To Respond Instructions" in sheets:
            return "TYPE_A_ARIBA"
        if re.match(r"Aramco_\d{10}", Path(filepath).stem):
            return "TYPE_A_ARIBA"
        
        # Type B: NRM2/BCIS
        if "MAIN BOQ" in sheets:
            return "TYPE_B_NRM2"
        if "Bill02a Main Works" in sheets or "Bill01a-General Requirement" in sheets:
            return "TYPE_B_NRM2_ADDOMMIT"
        
        # Type E: .xls telecom
        if filepath.endswith(".xls"):
            ws = workbook.sheet_by_index(0)
            headers = [str(ws.cell(5, c).value) for c in range(ws.ncols)]
            if "STC ITEM DESCRIPTION" in str(headers):
                return "TYPE_E_TELECOM"
        
        # Type C vs D: check for price columns
        for shname in sheets:
            ws = workbook[shname]
            for row in ws.iter_rows(max_row=10, values_only=True):
                row_str = " ".join(str(c) for c in row if c)
                if "U. Price" in row_str or "Unit Price" in row_str:
                    return "TYPE_C_VENDOR_QUOTE"
                if "Service Duration" in row_str and "Part Number" in row_str:
                    return "TYPE_D_BOM_NO_PRICE"
        
        return "TYPE_UNKNOWN"

    def parse_type_a(self, workbook) -> list[dict]:
        # Find Commercial Envelope sheet
        ws = next(s for s in workbook.sheetnames if "Commercial Envelope" in s)
        sheet = workbook[ws]
        # Skip rows 1-4 (system rows), parse from row 5
        items = []
        for row in sheet.iter_rows(min_row=5, values_only=True):
            if row[0] and re.match(r"^\d+\.\d+$", str(row[0])):
                items.append({
                    "item_number": row[0],   # col A
                    "description": row[5],   # col F
                    "currency": row[8],      # col I
                    "uom": row[9],           # col J
                    "qty": row[11],          # col L
                    "unit_price": row[13],   # col N (required field)
                    "lead_time": row[17],    # col R
                    "manufacturer": row[21], # col V
                    "model_pn": row[23],     # col X
                    "country": row[25],      # col Z
                })
        return items

    def parse_type_b(self, workbook) -> list[dict]:
        ws = workbook["MAIN BOQ"]
        items, current_section = [], {}
        for row in ws.iter_rows(values_only=True):
            ref, sec, subsec, desc, qty, unit, rate, total = row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]
            if ref and re.match(r"^\d+\.\d+$", str(ref)) and sec:
                current_section = {"l1": sec, "l2": "", "l3": ""}
            elif ref and re.match(r"^[a-z]+$", str(ref)) and desc:
                items.append({
                    "ref": ref,
                    "section_l1": current_section.get("l1"),
                    "section_l2": current_section.get("l2"),
                    "description": desc,
                    "qty": qty,
                    "unit": unit,
                    "rate": rate,  # None/blank in client template
                    "total": total
                })
        return items
```

---

## Section 4: Pattern Library Summary

| Attribute | Type A (Ariba) | Type B (NRM2) | Type C (STCS Quote) | Type D (BOM) | Type E (Telecom) |
|-----------|---------------|---------------|---------------------|-------------|-----------------|
| **Clients** | Aramco only | DGDA (Diriyah) | NesmaKent, AVR | NEOM/Sindalah | STC Kuwait |
| **Price columns** | Unit Price (N) — no total | Rate (G) → Total (H) formula | U.Price (E) → T.Price (F) formula | None | UnitPrice(E) → Gross(H) → Net(J) |
| **Qty editable** | No | No | Yes | No | Yes (vendor) |
| **Rate editable** | Yes (N = price) | Yes (G = rate) | Yes (E = unit price) | N/A | Yes (E) |
| **Currency** | USD (or SAR) | SAR | SAR | None | KWD |
| **OEM column** | No (in description F) | No | No (in description) | Col B (part#) | No |
| **Item numbering** | Flat: 7.1, 7.2 | NRM2: 1.00, 2.01, a/b/c | Decimal: 1.01, 2.01 | Group-relative: 1.0 | Single item (STC) |
| **Bilingual** | No | No | No | No | No |
| **Sheet protection** | Yes (password locked) | No explicit | No | No | Not readable (.xls) |
| **Editable detection** | Cell fill color index | Column position (G=rate=blank) | Column position (E=blank) | N/A | Column position |
| **Vendor fill scope** | G,H,M,N,O,P,R,S,U,V,W,X,Y,Z,AO,AP | G only (Rate) | D, E, G | N/A (pricing request) | B,C,D,E,G,I |
| **Sub-totals** | None (Ariba calculates) | "Carried to Collection" rows | SUM formulas | None | None |
| **File format** | .xlsx | .xlsx | .xlsx | .xlsx | .xls (legacy) |
| **Scale** | 1–420 line items | 1,536 rows (MAIN BOQ) | 150 rows | 207 rows | 1 STC item + 6,666 blank |

### Observed Gaps / Non-client BoQs (Excluded)

The following files found in search were **excluded** from this analysis as they are STCS internal documents, not client-provided templates:
- All files named `PLv{n}` or `Tender Analyzer` — STCS internal PnL sheets
- `NVIDIA BOQ.docx` — vendor configuration document (not a spreadsheet template)
- `HPE BOQ ICT.xlsx` — vendor quote response, not client template
- `Huawei PS BoQ.xlsx` — professional services quote response
- `Material BoQ.xlsx`, `BoQ Aro Drilling NET&ERP Price.xlsx` — STCS internal pricing files
- `Aramco FA BoQ-0506.xlsx`, `Aramco_4203076273_BoQ_V1.xlsx` — Ariba response files (Type A variant, no new patterns)
