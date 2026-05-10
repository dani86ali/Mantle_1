# Technical Proposal Template Model

> Reverse-engineered from 8 STCS Technical Proposals across different project types.
> Sources: OP-2024-147007 (HPC), OP-184121 (Smart City), OP-097213 (WAF), OP-166576 (Sandboxing),
> OP-167515 (UCaaS), OP-2024-152435 (Cloud Hosting), OP-2023-121577 (NCD Smart Building),
> OP-2021-33682 (Red Sea Hotel ICT/Security).

---

## 1. Master TP Section Structure

The unified template below merges the heading structures from all 8 TPs into a single canonical outline. Section numbers follow the playbook Section 6.1 mapping where applicable.

```
FRONT MATTER
  Cover Page (customer logo, project title, OP number, version, date, confidentiality)
  Confidentiality Agreement / Nondisclosure
  Contacts Table (Name, Designation, Mobile, Email)
  Table of Contents
  List of Tables
  List of Figures
  Abbreviations / Glossary

BODY
  1. Document Control
     - Document Revision History (Version, Reviewer, Date, Description)

  2. Purpose of this Document

  3. Executive Summary

  4. Our Understanding of the Requirement / Background

  5. Compliance to Evaluation Criteria
     (Table mapping RFP evaluation criteria -> TP section references)

  6. Proposed Solution
     6.1  Solution Overview / End-to-End Architecture
     6.2  Solution Component A (per project type)
          6.2.1  Component Description
          6.2.2  Features & Benefits
          6.2.3  Specifications / Details
          6.2.4  Component Diagram
     6.3  Solution Component B ...
     ...  (Repeat for each major solution component/subsystem)
     6.N  Network Diagram / Architecture Diagram
     6.N+1 IP Address Requirements
     6.N+2 Rack Layout / Floor Plan
     6.N+3 Machine Unit Specifications (MUS)

  7. Scope of Work
     7.1  Deliverables
     7.2  Professional Services
     7.3  Schedule & Staffing
     7.4  Location / Delivery Model

  8. Implementation Approach
     8.1  Delivery Methodology (phases: Plan, Analyze, Design, Build, Test, Deploy)
     8.2  Project Plan / Gantt Summary
     8.3  Project Organisation Chart
     8.4  RACI Matrix
     8.5  Governance, Reporting & Escalation
     8.6  Risk Management & Mitigations

  9. Service Levels & Support
     9.1  SLA Definitions (Severity Categorization)
     9.2  Managed Services Scope of Work
          9.2.1  NOC & Helpdesk
          9.2.2  Incident Management Process
          9.2.3  Problem Management
          9.2.4  Change Management
     9.3  Incident & Escalation Procedures
     9.4  Maintenance Windows
     9.5  Technical Support Requirements / Operating Model
     9.6  Manpower Resources

  10. Information Protection & Security Compliance
      10.1  Access Control & Physical Security
      10.2  Cybersecurity Compliance (SACS / NCA)
      10.3  Data Sanitization

  11. Compliance to Requirements
      (Compliance matrix: Requirement | Compliance Status | Response)

  12. Assumptions & Exclusions
      12.1  Assumptions (General + Project-Specific)
      12.2  Exclusions (General + Project-Specific)
      12.3  Key Dependencies
      12.4  Key Risks
      12.5  Downtime Exclusions

  13. Terms and Conditions

  14. Annexure
      14.1  Bill of Quantity (BOQ)
      14.2  Product Datasheets
      14.3  Project Management and QA Methodology
      14.4  Detailed Network Diagrams / HLD
      14.5  Rack Elevation Diagrams

  15. Company / Solutions Profile
      15.1  About Solutions by stc
      15.2  Services Offered
      15.3  Values
      15.4  Why Solutions by stc
      15.5  Partners
      15.6  Awards & Recognition
      15.7  Certifications
      15.8  Key Clients
      15.9  References / Case Studies

  16. Appendices
      16.1  CVs / Resumes (per partner/consortium member)
      16.2  OEM Partner Profiles
      16.3  Recommended Spares List
      16.4  Subcontracting Intentions
      16.5  Quality Management Plan
      16.6  HSE Plan
      16.7  Remediation Plan
      16.8  Current Workload
      16.9  List of Addendums

BACK MATTER
  Signature Page
```

---

## 2. Section Classification

Each section is classified by how frequently it appears across the 8 TPs analyzed.

### Legend

