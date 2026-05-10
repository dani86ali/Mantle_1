# Fortinet Vendor Catalog Model
**For BOMATIC — Extracted from STCS Knowledge Base**
*Source data: Q4 2020 ME&A FortiWeb Price List, Arabian Internet/Exclusive Networks quotes 2022–2024, 4 TPs across Tabuk/ARASCO/MSC/NCD, FortiGate 4800F datasheet*
*Note: No Q2 2026 full ME&A price list was found in the knowledge base. This document synthesizes the Q4 2020 FortiWeb-specific price list plus real distributor quotes (SAR) dated Oct 2022 – Jun 2024 as the best available pricing reference.*

---

## Section 1: Product Family Hierarchy

### 1.1 Security (NGFW / UTM / WAF / Email / Sandbox)

```
Fortinet
├── FortiGate (NGFW / SD-WAN / ZTNA)
│   ├── Entry / SOHO          FG-40F, FG-60F, FG-80F
│   ├── SMB / Branch          FG-100F, FG-101F, FG-200F, FG-201F
│   ├── Mid-Range             FG-400F, FG-401F, FG-500E, FG-600F, FG-601F
│   ├── Enterprise            FG-900D, FG-1000F, FG-1500D, FG-1800F, FG-2000E
│   ├── DC / Carrier          FG-3001F, FG-3200F, FG-3400E
│   └── Hyperscale            FG-4200F, FG-4400F, FG-4800F, FG-4801F, FG-6000F, FG-7000F
├── FortiWeb (WAF)
│   ├── Appliance             FWB-100D, FWB-400D, FWB-600D, FWB-1000D, FWB-2000E,
│   │                         FWB-3000E, FWB-3010E, FWB-4000E
│   ├── VM                    FC1-10-WBVMS-xxx (1-CPU subscription)
│   └── Container             FC1-10-WBVMC-xxx
├── FortiMail (SEG)
│   ├── Appliance             FML-60D, FML-200E, FML-400E, FML-1000D, FML-3000E
│   └── VM                    FML-VM-xxx
├── FortiSandbox (ATP)
│   ├── Appliance             FSA-1000F, FSA-2000E, FSA-3000E
│   └── Cloud                 FortiSandbox Cloud (subscription add-on to FortiGate)
└── FortiDDoS                 FDD-200F, FDD-1500F, FDD-2000F
```

### 1.2 Management & Analytics

```
Fortinet
├── FortiManager (Centralized Policy Mgmt)
│   ├── Appliance             FMG-200G, FMG-300F, FMG-1000F, FMG-3000G
│   └── VM                    FMG-VM-xxx (device count license)
├── FortiAnalyzer (Log / SIEM)
│   ├── Appliance             FAZ-200G, FAZ-300F, FAZ-1000F, FAZ-3000G
│   └── VM                    FAZ-VM-xxx (GB/day license)
│       └── Upgrade           FAZ-VM-GB5 (+5GB/day), FAZ-VM-GB25, etc.
├── FortiSIEM                 FSM-500F, FSM-2000F, FSM-3500F + FortiSIEM-VM
└── FortiSOAR                 Cloud / VM (SOAR orchestration)
```

### 1.3 Network Access (Wireless / Switch / NAC)

```
Fortinet
├── FortiSwitch (Access / Distribution)
│   ├── Desktop               FS-108F, FS-124F, FS-148F
│   ├── Access (PoE)          FS-224F-POE, FS-248F-POE, FS-424F-POE
│   └── Aggregation           FS-1048E, FS-3032E
├── FortiAP (Wi-Fi)
│   ├── Indoor                FAP-221E, FAP-U221EV, FAP-431F, FAP-433F
│   ├── Outdoor               FAP-222E, FAP-U423EV, FAP-432F
│   └── High-Density          FAP-U24JEV, FAP-U423EV
├── FortiWLC (Legacy Controller — being replaced by FortiGate-based mgmt)
│   └── Appliance             FWC-200D (200 AP controller)
├── FortiNAC (Network Access Control)
│   └── Appliance/VM          FNC-100F, FNC-200F, FNC-VM
└── FortiAuthenticator (2FA / RADIUS)
    └── Appliance             FAC-200E, FAC-400E, FAC-2000E
```

### 1.4 Endpoint & Identity

```
Fortinet
├── FortiClient (EMS + endpoint agent)
│   └── License tiers         Zero Trust, VPN, EPP/APT
├── FortiToken (MFA)
│   ├── Hardware OTP          FTK-200 (per unit)
│   └── Mobile App            FTM-ELIC-xxx (perpetual user license)
│       └── Example           FTM-ELIC-50 (50 users), FTM-ELIC-200 (200 users)
└── FortiEDR (Cloud EDR)
    └── Cloud subscription    FEP-xxx (per endpoint/year)
```

