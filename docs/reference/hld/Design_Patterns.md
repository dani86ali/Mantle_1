# BOMATIC Design Patterns Library
*Extracted from STCS Technical Proposals, Design Reports, and Draw.io Files*
*Source: 6 TPs + NCD Design Report + 8 Draw.io files | Generated: 2026-05-08*

---

## Section 1: Master Design Section Structure

### 1.1 Unified TP Structure (from 6 TPs)

| # | Section Heading | NCD TP (Cisco) | NVidia SuperPOD | HPE Seismic | UCaaS (Cisco) | Qadeseya (Huawei) | NCD Design Report |
|---|----------------|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | Document Control / Version History | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Background / Project Context | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | Executive Summary | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 4 | Solution Overview / Value Proposition | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Technical Architecture (topology diagram) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | Component / Product Description | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Network Architecture | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | Security Architecture | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | Sub-system Integration | ✓ | — | — | ✓ | ✓ | ✓ |
| 10 | High Availability / Redundancy Design | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 | Implementation / Migration Approach | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | Testing & Acceptance (FAT/SAT/UAT) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 | Project Management (12-aspect) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 14 | Standards & Compliance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | Bill of Materials | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 1.2 Section-Level Detail by TP Type

#### 1.2.1 Low-Current / Smart Building TP Structure (NCD TP, Qadeseya Club)
```
1. Document Control
2. Background
   2.1 Client Overview
   2.2 Project Scope
   2.3 Site Description
3. Executive Summary
4. Solution Overview
   4.1 Design Philosophy
   4.2 Technology Selection Rationale
5. ICT Network Architecture
   5.1 Network Topology (collapsed core / 2-tier)
   5.2 Switching Infrastructure
   5.3 Wireless Infrastructure (Wi-Fi 6/7)
   5.4 Network Security (NGFW, ISE, TrustSec)
   5.5 Network Management (DNA Center / iMaster NCE)
6. Security Systems Architecture
   6.1 CCTV (IP Cameras, VMS, Control Room)
   6.2 Access Control (ACS, Readers, Controllers)
   6.3 Public Address System
   6.4 BMS Integration (BACnet/IP)
   6.5 Disabled Alarm / Emergency Systems
7. Sub-system Integration
   7.1 PSIM Integration
   7.2 BACnet/OSDP Protocol Bridges
8. High Availability & Redundancy
9. Cable Plant & Physical Infrastructure (TIA-568, SBC)
10. Implementation Methodology
    10.1 Greenfield Deployment Sequence
    10.2 Phased Zone Cutover
11. Testing (FAT → SAT → UAT)
12. Project Management (12-aspect STCS template)
13. Standards Compliance Matrix
14. Bill of Materials
```

#### 1.2.2 HPC / AI Cluster TP Structure (NVidia SuperPOD, HPE Seismic)
```
1. Document Control
2. Background
   2.1 Client Technical Requirements
   2.2 Reference Architecture Selection
3. Executive Summary
4. Compute Architecture
   4.1 GPU/CPU Node Specifications
   4.2 Compute Topology (fat-tree / dragonfly)
   4.3 Interconnect Technology (InfiniBand / Slingshot)
5. Storage Architecture
   5.1 Parallel File System (BeeGFS / GPFS / Lustre)
   5.2 Storage Hardware (NetApp EF600 / ClusterStor)
   5.3 Storage Network (InfiniBand HDR / Ethernet)
6. Network Architecture
   6.1 In-Band Management Network
   6.2 Out-of-Band Management Network
   6.3 External Connectivity (DWDM / WAN)
7. Security Architecture
   7.1 Physical Security (cage, card access)
   7.2 Network Segmentation
   7.3 Cybersecurity (NCA, NIST, encryption)
8. Data Center Integration
   8.1 Power (N+N, PDU specifications)
   8.2 Cooling (air / liquid immersion)
   8.3 DC Rating (Tier III / Uptime Institute)
9. Software Stack
   9.1 OS / Workload Manager
   9.2 Monitoring & Management
10. Phase Plan (Phase 1 → Phase 2 expansion)
11. Factory Acceptance Testing (FAT)
12. Project Management (12-aspect STCS template)
13. Bill of Materials
```

#### 1.2.3 UCaaS / Collaboration TP Structure (Cisco HCS)
```
1. Document Control
2. Background
3. Executive Summary
4. Cisco HCS (Hosted Collaboration Solution) Overview
   4.1 Architecture Model (hybrid on-prem + cloud)
   4.2 Cisco Webex Platform
   4.3 Call Control (UCM — Unified Communications Manager)
   4.4 SIP Trunk Integration
5. Technical Architecture
   5.1 Preferred Architecture for Cisco Webex Hybrid Services
   5.2 Cisco HCS Architecture Detail
   5.3 IP Telephony Call Control
   5.4 Webex Core Services
   5.5 Webex Hybrid Directory Service
   5.6 Webex Hybrid Call Service
   5.7 Webex Hybrid Calendar
6. Security (SACS-003 CCA 29-control compliance)
7. Implementation Approach
8. Testing & Acceptance
9. Project Management
10. Bill of Materials
```

### 1.3 STCS 12-Aspect Project Management Template
*Used identically across all 6 TPs — universal STCS methodology:*

| # | Aspect | Contents |
|---|--------|---------|
| 1 | Project Governance | Roles, responsibilities, org chart, escalation path |
| 2 | Scope Management | Scope statement, in/out-of-scope, deliverables |
| 3 | Schedule / WBS / RACI | Gantt chart, work breakdown structure, RACI matrix |
| 4 | Resource Management | Team allocation, skills matrix, subcontractor list |
| 5 | Risk Management | Risk register (probability × impact matrix) |
| 6 | Communication Management | Meeting cadence, reporting format, stakeholder comms |
| 7 | Stakeholder Management | Stakeholder register, engagement strategy |
| 8 | Quality Management | Quality plan, audit schedule, KPIs |
| 9 | Issue Management | Issue log, resolution SLA |
| 10 | Change Control | Change request form, approval authority levels |
| 11 | Document Management | Document register, naming convention, version control |
| 12 | Vendor Management | Vendor matrix, SLAs, escrow, OEM engagement model |