| Tag | Meaning | Count |
|-----|---------|-------|
| **ALWAYS** | Present in all 8 TPs | 8/8 |
| **COMMON** | Present in 5-7 TPs | 5-7/8 |
| **CONDITIONAL** | Present in 2-4 TPs | 2-4/8 |
| **RARE** | Present in 1 TP only | 1/8 |

### Classification Table

| Section | Classification | Present In | Notes |
|---------|---------------|-----------|-------|
| **Cover Page** | ALWAYS | All 8 | Standard template with logos |
| **Confidentiality Agreement** | ALWAYS | All 8 | Identical boilerplate |
| **Contacts Table** | ALWAYS | All 8 | Same 4-column format |
| **Table of Contents** | ALWAYS | All 8 | Auto-generated |
| **List of Tables** | COMMON | 6/8 | Missing in WAF, Sandboxing |
| **List of Figures** | COMMON | 6/8 | Missing in WAF, Sandboxing |
| **Abbreviations** | COMMON | 5/8 | Missing in NCD, Red Sea, WAED |
| **1. Document Control** | ALWAYS | All 8 | Revision history table |
| **2. Purpose of this Document** | ALWAYS | All 8 | Boilerplate with fill-ins |
| **3. Executive Summary** | ALWAYS | All 8 | Project-specific |
| **4. Understanding of Requirement** | ALWAYS | All 8 | Named variously: "Background", "Our Understanding" |
| **5. Compliance to Eval Criteria** | CONDITIONAL | 3/8 | WAED, NCD, Red Sea (newer TPs) |
| **6. Proposed Solution** | ALWAYS | All 8 | Largest section; varies by project |
| **6.x Solution Architecture Diagram** | ALWAYS | All 8 | At least 1 architecture diagram |
| **6.x Network Diagram** | COMMON | 6/8 | Not in WAF, Sandboxing (appliance projects) |
| **6.x Rack Layout / Floor Plan** | CONDITIONAL | 2/8 | DMM7++, Smart City (DC/facility projects) |
| **6.x IP Address Requirements** | CONDITIONAL | 2/8 | DMM7++, UCaaS |
| **7. Scope of Work** | ALWAYS | All 8 | Structure varies |
| **7.x Deliverables** | COMMON | 7/8 | Missing as explicit section in DMM7++ |
| **7.x Schedule & Staffing** | COMMON | 5/8 | WAF, Sandboxing, UCaaS, Smart City, WAED |
| **8. Implementation / Delivery Methodology** | COMMON | 6/8 | Absent as standalone in WAF, Sandboxing |
| **8.x Project Plan / Gantt** | COMMON | 5/8 | DMM7++, Smart City, UCaaS, NCD, WAED |
| **8.x Project Organisation Chart** | CONDITIONAL | 3/8 | Smart City, DMM7++, WAED |
| **8.x RACI Matrix** | CONDITIONAL | 3/8 | Smart City, WAED, DMM7++ |
| **8.x Governance & Escalation** | CONDITIONAL | 4/8 | Smart City, WAED, DMM7++, UCaaS |
| **8.x Risk Management** | CONDITIONAL | 3/8 | Smart City, WAED, DMM7++ |
| **9. SLA Definitions** | CONDITIONAL | 3/8 | WAED, DMM7++, UCaaS |
| **9.x Managed Services** | COMMON | 5/8 | DMM7++, Smart City, UCaaS, WAED, NCD |
| **9.x Incident/Escalation Process** | COMMON | 6/8 | All except WAF, Sandboxing |
| **9.x Manpower Resources** | COMMON | 5/8 | UCaaS, DMM7++, Smart City, WAED, NCD |
| **10. Security Compliance** | CONDITIONAL | 3/8 | DMM7++, Smart City, NVidia-related |
| **11. Compliance Matrix** | COMMON | 6/8 | Sandboxing, UCaaS, WAED, NCD, Red Sea, Smart City |
| **12. Assumptions** | ALWAYS | All 8 | Boilerplate + project-specific |
| **12. Exclusions** | ALWAYS | All 8 | Boilerplate + project-specific |
| **12.x Key Dependencies** | CONDITIONAL | 2/8 | Smart City, WAED |
| **12.x Key Risks** | CONDITIONAL | 2/8 | Smart City, WAED |
| **12.x Downtime Exclusions** | RARE | 1/8 | DMM7++ only |
| **13. Terms and Conditions** | COMMON | 5/8 | WAF, NCD, WAED, DMM7++, Smart City |
| **14.1 BOQ** | ALWAYS | All 8 | In Annexure or inline |
| **14.2 Product Datasheets** | COMMON | 5/8 | Sandboxing, NCD, Red Sea, DMM7++, Smart City |
| **14.3 PM Methodology** | ALWAYS | All 8 | Boilerplate (table or expanded) |
| **15. Company Profile** | ALWAYS | All 8 | Identical boilerplate |
| **15.x References** | COMMON | 6/8 | Absent in WAF, Sandboxing (older format) |
| **16.x CVs / Resumes** | COMMON | 5/8 | Smart City, DMM7++, UCaaS, WAED, NCD |
| **16.x OEM Partner Profile** | COMMON | 6/8 | HPE, Accenture, Software AG, Zoom, Google, Cisco |
| **16.x Spares List** | RARE | 1/8 | Smart City only |
| **16.x Subcontracting Intentions** | RARE | 1/8 | Smart City only |
| **16.x Quality Management** | CONDITIONAL | 2/8 | Smart City, NCD |
| **16.x HSE Plan** | CONDITIONAL | 2/8 | Smart City, DMM7++ |
| **16.x Remediation Plan** | RARE | 1/8 | Smart City only |
| **16.x Current Workload** | RARE | 1/8 | Smart City only |