### 1.5 SD-WAN & Connectivity

```
Fortinet
├── SD-WAN (software feature built into FortiGate)
│   └── No separate hardware — enabled via license on FortiGate
├── FortiExtender (LTE/5G WAN extension)
│   └── FEX-201E, FEX-511F (LTE/4G/5G USB or blade)
└── FortiADC (Application Delivery Controller)
    └── FAD-100F, FAD-200D, FAD-700D, FAD-VM
```

---

## Section 2: SKU Naming Convention

### 2.1 Hardware SKU Pattern

```
{FAMILY_PREFIX}-{MODEL_ID}[-{VARIANT}]
```

| Prefix | Product Family |
|--------|---------------|
| `FG-` | FortiGate NGFW |
| `FWB-` | FortiWeb (WAF) |
| `FAZ-` | FortiAnalyzer |
| `FMG-` | FortiManager |
| `FSA-` | FortiSandbox |
| `FML-` | FortiMail |
| `FWC-` | FortiWLC controller |
| `FAP-` | FortiAP access point |
| `FTK-` | FortiToken hardware |
| `FTM-` | FortiToken Mobile |
| `FNC-` | FortiNAC |
| `FAC-` | FortiAuthenticator |
| `FAD-` | FortiADC |

**Model number conventions:**
- First digits = throughput tier (60 = SMB, 100 = low-mid, 400 = mid, 600 = mid-high, 1500 = enterprise, 3000 = DC, 4800 = hyperscale)
- Letter generation: `D` = 2015–2017 (D-series), `E` = 2018–2019, `F` = 2020+ (current F-series)
- `-BDL` suffix = Hardware + Bundle (hardware + subscription sold together as one SKU)

### 2.2 Subscription / Service SKU Pattern

```
FC{tier}-{channel}-{model_code}-{service_code}-{channel_type}-{duration}
```

| Field | Position | Meaning |
|-------|----------|---------|
| `FC` | prefix | FortiCare service |
| `FC1` | prefix | FortiCare subscription (VM/cloud) |
| `FCZ` | prefix | FortiCare renewal (existing contract) |
| `FP` | prefix | FortiCare Professional Services |
| `FT` | prefix | Fortinet Training |
| `LIC` | prefix | Fortinet License (perpetual) |
| `{tier}` | 2nd segment | Device count tier: `10`=1 unit, `15`=legacy, `1K`=1000 units |
| `{model_code}` | 3rd segment | Abbreviation of hardware SKU (e.g. `01500`=FG-1500D, `F201F`=FG-201F, `0401F`=FG-401F, `F3K1F`=FG-3001F, `V4002`=FWB-4000E) |
| `{service_code}` | 4th segment | Type of service — see table below |
| `{channel_type}` | 5th segment | `02`=reseller, `01`=direct |
| `{duration}` | 6th segment | `12`=1 year, `24`=2 years, `36`=3 years, `60`=5 years |

### 2.3 Service Codes (4th Segment)

| Code | Service |
|------|---------|
| `100` | Advanced Malware Protection (AMP) |
| `108` | NGFW (IPS + App Control) |
| `112` | Web & Video Filtering |
| `114` | AntiSpam |
| `123` | FortiSandbox Cloud Service |
| `137` | FortiWeb Application Security Service |
| `140` | IP Reputation Service |
| `143` | FortiGuard Credential Stuffing Defense |
| `210` | Next-Day Delivery Premium RMA |
| `211` | 4-Hour Hardware Delivery Premium RMA |
| `212` | 4-Hour Hardware + Onsite Engineer Premium RMA |
| `241` | Enhanced Support (Premium) |
| `242` | Telephone Support (Premium) |
| `243` | Hardware replacement (Advanced HW) |
| `247` | 24x7 FortiCare |
| `248` | 24x7 FortiCare Premium |
| `301` | Secure RMA |
| `311` | 8x5 FortiCare |
| `601` | Advanced Bundle (FortiWeb: Standard + Sandbox Cloud + Credential Stuffing) |
| `811` | Enterprise Protection Bundle (IPS + AMP + App Control + Web Filter + Antispam + Mobile Malware + FortiCare 24x7) |
| `855` | Firmware & General Updates |
| `900` | UTM Protection (older naming, used with E-series) |
| `916` | FortiWeb-VM Subscription with Standard Bundle |
| `928` | Advanced Threat Protection (ATP): IPS + AMP + App Control + FortiCare Premium |
| `934` | Standard Bundle (FortiWeb: AV + Security Service + IP Reputation + FortiCare 24x7) |
| `950` | Unified Threat Protection (UTP): IPS + AMP + App Control + Web Filter + Antispam + FortiCare Premium |