---

## Section 2: Topology Pattern Library

### Pattern 1: 2-Tier Collapsed Core (Campus LAN — Small/Medium)

**When to use:** Single-building or campus up to ~1,000 ports; budget-constrained; latency-sensitive (no extra hop); greenfield SME/commercial/club/sports facility.

**Structure:**
```
[Internet / WAN]
       |
  [Firewall / NGFW]
       |
  [Core Switches] ← HA pair (stacked or VSS/VSX)
       |
  [Access Switches] ← PoE, per-floor/zone
       |
  [End Devices] ← PCs, Phones, APs, Cameras, IoT
```

**Observed implementations:**
| TP | Core | Access | Firewall | Wi-Fi |
|----|------|--------|---------|-------|
| NCD TP (Cisco) | Cisco C9500 HA pair | C9300 PoE stacks | FPR3100-FTD HA | C9124AXI-ROW + C9800-L |
| Qadeseya Club (Huawei) | Huawei S6730 HA pair | S5735 PoE | USG6555F NGFW | AirEngine 6776-57T (Wi-Fi 7) |

**Design principles applied:**
- Cisco: SD-Access fabric, TrustSec SGT, ISE NAC, DNA Center management
- Huawei: iMaster NCE, eSight; campus fabric (CLI-based in older designs)
- Both: IEEE 802.1X port authentication, VLAN segmentation (ICT + Security separate VLANs)
- MACsec-256 encryption on uplinks (NCD TP, Cisco)
- Separate ICT network (internet-connected) and Security network (airgapped CCTV/ACS)

**Key design decisions:**
- No distribution layer → all uplinks go directly to core pair
- Core pair carries both L2 (VLAN trunks) and L3 (inter-VLAN routing, VRFs)
- Redundant uplinks from each access stack to both core nodes (ECMP/LAG)

---

### Pattern 2: 3-Tier Core-Distribution-Access (Campus LAN — Large)

**When to use:** Multi-building campus, hotel/resort, large commercial complex, >1,000 ports, multiple IDF rooms per floor.

**Structure:**
```
[Internet / WAN / MPLS]
         |
   [Core Layer] ← modular chassis, L3, routing
         |
[Distribution Layer] ← per-building or per-zone, L2/L3 boundary
         |
  [Access Layer (IDF)] ← per-floor IDF rooms, PoE stacks
         |
   [End Devices]
```

**Observed implementations:**
| Site | Core | Distribution | Access | Notes |
|------|------|-------------|--------|-------|
| NCD Design Report (Buro Happold) | Cisco C9500 pair (Core) + C9500 pair (Server Farm) | Implicit distribution layer | C9300 PoE stacks per IDF | 7 IDFs per basement level |
| Ummahat Alshaykh Hotel H11 (drawio) | Cisco Nexus 9K pair | C9606R (FTB-1 zone) + C9500 (FTB-2 zone) | C9200L per building | Separate ICT + CCTV networks |

**IDF room design (NCD Design Report standard):**
- Each IDF room: 2 × 42U cabinets (1× IT cabinet + 1× Security cabinet)
- IT cabinet: C9300 PoE stack (6–8U), patch panels, UPS, KVM
- Security cabinet: Dedicated switch for CCTV/ACS (airgapped VLAN)
- Dual uplinks per IDF to distribution (active/standby or LACP)

**Dual-network pattern (NCD Design Report):**
```
IT Network (internet-connected):
  Core (C9500) → Distribution → IDF C9300 → PCs, Phones, APs
  ↕ NGFW
  Internet / WAN

Security Network (airgapped):
  Core (C9500) → Distribution → IDF Security Switch → Cameras, ACS Readers, BMS
  [No uplink to internet — physical separation or strict VLAN isolation]
```

---

### Pattern 3: HPC Spine-Leaf / Fat-Tree (Data Center — AI/HPC)

**When to use:** AI training clusters, GPU compute farms, high-performance computing, parallel workloads requiring low-latency non-blocking interconnect.

#### Pattern 3a: NVIDIA InfiniBand Fat-Tree (SuperPOD)

**Structure:**
```
4 separate fabrics:
┌─────────────────────────────────────────────┐
│  Fabric 1: Compute InfiniBand (NDR 400Gbps) │
│  Rail-optimized fat-tree                    │
│  GPU↔GPU: 400Gbps non-blocking              │
├─────────────────────────────────────────────┤
│  Fabric 2: Storage InfiniBand (HDR 200Gbps) │
│  GPU Nodes ↔ NetApp EF600 + BeeGFS servers  │
├─────────────────────────────────────────────┤
│  Fabric 3: In-Band Ethernet (25GbE/100GbE)  │
│  Management traffic, cluster services       │
├─────────────────────────────────────────────┤
│  Fabric 4: Out-of-Band Ethernet (1GbE)      │
│  BMC/iDRAC IPMI, console, KVM-over-IP       │
└─────────────────────────────────────────────┘
```

**NVIDIA SuperPOD reference numbers:**
- DGX H100 nodes per SuperPOD: defined by reference architecture
- Quantum-2 NDR switches (800Gbps switching capacity)
- Storage: 12× NetApp EF600 + SR665 V3 BeeGFS servers, each with 48× NDR200 ports
- DC hosting: STC Center3 (Tier III, Uptime Institute certified)
- Power: N+N (2×(N+1)) redundancy

