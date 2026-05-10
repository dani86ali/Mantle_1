# RFP Compliance Patterns for BOMATIC

> Extracted from real RFP packages across 5 STCS opportunities:
> OP-2024-147007 (DMM7++ / Aramco Seismic), OP-2023-136618 (NVidia Supercomputer),
> OP-184121 (Smart City), OP-2025-154381 (Storage Cluster), NCD (Diriyah Cultural District).

---

## 1. Requirement Classification Patterns

BOMATIC's RFP parser uses three requirement obligation levels. Below are regex patterns and real examples from actual Saudi Aramco RFP documents.

### 1.1 MANDATORY Language

**Regex patterns:**

```regex
# Primary mandatory indicators
\b(shall)\b(?!\s+(not|neither))
\b(must)\b(?!\s+(not|neither))
\b(is|are)\s+required\s+to\b
\b(mandatory|mandated)\b
\b(will\s+be\s+disqualified)\b
\b(failure\s+to\s+comply)\b
\b(shall\s+be\s+cause\s+for\s+(disqualification|rejection))\b
\b(obligated\s+to)\b
\b(is\s+strictly\s+prohibited)\b
\b(shall\s+not)\b
\b(must\s+not)\b
\b(at\s+no\s+additional\s+cost)\b
\b(at\s+a\s+minimum)\b
\b(no\s+later\s+than)\b
\b(prior\s+to)\b.*\bshall\b
```

**Real examples (30+ from actual documents):**

| # | Source | Exact Quote |
|---|--------|-------------|
| 1 | DMM7++ Tech Specs | "This document outlines the minimum technical specifications, which the Bidders **shall** fulfill to be technically qualified." |
| 2 | DMM7++ Tech Specs | "All Bidders are **required** to provide documented proof of either ownership or lease agreement of the proposed Remote Computing Facility." |
| 3 | DMM7++ Tech Specs | "Bidder **shall** confirm via a letter from the OEM in a format acceptable to Saudi Aramco, that it has the support of the OEM for the duration of the Contract." |
| 4 | DMM7++ Tech Specs | "Bidder **shall** provide an integrated supercomputing system that provides (at minimum) FP64 HPL performance below: Theoretical HPL performance (Rpeak) of 145 PFlops" |
| 5 | DMM7++ GIB | "Bidder **shall** keep all Proprietary Information of SAUDI ARAMCO in strict confidence and **shall not** disclose such Proprietary Information to third parties." |
| 6 | DMM7++ GIB | "Bidders **shall** comply with the terms and conditions incorporated in SAUDI ARAMCO's Supplier Code of Conduct." |
| 7 | DMM7++ GIB | "All Bidders **must** have completed and executed the Acknowledgement of SAUDI ARAMCO's Supplier Code of Conduct or risk disqualification." |
| 8 | DMM7++ GIB | "Contact with anyone other than the Contracting Department **is strictly prohibited**." |
| 9 | DMM7++ SIB | "The Bidder **is required to** submit a Primary Proposal in strict accordance with the Pro-Forma Contract." |
| 10 | DMM7++ SIB | "No commercial information, explicit or suggested **shall** be part of the Technical Proposal." |
| 11 | DMM7++ Schedule B | "CONTRACTOR **shall** supply and maintain Manpower, Tools and Materials necessary for the performance of the WORK on a 24/7 Basis." |
| 12 | DMM7++ Schedule B | "CONTRACTOR **shall** maintain a minimum SLC for the Exploration Supercomputer of 99.67% uptime per Contract Year." |
| 13 | DMM7++ Schedule X | "CONTRACTOR **shall** comply with the Third-Party Cybersecurity Standard (SACS-002)." |
| 14 | DMM7++ Schedule X | "CONTRACTOR **shall** notify SAUDI ARAMCO within twenty-four (24) hours of discovering the Cybersecurity Incident." |
| 15 | DMM7++ Acceptance | "If the failure rate during the benchmarking period exceeds two percent (2%), then the Exploration Supercomputer **shall not** be deemed to be stable." |
| 16 | NVidia TEQ | "Requirement **shall** be 100% covered within the standard solution." |
| 17 | NVidia Schedule B | "CONTRACTOR **shall** host the Equipment in a cloud data center approved by SAUDI ARAMCO, with a minimum of tier III classification." |
| 18 | NVidia Schedule B | "The cloud data center **shall** be located in the Kingdom of Saudi Arabia." |
| 19 | NVidia Schedule B | "CONTRACTOR **shall** deploy at least one (1) full time support personnel onsite within SAUDI ARAMCO's premises in Dhahran." |
| 20 | NVidia Schedule D | "CONTRACTOR **shall** implement a Safety Management System (SMS) in accordance with the latest version of ISO 45001." |
| 21 | NVidia Schedule D | "No WORK **shall** commence at a WORK Site before the HIP has been approved by SAUDI ARAMCO." |
| 22 | Smart City GIB | "**FAILURE TO PREPARE BIDS IN ACCORDANCE WITH THE SPECIFICATIONS, TERMS AND CONDITIONS WILL BE CAUSE FOR DISQUALIFICATION.**" |
| 23 | Smart City SIB | "**FAILURE TO ATTEND THE JOB EXPLANATION MEETING SHALL BE CAUSE FOR DISQUALIFICATION.**" |
| 24 | Smart City SIB | "**BIDDERS SHALL NOT QUOTE PRICES, OR OTHER COMMERCIAL TERMS OF ANY NATURE, IN THE TECHNICAL PROPOSAL.**" |
| 25 | Smart City Schedule A | "where the words such as 'will', 'may' or 'should' appear in the Project Standards, these **shall** mean and be interpreted as 'CONTRACTOR shall'" |
| 26 | Smart City Schedule Q | "CONTRACTOR **shall** implement for this Contract a Quality Management System in accordance with the latest version of ISO 9001." |
| 27 | Storage PR | "Local Bidders **must** provide corporate profile, services portfolio that includes qualifications, area of expertise." |
| 28 | Storage PR | "The vendor **shall** provide a proposal that addresses all the stated criteria and satisfies all the requirements in this Purchase Requisition." |
| 29 | Storage PR | "The success of the testing **is mandatory** for acceptance of the proposed solution." |
| 30 | Storage PR | "Bidders **must** complete hardware installation of ordered systems within (30) thirty business days from delivery." |
| 31 | SACS-002 TPC-1 | "Third Party **must** establish, maintain and communicate a Cybersecurity Acceptable Use Policy (AUP)." |
| 32 | SACS-002 TPC-12 | "Third Party Technology Assets **must** be protected with anti-virus (AV) software. Updates **must** be applied daily." |
| 33 | NCD BOQ | "The Contractor **shall** be responsible for coordinating all Builder's Work Drawings and Working Drawings." |