### 2.4 Bundle Hardware SKU Suffix Pattern

For bundled hardware SKUs (e.g., `FG-601F-BDL-950-36`):
```
{HW_SKU}-BDL-{bundle_code}-{duration}
```
- `BDL` = bundle
- `950` = UTP bundle
- `811` = Enterprise Protection bundle
- `36` = 3-year subscription included
- `12` = 1-year subscription included

---

## Section 3: FortiGuard Bundle Comparison

### 3.1 FortiGate Bundle Tiers

| Bundle | SKU Code | Services Included | Typical Use |
|--------|----------|-------------------|-------------|
| **UTM / Unified Threat Protection** | `-950-` | IPS • Advanced Malware Protection • Application Control • Web & Video Filtering • Anti-Spam • FortiCare Premium (24x7 + NBD RMA) | Standard MENA deployment — covers most compliance needs including SACS-002 |
| **Advanced Threat Protection (ATP)** | `-928-` | IPS • Advanced Malware Protection • Application Control • FortiCare Premium | Used for renewals on legacy D-series; also chosen when web filter/antispam not needed (DC firewalls) |
| **Enterprise Protection** | `-811-` | IPS • AMP • App Control • Web Filter • Anti-Spam • **Mobile Malware** • FortiCare Premium | Full stack; adds mobile threat protection vs UTP; used in F-series new deployments (FG-100F, FG-60F) |
| **NGFW only** | `-108-` individual | IPS + App Control only (no AMP, no web filter) | Rarely sold alone — used as add-on to base 24x7 |

**Bundle hierarchy (most complete → least):**
```
Enterprise Protection  >  UTP  >  ATP  >  NGFW-only
```

### 3.2 FortiWeb Bundle Tiers

| Bundle | SKU Code | Services Included |
|--------|----------|-------------------|
| **Standard Bundle** | `-934-` | 24x7 FortiCare + AV (FortiGuard) + FortiWeb Security Service + IP Reputation |
| **Advanced Bundle** | `-601-` | Standard + FortiSandbox Cloud + Credential Stuffing Defense |
| **24x7 FortiCare only** | `-247-` | Support only, no FortiGuard services |

### 3.3 Individual FortiGuard Services (Add-on / Standalone)

| SKU Code | Service | Notes |
|----------|---------|-------|
| `-100-` | FortiGuard AV | Signature-based antivirus |
| `-108-` | NGFW | IPS + Application Control |
| `-112-` | Web & Video Filtering | URL categorization |
| `-114-` | AntiSpam | Email filtering signatures |
| `-123-` | FortiSandbox Cloud | Cloud-based detonation |
| `-137-` | FortiWeb Security Service | WAF signatures + bots |
| `-140-` | IP Reputation Service | Botnet/threat-actor IP blocking |
| `-143-` | Credential Stuffing Defense | Username/password spray protection |

---

## Section 4: FortiCare Support Tiers

### 4.1 Standard FortiCare Contracts

| Tier | SKU Code | Coverage | Response | NBD RMA | Use When |
|------|----------|----------|----------|---------|----------|
| **8x5 FortiCare** | `-311-` | Business hours only | Business hours | No | Access points, non-critical edge devices |
| **24x7 FortiCare** | `-247-` | 24x7 | Next business day | Yes (NBD) | Standard for all firewalls and appliances |
| **24x7 FortiCare Premium** | `-248-` | 24x7 | 4-hour advance replacement | Yes (4hr) | Included in UTP/ATP bundles on mid-range+ models |
| **FortiCare Elite** | (premium add-on) | 24x7 + TAM | 4-hour + PRMA | Yes | Critical infrastructure, datacenter |

### 4.2 Premium RMA Add-On SKUs (Annual Contracts Only)

| SKU Code | Service | Price Notes (Q4 2020 USD) |
|----------|---------|--------------------------|
| `-210-` | Next-Day Delivery Premium RMA | ~3–6% of HW cost/yr |
| `-211-` | 4-Hour Hardware Delivery Premium RMA | ~7–10% of HW cost/yr |
| `-212-` | 4-Hour Hardware + Onsite Engineer Premium RMA | ~13–17% of HW cost/yr |
| `-301-` | Secure RMA (no return of defective unit) | ~4–6% of HW cost/yr |

*Notes: All PRMA require 24x7 or ASE FortiCare as base. Annual contracts only (no multi-year PRMA). Must verify availability with PRMA tool before quoting.*

### 4.3 Advanced Support Services (Enterprise/SP)