#### Pattern 3b: HPE Slingshot Dragonfly (Seismic HPC)

**Dragonfly Topology Class Sizing:**
| Class | Switches/Group | Max Groups | Max Endpoints | Use Case |
|-------|---------------|------------|--------------|---------|
| Class 0 | 1 | — | 64 | Single switch |
| Class 1 | 2 | up to 25 | 800 | Small cluster |
| Class 2 | 4 | up to 49 | 3,136 | Phase 2 (HPE/Aramco) |
| Class 3 | 8 | up to 81 | 10,368 | Phase 1 (HPE/Aramco) |
| Class 4 | 16 | up to 169 | 43,264 | Large national HPC |
| Class 5 | 32 | up to 289 | 131,584 | Tier-1 national facility |

**Phase 1 (Aramco Seismic):** Class 3, HPE Slingshot-11 (200Gbps)
**Phase 2 (Aramco Seismic):** Class 2, HPE Slingshot-400 (400Gbps)

**5 IP Zones (HPE HPC design):**
| Zone | Name | Description |
|------|------|-------------|
| CAN | Customer Access Network | External access |
| HMN | Hardware Management Network | OOB BMC/iLO |
| NMN | Node Management Network | In-band OS management |
| LMN | Low-speed Management Network | Storage management |
| HSN | High-Speed Network | MPI/compute (Slingshot) |

---

### Pattern 4: Hub-and-Spoke (WAN / GPON Residential)

**When to use:** WAN connectivity from HQ to branches; hospitality/hotel fiber-to-room (GPON); centralized service delivery to distributed endpoints.

#### Pattern 4a: GPON Hospitality (Ummahat Alshaykh H11)
```
[Cisco 10700 OLT]
        |
[HPE Aruba CX 6405 Core Switch]
        |
[HPE Aruba 2530 / 6200F Aggregation]
        |
[1:32 Optical Splitter] (per floor/wing)
        |
[ONT] ← per room type:
  - Standard Room ONT
  - Junior Suite ONT
  - Suite ONT (higher bandwidth)
  - Villa ONT
```

**Key design note:** GPON is passive (no power on fiber run to room); ONT provides Ethernet + Wi-Fi to room.

#### Pattern 4b: SD-WAN Hub-and-Spoke
*Pattern not explicitly extracted from TPs reviewed; common in STCS enterprise WAN projects*
```
[HQ — SD-WAN Hub]
     ↙    ↓    ↘
[Branch A] [Branch B] [Branch C]
(MPLS / Internet / 4G/5G underlay)
```

---

### Pattern 5: OT/IT Segmented Architecture (Industrial / Oil & Gas)

**When to use:** Sites with operational technology (SCADA, DCS, PLC, OPC servers) that must be isolated from corporate IT while allowing controlled data exchange.

**Structure (from OGF Drilling drawio):**
```
[VSAT / WAN Cloud]
         |
   [IT DMZ Zone] ← blue zone
     |         |
[Lucior Platform] [IT Servers/Laptops]
[Allied Telesis L3]
         |
    [EDGE Node] ← bridging device / data diode / unidirectional gateway
         |
   [OT/OPC Zone] ← yellow zone (airgapped from internet)
     |         |
[OPC Server] [CCTV Controller]
[Allied Telesis L2]
[PLC / RTU / Sensors]
[IOT Devices]
```

**Security principles:**
- OT zone: no internet connectivity, no IP routing to IT
- EDGE node: unidirectional data flow (OT → IT only); or firewall with strict whitelist
- VLAN separation at L2; separate physical switches where budget allows
- Industrial protocols in OT zone: OPC-UA, Modbus, DNP3
- IT zone: standard Ethernet/IP, HTTPS, SYSLOG to SIEM

---

## Section 3: Security Zone Templates

### 3.1 Standard Enterprise Security Zones

| Zone Name | Trust Level | Connected To | Traffic Allowed |
|-----------|------------|-------------|-----------------|
| **Internet/Untrusted** | 0 (none) | ISP, WAN | Inbound denied by default |
| **DMZ** | 1 (low) | Internet + Internal | Inbound on specific ports (80/443/25) |
| **Guest / BYOD** | 2 (limited) | Internet only | HTTP/HTTPS outbound only; isolated from internal |
| **Employee (Corporate)** | 3 (medium) | Internal LAN | Standard corporate applications |
| **Server Farm** | 4 (high) | Internal only | Restricted inbound from corporate only |
| **Management / OOB** | 5 (highest) | Admin workstations only | SSH/HTTPS to all devices; no user traffic |
| **Secure/Airgapped** | Isolated | Physical separation | No cross-zone routing at all |

### 3.2 Cisco TrustSec / SD-Access Zone Model (NCD TP)

```
ISE Policy Engine
       |
[SGT Tag Assignment at ingress]
       |
  ┌────────────────────────────┐
  │  TrustSec Domain           │
  │  ┌──────────────────────┐  │
  │  │ Employee SGT (tag 10) │  │ → Allow: Corp Servers, Internet
  │  ├──────────────────────┤  │
  │  │ IoT/BMS SGT (tag 20) │  │ → Allow: BMS Controller only
  │  ├──────────────────────┤  │
  │  │ CCTV SGT (tag 30)    │  │ → Allow: VMS Server only (airgapped VLAN)
  │  ├──────────────────────┤  │
  │  │ Guest SGT (tag 40)   │  │ → Allow: Internet only
  │  ├──────────────────────┤  │
  │  │ ACS SGT (tag 50)     │  │ → Allow: ACS Server only
  │  └──────────────────────┘  │
  └────────────────────────────┘

SGT Policy Matrix (SGACL):
  Employee → Corp Servers: PERMIT
  Employee → Internet: PERMIT
  IoT → Corp Servers: DENY
  CCTV → Internet: DENY
  Guest → Corp Servers: DENY
```