### 1.2 OPTIONAL Language

**Regex patterns:**

```regex
\b(should)\b(?!\s+be\s+(cause|grounds))
\b(may)\b(?!\s+(result\s+in|cause|be\s+subject|be\s+disqualified))
\b(recommended)\b
\b(preferred)\b
\b(desirable)\b
\b(optional)\b
\b(encouraged\s+to)\b
\b(at\s+(its|the\s+Bidder'?s)\s+option)\b
\b(not\s+required\s+to)\b
```

**Real examples (20+ from actual documents):**

| # | Source | Exact Quote |
|---|--------|-------------|
| 1 | DMM7++ Tech Specs | "Bidders are **encouraged** to provide energy efficient data centers to align with the Kingdom's vision of promoting sustainability." |
| 2 | DMM7++ Tech Specs | "Bidder **may** provide at least 400 8-way GPU nodes with below minimum specifications." |
| 3 | DMM7++ Tech Specs | "The management software **should** offer capabilities for monitoring and managing the entire system." |
| 4 | DMM7++ Tech Specs | "Bidder **may** propose alternative solutions as long as they meet the below requirements." |
| 5 | DMM7++ GIB | "Bidders **should** familiarize themselves with SAUDI ARAMCO's conflict of interest provisions." |
| 6 | DMM7++ GIB | "Bidders are **encouraged** to develop and propose alternatives to the job specification that will reduce contract price." |
| 7 | DMM7++ GIB | "An unsuccessful Bidder **may**, if it wishes, request in writing to be formally debriefed." |
| 8 | DMM7++ SIB | "The Bidder, **at its option** may submit one or more Optional Alternative Proposals." |
| 9 | DMM7++ SIB | "The Bidder is **encouraged** to submit Optional Alternative Proposals, but is **not required to** do so." |
| 10 | DMM7++ Schedule B Att. 4 | "Where security guards cannot be employed, a real-time intrusion detection and prevention system **should** be employed." |
| 11 | DMM7++ Acceptance | "CONTRACTOR Group **may** run a partial HPL/LINPACK and HPCG if there is a power constraint." |
| 12 | NVidia Schedule D | "SAUDI ARAMCO, at its own discretion, **may** from time to time provide recognition awards of nominal value." |
| 13 | NVidia Schedule D | "CONTRACTOR **may** request clarification or explanation from SAUDI ARAMCO regarding any of its SH&E Requirements." |
| 14 | Smart City GIB | "Bidders **may** only submit one primary bid. However, if it wishes to submit alternative proposals, it **may** do so." |
| 15 | Smart City GIB | "Bidders are **encouraged** to visit the site." |
| 16 | Smart City SIB | "Unsolicited alternative proposals **may** also be submitted." |
| 17 | Smart City SIB | "Bidders are **encouraged** to develop and propose alternatives that will reduce the Contract Price." |
| 18 | Smart City Schedule D | "The Environmental Compliance Obligations register as 'Documented Information' which **should** be signed and dated." |
| 19 | Storage PR | "The proposal **should** include redundant power supplies." |
| 20 | Storage PR | "An IP CLOS fabric spine-leaf configuration is another **option** for bidders to be evaluated." |
| 21 | Storage PR | "The vendor **should** provide management software that will be used to configure the underlying storage." |
| 22 | Storage PR | "802.1X Network Access Control (**Optional**)." |

### 1.3 CONDITIONAL Language

**Regex patterns:**

```regex
\b(if\s+applicable)\b
\b(where\s+required)\b
\b(as\s+needed)\b
\b(at\s+Saudi\s+Aramco('?s)?\s+sole\s+discretion)\b
\b(at\s+(the\s+)?Company('?s)?\s+(sole\s+)?discretion)\b
\b(subject\s+to)\b
\b(unless\s+otherwise)\b
\b(in\s+the\s+event\s+(of|that))\b
\b(may\s+or\s+may\s+not)\b
\b(provided\s+that)\b
\b(in\s+case\s+of)\b
\b(reserves\s+the\s+right)\b
\b(at\s+its\s+sole\s+(option|convenience))\b
\b(non-committing)\b
```

**Real examples (25+ from actual documents):**

| # | Source | Exact Quote |
|---|--------|-------------|
| 1 | DMM7++ Tech Specs | "Bidder shall confirm that the execution of Phase-2 of this project is **at Saudi Aramco's sole discretion**." |
| 2 | DMM7++ Tech Specs | "Provisional requirements such as this option for Phase-2 **may or may not** be ordered in response to business requirements." |
| 3 | DMM7++ Tech Specs | "minimum DIMM size of 32GB DDR5 **unless approved** by Saudi Aramco." |
| 4 | DMM7++ Tech Specs | "the proposed parallel filesystem shall be either Enterprise Luster or IBM Spectrum Scale. Any alternatives shall be approved by Saudi Aramco first." |
| 5 | DMM7++ Tech Specs | "Bidder shall note that this phase is **non-committing** to Saudi Aramco." |
| 6 | DMM7++ GIB | "SAUDI ARAMCO **may, in its sole discretion**, disqualify any Bidder based upon potential conflicts of interest." |
| 7 | DMM7++ GIB | "SAUDI ARAMCO nevertheless **reserves the right** to reject any or all proposals for any reason whatsoever." |
| 8 | DMM7++ SIB | "The decision to award or not award a contract shall remain **at SAUDI ARAMCO's sole discretion**." |
| 9 | DMM7++ SIB | "**In the event of** a conflict between this SIB and the GIB, the SIB shall prevail." |
| 10 | DMM7++ Schedule B | "This Contract **may** be executed in two (2) phases. Phase 2 **may** be executed through an exercise of option by SAUDI ARAMCO." |
| 11 | DMM7++ Schedule B | "**If** a dispute arises regarding the number of Downtime Hours, the reasonable discretion of the Company Representative shall prevail." |
| 12 | DMM7++ Schedule A | "SAUDI ARAMCO **may at any time**, with or without cause, suspend performance of the WORK." |
| 13 | DMM7++ Schedule A | "SAUDI ARAMCO **may at any time and at its sole convenience**, terminate this Contract." |
| 14 | NVidia Addendum | "to SAUDI ARAMCO's satisfaction, as determine **in SAUDI ARAMCO's sole discretion**, and confirmed by SAUDI ARAMCO in writing." |
| 15 | NVidia Schedule B | "Decisions to upgrade to newer versions of the SuperPod shall be **solely SAUDI ARAMCO's**." |
| 16 | NVidia Schedule H | "**In its sole discretion**, SAUDI ARAMCO may novate this CONTRACT to Aramco Digital." |
| 17 | NVidia Schedule D | "**In case of** conflicting requirements, the most stringent requirement shall apply **unless otherwise** noted." |
| 18 | NVidia Schedule D | "**If** current SAUDI ARAMCO requirements do not cover a specific situation, CONTRACTOR shall contact the Company Representative." |
| 19 | Smart City GIB | "**Where** the RFP calls for separate technical, IKTVA, and commercial proposals, SAUDI ARAMCO will normally consider the technical bids first." |
| 20 | Smart City Schedule A | "**Subject to** CONTRACTOR's compliance with Paragraph 9.2." |
| 21 | Smart City Schedule D | "SAUDI ARAMCO **reserves the right** to reject, remove from site, or have CONTRACTOR destroy any tools or equipment found to be defective." |
| 22 | Storage PR | "Phase-2: This phase includes provision of items that can be exercised **at Saudi Aramco sole discretion**." |
| 23 | Storage PR | "This purchase requisition is **non-committing** to Saudi Aramco for Phase-2." |
| 24 | Storage PR | "**In case of** solutions that do not meet any of these requirements, Saudi Aramco/UDC **at its own discretion** will choose one of: Allow the vendor to replace... Reject the solution..." |
| 25 | Storage PR | "**If** the delay is caused by Saudi Aramco, the warranty period shall commence after 60 days." |
| 26 | SACS-348 CT 2.2 | "Cloud Service Tenant must ensure that the cloud service provider is approved by CITC." |