| Service | SKU | Annual Price USD (Q4 2020 MEA) |
|---------|-----|-------------------------------|
| Premium Enterprise Tech Support (TAM) | `FP-10-PS001-701-02-12` | $32,000 |
| Business Enterprise Tech Support | `FP-10-PS001-702-02-12` | $48,000 |
| First Enterprise (Designated TAM) | `FP-10-PS001-703-02-12` | $86,000 |
| Global First (Global TAM) | `FP-10-PS001-704-02-12` | $240,000 |
| Select SP Support | `FP-10-PS001-705-02-12` | $48,000 |
| Elite SP Support (TAM+SDM) | `FP-10-PS001-706-02-12` | $86,000 |
| Designated Delivery Manager | `FP-10-PS001-707-02-12` | $48,000 |
| Advanced Services — 10 Service Points | `LIC-AS-10` | $12,500 |

### 4.4 Professional Services Rates (Q4 2020 MEA USD)

| Service | SKU | Rate |
|---------|-----|------|
| Onsite resource (FortiCare contract) | `FP-10-PS001-800-01-01` | $3,000/day |
| Onsite resource (SOW) | `FP-10-PS001-M08-00-00` | $3,000/day |
| After hours / weekend | `FP-PS001-HR` | $550/hr |
| Network Integration (Tier 1) | `FP-10-RS001-M08-00-00` | $3,000/day |
| Network Design & Optimization (Tier 2) | `FP-10-RS002-M08-00-00` | $4,000/day |
| Security Assessment (Tier 3) | `FP-10-RS003-M08-00-00` | $5,000/day |
| Resident Engineer Onsite 6M | `FP-10-PS001-923-02-06` | $220,000 |
| Resident Engineer Onsite 12M | `FP-10-PS001-923-02-12` | $330,000 |
| Remote Dedicated Resource 6M | `FP-10-PS001-802-02-06` | $220,000 |
| Remote Dedicated Resource 12M | `FP-10-PS001-802-02-12` | $330,000 |

---

## Section 5: FortiSwitch / FortiAP Licensing Model

### 5.1 FortiGate-Managed FortiSwitch (FortiLink)

| FortiGate Tier | Max FortiSwitch Ports | License Required |
|----------------|----------------------|-----------------|
| FG-60F series | Up to 8 FortiSwitch ports | None — included in FortiOS |
| FG-100F series | Up to 24 FortiSwitch ports | None — included in FortiOS |
| FG-200F+ | Unlimited (per FortiGate capacity) | None — FortiLink is free |

**Key points:**
- FortiLink is a feature of FortiOS — no per-switch license is required for controller functionality
- FortiSwitch hardware ships unlocked and is adopted by any compatible FortiGate via FortiLink
- FortiSwitch SKU naming: `FS-{ports}{tier}[-POE][-FPOE][-2S+]` (e.g., `FS-248F-POE` = 48-port PoE)
- FortiSwitch requires its own FortiCare contract (`FC-10-W0XXX-247-02-{DD}` pattern)
- FortiSwitch management via FortiManager requires a FortiManager license for the device count

### 5.2 FortiGate-Managed FortiAP (FortiWiFi / Wireless Controller)

| FortiGate Model | Max Managed APs | License |
|----------------|----------------|---------|
| FG-40F / FG-60F | 30–64 APs | None — AP management built into FortiOS |
| FG-100F / FG-200F | 128–256 APs | None — built in |
| FG-400F+ | 512+ APs | None — built in |

**Key points:**
- FortiAP hardware ships unlocked — no per-AP license required for management
- FortiAP requires its own FortiCare contract (`FC-10-P{model}-311-02-{DD}` for 8x5 or `-247-` for 24x7)
- FortiWLC (legacy controller) approach used `FWC-200D` hardware with per-controller licensing — being replaced by FortiGate-based management
- Fortinet Connect / SA-2000 is a separate guest management appliance with per-user licensing (`MCT-{N}-U`)

### 5.3 FortiAP SKU Pattern

```
FAP-{generation}{model}{variant}[-{region_code}]
FAP-U{model}{variant}[-{region_code}]   (Universal AP = all-region single SKU)
```

| SKU | Description | Observed In |
|-----|-------------|-------------|
| `FAP-U221EV-E` | Dual-radio indoor 802.11ac Wave2, BLE, 2x2 MIMO, PoE — Region E (ETSI/MEA) | Tabuk Emara WLAN TP |

---

## Section 6: Pricing Tier Patterns

### 6.1 FortiGate Price Reference (SAR — Exclusive Networks Saudi Arabia)

*All prices are distributor list price (Exclusive Networks to reseller = Arabian Internet to STCS). No discount applied. VAT 15% and customs SAR 375 added on top.*