### 3.3 Huawei NGFW Zone Model (Qadeseya Club)

```
USG6555F Security Zones:
  untrust (WAN/Internet)
  dmz (public-facing servers: web portal, guest portal)
  trust (LAN: employee, management)
  local (firewall management interface itself)

Zone pairs with policies:
  untrust → dmz: PERMIT HTTP/HTTPS (destination NAT)
  untrust → trust: DENY all
  trust → untrust: PERMIT (source NAT)
  trust → dmz: PERMIT specific ports
  local → all: PERMIT (management)
```

### 3.4 Dual-Network (IT + Security Airgapped) Pattern

*Source: NCD Design Report (Buro Happold) — most detailed implementation found*

```
Physical Layer:
  IT Network cabling: Blue Cat6A
  Security Network cabling: Red Cat6A
  (Same conduit runs, different patch panel rows)

Logical Layer:
  IT Network:
    VLANs: Employee (10), Voice (20), Guest (30), Management (99)
    Uplink to NGFW → Internet
    DNS/DHCP via Windows Server
    
  Security Network:
    VLANs: CCTV (100), ACS (110), BMS (120), PA (130), Alarm (140)
    NO uplink to IT network or internet
    Dedicated CCTV NVR servers, VMS, ACS server — all airgapped
    Management only via dedicated admin workstations in Security NOC

IDF Room Implementation:
  42U IT Cabinet: C9300 stack, IT patch panels, fiber uplink (blue)
  42U Security Cabinet: Security switch, security patch panels, fiber uplink (red)
  Cabinets may be co-located in same IDF room but on separate cable trays
```

### 3.5 OT/IT Security Boundary (Industrial)

*Source: OGF Drilling drawio*

**Unidirectional Gateway (Data Diode) Model:**
```
OT Zone (Yellow) → [Hardware Data Diode] → IT DMZ (Blue)
  PLC data / OPC-UA → IT analytics platform
  
Allowed: OT operational data → IT only (one-way)
Blocked: Any IT traffic → OT zone (physical impossibility with diode)
```

**Controlled Firewall Model (alternative):**
```
OT Zone ← [Industrial Firewall] → IT DMZ
  Whitelist-only rules:
  - OPC-UA TCP/4840 from OPC server → IT historian
  - ICMP echo from monitoring server → OT switches
  Implicit deny all others
  
Log all cross-zone sessions to SIEM
```

### 3.6 MOI CCTV Pixel Density Compliance (Saudi Arabia)

*Source: NCD Design Report (Buro Happold)*

| Coverage Level | PPF (Pixels per Foot) | Use Case |
|---------------|----------------------|---------|
| Identification | ≥120 PPF | Entry/exit doors, cashiers, critical chokepoints |
| Recognition | ≥50 PPF | Corridors, lobby, escalators |
| Observation | ≥20 PPF | Open areas, parking lots, perimeter |

**PSIM Control Room Standard (NCD):**
- Videowall configuration: 6×5 matrix (2-row × 3-column per section)
- Resolution: 4K displays recommended
- NVR redundancy: Active-standby pair (Stratus everRun HA)
- Standards: BS 7958 (CCTV operations), BS 8418 (remote monitoring)

---

## Section 4: Migration Approach Templates

### 4.1 Greenfield Deployment (NCD TP Model)

**Use when:** New building, no existing infrastructure, full clean-slate installation.

```
Phase 0 — Pre-Installation:
  ├─ Structured cabling installation (Cat6A + OM4/OS2 fiber)
  ├─ IDF room fit-out (cabinets, power, cooling, labeling)
  ├─ Equipment delivery and staging at STC warehouse
  └─ Factory configuration (templates loaded offline)

Phase 1 — Core Infrastructure:
  ├─ Core switch installation and configuration
  ├─ Firewall installation and base policy
  ├─ WAN/ISP circuit termination
  ├─ Management network (OOB + in-band)
  └─ Network management platform (DNA Center / iMaster NCE)

Phase 2 — Distribution and Access:
  ├─ IDF switch installation (zone by zone)
  ├─ Uplink commissioning
  ├─ VLAN and spanning-tree configuration
  └─ PoE validation

Phase 3 — Services and Sub-systems:
  ├─ CCTV camera installation and VMS commissioning
  ├─ ACS reader installation and controller programming
  ├─ Wi-Fi AP installation and RF optimization
  ├─ IP telephony (endpoints, call flows)
  └─ BMS gateway integration (BACnet/IP)

Phase 4 — Testing:
  ├─ FAT (Factory Acceptance Test) — vendor-side, pre-shipment
  ├─ SAT (Site Acceptance Test) — on-site, post-installation
  └─ UAT (User Acceptance Test) — client sign-off, live usage

Phase 5 — Handover:
  ├─ As-built documentation
  ├─ Knowledge transfer and training
  ├─ O&M manuals
  └─ Warranty and support contract activation
```

### 4.2 Phased HPC Expansion (HPE/Aramco Model)

**Use when:** Large-scale compute deployment with budget or DC capacity constraints requiring multi-year build-out.