---

## 2. Evaluation Criteria Patterns

### 2.1 Evaluation Methodology (Common Across All Opportunities)

Saudi Aramco consistently uses a **sequential envelope evaluation** process:

```
1. Technical Proposals evaluated first (pass/fail + scoring)
2. IKTVA Proposals evaluated second (pass/fail with minimum score)
3. Only commercially qualified bidders' Commercial Proposals opened
4. Award to "least overall cost" among technically & IKTVA qualified bidders
```

**Key pattern:** "SAUDI ARAMCO will normally award the contract to the technically and IKTVA qualified Bidder whose proposal, in SAUDI ARAMCO's opinion, represents the least overall cost to SAUDI ARAMCO."

### 2.2 Technical Evaluation Questionnaire Structure (OP-2023-136618)

**Compliance categories (3-level system):**

| Level | Label | Meaning | Bidder Must Provide |
|-------|-------|---------|-------------------|
| 1 | **Supported** | "Requirement shall be 100% covered within the standard solution" | Brief description + supporting documentation |
| 2 | **Will be Customized** | "Requirement is not fulfilled by the standard solution, however it will be fulfilled as part of the implementation" | Description of customization, maintenance plan, development timeline |
| 3 | **Not Supported** | "Requirement cannot be fulfilled" | Explanation of limitation, alternative approaches if any |

**Evaluation question categories (from NVidia TEQ):**

| # | Category | Question Pattern |
|---|----------|-----------------|
| 1 | Availability & Reliability | "What is your design to maintain 99.9% availability?" |
| 2 | Bill of Materials | "Provide detailed bill of material meeting the equipment and software requirements specified in Schedule 'B' and Schedule 'G'" |
| 3 | Data Center / Hosting | "Provide detailed information on how your data center hosting proposal will meet or exceed the requirements set forth in Schedule 'B'" |
| 4 | Cybersecurity Compliance | "Provide details confirming how you plan to comply with SAUDI ARAMCO's cybersecurity requirements and NCA guidelines" |

### 2.3 IKTVA Scoring Structure (OP-184121)

| Category | Description | Min Year 1 | Min Year 2 |
|----------|-------------|-----------|-----------|
| A | Localized goods and services | - | - |
| B | Salaries paid to Saudis | - | - |
| C | Training and Development of Saudis | - | - |
| D | Vendor/Manufacturer development spend | - | - |
| R | Research and Development | - | - |
| X | Export Revenue Factor | - | - |
| **Score** | **A+B+C+D+R** | **21%** | **23%** |

Pattern: "Failure to submit an IKTVA proposal or failure to meet the minimum IKTVA passing score may result in excluding your commercial proposal from evaluation."

### 2.4 Acceptance Test Criteria (Performance Thresholds)

**DMM7++ (OP-2024-147007) benchmarks:**

| Test | Metric | Minimum |
|------|--------|---------|
| HPL/LINPACK (Rmax) | TFLOPS | 80,000 |
| HPCG | GFLOPS | 910,000 |
| Local NVMe Write | GB/s per node | 8 |
| Local NVMe Read | GB/s per node | 16 |
| Parallel FS N-N Sequential Read | GB/s | 1,000 |
| Parallel FS N-N Sequential Write | GB/s | 1,000 |
| NFS Performance Read | MB/s | 1,000 |
| NFS Performance Write | MB/s | 600 |
| Network iperf point-to-point | Gb/s | 160 |
| Stability failure rate | % | <= 2% |

**Storage (OP-2025-154381) benchmarks:**

| Test | Metric | Minimum |
|------|--------|---------|
| Aggregate Read (100,000 TB) | GB/s | 800 |
| Aggregate Write (100,000 TB) | GB/s | 600 |
| Remote Clients Read | GB/s | 400 |
| IO500, HPCG, LINPACK | Required | Pass/fail |

### 2.5 Commercial Evaluation Patterns

- "The commercial TCO evaluation of this bid is based on the total cost of the material forecasted in line items 1-4, and the cost of the General Services Contract."
- "Where the RFP calls for a lump sum price with unit rates to cover change order work, both the lump sum price and the unit rates may be considered in the evaluation."
- "SAUDI ARAMCO also reserves the right to delete or to negotiate any change order unit rates that it considers excessively high or low."

### 2.6 Contract Schedule Precedence Order

When schedules conflict, the following order applies (highest first):

1. Schedule "H" -- Special Terms and Conditions
2. Schedule "A" -- General Terms and Conditions
3. Schedule "X" -- Cybersecurity Terms and Conditions
4. Schedule "S" -- Saudization Requirements
5. Schedule "I" -- In-Kingdom Total Value Add (IKTVA)
6. Schedule "D" -- Safety, Health and Environmental Requirements
7. Schedule "E" -- Settlement of Disputes
8. Schedule "F" -- Taxes, Duties and Related Obligations
9. Schedule "C" -- Contract Price and Payment Provisions
10. Schedule "Q" -- Quality Assurance and Control
11. Schedule "G" -- Materials, Tools and Equipment
12. Schedule "B" -- Job Specification
13. Attachments to Schedule "B"
14. Schedule "P" -- Sustainability (V34+)