| Model | SKU | Format | Date | SAR/Unit | ~USD/Unit |
|-------|-----|--------|------|----------|-----------|
| FortiGate-60E | `FG-60E-BDL-950-12` | HW+1Y UTP | 2020 | 2,458 | 655 |
| FortiGate-100E | `FG-100E-BDL-950-12` | HW+1Y UTP | 2020 | 7,564 | 2,017 |
| FortiGate-60F | `FG-60F-BDL-811-12` | HW+1Y Enterprise | 2020 | — | 884 (USD direct) |
| FortiGate-60F | `FG-60F-BDL-950-12` | HW+1Y UTP | 2020 | 2,458 | 655 |
| FortiGate-100F | `FG-100F-BDL-811-12` | HW+1Y Enterprise | 2020 | — | 3,561 (USD direct) |
| FortiGate-201F | `FG-201F` | Hardware only | May 2023 | 24,135 | 6,436 |
| FortiGate-201F | `FC-10-F201F-950-02-36` | 3Y UTP sub | May 2023 | 56,648 | 15,106 |
| FortiGate-401F | `FG-401F` | Hardware only | Nov 2023 | 46,699 | 12,453 |
| FortiGate-401F | `FC-10-0401F-950-02-36` | 3Y UTP sub | Nov 2023 | 100,583 | 26,822 |
| FortiGate-601F | `FG-601F-BDL-950-36` | HW+3Y UTP bundle | Oct 2022 | 169,830 | 45,288 |
| FortiGate-601F | `FG-601F-BDL-950-36` | HW+3Y UTP bundle | Jun 2024 | 235,384 | 62,769 |
| FortiGate-1500D | `FC-10-01500-928-02-12` | 1Y ATP renewal | Oct 2022 | 63,586 | 16,956 |
| FortiGate-3001F | `FG-3001F` | Hardware only | Jun 2024 | 362,276 | 96,607 |
| FortiGate-3001F | `FC-10-F3K1F-928-02-36` | 3Y ATP sub | Jun 2024 | 516,240 | 137,664 |

**Price escalation observed:** FG-601F-BDL-950-36 increased ~38.6% from Oct 2022 to Jun 2024 (20 months).

### 6.2 Pricing Tiers by Segment

| Segment | Typical Models | HW+1Y Bundle SAR Range |
|---------|---------------|------------------------|
| SOHO / Home Office | FG-40F, FG-60F | SAR 2,000–5,000 |
| SMB / Small Branch | FG-60F, FG-80F, FG-100F | SAR 2,500–10,000 |
| Mid Branch / Campus edge | FG-200F, FG-201F | SAR 24,000–100,000 |
| Large Branch / Regional HQ | FG-400F, FG-401F | SAR 46,000–200,000 |
| Enterprise Campus / DC edge | FG-600F, FG-601F, FG-900D | SAR 170,000–500,000 (3Y) |
| Large Enterprise / DC | FG-1500D, FG-2000E | SAR 350,000–800,000 (3Y) |
| DC / Carrier | FG-3000F, FG-3001F | SAR 360,000+ HW / 516,000 3Y ATP |
| Hyperscale | FG-4800F, FG-6000F | >SAR 1,000,000 |

### 6.3 FortiWeb Pricing Reference (USD — Q4 2020 ME&A)

| Model | SKU | Format | USD |
|-------|-----|--------|-----|
| FortiWeb-100D | `FWB-100D` | Hardware | 6,745 |
| FortiWeb-100D | `FC-10-V0101-934-02-12` | 1Y Standard Bundle | 2,920 |
| FortiWeb-100D | `FC-10-V0101-601-02-12` | 1Y Advanced Bundle | ~3,796 |
| FortiWeb-100D | `FC-10-V0101-247-02-12` | 1Y 24x7 FortiCare | ~1,168 |
| FortiWeb-4000E | `FWB-4000E` | Hardware | 231,142 |
| FortiWeb-4000E | `FC-10-V4002-934-02-12` | 1Y Standard Bundle | 100,047 |
| FortiWeb-4000E | `FC-10-V4002-601-02-12` | 1Y Advanced Bundle | 130,061 |
| FortiWeb-4000E | `FC-10-V4002-247-02-12` | 1Y 24x7 FortiCare | 40,019 |
| FortiWeb-VM (1 CPU) | `FC1-10-WBVMS-916-02-12` | 1Y Sub w/ Standard Bundle | 3,547 |
| FortiWeb-VM (1 CPU) | `FC1-10-WBVMS-633-02-12` | 1Y Sub w/ Advanced Bundle | 4,185 |

### 6.4 Transceiver Reference Prices (USD — Q4 2020 ME&A)