### Summary Statistics

| Classification | Count |
|---------------|-------|
| ALWAYS (8/8) | 16 sections |
| COMMON (5-7/8) | 17 sections |
| CONDITIONAL (2-4/8) | 14 sections |
| RARE (1/8) | 5 sections |

---

## 3. Boilerplate Text Blocks

The following text blocks are reused across TPs with minimal or no changes. Content is paraphrased/anonymized.

### 3.1 Confidentiality Agreement (ALWAYS -- all 8 TPs)

**Location:** Front matter, before TOC
**Length:** 4 paragraphs
**Variation:** Customer name is parameterized; all other text is identical.

**Template:**

> This document contains information that is confidential and proprietary to Solutions by stc ("STCS") and {CUSTOMER_NAME}. The information in this document is provided for the sole purpose of allowing {CUSTOMER_NAME} to evaluate the STCS technical proposal for the {PROJECT_NAME} project.
>
> No part of it may be reproduced, stored in a retrieval system, or transmitted in any form or by any means, electronic, mechanical, or otherwise, without the prior written permission of STCS.
>
> STCS reserves the right to vary the contents of this document without prior notice.
>
> This document contains forward-looking statements that involve risk and uncertainties. The proposed solution and associated costs may change during the detailed scoping and design phases.

### 3.2 Purpose of this Document (ALWAYS -- all 8 TPs)

**Location:** After Document Control, before Executive Summary
**Length:** 3-4 paragraphs
**Variation:** Project name, customer name, and solution type are parameterized.

**Template:**

> The purpose of this document is to present the technical solution proposed by Solutions by stc for the {PROJECT_NAME} project for {CUSTOMER_NAME}.
>
> This document describes the proposed solution, scope of work, technical specifications, and components required to deliver the {SOLUTION_TYPE} solution as per the requirements outlined in the RFP/RFQ.
>
> The commercial aspects (pricing) of this proposal are provided in a separate commercial document and are not included in this technical proposal.

### 3.3 Project Management and QA Methodology (ALWAYS -- all 8 TPs)

**Location:** Annexure section or standalone section
**Length:** 1-12 pages (ranges from single table to expanded 12-subsection version)
**Variation:** Two formats exist -- "compact" (table) and "expanded" (with diagrams)

**Compact format (6/8 TPs):** A single table with 12 rows:

| # | Aspect | Description |
|---|--------|-------------|
| 1 | Project Governance | Steering committee structure, decision authority |
| 2 | Scope Management | Requirements baseline, scope change process |
| 3 | Schedule Management | Milestone tracking, Gantt chart updates |
| 4 | Resource Management | Team allocation, skills matrix |
| 5 | Risk and Issue Management | Risk register, mitigation plans |
| 6 | Communication Management | Reporting cadence, stakeholder updates |
| 7 | Stakeholder Management | RACI matrix, engagement plan |
| 8 | Quality Management | QA checkpoints, testing procedures |
| 9 | Change Control Management | Change request process, approval workflow |
| 10 | Document Management | Version control, naming conventions |
| 11 | Vendor Management | OEM coordination, escalation paths |
| 12 | Our Capabilities | Team certifications, relevant experience |

Accompanied by a "Project Lifecycle" figure showing phases: Initiation -> Planning -> Execution -> Monitoring & Control -> Closure.