---

## 3. File Classification Taxonomy

### 3.1 Classification Rules

BOMATIC classifies RFP package files into 5 categories using filename patterns, folder location, and content keywords.

#### Legal Documents

```yaml
category: legal
patterns:
  filename:
    - "*NDA*"
    - "*bid bond*"
    - "*bank guarantee*"
    - "*declaration*"
    - "*Signature*Sheet*"
    - "*Schedule_A*"          # General Terms
    - "*Schedule_E*"          # Disputes & Arbitration
    - "*Schedule_F*"          # Taxes
    - "*Schedule_H*"          # Special Terms
    - "*Schedule_I*"          # IKTVA
    - "*Schedule_S*"          # Saudization
    - "*Contract*"
    - "*IKTVA*"
    - "*Proforma*"
    - "*Performance*Guarantee*"
    - "*Exit*Strategy*"
    - "*End*Use*Statement*"
  folder:
    - "*/Proforma*"
    - "*/IFP*"
  content_keywords:
    - "governing law"
    - "arbitration"
    - "indemnify"
    - "warranty"
    - "termination for cause"
    - "intellectual property"
    - "confidentiality"
    - "force majeure"
```

#### Commercial Documents

```yaml
category: commercial
patterns:
  filename:
    - "*Schedule_C*"           # Pricing
    - "*Pricing*Attachment*"
    - "*BoQ*"
    - "*BOQ*"
    - "*Hypothetical*Quantities*"
    - "*Unit*Rate*"
    - "*Commercial*Proposal*"
    - "*Payment*"
    - "*Cash*Flow*"
    - "*Schedule_F*"           # Also taxes
    - "*Work-on-Hand*"
    - "*Estimate_*"
    - "*Quote*"
    - "*cost*"
  folder:
    - "*/BOQ/*"
    - "*/Quotes/*"
    - "*/PnL/*"
    - "*/P&L/*"
    - "*/Commercial*"
  content_keywords:
    - "lump sum"
    - "unit rate"
    - "payment milestone"
    - "total price"
    - "retention"
    - "advance payment"
    - "invoice"
```

#### Technical Documents

```yaml
category: technical
patterns:
  filename:
    - "*Schedule_B*"           # Job Specification / SOW
    - "*Tech*Spec*"
    - "*Minimum*Spec*"
    - "*Technical*Evaluation*"
    - "*Technical*Bid*"
    - "*JOBEX*"
    - "*JobEx*"
    - "*Scope*Work*"
    - "*Acceptance*Testing*"
    - "*Standards*Specifications*"
    - "*HLD*"                  # High Level Design
    - "*Manpower*"
    - "*Project*Milestones*"
    - "*Questionnaire*"
    - "*Schedule_D*"           # Safety/SH&E
    - "*Schedule_Q*"           # Quality
    - "*Device*List*"
    - "*Benchmark*"
    - "*Datasheet*"
    - "*FSD*"                  # Functional Spec Document
    - "*Purchase*Requisition*"
  folder:
    - "*/RFP/*"
    - "*/TP/*"
    - "*/Technical*"
    - "*/Specifications/*"
    - "*/Schematic*design/*"
  content_keywords:
    - "scope of work"
    - "minimum requirements"
    - "shall provide"
    - "acceptance criteria"
    - "performance test"
    - "milestone"
    - "SLA"
    - "uptime"
```

#### Compliance Documents

```yaml
category: compliance
patterns:
  filename:
    - "*SACS*"
    - "*CAP-*"                 # CyberSecurity Architecture Pattern
    - "*Schedule_X*"           # Cybersecurity Terms
    - "*Compliance*"
    - "*Cybersecurity*"
    - "*Security*Assessment*"
    - "*Security*Architecture*"
    - "*IKTVA*plan*"
    - "*KTVA*"
    - "*Local*Content*"
    - "*Addendum*"
    - "*Clarification*"
    - "*Schedule_P*"           # Sustainability
  folder:
    - "*/Important*Documents/*"
    - "*/LSTK*Job*Specification/*"
    - "*/Q&A/*"
    - "*/Clarification*"
  content_keywords:
    - "SACS-"
    - "cybersecurity"
    - "IKTVA"
    - "local content"
    - "compliance certificate"
    - "CCC"
    - "NCA"
    - "penetration testing"
    - "vulnerability"
```

#### Administrative Documents

```yaml
category: administrative
patterns:
  filename:
    - "*General*Instructions*Bidders*"
    - "*Specific*Instruction*Bidders*"
    - "*GIB*"
    - "*SIB*"
    - "*Guide*"
    - "*RACI*"
    - "*Charter*"
    - "*Schedule_G*"           # Materials/Equipment lists
    - "*Kick*Off*"
    - "*Handover*"
    - "*Lessons*Learned*"
    - "*WIN*ANNOUNCEMENT*"
    - "*Open*Envelope*"
    - "*IFP*letter*"
    - "*CR*"                   # Commercial Registration
    - "*VAT*certificate*"
    - "*GOSI*"
    - "*Resume*"
    - "*CV*"
  folder:
    - "*/Admin*"
    - "*/Resumes/*"
  content_keywords:
    - "instructions to bidders"
    - "bid closing date"
    - "proposal validity"
    - "e-Marketplace"
    - "ECN system"
    - "registration"
```

### 3.2 Aramco Schedule Classification Map

| Schedule | Type | Description |
|----------|------|-------------|
| Schedule A | legal | General Terms and Conditions |
| Schedule B | technical | Job Specification / Scope of Work |
| Schedule B Att. I | legal | Contract Release PO Terms |
| Schedule B Att. II | technical | Project Milestones |
| Schedule B Att. III | technical | Manpower Requirements |
| Schedule B Att. IV | technical | Standards and Specifications |
| Schedule B Att. VI-VII | technical | Acceptance Testing |
| Schedule C | commercial | Contract Price and Payment |
| Schedule C Att. I | commercial | Pricing Attachment |
| Schedule D | technical/compliance | Safety, Health and Environmental |
| Schedule E | legal | Disputes, Arbitration, Choice of Law |
| Schedule F | legal/commercial | Taxes, Duties and Related Obligations |
| Schedule G | technical | Materials, Tools and Equipment |
| Schedule H | legal | Special Terms and Conditions |
| Schedule I | compliance | IKTVA (In-Kingdom Total Value Add) |
| Schedule P | compliance | Sustainability |
| Schedule Q | technical/compliance | Quality Assurance and Control |
| Schedule S | compliance | Saudization Terms |
| Schedule X | compliance | Cybersecurity Terms and Conditions |

---

## 4. Referenced Document Detection Patterns