| SKU | Description | USD |
|-----|-------------|-----|
| `FN-TRAN-SX` | 1GE SFP SX | 55 |
| `FN-TRAN-LX` | 1GE SFP LX | 115 |
| `FN-TRAN-GC` | 1GE SFP RJ45 | 180 |
| `FN-TRAN-SFP+SR` | 10GE SFP+ SR | 125 |
| `FN-TRAN-SFP+LR` | 10GE SFP+ LR | 355 |
| `FN-TRAN-SFP+ER` | 10GE SFP+ ER (40km) | 2,325 |
| `FN-TRAN-SFP+GC` | 10GE SFP+ RJ45 copper (30m) | 938 |
| `FN-TRAN-SFP28-SR` | 25GE SFP28 SR | 1,313 |
| `FG-TRAN-SFP28-LR` | 25GE SFP28 LR | 5,625 |
| `FN-TRAN-QSFP+SR` | 40GE QSFP+ SR | 935 |
| `FN-TRAN-QSFP+LR` | 40GE QSFP+ LR | 3,250 |
| `FN-TRAN-QSFP28-SR` | 100GE QSFP28 SR | 3,790 |
| `FG-TRAN-QSFP28-LR4` | 100GE QSFP28 LR | 12,500 |
| `FN-TRAN-QSFP28-CWDM4` | 100GE QSFP28 CWDM4 2km | 6,000 |
| `FN-CABLE-SFP28-5` | 25GE SFP28 DAC 5m | ~1,050 SAR (Jun 2024 quote) |
| `FN-TRAN-QSFPDD-SR8` | 400GE QSFP-DD SR8 | Call for quote |
| `FN-TRAN-QSFPDD-LR4` | 400GE QSFP-DD LR4 10km | Call for quote |

---

## Section 7: JSON Schema for BOMATIC Vendor Catalog DB