```
Phase 1 — Foundation:
  ├─ New data center build (Dhahran Techno Valley DC)
  ├─ Core Slingshot fabric Class 3 (8-switch groups)
  ├─ Compute: 560× GPU nodes (XD665, AMD MI250X) + 560× CPU nodes (XD225v)
  ├─ Storage: 100PB ClusterStor E1000
  ├─ Performance: 145 PFlops (FP64)
  ├─ FAT Phase I (benchmark acceptance: HPL, STREAM, MPI_Allreduce)
  └─ Go-live cutover from legacy Dammam-3 facility

Phase 2 — Expansion (concurrent with Dammam-7 dismantlement):
  ├─ Dragonfly topology upgrade: Class 3 → Class 2 (Slingshot-400 400Gbps)
  ├─ Compute: +170× GPU nodes (XD675/MI300X or XD680/B100)
  ├─ Storage: Replace E1000 → E2000 (ClusterStor next-gen)
  ├─ Performance: +55 PFlops → total ~200 PFlops
  ├─ FAT Phase II (incremental: only new nodes tested)
  └─ Parallel run period: Phase 1 live while Phase 2 commissioned

Rollback capability:
  Phase 1 fully independent — if Phase 2 fails, Phase 1 remains operational
  Data: ONTAP SnapMirror replication between E1000 and E2000 during migration
```

### 4.3 Cutover Migration (Hosting / Cloud Migration)

*Pattern derived from WAED hosting project (197-Q&A)*

**Use when:** On-premises workloads migrating to managed hosting (IaaS/PaaS).

```
Discovery Phase:
  ├─ Application inventory (17 VMs cataloged: OS, RAM, vCPU, disk)
  ├─ Dependency mapping (AD → Exchange → ADFS → web apps)
  ├─ RTO/RPO definition per workload tier:
  │   Tier 1 (Critical): RTO 8h / RPO 12h — Exchange, AD, Firewall
  │   Tier 2 (Important): RTO 12h / RPO 42h — Web apps
  └─ Compliance scope (NCA ECC, NIST CSF, Data residency KSA)

Pre-Migration:
  ├─ Parallel environment build on target (STC IaaS)
  ├─ Network: VPN tunnel between old site and new IaaS
  ├─ DNS: TTL reduction (300s → 60s) 72h before cutover
  ├─ Certificate pre-staging
  └─ Backup validation (Veeam jobs verified restorable)

Migration Sequence (dependency order):
  1. Hypervisor + Storage foundation (KVM → STC-managed hypervisor)
  2. Active Directory (DC1 → replicate to new DC in IaaS)
  3. Firewall (pfSense → STC managed FW: Fortinet/Palo Alto preferred)
  4. ADFS (replicated AD prerequisite)
  5. Exchange 2019 (AD + DNS prerequisite); 115 mailboxes
  6. Web applications (last — depend on all above)
  7. Cloudflare WAF DNS records updated → point to new IaaS IPs

Cutover Window:
  ├─ Scheduled: Thursday night 22:00 → Friday 06:00 (minimal business impact)
  ├─ Parallel run: 48–72h with old system still running
  ├─ Rollback trigger: Any P1 issue within 24h restores DNS to old site
  └─ Formal sign-off: Client IT + STCS PM + STC IaaS team

Post-Migration:
  ├─ Old infrastructure decommission (30-day hold after sign-off)
  ├─ DR testing (restore from backup in test IaaS tenant)
  └─ Monitoring handover (Tenable VA → monthly scan SLA)
```

### 4.4 Testing Phase Templates

| Phase | Acronym | Who Conducts | Location | Pass/Fail Criteria |
|-------|---------|-------------|---------|-------------------|
| Factory Acceptance Test | FAT | Vendor + STCS witness | Vendor lab / STC warehouse | BoM completeness, firmware, basic function |
| Site Acceptance Test | SAT | STCS + Client | Project site | Installation quality, all ports up, protocols configured |
| User Acceptance Test | UAT | Client operations team | Project site | Business functions work end-to-end |
| Benchmark Acceptance | BAT | STCS + Client + Vendor | HPC site (HPC only) | HPL ≥ 90% theoretical, STREAM, MPI latency thresholds |
| Penetration Test | PenTest | Third-party (client-mandated) | Remote + on-site | No critical/high findings unresolved |

---

## Section 5: Draw.io Diagram Patterns

### 5.1 File Structure Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z"
        agent="Mozilla/5.0" version="24.8.4" type="device">
  <diagram name="Page-1" id="PAGE_UUID_HERE">
    <mxGraphModel dx="2876" dy="1114" grid="1" gridSize="10" guides="1"
                  tooltips="1" connect="1" arrows="1" fold="1" page="1"
                  pageScale="1" pageWidth="1654" pageHeight="1169"
                  math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- All nodes and edges are children of cell id="1" -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 5.2 Node Patterns

#### Network Device Node
```xml
<!-- Generic network device with label -->
<mxCell id="node-1" value="Core Switch&#xa;C9500-48Y4C"
        style="shape=mxgraph.cisco.switches.workgroup_switch;
               sketch=0;html=1;pointerEvents=1;dashed=0;
               fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;
               verticalLabelPosition=bottom;verticalAlign=top;
               align=center;outlineConnect=0;"
        vertex="1" parent="1">
  <mxGeometry x="400" y="200" width="50" height="50" as="geometry" />
</mxCell>
```

#### Zone Container (colored rectangle)
```xml
<!-- Security zone container — blue = IT/trusted -->
<mxCell id="zone-it" value="IT Zone" 
        style="swimlane;startSize=30;fillColor=#dae8fc;strokeColor=#6c8ebf;
               fontStyle=1;fontSize=14;align=left;verticalAlign=top;
               whiteSpace=wrap;html=1;"
        vertex="1" parent="1">
  <mxGeometry x="60" y="60" width="500" height="400" as="geometry" />
</mxCell>

<!-- OT zone container — yellow = industrial/OT -->
<mxCell id="zone-ot" value="OT Zone (Airgapped)" 
        style="swimlane;startSize=30;fillColor=#fffacd;strokeColor=#d6b656;
               fontStyle=1;fontSize=14;align=left;verticalAlign=top;"
        vertex="1" parent="1">
  <mxGeometry x="600" y="60" width="500" height="400" as="geometry" />
</mxCell>
```