### 4.1 Internal Document References

**Regex patterns for cross-references within the RFP package:**

```regex
# Schedule references
(?:Schedule|Sched\.)\s*['"]?([A-Z])['"']?\s*(?:,?\s*(?:Paragraph|Para\.?|Section|Sec\.?)\s*(\d+(?:\.\d+)*))?
(?:Attachment|Att\.?)\s+([IVX]+|\d+)\s+(?:to|of)\s+Schedule\s*['"]?([A-Z])['"]?
(?:Exhibit|Exh\.?)\s+['"]?([A-Z])['"]?\s+(?:to\s+(?:this|the)\s+SIB)?

# Paragraph/section references
(?:Paragraph|Para\.?)\s+(\d+(?:\.\d+)*)\s+(?:of\s+)?(?:this\s+)?Schedule\s*['"]?([A-Z])['"]?
(?:Section|Sec\.?)\s+(\d+(?:\.\d+)*)\s+(?:of|above|below|herein)

# Annex / Appendix references
(?:Annex|Appendix|Appendices)\s+([A-Z]|\d+)
(?:refer\s+to|see|as\s+per|per)\s+(?:Annex|Appendix)\s+([A-Z]|\d+)
```

**Real examples:**

| Pattern | Real Usage |
|---------|-----------|
| Schedule reference | "as set forth in Schedule 'B'" |
| Attachment reference | "in accordance with Attachment IV to Schedule 'B'" |
| Paragraph reference | "pursuant to Paragraph 18 of Schedule 'A'" |
| Exhibit reference | "The Bidder shall comply with Exhibit 'A' to this SIB" |
| Cross-schedule | "The Monthly Lease Rate set forth in Pricing Attachment I to this Schedule 'C'" |

### 4.2 Saudi Aramco Standard References

**Regex patterns for Aramco engineering and cybersecurity standards:**

```regex
# SACS standards (Cybersecurity)
SACS[-\s]?(\d{3})\b

# SAES standards (Engineering)
SAES[-\s]?([A-Z][-\s]?\d{3})\b

# SAEP standards (Engineering Procedures)
SAEP[-\s]?(\d{1,4})\b

# SAER standards (Engineering Reports)
SAER[-\s]?(\d{4})\b

# GI standards (General Instructions)
G\.?I\.?\s*(\d{1,3}(?:\.\d{3})*)\b

# SAMSS (Materials & Standardization)
SAMSS[-\s]?(\d{3})\b

# SABP (Best Practices)
SABP[-\s]?([A-Z][-\s]?\d{3})\b

# SAEHC (Environmental Health Code)
SAEHC[-\s]?([A-Z][-\s]?\d{2})\b

# CU references (Corporate Instructions)
CU[-\s]?(\d{2}\.\d{2})\b

# CAP (CyberSecurity Architecture Patterns)
CAP[-\s]?(\d{3})\b

# MSAERs
M(?:andatory\s+)?S(?:audi\s+)?A(?:ramco\s+)?E(?:ngineering\s+)?R(?:equirements)?

# NCA references
NCA\s+(?:ECC|DCC|CSCC|Cloud)\b
```

### 4.3 Complete Saudi Aramco Standards Registry (from Extracted Documents)

#### SACS Standards (Cybersecurity)

| ID | Full Name | Typical Context |
|----|-----------|-----------------|
| SACS-001 | Anti-Malware Cybersecurity Standard | IT Security Assessment |
| SACS-002 | Third Party Cybersecurity Standard (2022) | All contracts (CCC requirement) |
| SACS-003 | Cloud Cybersecurity Standard | Cloud hosting |
| SACS-004 | Firewall Security Standard | Network security |
| SACS-006 | Workstations and Servers Security Standard | Endpoint security |
| SACS-008 | Patch Management Standard | Software maintenance |
| SACS-009 | Identity & Access Management Standard | Authentication |
| SACS-010 | Video Surveillance Cybersecurity Standard | Physical security |
| SACS-011 | Sanitization Standard | Data destruction |
| SACS-012 | Physical Protection Standard (2023) | Facility security |
| SACS-014 | Extranet Security Standard | External connections |
| SACS-015 | Unified Communication Cybersecurity Standard | VoIP/UC |
| SACS-016 | Encryption Security Standard | Data encryption |
| SACS-017 | Application & Database Development Standard | Software dev |
| SACS-018 | Vulnerability Management Standard | Security scanning |
| SACS-019 | Cybersecurity Incident Management Standard | Incident response |
| SACS-020 | Logging Security Standard | Audit logging |
| SACS-021 | Affiliates Cybersecurity Standard (ACS) | Subsidiary security |
| SACS-022 | Mobile Device Security Standard | Mobile security |
| SACS-023 | Network Security Standard | Network infrastructure |
| SACS-025 | Intrusion Prevention & Detection Standard | IDS/IPS |
| SACS-026 | Wireless Networks Security Standard | WiFi security |
| SACS-028 | Social Media Accounts Cybersecurity Standard | Social media |
| SACS-029 | Email Cybersecurity Standard | Email security |
| SACS-030 | Cybersecurity Architecture Standard | Security architecture |
| SACS-031 | Corporate and Executive Management CS Standard | Governance |
| SACS-032 | Third Party Proponent Standard | Vendor management |
| SACS-034 | Asset Management Standard | IT asset tracking |
| SACS-035 | Remote Access Cybersecurity Standard | VPN/remote access |
| SACS-036 | Business Continuity & Disaster Recovery Standard | BC/DR |
| SACS-039 | Drones Cybersecurity Standard | Drone security |
| SACS-040 | Internet of Things (IoT) Security Standard | IoT security |
| SACS-333 | Sanitization Cybersecurity Standard (2024) | Media sanitization |
| SACS-348 | Cloud Computing Cybersecurity Standard (2023) | Cloud services |

#### CAP Standards (CyberSecurity Architecture Patterns)

| ID | Full Name |
|----|-----------|
| CAP-001 | Containers |
| CAP-002 | Cloud Workload Protection |
| CAP-003 | Data Anonymization |
| CAP-004 | Digital Signing |
| CAP-005 | Data Loss Prevention |
| CAP-006 | File Integrity Monitoring (FIM) |
| CAP-007 | Identity and Access Management (IAM) |
| CAP-008 | Network Segmentation |
| CAP-009 | Privileged Access Management (PAM) |
| CAP-010 | Remote Access |
| CAP-011 | Secure Platform |
| CAP-012 | Encryption at Rest |

#### SAES Standards (Engineering)