```json
{
  "$schema": "https://json-schema.org/draft/2020-12",
  "$id": "bomatic/schemas/vendor_catalog_fortinet.json",
  "title": "BOMATIC Fortinet Vendor Catalog",
  "description": "Normalized Fortinet product catalog for BOMATIC pricing engine",
  "type": "object",
  "required": ["metadata", "products"],
  "properties": {
    "metadata": {
      "type": "object",
      "required": ["vendor", "pricelist_version", "currency", "exchange_rate_sar", "last_updated"],
      "properties": {
        "vendor": { "type": "string", "const": "Fortinet" },
        "pricelist_version": {
          "type": "string",
          "description": "e.g. 'Q4-2020-MEA', 'Q2-2026-MEA'",
          "examples": ["Q4-2020-MEA"]
        },
        "currency": {
          "type": "string",
          "enum": ["USD", "SAR"],
          "description": "Base currency of list prices"
        },
        "exchange_rate_sar": {
          "type": "number",
          "description": "SAR per 1 USD at time of pricelist",
          "examples": [3.75]
        },
        "region": { "type": "string", "const": "ME&A" },
        "distributor": {
          "type": "string",
          "description": "Primary distributor in Saudi Arabia",
          "examples": ["Exclusive Networks For Information Systems Technology"]
        },
        "last_updated": { "type": "string", "format": "date" },
        "vat_rate": {
          "type": "number",
          "description": "Saudi VAT rate (0.15 = 15%)",
          "default": 0.15
        }
      }
    },

    "products": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/product"
      }
    }
  },

  "$defs": {
    "product": {
      "type": "object",
      "required": ["sku", "description", "family", "category", "type"],
      "properties": {
        "sku": {
          "type": "string",
          "description": "Exact Fortinet part number",
          "examples": ["FG-601F-BDL-950-36", "FC-10-F201F-950-02-36"]
        },
        "description": {
          "type": "string",
          "description": "Full product description as per Fortinet price list"
        },
        "family": {
          "type": "string",
          "enum": [
            "FortiGate", "FortiWeb", "FortiMail", "FortiSandbox", "FortiDDoS",
            "FortiAnalyzer", "FortiManager", "FortiSIEM", "FortiSOAR",
            "FortiSwitch", "FortiAP", "FortiWLC", "FortiNAC", "FortiAuthenticator",
            "FortiToken", "FortiClient", "FortiEDR", "FortiExtender", "FortiADC",
            "Transceiver", "Accessory", "Professional Services", "Training"
          ]
        },
        "category": {
          "type": "string",
          "enum": ["HW", "SW", "SUBSCRIPTION", "BUNDLE", "LICENSE", "SERVICE", "TRAINING", "TRANSCEIVER"],
          "description": "Product type category"
        },
        "type": {
          "type": "string",
          "description": "Maps to STCS PnL category prefix",
          "enum": ["HW-Forti", "TSS-Forti", "Lic-Forti", "PS-Forti", "TR-Forti"]
        },
        "hardware_model": {
          "type": "string",
          "description": "Base hardware model this SKU applies to (for subscription SKUs)",
          "examples": ["FortiGate-601F", "FortiGate-1500D"]
        },
        "generation": {
          "type": "string",
          "enum": ["D-series", "E-series", "F-series", "VM", "Cloud"],
          "description": "Hardware generation"
        },
        "segment": {
          "type": "string",
          "enum": ["SOHO", "SMB", "Branch", "Mid-Range", "Enterprise", "DC", "Hyperscale", "N/A"]
        },
        "list_price": {
          "type": "object",
          "properties": {
            "amount": { "type": ["number", "null"] },
            "currency": { "type": "string", "enum": ["USD", "SAR"] },
            "date": { "type": "string", "format": "date", "description": "Date this price was observed" },
            "source": { "type": "string", "description": "Quote/pricelist source identifier" }
          }
        },
        "bundle": {
          "type": "object",
          "description": "Bundle contents (for BUNDLE category products)",
          "properties": {
            "code": {
              "type": "string",
              "description": "Bundle code from SKU",
              "enum": ["950", "928", "811", "900", "934", "601", "947"]
            },
            "name": {
              "type": "string",
              "examples": [
                "Unified Threat Protection (UTP)",
                "Advanced Threat Protection (ATP)",
                "Enterprise Protection",
                "FortiGuard UTM",
                "Standard Bundle (FortiWeb)",
                "Advanced Bundle (FortiWeb)"
              ]
            },
            "includes": {
              "type": "array",
              "items": { "type": "string" },
              "description": "List of services included",
              "examples": [["IPS", "AMP", "App Control", "Web Filter", "AntiSpam", "FortiCare Premium"]]
            },
            "duration_years": {
              "type": "integer",
              "enum": [1, 2, 3, 4, 5]
            }
          }
        },
        "support": {
          "type": "object",
          "description": "Support tier details (for SUBSCRIPTION/SERVICE products)",
          "properties": {
            "tier": {
              "type": "string",
              "enum": ["8x5", "24x7", "24x7 Premium", "FortiCare Elite", "TAM-Based"]
            },
            "nbd_rma": { "type": "boolean" },
            "prma_4hr": { "type": "boolean" },
            "duration_years": { "type": "integer" }
          }
        },
        "specs": {
          "type": "object",
          "description": "Key throughput/capacity specs for hardware",
          "properties": {
            "firewall_throughput_gbps": { "type": "number" },
            "ips_throughput_gbps": { "type": "number" },
            "ngfw_throughput_gbps": { "type": "number" },
            "threat_protection_gbps": { "type": "number" },
            "concurrent_sessions_m": { "type": "number", "description": "Millions" },
            "interfaces": { "type": "string" },
            "spu": { "type": "string", "description": "ASIC processor (NP7, CP9, etc.)" },
            "storage_tb": { "type": "number" },
            "form_factor": { "type": "string" }
          }
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Searchable tags for BOMATIC auto-selection",
          "examples": [["SD-WAN", "NGFW", "branch", "UTP", "F-series"]]
        },
        "notes": {
          "type": "string",
          "description": "Free-text notes (EOL, regional availability, special conditions)"
        }
      }
    }
  }
}
```

---

## Section 8: Top 20 Most Likely SKUs for MENA Pre-Sales

Ranked by frequency observed in STCS opportunities and relevance to common project types in Saudi Arabia (Cybersecurity, Campus Network, Smart Building, Data Center, Branch Office).