#### Rack Cabinet Container
```xml
<!-- 42U rack cabinet with rack layout -->
<mxCell id="rack-1" value="IDF-B1-01&#xa;42U Cabinet"
        style="shape=mxgraph.rackGeneral.rackCabinet3;
               whiteSpace=wrap;container=1;childLayout=rack;
               rackLayout=1;rackUnits=42;unitSize=15;unitFirstCharacter=1;
               currentUnit=0;unitPrefix=U;mountableUnitSize=30;
               fillColor=#dae8fc;strokeColor=#6c8ebf;"
        vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="200" height="645" as="geometry" />
</mxCell>

<!-- Device inside rack (rack-mountable) -->
<mxCell id="sw-rack-1" value="C9300-48P"
        style="shape=mxgraph.rack.cisco.cisco_catalyst_9300_48p;
               html=1;dashed=0;outline=0;"
        vertex="1" parent="rack-1">
  <mxGeometry x="0" y="0" width="200" height="30" as="geometry" />
</mxCell>
```

#### Standard Edge (Link)
```xml
<!-- Backbone link — red, thick -->
<mxCell id="edge-backbone" value="25G" 
        style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;
               jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;
               entryX=0.5;entryY=0;entryDx=0;entryDy=0;
               strokeColor=#CC0000;strokeWidth=3;"
        edge="1" parent="1" source="core-sw-1" target="dist-sw-1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>

<!-- Distribution link — green, medium -->
<mxCell id="edge-dist" value="1G"
        style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;
               jettySize=auto;html=1;strokeColor=#009900;strokeWidth=3;"
        edge="1" parent="1" source="dist-sw-1" target="access-sw-1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>

<!-- Access link — black, thin -->
<mxCell id="edge-access" value=""
        style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;
               jettySize=auto;html=1;strokeColor=#000000;strokeWidth=2;"
        edge="1" parent="1" source="access-sw-1" target="endpoint-1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

### 5.3 Shape Library Reference

| Vendor | Shape Namespace | Example Shape ID |
|--------|----------------|-----------------|
| Cisco (icons) | `mxgraph.cisco.*` | `mxgraph.cisco.switches.workgroup_switch` |
| Cisco (rack) | `mxgraph.rack.cisco.*` | `mxgraph.rack.cisco.cisco_catalyst_9300_48p` |
| HPE Aruba | `mxgraph.rack.hpe_aruba.*` | `mxgraph.rack.hpe_aruba.switches.r0x26a_aruba_cx_6405_switch_rear` |
| Generic rack | `mxgraph.rackGeneral.*` | `mxgraph.rackGeneral.rackCabinet3` |
| Cisco UCaaS | `mxgraph.office.communications.*` | `mxgraph.office.communications.voip_gateway` |
| Cloud icons | `mxgraph.azure.*` / `mxgraph.gcp2.*` | `mxgraph.gcp2.compute_engine` |
| Generic network | `shape=image;image=img/lib/...` | Custom PNG icon embed |

### 5.4 Color Convention Standard

| Color | Hex | Usage |
|-------|-----|-------|
| Red (backbone) | `#CC0000` | Core/backbone links ≥25G |
| Green (distribution) | `#009900` | Distribution uplinks 1G |
| Black (access) | `#000000` | Standard access layer |
| Blue (wireless) | `#66B2FF` | Wi-Fi AP connections |
| Red (SIP) | `#FF0000` | SIP trunk (UCaaS) |
| Blue fill (IT zone) | `#dae8fc` | IT/trusted zone background |
| Yellow fill (OT zone) | `#fffacd` | OT/industrial zone background |
| Orange fill (CCTV zone) | `#ffe6cc` | CCTV/Security zone background |
| Green fill (DMZ) | `#d5e8d4` | DMZ zone background |

### 5.5 Diagram Type Templates

#### Type 1: Logical Network Topology
- Zones as colored swimlane containers
- Network icons (Cisco shapes or PNG)
- Orthogonal edge routing
- Link labels showing speed (25G, 10G, 1G)
- Protocol labels on edges (BGP, OSPF, VXLAN)
- No physical layout — logical grouping by zone/function

#### Type 2: Physical Rack Elevation
- `mxgraph.rackGeneral.rackCabinet3` container
- `childLayout=rack` with `rackUnits=42`
- Rack-mountable vendor shapes in children
- U-position explicit in geometry Y values
- Patch panel shapes at top
- UPS shapes at bottom

#### Type 3: Hotel / Campus Physical Topology
- Building outlines as rectangles (light gray fill)
- Floor labels
- IDF room markers
- Physical cable runs (straight or orthogonal)
- Separate layers: ICT layer + Security layer (different diagram pages or separate colors)

#### Type 4: OT/IT Zone Diagram
- Two side-by-side zone containers (yellow OT + blue IT)
- EDGE node or firewall between zones (centered, straddling boundary)
- Explicit protocol annotations on cross-zone links
- Cloud/WAN oval at top

### 5.6 Decoding Compressed Draw.io Files

Older draw.io files (pre-v21) compress the XML inside `<diagram>` tags:

```python
import base64, zlib, urllib.parse

def decode_drawio(compressed_b64: str) -> str:
    """Decode compressed draw.io diagram content."""
    binary = base64.b64decode(compressed_b64)
    decompressed = zlib.decompress(binary, -15)  # -15 = raw deflate
    return urllib.parse.unquote(decompressed.decode('utf-8'))

def encode_drawio(xml_string: str) -> str:
    """Encode XML for use in draw.io diagram tag."""
    quoted = urllib.parse.quote(xml_string)
    compressed = zlib.compress(quoted.encode('utf-8'))[2:-4]  # strip zlib header/checksum
    return base64.b64encode(compressed).decode('utf-8')
```