| ID | Full Name | Context |
|----|-----------|---------|
| SAES-A-007 | Hydrostatic Testing Fluids | Environmental |
| SAES-A-102 | Ambient Air Quality and Source Emission Standards | Environmental |
| SAES-A-103 | Discharges to Marine Environment | Environmental |
| SAES-A-104 | Wastewater Treatment | Environmental |
| SAES-A-105 | Noise Control | Environmental |
| SAES-A-114 | Rock Excavation | Construction |
| SAES-A-202 | Engineering Standard for Drawings | Documentation |
| SAES-A-400 | Industrial Drainage Systems | Environmental |
| SAES-A-401 | Closed Drain Systems | Environmental |
| SAES-A-403 | Offshore Platform Drainage | Offshore |
| SAES-D-116 | Underground Storage Tank System | Environmental |
| SAES-L-460 | Pipeline Crossings | Construction |
| SAES-S-007 | Solid Waste Landfill Requirements | Waste mgmt |
| SAES-S-010 | Sanitary Sewers | Infrastructure |
| SAES-S-020 | Oily Water Drainage | Environmental |
| SAES-S-040 | Water Systems | Utilities |
| SAES-T-494 | VSAT Network Design | Telecom |
| SAES-T-566 | Plants DMZ Architecture | Network security |
| SAES-T-916 | Building Cable Systems and Spaces | Infrastructure |
| SAES-Z-001 | Process Control Systems | ICS |
| SAES-Z-004 | SCADA System | ICS |
| SAES-Z-010 | Process Automation Networks | ICS |

#### GI Standards (General Instructions)

| ID | Full Name |
|----|-----------|
| GI 1000.000 | Contractor Workforce Qualification Assurance |
| GI 2.100 | Work Permit System |
| GI 2.104 | Leak and Spill Reporting |
| GI 2.400 | Offshore Oil Spill Contingency Plan |
| GI 2.401 | Inland Oil Spill Response |
| GI 2.710 | Performance Acceptance |
| GI 2.717 | Procedures for Handling PCBs |
| GI 6.003 | Incident Investigation |
| GI 6.007 | Reporting of Contractor On-Job Injuries |
| GI 6.012 | Safety Reporting |
| GI 6.020 | Water Survival |
| GI 6.030 | Traffic and Vehicle Safety |
| GI 150.000 | Industrial Hygiene and Occupational Health |
| GI 150.001 | Asbestos Hazard Management |
| GI 150.100 | Environmental Health |
| GI 298.010 | Administration Procedure of Contractor Camps |
| GI 299.120 | Data Sanitization |
| GI 430.001 | Implementing the Hazardous Waste Code |
| GI 710.001 | SAUDI ARAMCO Identification Cards |
| GI 710.002 | Classification and Handling of Sensitive Information |
| GI 710.007 | Restricted/Non-Restricted Area Vehicle Stickers |
| GI 710.025 | Security Risk Assessments for Facilities |

#### SAEP Standards (Engineering Procedures)

| ID | Full Name |
|----|-----------|
| SAEP-13 | Environmental Impact Assessment |
| SAEP-66 | Noise Control |
| SAEP-99 | ICS Security |
| SAEP-100 | Plant's Cyber Security Incident Response |
| SAEP-122 | Quality Assurance |
| SAEP-302 | Instructions for Obtaining Waiver of MSAER |
| SAEP-327 | Disposal of Wastewater |
| SAEP-334 | As-Built Drawings |
| SAEP-367 | Project Risk Management |
| SAEP-410 | Environmental Management System |

### 4.4 External / Industry Standard References

**Regex patterns:**

```regex
# ISO standards
ISO\s+(\d{4,5})(?:[-:](\d{4}))?

# NIST
NIST\s+(?:SP\s+)?(\d{3}[-]?\d{0,3})(?:\s+Rev\.?\s*(\d+))?

# NFPA
NFPA\s+(\d{1,3})

# API
API\s+(\d{3,4})

# ASME
ASME\s+(?:Section\s+)?([IVX]+|\w+)

# IEEE
IEEE\s+(\d{3,4}(?:\.\d+)?)

# NCA (Saudi National Cybersecurity Authority)
NCA\s+(ECC|DCC|CSCC|Cloud)\b
```

**External standards found in RFP packages:**

| Category | Standards |
|----------|-----------|
| Quality | ISO 9001, ISO 9000, ISO 10005, ISO 19011 |
| Safety | ISO 45001, ISO 14040, NFPA 13/14/20/70/72/75/90A/99/251 |
| Cybersecurity | NIST 800-53 Rev 4/5, NIST 800-88 Rev 1, NIST CSF, NCA ECC/DCC/CSCC/Cloud |
| Cloud | CSA CCM (Cloud Controls Matrix) |
| Engineering | ANSI B31.3/31.4/31.8, ASME I/V/VIII/IX, API 510/620/650/653 |
| Welding | AWS D1.1, ASNT CP-189 |
| Electrical | IEEE 518/1100, IEC 60529 |
| Cabling | ANSI/TIA/EIA-568-C, ISO/IEC 11801, BICSI TDMM |
| Building | IBC, M-100 (Saudi Aramco Building Code) |
| Maritime | MARPOL, ROPME Protocol |

### 4.5 Generic Reference Detection Patterns

```regex
# "refer to" patterns
(?:refer(?:s|red|ring)?\s+to|see|as\s+per|per|in\s+accordance\s+with|as\s+defined\s+in|pursuant\s+to|as\s+specified\s+in|as\s+described\s+in|as\s+set\s+forth\s+in|in\s+compliance\s+with|compliant\s+with|in\s+conformance\s+with)\s+(?:the\s+)?(.+?)(?:\.|,|;|\s+and\s+|\s+or\s+)

# "attached" / "enclosed" patterns
(?:the\s+attached|attached\s+hereto|enclosed\s+herewith|accompanying\s+document|herein\s+enclosed|annexed\s+hereto)

# Numbered document patterns
Doc\s*(\d{9,12})
\d{10}[-_]\w+  # Aramco document numbers
```

---

## 5. Disqualification Trigger Patterns

### 5.1 Automatic Disqualification (Immediate Rejection)

These patterns indicate an action that causes **immediate, automatic** disqualification with no discretion:

```regex
\b(automatic(?:ally)?\s+disqualif(?:ied|ication))\b
\b(shall\s+(?:be\s+)?(?:cause\s+for\s+)?disqualif(?:ied|ication))\b
\b(will\s+(?:result\s+in|be\s+cause\s+for)\s+disqualification)\b
\b(shall\s+not\s+be\s+(?:opened|considered|accepted))\b
```