**Expanded format (2/8 TPs -- WAED, Smart City):** Each of the 12 aspects gets its own H3 subsection with detailed description, diagrams, and process flows.

### 3.4 Company / Solutions Profile (ALWAYS -- all 8 TPs)

**Location:** Final body section before appendices
**Length:** 3-10 pages
**Variation:** Two generations of this boilerplate exist

**Older format (2019-2021 -- WAF, Sandboxing, UCaaS):**

Subsections:
- About STC Solutions (1 paragraph overview)
- Services offered (bulleted list)
- STCS values (4-5 bullet points)
- Why STCS? (differentiators list)
- Partners (partner logos)

**Newer format (2023-2024 -- WAED, NCD, Red Sea, DMM7++, Smart City):**

Subsections:
- About Solutions (expanded overview with history, scale, employee count)
- Solutions Services (categorized service portfolio)
- Solutions Values (mission statement)
- Why Solutions (differentiators with icons)
- Success Partners (partner tier badges and logos)
- Awards & Recognition (award images)
- Excellence Certifications (ISO/CMMI badges)
- Excellence Clients (client logos)
- References (12 case study blocks with project descriptions)

**Standard reference projects (in newer format):**
National Commercial Bank, Saudi Aramco, STC Pay, Al Jomiah Auto Motors, Gulf International Bank, Mediterranean Shipping Company, Jacobs, Al Kifah Holding, Yasref, Al Yusr, Alandalus Property, MISK Foundation.

### 3.5 Assumptions Block (ALWAYS -- all 8 TPs)

**Location:** Dedicated section or subsection under Scope of Work
**Typical items (project-agnostic):**
- Customer will provide timely access to sites and facilities
- Customer will provide necessary network connectivity and IP addresses
- Customer will assign a dedicated project manager / SPOC
- All required approvals and permits will be obtained by the customer
- Working hours are Sunday-Thursday, 8:00 AM - 5:00 PM
- Remote access to systems will be provided for configuration and support
- Customer will provide rack space, power, and cooling for proposed equipment
- Existing infrastructure is in good working condition
- The scope is based on information available at the time of proposal

### 3.6 Exclusions Block (ALWAYS -- all 8 TPs)

**Location:** Dedicated section or subsection under Scope of Work
**Typical items (project-agnostic):**
- Civil works, cabling, and passive infrastructure (unless explicitly stated)
- Third-party software licensing not listed in BOQ
- Data migration from legacy systems
- Integration with systems not specified in the RFP
- Training beyond what is specified in scope
- Regulatory approvals and compliance certifications (customer responsibility)
- Hardware beyond what is listed in the BOQ
- Extended warranty beyond standard OEM terms

### 3.7 Terms and Conditions (COMMON -- 5/8 TPs)

**Location:** Standalone section before Annexure
**Typical clauses:**
1. Language: English
2. Governing law: Laws of Kingdom of Saudi Arabia
3. Working hours: Sunday to Thursday, 08:00 to 17:00
4. Travel and expenses: As per STCS travel policy
5. Change requests: Formal change request process applies
6. Validity: Proposal valid for 90/120 days
7. Intellectual property: As per contract terms
8. Force majeure clause
9. Confidentiality: Per NDA / confidentiality agreement
10. Warranty: Per OEM standard warranty terms
11. Limitation of liability
12. Payment terms: As per commercial proposal
13. Acceptance criteria: Per mutual agreement

### 3.8 Vendor/OEM Product Descriptions (COMMON -- 6/8 TPs)

These are vendor-sourced boilerplate blocks inserted into the Proposed Solution section. They follow a repeating pattern:

**Per product/component:**
1. Product Overview (1-2 paragraphs from datasheet)
2. The [Product] Advantage (3-5 bullet points)
3. [Product] Benefits (bulleted list)
4. [Product] Details / Specifications (table or detailed specs)
5. [Product] Components (model numbers and descriptions)

**Most common vendor boilerplate sources:**
- Cisco (Catalyst 9000, Nexus, ISR 4000, Firepower, ISE, Wireless, DNA Center, BE7000)
- HPE (Cray XD servers, ClusterStor, Slingshot, ProLiant, ARCS cooling)
- Fortinet (FortiWeb, FortiAnalyzer, FortiCare services)
- FireEye/Trellix (NX, EX, AX, CM, SmartVision)
- Zoom (UCaaS platform, Phone, Meetings)
- Edwards/EST (Fire alarm EST4 series)
- Johnson Controls/CEM (Access control AC2000)
- TOA Electronics (Public address VX series)