*New draw.io files (v24+) store uncompressed XML directly — just parse the `<mxGraphModel>` XML inside the `<diagram>` tag.*

---

## Section 6: Design Methodology Decision Tree

### 6.1 Primary Methodology: PPDIOO (Cisco) vs STCS Adapted

| Phase | PPDIOO (Cisco) | STCS Adapted Equivalent |
|-------|---------------|------------------------|
| **P**repare | Business requirements, ROI | RFI/Discovery (Section 2.4 A-F) |
| **P**lan | Project plan, site assessment | PM plan (12-aspect template) |
| **D**esign | HLD → LLD, BoM | TP sections 4–9 |
| **I**mplement | Installation, configuration | Phase 1/2/3 deployment |
| **O**perate | Day-2 operations, monitoring | NOC/SOC SLA, NMS |
| **O**ptimize | Performance tuning, capacity planning | Quarterly review, expansion |

### 6.2 Topology Selection Decision Tree

```
What is the project scope?

1. Single building / <500 ports / <3 IDF rooms?
   └── 2-Tier Collapsed Core (Pattern 1)
       └── Cisco: C9500 core + C9300 access + FPR3100 NGFW
       └── Huawei: S6730 core + S5735 access + USG6555F

2. Multi-building / >1,000 ports / >5 IDF rooms per floor?
   └── 3-Tier Core-Distribution-Access (Pattern 2)
       └── Cisco: N9K/C9500 core → C9606R distribution → C9200L access
       └── Add PSIM if security sub-systems >3 types

3. AI/ML training cluster / GPU compute farm?
   └── Is the RFI Nvidia-centric or HPE-centric?
       ├── Nvidia DGX → InfiniBand Fat-Tree + 4-Fabric SuperPOD (Pattern 3a)
       └── HPE Cray → Slingshot Dragonfly (Pattern 3b)
           └── Scale: <3,136 endpoints → Class 2; <10,368 → Class 3

4. Hospitality / fiber-to-room?
   └── GPON Hub-and-Spoke (Pattern 4a)
       └── Cisco OLT → HPE Aruba aggregation → ONT per room

5. Oil & gas / industrial site with PLC/SCADA?
   └── OT/IT Segmented (Pattern 5)
       └── Does client require data diode or firewall?
           ├── Airgap / data diode: hardware unidirectional solution
           └── Controlled access: industrial firewall (Fortinet / Palo Alto / Cisco) + strict whitelist

6. UCaaS / collaboration upgrade?
   └── Cisco HCS: on-prem UCM + Webex cloud (hybrid)
       └── SIP trunk from existing telephony to UCM
       └── Webex Hybrid Call Service for external meetings
```

### 6.3 Security Architecture Decision Tree

```
Does the project include operational technology (PLC, SCADA, BMS control)?
├── YES → OT/IT Segmented Pattern (Section 3.5)
│         Physical or logical separation mandatory
└── NO → Continue

Is the project a smart/secure building?
├── YES → Dual-Network Pattern (Section 3.4)
│         IT network (internet) + Security network (airgapped)
│         Separate cabling, separate switches, separate NOC
└── NO → Continue

Is the client Saudi Aramco / NCA-regulated?
├── YES → Add SACS-003 CCA 29-control compliance (Section 3)
│         MOI CCTV pixel density compliance
│         NCA ECC 2019 / NCA CCC 2020 alignment
└── NO → Standard enterprise security zones (Section 3.1)

What firewall vendor?
├── Cisco → TrustSec + ISE + SD-Access (Section 3.2)
├── Huawei → USG NGFW zone-based policy (Section 3.3)
├── Fortinet → FortiGate + FortiManager + FortiAnalyzer
└── Palo Alto → NGFW + Panorama (used in HPC/SuperPOD projects)
```

### 6.4 Migration Approach Decision Tree

```
Is this greenfield (no existing infrastructure)?
├── YES → Greenfield Deployment (Section 4.1)
└── NO → Continue

Is this a workload migration (servers/VMs moving)?
├── YES → Cutover Migration (Section 4.3)
│         Define RTO/RPO per workload tier
│         Plan DNS cutover window
└── NO → Continue

Is this an upgrade/replacement of active infrastructure?
├── Single site, <72h maintenance window available → Cutover migration
├── Multi-site or no maintenance window → Phased migration (Section 4.2)
│   Build new parallel → migrate workloads → decommission old
└── Brownfield expansion (adding capacity) → Section 4.2 phase approach
```

---

## Section 7: Vendor Reference Architecture Citations

### 7.1 Cisco Reference Architectures

| Architecture | TP / Document | Version Cited | Key Components |
|-------------|--------------|---------------|----------------|
| Cisco SD-Access Campus Fabric | NCD TP (OP-2023-121577) | Version cited in TP | DNA Center, ISE, TrustSec, C9000 series |
| Cisco Enterprise Wireless | NCD TP | Wi-Fi 6 (802.11ax) | C9800 WLC, C9124AXI access points |
| Cisco Secure Firewall (Firepower) | NCD TP, Hotel H11 drawio | FPR3100 FTD, FPR2130, FPR1150 | FMC management, HA active-standby |
| Cisco HCS (Hosted Collaboration) | UCaaS TP (OP-167515) | HCS + Webex hybrid | UCM, Webex cloud, SIP trunk |
| Cisco Nexus Data Center | Hotel H11 drawio | Nexus 9K (9504/9508) | N9K spine, C9606R leaf |

### 7.2 NVIDIA / DGX Reference Architectures