| Trigger | Source | Severity |
|---------|--------|----------|
| Including prices in Technical Proposal | SIB (all opportunities) | **Automatic** |
| Not attending Job Explanation meeting | SIB (all opportunities) | **Automatic** |
| Not attending mandatory Site Visit | SIB (Smart City) | **Automatic** |
| Failure to submit compliant Commercial Proposal | SIB (DMM7++) | **Automatic** |
| Failure to submit Technical Proposal | GIB (all) | **Automatic** |
| Failure to submit IKTVA proposal | GIB (all) | **Automatic** |
| No formal relationship with Manufacturer | Storage PR | **Automatic** |
| Failure to meet minimum IKTVA passing score | GIB (all) | **Automatic** |
| Failure to meet minimum Technical passing score | GIB (all) | **Automatic** |

### 5.2 Discretionary Disqualification (May Result in Rejection)

These patterns indicate Saudi Aramco **retains discretion** to reject:

```regex
\b(may\s+(?:result\s+in|cause|be\s+(?:cause|grounds)\s+for)\s+(?:disqualification|rejection))\b
\b(at\s+SAUDI\s+ARAMCO'?s?\s+sole\s+discretion.*(?:disqualif|reject))\b
\b(risk\s+disqualification)\b
\b(may\s+not\s+be\s+(?:opened|considered))\b
```

| Trigger | Source | Severity |
|---------|--------|----------|
| Failure to provide GOSI certification | GIB | **May not open** |
| Failure to provide Saudization certification | GIB | **May not open** |
| Failure to provide Government ID numbers | GIB | **May disqualify** |
| Qualifications/exceptions/deviations in primary proposal | SIB | **May disqualify** |
| Rate discrepancies between electronic and hard copies | SIB | **May disqualify** |
| Failure to provide proof of facility ownership/lease | Tech Specs | **May reject** |
| False, incomplete, or unresponsive statements | Storage PR | **May reject** |
| Conditions or limitations set up by the Bidder | Storage PR | **May reject** |
| Subcontracting more than 40% of WORK | SIB (Smart City) | **May disqualify** |

### 5.3 Contract Breach / Termination Triggers

These apply post-award and indicate actions that constitute material breach:

```regex
\b(substantial\s+(?:and\s+material\s+)?breach)\b
\b(material\s+breach)\b
\b(right\s+to\s+terminate)\b
\b(terminate\s+(?:this\s+)?(?:Contract|Agreement)\s+(?:for\s+cause|immediately))\b
\b(suspend\s+(?:all\s+or\s+any\s+part\s+of)\s+the\s+WORK)\b
```

| Trigger | Source | Consequence |
|---------|--------|-------------|
| SH&E non-conformance | Schedule D | Substantial and material breach |
| Failure to be operational within deadline (120/240 days) | Schedule B / Addendum | Immediate termination |
| Loss of OEM/manufacturer authorized status | Schedule H | Substantial breach |
| Delivery requirements not met | Schedule H | Partial/full termination |
| Failure to comply with Contractor Passport registration | Schedule A | Material breach |
| Failure to certify employee/subcontractor payments | Schedule A | Material breach |
| Conflict of interest violation | Schedule A | Substantial breach |
| Failure to provide CCC within 90 days | Schedule X / GIB | Material breach |
| Exceeding 2% failure rate during benchmarking | Acceptance Testing | Fails acceptance |

### 5.4 Key Compliance Deadlines

| Deadline | Trigger | Source |
|----------|---------|--------|
| Bid Closing Date | GOSI, Saudization certs must be uploaded | GIB |
| 15 working days from Contract execution | CSSP, HIP, SH&E Accountability Plan, EMP | Schedule D |
| 21 calendar days from Contract effective date | Quality Plan submission | Schedule Q |
| 24 hours | Cybersecurity incident notification | Schedule X |
| 30 calendar days | Notice of Appeal submission | Schedule E |
| 48 hours | Temporary replacement of rejected personnel | Schedule B |
| 7 calendar days | Permanent replacement of rejected personnel | Schedule B |
| 90 calendar days from Contract effective date | CCC submission | Schedule X / GIB |
| 120 calendar days | Proposal validity minimum | GIB/SIB |
| 2 years | CCC renewal | Schedule X |

---

## 6. Aramco-Specific Patterns

### 6.1 SACS Compliance Framework

**CCC (Cybersecurity Compliance Certificate) requirement pattern:**

Every Saudi Aramco contract requires:
1. "The awarded Contractor **shall obtain** a Cybersecurity Compliance Certificate (CCC) from SAUDI ARAMCO authorized audit firms in accordance with the third-party classification set forth in **SACS-002**."
2. "The awarded Contractor **shall submit** the CCC to SAUDI ARAMCO through the Saudi Aramco e-Marketplace system within **ninety (90) calendar days** of the Effective Date."
3. "CONTRACTOR **shall renew** the CCC every **two (2) years**."

**Third-party classification tiers (SACS-002):**
- **Section VII (A)**: Minimum controls -- ALL third parties must comply
- Higher tiers assigned by Saudi Aramco based on data access level and criticality

**Key SACS-002 controls (92 TPC controls):**

| Control Area | Key Requirements |
|-------------|-----------------|
| Access & Authentication | Unique user IDs (TPC-32), MFA on remote access (TPC-4), MFA on cloud (TPC-5), MFA on privileged accounts (TPC-37) |
| Data Protection | Segregate SA data from other clients (TPC-38), Encrypt data in transit (TPC-52), AES-256 encryption at rest (TPC-54) |
| Endpoint Security | Anti-virus with daily updates (TPC-12), Firewalls on endpoints (TPC-22), Regular patching (TPC-11) |
| Email Security | SPF implementation (TPC-13/14/15), Anti-spam (TPC-16), Private email domain required (TPC-17) |
| Network Security | Perimeter firewalls (TPC-76), IDS/IPS (TPC-77), WAF for web apps (TPC-79), Server/workstation segmentation (TPC-40) |
| Monitoring | Monthly vulnerability scans (TPC-85), Annual penetration testing (TPC-27), 1-year audit log retention (TPC-75), Central event monitoring (TPC-81) |
| Incident Response | 24-hour notification to SA (TPC-23), Documented IR plan (TPC-88/89) |
| Physical Security | Locked racks (TPC-46), Restricted access (TPC-49), Visitor management (TPC-47/48), Video surveillance (TPC-82) |
| Data Sanitization | NIST 800-88 compliant (TPC-19/66), Signed certification letter to SA |
| BC/DR | Documented DR plan (TPC-67), Annual BC drills (TPC-70) |
| Vulnerability Remediation | Critical: 14 days, High: 1 month, Medium/Low: 3 months (TPC-91) |

### 6.2 IKTVA (In-Kingdom Total Value Add) Patterns