---

## 4. Project-Type Variations

### 4.1 Section Presence by Project Type

| Section | HPC/DC | Smart City | Cyber (WAF) | Cyber (Sandbox) | UCaaS | Cloud Hosting | Smart Building | Hospitality ICT |
|---------|--------|-----------|-------------|-----------------|-------|--------------|----------------|----------------|
| Consortium Profile (multi-partner) | - | Yes | - | - | - | - | - | - |
| OEM Partner Profile | HPE | Accenture+SAG+Worley | Fortinet | FireEye | Zoom | Google | Cisco | Cisco |
| Solution Architecture Diagram | Yes | Yes | - | - | Yes | Yes | Yes | Yes |
| Network Diagram | Yes | - | - | - | Yes | - | - | Yes |
| Rack Layout / Floor Plan | Yes | - | - | - | - | - | - | - |
| IP Address Requirements | Yes | - | - | - | Yes | - | - | - |
| Use Case Descriptions | - | Yes (5) | - | Yes | - | - | - | - |
| Call Flow Diagrams | - | - | - | - | Yes | - | - | - |
| Compliance Matrix (detailed) | Yes (inline) | Yes | - | Yes (3 tables) | Yes | Yes | - | - |
| SLA Section | Yes | - | - | - | - | Yes | - | - |
| RACI Matrix | Yes | Yes | - | - | - | Yes | - | - |
| Delivery Methodology (multi-phase) | - | Yes (9 phases) | - | - | - | - | - | - |
| EPC / Construction Sections | - | Yes | - | - | - | - | - | - |
| Work Execution Plan | - | Yes | - | - | - | - | - | - |
| Managed Services Operating Model | Yes | Yes | - | - | Yes | Yes | - | - |
| Incident & Escalation | Yes | Yes | - | - | Yes | Yes | Yes | - |
| Manpower Resources | Yes | Yes | - | - | Yes | Yes | Yes | - |
| Performance/Benchmarking | Yes | - | - | - | - | - | - | - |
| Downtime Exclusions | Yes | - | - | - | - | - | - | - |
| Acceptance Testing | Yes | - | - | - | - | - | - | - |
| Fire Alarm System | - | - | - | - | - | - | Yes | - |
| Access Control System | - | - | - | - | - | - | Yes | - |
| Video Surveillance System | - | - | - | - | - | - | Yes | - |
| BMS / Waste / Water Leakage | - | - | - | - | - | - | Yes | - |
| IoT Platform Details | - | Yes | - | - | - | - | - | - |
| Data & Analytics | - | Yes | - | - | - | - | - | - |
| Dashboard Descriptions | - | Yes | - | - | - | - | - | - |
| Unified Communications | - | - | - | - | Yes | - | - | Yes |
| DR Setup Approach | - | - | - | - | - | Yes | - | - |
| Terms & Conditions (vendor-specific) | - | - | Yes (Fortinet T&M) | - | - | - | - | - |
| Quality Management Plan | - | Yes | - | - | - | - | Yes | - |
| HSE Plan | - | Yes | - | - | - | - | - | - |
| Remediation Plan | - | Yes | - | - | - | - | - | - |
| Subcontracting Intentions | - | Yes | - | - | - | - | - | - |
| CVs (Appendix) | Yes | Yes (3 partners) | - | - | Yes | - | - | - |
| Spares List | - | Yes | - | - | - | - | - | - |

### 4.2 Project-Type Specific Patterns

**HPC / Data Center (DMM7++):**
- Heaviest on hardware specifications (GPU nodes, CPU nodes, storage, interconnect fabric)
- Unique sections: Phase 1/Phase 2 Solution, Benchmarking & Acceptance Testing, Downtime Exclusions, Machine Unit Specifications, Rack Elevation diagrams, Floor Plans
- Multiple compliance sections (Phase 1, Phase 2, Manpower separately)
- ~160 pages, highly technical

**Smart City / LSTK (OP-184121):**
- Largest TP (~235 pages) due to multi-partner consortium
- Unique sections: Consortium Profile (4 partners), Use Case Descriptions (5 use cases each with Equipment/Integration/IoT/Analytics/Dashboard/Architecture), EPC Work Execution Plan, Construction sections, Delivery Methodology (9 detailed phases)
- Heavy on project management and governance
- Includes appendices for hardware across multiple use cases