| Architecture | TP / Document | Version Cited | Key Components |
|-------------|--------------|---------------|----------------|
| NVIDIA DGX SuperPOD | NVidia SuperPOD TP (OP-2022-91095) | DGX H100 SuperPOD v1 | DGX H100, Quantum-2 NDR IB, NetApp EF600, BeeGFS |
| NVIDIA Rail-Optimized Fat-Tree | SuperPOD TP | NDR 400Gbps | Quantum-2 switches, 8 rails per compute node |

### 7.3 HPE / Cray Reference Architectures

| Architecture | TP / Document | Version Cited | Key Components |
|-------------|--------------|---------------|----------------|
| HPE Cray EX (Seismic HPC) | OP-2024-147007 | Phase 1: XD665, Phase 2: XD675 | Slingshot-11 (Ph1), Slingshot-400 (Ph2), Dragonfly |
| HPE ClusterStor | OP-2024-147007 | E1000 (Ph1), E2000 (Ph2) | 100PB capacity, ONTAP, BeeGFS |
| HPE ARCS Liquid Cooling | OP-2024-147007 | Not versioned | Direct liquid cooling for XD665/XD675 |
| HPE ProLiant + GreenLake | Storage Fabric HLD | Not versioned | SR665 V3 (BeeGFS servers) |

### 7.4 Huawei Reference Architectures

| Architecture | TP / Document | Version Cited | Key Components |
|-------------|--------------|---------------|----------------|
| Huawei CloudCampus | Qadeseya Club TP (OP-2024-145666) | Not versioned | S6730/S5735, AR6121E, AirEngine Wi-Fi 7 |
| Huawei NGFW | Qadeseya Club TP | USG6555F | Zone-based policy, IPS/AV/URL |

### 7.5 NetApp Reference Architectures

| Architecture | TP / Document | Version Cited | Key Components |
|-------------|--------------|---------------|----------------|
| NetApp EF600 All-Flash | SuperPOD TP, Storage Fabric HLD | EF600 (NDR200 ports) | 48× NDR200 ports per shelf, BeeGFS |
| NetApp ONTAP Security | OP-2024-147007 | FIPS-140-2, ARP, SnapLock | MAV, SAML MFA, SnapMirror |

### 7.6 Standards and Regulatory Frameworks Cited

| Standard | Scope | TPs Referencing |
|----------|-------|----------------|
| BICSI 002/003/007/008/009 | Data center design, cabling | NCD Design Report |
| TIA-568-C.0/1/2/3/4 | Structured cabling | NCD TP, NCD Design Report, Qadeseya TP |
| TIA-569-C | Pathways and spaces | NCD Design Report |
| TIA-942-A | Data center design | NCD Design Report |
| SBC 201/301/401/501/801/1001 | Saudi Building Code | NCD Design Report |
| BS 7958 | CCTV operational procedures | NCD Design Report |
| BS 8418 | CCTV remote monitoring | NCD Design Report |
| BS EN 60839-11-1/5 | Electronic access control | NCD Design Report |
| OSDP v2 | Access control serial protocol | NCD TP |
| BACnet/IP (ANSI/ASHRAE 135) | BMS integration protocol | NCD TP |
| IEEE 802.11ax (Wi-Fi 6) | Wireless | NCD TP |
| IEEE 802.11be (Wi-Fi 7) | Wireless | Qadeseya Club TP |
| IEEE 802.1AE (MACsec) | Layer 2 encryption | NCD TP (MACsec-256) |
| NCA ECC 2019 | Saudi national cybersecurity controls | OP-2024-147007, UCaaS TP, WAED |
| NCA CCC 2020 | Saudi cloud cybersecurity controls | UCaaS TP, WAED hosting |
| NIST CSF | Cybersecurity framework | WAED hosting project |
| Aramco SACS-003 | Saudi Aramco cloud security assessment | UCaaS TP (29-control CCA) |
| Aramco SACS-005 | Saudi Aramco security general | OP-2024-147007 |
| ISO 27001 | Information security management | Qadeseya Club TP |
| CITC ICT Construction Guideline (Oct 2022) | Saudi ICT infrastructure | NCD Design Report |
| MIL-STD-461 | EMC (HPC context) | OP-2024-147007 |
| US Export Controls (EAR/ITAR) | GPU export licensing | OP-2024-147007 (NVIDIA H100) |

### 7.7 Vendor Reference Architecture by Project Type

| Project Type | Primary Vendor RA | Secondary | Notes |
|-------------|------------------|-----------|-------|
| Smart building / low-current | Cisco SD-Access Campus | ISE + DNA Center | NCD TP standard |
| AI/GPU cluster | NVIDIA DGX SuperPOD | NetApp BeeGFS | Aramco standard for AI |
| Scientific HPC (seismic) | HPE Cray EX + Slingshot | HPE ClusterStor | Aramco Dhahran DTV |
| UCaaS / collaboration | Cisco HCS + Webex | — | Hybrid on-prem + cloud |
| Hotel / hospitality ICT | Cisco 3-tier (N9K + C9606R + C9200L) | GPON OLT | Resort/island projects |
| Club / sports facility | Huawei CloudCampus | Cisco (alternative) | Qadeseya pattern |
| Oil & gas / industrial | Allied Telesis + Lucior (OT) | Cisco/Fortinet (IT) | Segregated OT/IT |
| Hosting / IaaS migration | STC IaaS + Fortinet/PaloAlto FW | Veeam backup | WAED pattern |
| Cybersecurity (WAF) | Fortinet or Palo Alto | F5 (alternative) | NGFW + WAF overlay |

---

*End of Design_Patterns.md*
*Sources: 6 Technical Proposals (NCD TP, NVidia SuperPOD TP, HPE Seismic TP, UCaaS TP, Qadeseya Club TP, WAF TP), NCD Design Report (Buro Happold), 8 Draw.io files (hotel ICT, hotel CCTV, GPON, UC, OGF drilling, ACWA GCP, NCD HLD)*