**Detection pattern:**
```regex
\b(IKTVA|In[-\s]Kingdom\s+Total\s+Value\s+Add)\b
\b(KTVA)\b
\b(local\s+content)\b
\b(Saudization)\b
\b(Council\s+of\s+Ministers\s+Decision\s+50)\b
```

**Standard IKTVA structure:**
- Category A: Localized goods and services
- Category B: Salaries paid to Saudis
- Category C: Training and Development of Saudis
- Category D: Vendor/Manufacturer development spend
- Category R: Research and Development
- Category X: Export Revenue Factor
- **IKTVA Score = A + B + C + D + R** (must meet minimum per contract year)

**Key compliance requirements:**
- "Failure to submit an IKTVA proposal or failure to meet the minimum IKTVA passing score may result in excluding your commercial proposal from evaluation."
- IKTVA proposal format must use Saudi Aramco provided Excel template
- "The IKTVA proposal must be submitted in the format provided by Saudi Aramco, otherwise it will not be accepted/reviewed."

### 6.3 Saudi Aramco Contract Document Naming Conventions

**Document numbering pattern:**
```regex
# Aramco purchase requisition
(?:Aramco|SA)[-_]?\d{10}[-_]
# Aramco RFP document package
Doc\d{9,12}
# Opportunity reference
OP[-]?\d{4}[-]?\d{6}
# Salesforce reference
(?:XX|SA)[-]\d{4}[-]\d{5}
```

**Standard RFP package structure:**
```
{DocXXXXXXXXXX}/
  General Instructions to Bidders.docx      (or "e-Marketplace" variant)
  Specific Instruction to Bidders.docx
  KTVA plan Proposal Sheet.xlsx
  Proforma Schedules/
    Schedule_A_-_GS.docx                    # General Terms
    Schedule_A_Attachment_I.docx            # Contract Release PO
    Schedule_B.docx                         # Job Specification
    Schedule_B_Attachment_01.docx           # Varies
    Schedule_B_Attachment_02.docx           # Project Milestones
    Schedule_B_Attachment_03.docx           # Manpower
    Schedule_B_Attachment_04.docx           # Standards and Specifications
    Schedule_B_Attachment_06.docx           # Acceptance Testing Phase I
    Schedule_B_Attachment_07.docx           # Acceptance Testing Phase II
    Schedule_C_-_GS.docx                    # Contract Price
    Schedule_C_Attachment_I.xlsx            # Pricing (Commercial Envelope)
    Schedule_D_-_OPS.docx                   # Safety/SH&E
    Schedule_E_-_IK.docx                    # Disputes/Arbitration
    Schedule_F_-_GS.docx                    # Taxes
    Schedule_H.docx                         # Special Terms
    Schedule_I_Contract_-_GA.docx           # IKTVA
    Schedule_P.docx                         # Sustainability
    Schedule_S_-_OPS.docx                   # Saudization
    Schedule_X_-_GA.docx                    # Cybersecurity
    Signature_Sheet.docx
    Hypothetical_Quantities.xlsx
```

### 6.4 Aramco-Specific Requirement Language

**Unique to Saudi Aramco RFPs (not found in standard commercial contracts):**

| Pattern | Meaning | BOMATIC Action |
|---------|---------|---------------|
| "In-Kingdom" | Work must be performed in KSA | Flag data center location requirements |
| "Company Representative" | Saudi Aramco's designated authority | Track approval dependencies |
| "Contractor Park" | SA-designated accommodation area | Include in mobilization costs |
| "WORK Permit" | GI 2.100 authorization | Flag safety compliance requirement |
| "Cybersecurity Compliance Certificate (CCC)" | SACS-002 audit certificate | Flag 90-day compliance deadline |
| "e-Marketplace" / "ECN" | Saudi Aramco procurement system | Submission channel requirement |
| "Contractor Passport Application" | SA registration system | Registration compliance check |
| "CWQAP" | Workforce Qualification Assurance Program | Personnel qualification requirement |
| "CSAR" | Construction Safety Administrative Requirements | Safety document submission |
| "CSSP" | Contractor Site Safety Program | 15-day submission deadline |
| "HIP" | Hazard Identification Plan | Must be approved before WORK starts |
| "MSAERs" | Mandatory Saudi Aramco Engineering Requirements | Engineering compliance baseline |
| "Sell Outside KSA" | Export classification | Affects WHTax calculation (0%) |
| "TOP500 List" | HPC benchmark ranking | Publication requires SA approval |
| "Uptime Institute" | Data center certification body | Tier certification requirement |

### 6.5 NCA (National Cybersecurity Authority) References

Saudi Aramco RFPs increasingly reference NCA frameworks alongside SACS:

| Framework | Full Name | Controls Referenced |
|-----------|-----------|-------------------|
| NCA ECC | Essential Cybersecurity Controls | 2-14-3-x, 4-2-3-x, 2-2-3 |
| NCA DCC | Data Cybersecurity Controls | 2-6-1-x, 3-1-1-x |
| NCA Cloud | Cloud Cybersecurity Controls | 1-1-T-1, 2-6-T-1-1, etc. |
| NCA CSCC | Critical Systems Cybersecurity Controls | 4-2-1-1 |
| CITC | Communications & IT Commission | Cloud provider registration |

**Detection pattern:**
```regex
\b(NCA)\b\s*(?:ECC|DCC|CSCC|Cloud)?
\b(National\s+Cybersecurity\s+Authority)\b
\b(CITC)\b
\b(Communications\s+(?:and|&)\s+Information\s+Technology\s+Commission)\b
```

### 6.6 NCD / Non-Aramco Patterns (Diriyah Gate)

NCD uses international construction standards rather than Aramco-specific ones:

| Standard Set | Examples |
|-------------|---------|
| CSI Divisions | Div. 27 (Communications), Div. 28 (Electronic Safety & Security) |
| NRM/RICS | Elemental cost breakdown (BOQ structure) |
| KSA MOI | Ministry of Interior security compliance |
| DGDA | Diriyah Gate Development Authority guidelines |
| WSP specs | DG-NCD-408-0000-WSP-SPC-SE-000001 format |

**BOQ structure (NRM-based):**
```
0.00 Facilitating Works
1.00 Substructure
2.00 Superstructure (Frame, Floors, Roof, Stairs, Walls, Windows, Doors)
3.00 Internal Finishes (Wall, Floor, Ceiling)
4.00 Fittings Furnishings and Equipment
5.00 Services (Sanitary, Disposal, Water, HVAC, Electrical, Lifts, Fire, Comms/Security)
6.00 Prefabricated Buildings
7.00 Work to Existing Buildings
8.00 External Works
9.00 Contractor's Adjustments
```