**Cybersecurity -- Appliance Deployment (WAF, Sandboxing):**
- Shortest TPs (~35-55 pages)
- Solution section dominated by OEM product descriptions (vendor boilerplate)
- Scope of Work focused on deployment activities and professional services
- Terms and Conditions may include vendor-specific T&M terms
- Less emphasis on project management, no RACI/governance
- Compliance matrix critical for appliance feature matching

**Network / UCaaS (OP-167515):**
- Mid-size (~30 pages)
- Unique sections: Call Flow Use Cases (3 diagrams), Firewall Requirements, Premise Peering details, Port/Protocol tables
- Implementation plan follows OEM deployment methodology (Zoom's phases)
- Customer deliverables explicitly listed alongside vendor deliverables

**Cloud Hosting (OP-2024-152435):**
- Mid-size (~35 pages)
- Unique sections: DR Setup Approach, DR Server List, Google Cloud managed services scope, 3rd Party Managed Services scope, Maintenance Windows (Regular + Emergency)
- SLA section with severity categorization
- RACI matrix for operational handoff
- Arabic/English bilingual BOQ headers

**Smart Building / Low Current (NCD):**
- Large TP (~65 pages) due to many subsystems
- Solution section covers 14+ subsystems (ICT network, fire alarm, access control, CCTV, intercom, digital signage, PA, video wall, BMS, waste management, water leakage, disabled alarm)
- Each subsystem follows: Controller/Software -> Field Devices pattern
- Assumptions/Exclusions broken down per subsystem
- Heavy on product specifications and model numbers

**Hospitality ICT (Red Sea Hotel):**
- Large TP (~67 pages) dominated by Cisco product descriptions
- Solution section covers: Campus switching (Catalyst 9000), DC switching (Nexus 9000), Routing (ISR 4000), Core/Distribution/Access switch tiers, Unified Comms (BE7000), Firewalls (Firepower), NAC (ISE), Wireless
- Includes dedicated Datasheets section with 18 product links
- Uses Cisco boilerplate extensively (Advantage/Benefits/Details/Components pattern)

---

## 5. Case Study Index

| # | OP Number | Client | Project Scope | Vendors | Vertical | Year | Est. Pages |
|---|-----------|--------|--------------|---------|----------|------|-----------|
| 1 | OP-2024-147007 | Saudi Aramco | Seismic Processing Supercomputer (DMM7++ Expansion) -- 560 GPU nodes, 560 CPU nodes, Parallel FS storage, Remote Computing Facility, 3+3yr lease | HPE (Cray XD, ClusterStor, Slingshot, ProLiant), NetApp, Juniper, Fortinet | Energy / O&G | 2024 | ~159 |
| 2 | OP-184121 | Saudi Aramco | Integrated Smart City Systems -- IoT platform, 5 use cases (Water, Power, Parking, Irrigation, BTU Analytics), EPC construction, LoRaWAN, managed services | Software AG, Accenture, Worley, Cisco, AEC, SIBCA, QudraTech, Actility | Energy / Smart City | 2020 | ~235 |
| 3 | OP-097213 | Saudi Aramco | WAF Device Activation and Health Check Services -- FortiWeb WAF deployment, FortiAnalyzer logging | Fortinet | Energy / Cybersecurity | 2019 | ~55 |
| 4 | OP-166576 | Saudi Aramco | Sandboxing Appliances -- FireEye NX/EX/AX/CM/SmartVision deployment across network, email, file, lateral movement | FireEye (Trellix) | Energy / Cybersecurity | 2020 | ~40 |
| 5 | OP-167515 | Saudi Aramco | UCaaS (Zoom) -- Zoom Meetings, Zoom Phone, Premise Peering with SBC, Cloud hosting via STC | Zoom | Energy / UC&C | 2021 | ~30 |
| 6 | OP-2024-152435 | WAED (Aramco) | Cloud Hosting for WAED -- Google Cloud hosting, DR setup, managed services, 3rd party app management | Google Cloud | Energy / Cloud | 2024 | ~37 |
| 7 | OP-2023-121577 | BINYAH (Diriyah Gate) | NCD P3 Car Park Low Current Systems -- ICT network, fire alarm, access control, CCTV, intercom, digital signage, PA, video wall, BMS, waste mgmt | Cisco, Edwards/EST, CEM/Johnson Controls, Illustra, TOA, LG, Siemens, Sensoneo, RLE | Real Estate / Smart Building | 2023 | ~65 |
| 8 | OP-2021-33682 | Nesma & Partners (Red Sea Dev) | Hotel Security & ICT -- Campus/DC/WAN networking, UC&C, NGFW, NAC, Wireless across hotel property | Cisco (Catalyst, Nexus, ISR, Firepower, ISE, BE7000, Wireless) | Hospitality | 2021 | ~67 |

### Version Numbering Patterns Observed

| Pattern | Examples | Frequency |
|---------|----------|-----------|
| `Ver. X.0` | "Ver. 1.0", "Ver. 2.0" | 4/8 (WAF, Sandboxing, UCaaS, Smart City) |
| `Ver X.0` (no period) | "Ver 1.0", "Ver 3.0" | 2/8 (NCD, WAED) |
| `VX.0` | "V1.0", "V 3.0" | 2/8 (DMM7++, Smart City filename) |
| Filename suffix | `_Ver-3.5-Final`, `_Ver1`, `_Ver-1` | 5/8 |
| Decimal sub-versions | "Ver 3.5" | 1/8 (NCD) |

**Canonical pattern:** `Ver X.Y` where X = major revision (structural changes) and Y = minor revision (content updates). Final versions append "-Final" to filename.

### TP Size by Project Type

| Type | Pages | Words | Tables | Images | Figures |
|------|-------|-------|--------|--------|---------|
| HPC/DC | ~159 | ~48K | 19 | 96 | 48 |
| Smart City | ~235 | ~71K | 63 | 182 | 75 |
| Cybersecurity (WAF) | ~55 | ~10K | 4 | 25 | 4 |
| Cybersecurity (Sandbox) | ~40 | ~9K | 20 | 25 | 6 |
| UCaaS | ~30 | ~8K | 9 | 11 | 6 |
| Cloud Hosting | ~37 | ~9K | 15 | 176 | 1 |
| Smart Building | ~65 | ~20K | 19 | 402 | 16 |
| Hospitality ICT | ~67 | ~20K | 18 | 61 | 12 |

---

## 6. Mapping to Playbook Section 6.1

The playbook defines a 14-section TP structure. Below is how the actual STCS TPs map to it.

| Playbook 6.1 Section | Playbook Description | STCS TP Equivalent | Classification | Notes |
|----------------------|---------------------|-------------------|---------------|-------|
| **0. Cover Page** | Customer logo, project title, version, date, confidentiality | Cover Page + Confidentiality Agreement | ALWAYS | STCS adds standalone Confidentiality Agreement + Contacts table |
| **1. Cover Letter / Introduction** | Introduction | Purpose of this Document | ALWAYS | STCS uses "Purpose of this Document" rather than a cover letter. Some TPs have a Transmittal Letter (Smart City). |
| **2. Executive Summary** | 2 pages, CFO/CIO audience, restates challenges + solution | Executive Summary | ALWAYS | Varies from 1 paragraph (small projects) to 2+ pages (large). Always project-specific. |
| **3. Understanding of Customer Requirements** | Business context, restated requirements | Our Understanding of the Requirement | ALWAYS | STCS names this "Our Understanding of the Requirement" or "Background". Rarely has formal sub-sections for business context vs functional vs non-functional. |
| **4. Proposed Solution** | Overview, architecture, module descriptions, design rationale, compliance pointer | Proposed Solution (Section 6 in most TPs) | ALWAYS | Largest section. Sub-structure varies heavily by project type. Always includes architecture diagram. Compliance pointer is a separate section in newer TPs ("Compliance to Evaluation Criteria"). |
| **5. Technical Specifications** | Hardware list, software/licensing, performance claims | Embedded within Proposed Solution + BOQ (Annexure) | ALWAYS | STCS does not separate this into its own section. Hardware specs are inline in the solution section. BOQ in Annexure serves as the hardware/software list. |
| **6. Implementation Approach** | Methodology, phases, project plan, team, governance, RACI, risks | Delivery Methodology + Project Plan + Project Org Chart + RACI + Risk Management | COMMON | Full implementation sections appear in 6/8 TPs. Cybersecurity appliance TPs (WAF, Sandboxing) have minimal PM coverage. STCS PM Methodology boilerplate covers the standard items. |
| **7. Service Levels & Support** | Vendor support tier, managed services, acceptance criteria | SLA + Managed Services + Support & Escalation + Acceptance Testing | COMMON | SLA sections explicit in 3/8 TPs. Managed services in 5/8. Acceptance testing detailed only in HPC. |
| **8. Commercial Proposal** | Investment summary, detailed BoM, PS breakdown, maintenance schedule, payment terms | **Not in Technical Proposal** | N/A | STCS consistently separates commercial from technical. The TP states: "pricing is provided in a separate commercial document." BOQ in Annexure shows quantities only, no prices. |
| **9. Scope, Assumptions, Exclusions, Dependencies** | Scope boundaries | Assumptions + Exclusions + Key Dependencies + Key Risks | ALWAYS | STCS always has Assumptions and Exclusions. Dependencies and Risks appear in larger projects (Smart City, WAED). |
| **10. Compliance Matrix** | Mandatory for RFPs | Compliance to Requirements / Compliance Matrix | COMMON | Present in 6/8 TPs. Format varies: some are detailed tables (Sandboxing: 61 rows), some are section-reference mappings (WAED: criteria -> section table). |
| **11. References / Case Studies** | Past project references | References (within Solutions Profile) | COMMON | In newer TPs (2023+), 12 standard case studies are embedded in the Solutions Profile section. Older TPs (2019-2021) have a brief "References" subsection. |
| **12. Company Profile** | Certifications, vendor accreditations | Solutions Profile / STCS Profile | ALWAYS | Two generations of boilerplate. Newer version (2023+) includes Awards, Certifications, Clients, and 12 case studies. |
| **13. Appendices** | HLD, LLD, datasheets, CVs, full BoM, rack layouts, network diagrams | Annexure (BOQ + Datasheets + PM Methodology) + Appendices (CVs, Spares, Hardware Lists) | ALWAYS | STCS uses "Annexure" as the primary appendix container. CVs are separate Appendix sections in multi-partner TPs. |
| **14. Signature Page** | Customer acceptance | **Not observed** | RARE | None of the 8 TPs analyzed include a signature page within the TP document itself. Signature pages appear in the commercial/contract documents. |

### Key Gaps Between Playbook and Actual Practice

1. **Commercial content**: Playbook Section 8 (Commercial Proposal) is never in the TP. STCS strictly separates technical and commercial documents.

2. **Compliance to Evaluation Criteria**: Not in the playbook template but appears in newer STCS TPs (2023+) as a standalone section that maps RFP evaluation criteria to TP section numbers. This is a useful navigation aid for evaluators.

3. **Managed Services**: The playbook treats support as a single section (7). STCS TPs often have extensive managed services sections with full operational process descriptions (incident, problem, change management).

4. **Document Control**: Not in the playbook but always present in STCS TPs as Section 1 with revision history.

5. **Confidentiality Agreement**: The playbook mentions a "confidentiality statement" on the cover page. STCS has a full standalone section with legal language.

6. **OEM/Vendor boilerplate**: The playbook doesn't account for the large vendor product description sections that dominate cybersecurity and networking TPs. These can be 50%+ of the document content.

### Recommended BOMATIC TP Generation Order

Based on analysis of which sections are boilerplate vs project-specific:

| Priority | Section | Content Source | BOMATIC Role |
|----------|---------|---------------|-------------|
| 1 | Cover Page | Template | Auto-generate from metadata |
| 2 | Confidentiality Agreement | Boilerplate | Copy with customer name fill-in |
| 3 | Contacts | Template | Fill from CRM/project data |
| 4 | Document Control | Template | Auto-generate with version 1.0 |
| 5 | Purpose | Boilerplate | Fill customer + project type |
| 6 | Company Profile | Boilerplate | Select generation (old/new format) |
| 7 | PM Methodology | Boilerplate | Select format (compact/expanded) |
| 8 | Assumptions | Boilerplate + project | Start with standard items, add project-specific |
| 9 | Exclusions | Boilerplate + project | Start with standard items, add project-specific |
| 10 | Terms & Conditions | Boilerplate | Include if project type warrants it |
| 11 | BOQ structure | Template | Generate from TA/pricing data |
| 12 | Compliance Matrix | Semi-auto | Map RFP requirements to sections |
| 13 | **Executive Summary** | **Human-written** | Draft from project data, requires review |
| 14 | **Understanding of Requirement** | **Human-written** | Summarize RFP, requires domain knowledge |
| 15 | **Proposed Solution** | **Human + vendor** | Architecture from SE, vendor specs from library |
| 16 | **Scope of Work** | **Human-written** | Project-specific deliverables and schedule |
| 17 | **Implementation Plan** | **Semi-auto** | Template phases + project-specific milestones |
| 18 | **SLA / Support** | **Semi-auto** | Standard SLA template + project adjustments |