| Rank | SKU | Product / Description | Project Types | Observed In |
|------|-----|-----------------------|--------------|-------------|
| 1 | `FG-601F-BDL-950-36` | FortiGate-601F HW + 3Y FortiCare Premium + UTP | Enterprise campus, HQ firewall | ARASCO OP-2022-103262 |
| 2 | `FC-10-F201F-950-02-36` | FortiGate-201F 3Y UTP Subscription | Mid-size campus, DC edge | NesmaKent 2023 |
| 3 | `FG-201F` | FortiGate-201F Hardware only | Mid-size campus, DC edge | NesmaKent 2023 |
| 4 | `FC-10-0401F-950-02-36` | FortiGate-401F 3Y UTP Subscription | Large campus, site firewall | Nesma 2023 |
| 5 | `FG-401F` | FortiGate-401F Hardware only | Large campus, site firewall | Nesma 2023 |
| 6 | `FC-10-01500-928-02-12` | FortiGate-1500D 1Y ATP Renewal | Enterprise DC (legacy renewal) | ARASCO renewal 2022 |
| 7 | `FG-60F-BDL-950-12` | FortiGate-60F HW + 1Y UTP Bundle | SMB, branch office | MSC OP-237876 |
| 8 | `FG-100F-BDL-811-12` | FortiGate-100F HW + 1Y Enterprise Bundle | SMB+ / medium branch | MSC OP-237876 v1 |
| 9 | `FG-3001F` | FortiGate-3001F Hardware only | Data center / DC fabric firewall | Nesma Jun 2024 |
| 10 | `FC-10-F3K1F-928-02-36` | FortiGate-3001F 3Y ATP Subscription | Data center / DC fabric firewall | Nesma Jun 2024 |
| 11 | `FG-4800F` / `FG-4801F` | FortiGate 4800F series | Hyperscale DC (OGF/Aramco tier) | DMM7++ RFP eval |
| 12 | `FWB-1000D` | FortiWeb-1000D WAF Appliance | Aramco SACS-002 WAF, web apps | FA-0047 (Aramco WAF) |
| 13 | `FC-10-V{model}-934-02-12` | FortiWeb 1Y Standard Bundle | WAF subscription (AV+IPRep+SecSvc) | FA-0047 pricing model |
| 14 | `FAZ-VM-GB5` | FortiAnalyzer-VM +5GB/day upgrade | Logging, SOC integration | NesmaKent 2023 |
| 15 | `FC1-10-LV0VM-248-02-36` | FortiAnalyzer-VM 3Y FortiCare Premium | FAZ-VM support contract | NesmaKent 2023 |
| 16 | `FTM-ELIC-50` | FortiToken Mobile — perpetual 50 users | MFA for VPN, admin access | NesmaKent 2023 |
| 17 | `FAP-U221EV-E` | FortiAP Universal indoor 802.11ac Wave2 | Campus WLAN, smart building | Tabuk Emara WLAN TP |
| 18 | `FC-10-P{model}-311-02-12` | FortiAP 1Y 8x5 FortiCare | AP maintenance | Tabuk Emara WLAN TP |
| 19 | `FN-TRAN-QSFP28-SR` | 100GE QSFP28 short range transceiver | DC firewalls, spine connections | Nesma 2024 + 4800F datasheet |
| 20 | `FN-TRAN-SFP+SR` | 10GE SFP+ short range transceiver | General fiber connectivity | Nesma 2024 + quotes |

### 8.1 Bundle by Project Type

| Project Type | Primary SKUs | Notes |
|-------------|-------------|-------|
| **Cybersecurity Transformation** (full fabric) | FG-x-BDL-950-36 (perimeter), FWB (WAF), FSA (sandbox), FAZ-VM (logging), FMG-VM (mgmt) | Match Tabuk Emara Security Fabric pattern |
| **Enterprise Campus Firewall** | FG-401F or FG-601F + FC-10-xxxx-950-02-36 (3Y UTP) | ARASCO/Nesma standard pattern |
| **Branch Office NGFW** | FG-60F-BDL-950-12 or FG-100F-BDL-811-12 | MSC branch pattern |
| **Data Center Perimeter** | FG-3001F + FC-10-F3K1F-928-02-36 (3Y ATP) | ATP preferred (no antispam/web filter at DC) |
| **Hyperscale / Aramco Tier** | FG-4800F-BDL + Hyperscale license | DMM7++ / OGF evaluation grade |
| **WAF (Aramco SACS-002)** | FWB-1000D or FWB-2000E + Standard Bundle | FA-0047 pattern; SACS-002 requires WAF |
| **Campus WLAN** | FAP-U221EV + FWC-200D (legacy) or FortiGate-managed | Tabuk Emara: 115 APs + 2x FWC-200D |
| **Managed Security (MSSP)** | FG-x + FortiAnalyzer + FortiSIEM + FortiSOAR + FortiManager | OP-237876 MSC scope extended |

### 8.2 Channel / Distributor Notes for Saudi Arabia

| Field | Value |
|-------|-------|
| **Primary Distributor** | Exclusive Networks For Information Systems Technology |
| **Sub-brand used** | Arabian Internet & Communication Services (issues quotes as "Arabian Internet") |
| **Quote currency** | SAR (Saudi Riyal), fixed at SAR 3.75 = USD 1.00 |
| **VAT** | 15% on all items (HW + services) |
| **Customs** | ~SAR 375 flat per order (hardware imports) |
| **Shipping** | ~0.5–3% of subtotal |
| **Typical discount tier** | STCS as reseller: ~0–15% off distributor list (project-dependent); passes cost price through in PnL (0% GP on hardware at cost stage) |
| **Quote validity** | 30 days standard |
| **Payment terms** | Net 30 from delivery typical |
