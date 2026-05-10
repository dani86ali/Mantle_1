# Discovery Patterns: Real Questionnaire & RFI Data from STCS Knowledge Base
**Source:** Extracted from /stc-knowledge/ across 20+ questionnaire, clarification, and discovery files  
**Date Compiled:** 2026-05-08  
**Purpose:** Drive the BOMATIC RFI questionnaire engine with real patterns used in STCS pre-sales

---

## Section 1: All Questions Found (Organized by Section 2.4 Area)

### SECTION A — Business Context / Organization and Scope

**Source files:** Tabuk Emara/Information Gathering.txt, VSAT Technical Questionnaire Forms, DC Operations Questionnaire, NCD clarifications.xlsx, SAOO Technical Evaluation, OP-2024-147007 STCS Questionnaire

| # | Question (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| A1 | What are the number and locations of branches + HQ? | Tabuk Emara/Information Gathering.txt | Network/UC |
| A2 | Total number of users (breakdown by executive / manager / staff / reception)? | Tabuk Emara/Information Gathering.txt | Network/UC |
| A3 | What connectivity exists between branches? (MPLS, VSAT, internet?) | Tabuk Emara/Information Gathering.txt | Network |
| A4 | Is existing network infrastructure in place, or greenfield? | Tabuk Emara/Information Gathering.txt | Network |
| A5 | Is contractor commercially registered in Saudi Arabia? Provide CR number. | VSAT Technical Questionnaire / DC Ops Questionnaire | Qualification |
| A6 | Provide your Saudi Aramco Contractor/Vendor number. | VSAT Technical Questionnaire | Qualification |
| A7 | Is your company registered with CITC? Provide license copy. | VSAT Technical Questionnaire | VSAT/Telco |
| A8 | Provide details of similar projects performed over the last 3 years (title, scope, client, duration, team size). | SAOO Technical Evaluation Q7/Q8; VSAT Form 3 | Technical Eval |
| A9 | What is the scope of the alternative proposal? | OP-181414 Notes.txt | HPC/Servers |
| A10 | Is FAT (Factory Acceptance Testing) Phase I / Phase II mandatory? | OP-2024-147007 STCS Questionnaire V1 Q1/Q2 | HPC/Compute |
| A11 | Are Acceptance Phase 1 and Acceptance Phase 2 separate per SCHEDULE B ATTACHMENT VI and VII? | OP-2024-147007 STCS Questionnaire V1 Q11 | HPC/Compute |
| A12 | Provide org chart from management level to field service technician level. | VSAT Technical Questionnaire Form 2 | Qualification |
| A13 | What are the Saudization level targets by calendar year? Can you meet them? | VSAT Form 12 Q13; DC Ops Form 6 | Qualification |
| A14 | What is the intended project mobilization timeline? Minimum personnel at T0+3 months? | VSAT Form 10 | Qualification |
| A15 | Does the proposal include a full end-to-end solution design that fulfills requirements? | SAOO Technical Evaluation Q1 | Technical Eval |
| A16 | Does the proposal provide a detailed project plan and timeline matching required delivery? | SAOO Technical Evaluation Q4 | Technical Eval |
| A17 | Provide a detailed mobilization plan for personnel. | SAOO Technical Evaluation Q9 | Technical Eval |

---

### SECTION B — Current-State Network / Infrastructure

**Source files:** Tabuk Emara/Information Gathering.txt, NCD/Gathering Sheet.xlsx, NCD/NCD clarifications.xlsx, WAED Clarifications, WAF Questions, DR Questionnaire, OP-167357 Notes, OP-181414 Notes

| # | Question (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| B1 | What is the WAN connectivity model? (MPLS, VSAT, dedicated internet?) Carrier and bandwidth per site? | Tabuk Emara/Information Gathering.txt | Network |
| B2 | How many users per floor/zone/IDF area? (breakdown by type: voice, WAP, BMS, security) | NCD/Gathering Sheet.xlsx ICT sheet | Smart Building |
| B3 | What are the IDF zone locations, rack type (42U/24U), and active port counts per zone? | NCD/Gathering Sheet.xlsx ICT sheet (all rows) | Smart Building |
| B4 | What is the quantity of security devices per zone? (CCTV dome/bullet, access control panels, intercom, PTZ, multi-dome, lift cameras) | NCD/Gathering Sheet.xlsx Security sheet | Smart Building |
| B5 | What are the perimeter security devices? (firewall model and quantity, IPS/IDS, endpoint protection) | Tabuk Emara/Information Gathering.txt | Network/Security |
| B6 | What is the current Active Directory structure? (On-prem, hybrid, multi-domain) | WAED Clarifications Q128 | Hosting/Migration |
| B7 | How many Domain Controllers are in the AD forest? What version? | WAED Clarifications Q129–130, Q4 | Hosting/Migration |
| B8 | How many AD users? How many sites/locations? Network bandwidth between sites? | WAED Clarifications Q6, Q3 | Hosting/Migration |
| B9 | What is the current Exchange version? How many Exchange servers and DBs? | WAED Clarifications Q9–10, Q66 | Hosting/Migration |
| B10 | How many mailboxes (user + shared + room/equipment)? What is average mailbox size? | WAED Clarifications Q11–12, Q15 | Hosting/Migration |
| B11 | What is the current mail gateway? Vendor and model? (e.g., Fortimail, pfSense, Cloudflare) | WAED Clarifications Q16, Q33 | Hosting/Migration |
| B12 | How many ADFS servers and proxy/WAP servers? What version? | WAED Clarifications Q20–22 | Hosting/Migration |
| B13 | What applications are integrated with ADFS? | WAED Clarifications Q23 | Hosting/Migration |
| B14 | How many CA (Certificate Authority) servers? What applications use the existing CA? | WAED Clarifications Q25 | Hosting/Migration |
| B15 | Current hypervisor platform? (KVM, VMware, Nutanix?) | WAED Clarifications Q60, Q117 | Hosting/Migration |
| B16 | How many VMs total? (Prod, Dev, Non-Prod, UAT) — provide list with CPU/RAM/Storage/OS/App/DB | WAED Clarifications Q31, Q119, CPU RAM OS Application sheet | Hosting/Migration |
| B17 | Are there any physical servers? If yes, specs and running applications? | WAED Clarifications Q61, Q85 | Hosting/Migration |
| B18 | What is the current firewall platform? Vendor, model? (e.g., pfSense, Fortinet, Palo Alto) | WAED Clarifications Q16 | Hosting/Migration |
| B19 | What WAF is in use? (Cloudflare, Fortinet FortiWeb, etc.) | WAED Clarifications Q16, Q101 | Security |
| B20 | Is a SIEM in use? Managed internally or by third party? What tool? | WAED Clarifications Q149, Q153 | Security |
| B21 | What VA (vulnerability assessment) tool is used? How often are scans run? | WAED Clarifications Q153 | Security |
| B22 | Current backup solution and retention policies? (e.g., Veeam, incremental/differential/full) | WAED Clarifications Q134, Q138–142 | Hosting/Migration |
| B23 | Current backup capacity? Daily average change rate? | WAED Clarifications Q24, Q31 | Hosting/Migration |
| B24 | What SSL certificates are in use? Certificate authority? | WAED Clarifications Q102 | Hosting/Migration |
| B25 | What DNS solution is in use? (e.g., Cloudflare, AD-integrated) | WAED Clarifications Q57, Q158, OP-167881 Notes | Hosting/Cloud |
| B26 | What WAF device zones and quantities are in scope? (Extranet/Intranet/DR web applications) | WAF Questions.xlsx Q1 | Security/WAF |
| B27 | What is the quantity of FortiWeb/WAF devices to be activated and maintained? | WAF Questions.xlsx Q2 | Security/WAF |
| B28 | Provide serial numbers for all devices under the contract scope. | WAF Questions.xlsx Q5 | Security/WAF |
| B29 | Full DC hardware inventory (device type, vendor, model number) | DR Questionnaire / DC Inventory sheet | DR/HPC |
| B30 | What server monitoring, DB monitoring, and network monitoring tools are in use? | Tabuk Emara/Information Gathering.txt | Network/DC |
| B31 | What is the current connectivity between old and new data center? Bandwidth? | WAED Clarifications Q27–28 | DC Migration |
| B32 | What Microsoft 365 plan/license is in use? How many licensed users? | WAED Clarifications Q14, Q46, Q125–126 | Hosting/M365 |
| B33 | Which Microsoft 365 features are in use? (Exchange Online, Teams, SharePoint, OneDrive, Intune, ADFS) | WAED Clarifications Q22, Q166–167 | Hosting/M365 |
| B34 | Is Microsoft Entra (Azure AD) in use? Which features? (MFA, SSO, PIM, DLP) | WAED Clarifications Q166 | Hosting/M365 |
| B35 | Is load balancing in use? How many LB policies? | WAED Clarifications Q103, Q154 | Hosting/Migration |
| B36 | What is the Passive Network status (riser, BOQ, specs)? What systems are currently 50%/90% complete? | NCD/NCD clarifications.xlsx Deliverable Status | Smart Building |
| B37 | What is the storage and backup infrastructure? (e.g., EMC, Veeam, NetApp?) | Tabuk Emara/Information Gathering.txt | DR/Storage |
| B38 | What UC system is currently in place? (Cisco, Huawei telephony?) | UCaaS Questions.xlsx Q23 | UC/Collaboration |
| B39 | What is the current SIP trunk configuration? (Aramco-managed or SP?) | UCaaS Questions.xlsx Q5, Q27 | UC/Collaboration |
| B40 | What endpoint protection is in use? Version? (e.g., Symantec 12.x) | Tabuk Emara/Information Gathering.txt | Security |

---

### SECTION C — Applications and Traffic

**Source files:** UCaaS Questions.xlsx, WAED Clarifications, Smart City Questions (Accenture/Updated), DR Questionnaire (RTO-RPO sheet)

| # | Question (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| C1 | What type of connectivity is required for UCaaS? (Public internet + VPN, dedicated MPLS, DIA?) | UCaaS Questions Q5 | UC/Collaboration |
| C2 | Is integration with the existing UC system and Active Directory required during PoC? Describe the integration. | UCaaS Questions Q6 | UC/Collaboration |
| C3 | What is the desired federation model between UCaaS cloud and Active Directory? | UCaaS Questions Q11 | UC/Collaboration |
| C4 | How many hard IP phones are needed? Types? | UCaaS Questions Q12 | UC/Collaboration |
| C5 | What devices are required at the Aramco DMZ? SaaS with VPN or dedicated IPVPN? | UCaaS Questions Q15 | UC/Collaboration |
| C6 | Is the solution hosted in a single Tier IV data center? | UCaaS Questions Q18 | UC/Collaboration |
| C7 | Will Aramco configure their existing telephony (Cisco/Huawei) to integrate with UCaaS? | UCaaS Questions Q23 | UC/Collaboration |
| C8 | Will Aramco issue digital certificates from their PKI to secure call sessions? | UCaaS Questions Q24 | UC/Collaboration |
| C9 | What is the call flow from call center to the cloud? | UCaaS Questions | UC/Collaboration |
| C10 | What is the expected migration timeline? (e.g., End of 2022) | UCaaS Questions Q28 | UC/Collaboration |
| C11 | What applications are running and how are they connected to databases? | WAED Clarifications Q122 | Hosting/Migration |
| C12 | Are there backend applications that use email (websites, monitoring tools)? How many? | WAED Clarifications Q16 | Hosting/M365 |
| C13 | Is Microsoft Exchange hybrid deployment being considered? | WAED Clarifications Q32 | Hosting/M365 |
| C14 | Which services are in scope for migration? (VMs, OS, App, Services, DB, Microsoft Services) | WAED Clarifications Q10 | Hosting/Migration |
| C15 | Provide application criticality classification (most critical / medium / low). | WAED Clarifications Q196 | DR/Migration |
| C16 | What is peak traffic timing? (KSA office hours only, or 24x7?) | WAED Clarifications Q170 | Hosting/Migration |
| C17 | How many active user accounts in Microsoft 365 tenant? | WAED Clarifications Q126 | Hosting/M365 |
| C18 | How many Intune-licensed users require management? | WAED Clarifications Q178 | Hosting/M365 |
| C19 | How many concurrent programming environment users? (IDE, compilers) | OP-2024-147007 STCS Questionnaire V1 Q12 | HPC/Compute |
| C20 | What are the Name of Application/Service, Category, RPO, RTO per system? | DR Questionnaire / RTO-RPO sheet | DR |
| C21 | From what source will the platform receive parking data? (JSON payload from camera sensors or live video feed?) | Smart City Questions (Accenture) SPR_BR_1 | Smart City/IoT |
| C22 | What data retention period is required for parking data in the database? | Smart City Questions SPR_BR_7 | Smart City/IoT |
| C23 | How will the platform obtain parking capacity and parking data? | Smart City Questions SPR_BR_10 | Smart City/IoT |
| C24 | How will the platform receive: weather data, soil moisture, water usage, public gathering events? | Smart City Questions SI_BR_3 | Smart City/IoT |
| C25 | How many types of smart water meters? Communication channel (single or multi)? | Smart City Questions SW_BR_1 | Smart City/IoT |
| C26 | What analytics are required on metered data? | Smart City Questions SW_BR_1, SP_BR_1 | Smart City/IoT |
| C27 | What is the data volume? Number and types of devices? Data retention period? | Smart City Questions (all use cases) BR_1 | Smart City/IoT |
| C28 | Is SIEM required at public cloud or does Aramco use its own security monitoring? | Smart City Questions (Information Security) | Smart City/IoT |
| C29 | What systems will be connected to the SIEM? | Smart City Questions (Information Security) | Smart City/IoT |
| C30 | What is the 5-year forecast of number of devices to be connected to the platform? | Smart City Questions (Generic) | Smart City/IoT |

---

### SECTION D — Future-State Requirements

**Source files:** DR Questionnaire, WAED Clarifications, Smart City Questions, 5G Questionnaire, OP-2024-147007 STCS Questionnaire, OP-167881 Notes

| # | Question (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| D1 | What RTO and RPO are required per application/service? | DR Questionnaire (RTO-RPO sheet); WAED Q36, Q77 | DR/Migration |
| D2 | Which applications require DR site replication? (list critical services) | WAED DR servers list sheet; WAED Q35 | DR/Migration |
| D3 | What is the desired cloud model — private cloud at provider or public multi-tenant? | WAED Clarifications Q2 | Hosting/Cloud |
| D4 | What is the required connectivity to the new hosting provider? (IPSec, S2S, MPLS, speed?) | WAED Clarifications Q3, Q6, Q63 | Hosting/Migration |
| D5 | What is the required internet bandwidth? (inbound/outbound) | WAED Clarifications Q64, Q93 | Hosting/Cloud |
| D6 | Is "Always On" or "On Demand" DDoS protection required? | WAED Clarifications Q13 | Security |
| D7 | Is the DR a real-time sync to primary zone? RPO/RTO requirements? | WAED Clarifications Q42, Q53 | DR |
| D8 | What is the contract duration? (1Y / 2Y / 3Y, pay-as-you-go?) | WAED Clarifications Q11, Q79 | Commercial |
| D9 | Are iperf benchmark parameters flexible? (threads, MTU, buffer, window) | OP-2024-147007 STCS Questionnaire Q6 | HPC/Compute |
| D10 | Can XFS be used as local filesystem for NVMe drives? | OP-2024-147007 STCS Questionnaire Q7 | HPC/Compute |
| D11 | Are benchmark record sizes flexible? (iozone -r 1m instead of -r 8m?) | OP-2024-147007 STCS Questionnaire Q8 | HPC/Compute |
| D12 | Are alternative ior parameters acceptable? (-t 64m --posix.odirect?) | OP-2024-147007 STCS Questionnaire Q9 | HPC/Compute |
| D13 | Is 99.67% SLC equivalent to 28h 41m 23s downtime per year (Tier 1)? | OP-2024-147007 STCS Questionnaire Q13 | HPC/Compute |
| D14 | Will project milestones be adjusted after US export license approval for GPU hardware? | OP-2024-147007 STCS Questionnaire Q14 | HPC/Compute |
| D15 | What encryption is required on fiber between UDC and Remote Compute Facility? (L2 or IPSec?) | OP-2024-147007 STCS Questionnaire Q15 | HPC/Compute |
| D16 | Are next-generation firewalls with IPS/IDS required? HA pair or single? Forwarding rate? Port speed? | OP-2024-147007 STCS Questionnaire Q17 | HPC/Network |
| D17 | What is the 5G core throughput capacity and maximum subscriber count? | 5G Private Network Questionnaire Q1 | 5G |
| D18 | Does the 5G core support MORAN/MOCN RAN sharing? | 5G Private Network Questionnaire Q2 | 5G |
| D19 | Is the 5G core standalone? Map to 3GPP network functions. | 5G Private Network Questionnaire Q4 | 5G |
| D20 | How is throughput capacity upgraded — hardware replacement, hardware expansion, or VNF/CNF expansion? | 5G Private Network Questionnaire Q5 | 5G |
| D21 | Is the 5G core upgradeable to support network slicing (3GPP)? Hardware replacement or software upgrade? | 5G Private Network Questionnaire Q6 | 5G |
| D22 | Is the 5G core based on cloud-native architecture? Details on provisioning method? | 5G Private Network Questionnaire Q9 | 5G |
| D23 | Does the 5G core support Distributed Multi-Access Edge Computing (MEC) and UPF at edge? | 5G Private Network Questionnaire Q13 | 5G |
| D24 | Does the 5G RAN support 4.0–4.1 GHz? Is it medium-range per 3GPP TS 138 104? | 5G Private Network Questionnaire Q14–15 | 5G |
| D25 | What is the 99.9% availability design for the supercomputer? (fabric redundancy, node sparing) | NVidia Questionnaire Req 1 | HPC/AI |
| D26 | Provide detailed Bill of Materials per Schedule B and Schedule G. | NVidia Questionnaire Req 2 | HPC/AI |
| D27 | Is geo-redundancy required for data centers? HA requirements for platform? | Smart City Questions (BCDR) | Smart City/IoT |
| D28 | Is storage backup required? What retention duration? | Smart City Questions (BCDR) | Smart City/IoT |
| D29 | Is NB-IoT allowed for connectivity for all use cases? | Smart City Questions (Connectivity) | Smart City/IoT |
| D30 | Is IPVPN link required between Aramco and public cloud platform? | Smart City Questions (Connectivity) | Smart City/IoT |
| D31 | Would Windows Server 2016 licenses be needed? Could Ubuntu 16.04 LTS be provided? | OP-167881 Notes.txt | Cloud/IaaS |
| D32 | For 8TB storage with 30K peak IOPS (60/40 R/W), confirm performance specs. | OP-167881 Notes.txt | Cloud/IaaS |
| D33 | How will racks be priced? Responsibility matrix (equipment config by bidder or Aramco)? | OP-181414 Notes.txt | Servers/Frame |
| D34 | Is passive cabling required between racks? | OP-181414 Notes.txt | Servers/Frame |
| D35 | Is a dedicated onsite engineer required for the full BSP duration? | OP-181414 Notes.txt | Managed Services |
| D36 | What services are covered in the service contract? Will preventive and corrective maintenance be on Release PO? | OP-181414 Notes.txt | Managed Services |
| D37 | What IP addressing scheme is required? Can we use private IP ranges? | OP-2024-147007 R1 Q13 | HPC/Network |

---

### SECTION E — Compliance and Regulatory

**Source files:** UCaaS Attachment II Security Questionnaire, OP-2024-147007 R1 and R2, NVidia Technical Evaluation Q4, WAED Clarifications, SAOO Technical Evaluation

| # | Question / Control Statement (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| E1 | Data center must have physical perimeter security (access-controlled entry, cameras, manned reception). | UCaaS Security Questionnaire Q1 | Cloud/Security |
| E2 | Data center must be certified by internationally recognized authority (Uptime Institute Tier IV, ISO 27001). | UCaaS Security Questionnaire Q2 | Cloud/Security |
| E3 | Data center must have required tier rating as determined by Data Owner/Data Custodian. | UCaaS Security Questionnaire Q3 | Cloud/Security |
| E4 | Cloud service must provide high availability with fail-over to minimize downtime. | UCaaS Security Questionnaire Q4 | Cloud/Security |
| E5 | DDoS protection must be implemented for high-availability cloud services. | UCaaS Security Questionnaire Q5 | Cloud/Security |
| E6 | Multi-Factor Authentication must be enforced for admin access to public cloud services. | UCaaS Security Questionnaire Q6 | Cloud/Security |
| E7 | MFA must be enforced for end-users accessing cloud services containing Sensitive SAI. | UCaaS Security Questionnaire Q7 | Cloud/Security |
| E8 | MFA must be enforced for users accessing Content Management Services (CMS). | UCaaS Security Questionnaire Q8 | Cloud/Security |
| E9 | Sessions must be encrypted (HTTPS) where sensitive data is transmitted to/from cloud. | UCaaS Security Questionnaire Q9 | Cloud/Security |
| E10 | Cloud provider must have encryption key management capability. | UCaaS Security Questionnaire Q10 | Cloud/Security |
| E11 | Encryption at rest must be provided for all data including backups (unless classified Public). | UCaaS Security Questionnaire Q11 | Cloud/Security |
| E12 | Virtual servers hosting SAI must be separated from other organizations (tenant isolation). | UCaaS Security Questionnaire Q12 | Cloud/Security |
| E13 | Cloud provider must regularly apply security patches to cloud infrastructure. | UCaaS Security Questionnaire Q13 | Cloud/Security |
| E14 | Cloud provider must perform source-code vulnerability scanning before deployment. | UCaaS Security Questionnaire Q14 | Cloud/Security |
| E15 | Cloud provider must regularly perform security scans (threats and vulnerabilities). | UCaaS Security Questionnaire Q15 | Cloud/Security |
| E16 | Up-to-date antivirus for all Windows OS in the cloud. | UCaaS Security Questionnaire Q16 | Cloud/Security |
| E17 | Software must be developed in accordance with industry SDLC best practices. | UCaaS Security Questionnaire Q17 | Cloud/Security |
| E18 | Penetration testing by reputable third party must be performed regularly. | UCaaS Security Questionnaire Q18 | Cloud/Security |
| E19 | Firewalls and intrusion prevention mechanisms must secure the cloud. | UCaaS Security Questionnaire Q19 | Cloud/Security |
| E20 | Web applications must be protected by a WAF. | UCaaS Security Questionnaire Q20 | Cloud/Security |
| E21 | Security measures must restrict and protect SAI access by cloud employees/contractors. | UCaaS Security Questionnaire Q21 | Cloud/Security |
| E22 | Information systems used for cloud must be hardened. | UCaaS Security Questionnaire Q22 | Cloud/Security |
| E23 | Data backup and recovery capabilities must be provided. | UCaaS Security Questionnaire Q23 | Cloud/Security |
| E24 | Logging and security monitoring for cloud infrastructure (access and modification to SAI). | UCaaS Security Questionnaire Q24 | Cloud/Security |
| E25 | Security events and audit logs must be retained for a minimum of 1 year. | UCaaS Security Questionnaire Q25 | Cloud/Security |
| E26 | Cloud provider must have a procedure to timely notify SAI of a compromise or breach. | UCaaS Security Questionnaire Q26 | Cloud/Security |
| E27 | Background checks must be performed on users with admin rights to Sensitive SAI. | UCaaS Security Questionnaire Q27 | Cloud/Security |
| E28 | Data must be returned in a usable format upon service termination. | UCaaS Security Questionnaire Q28 | Cloud/Security |
| E29 | Technology assets must be sanitized upon service termination. | UCaaS Security Questionnaire Q29 | Cloud/Security |
| E30 | Vendor must confirm periodic SIEM aggregation of data from Firewalls, IDS/IPS, antivirus for event monitoring. | OP-2024-147007 R2 Q1 | HPC/Security |
| E31 | Vendor must confirm monthly Vulnerability Scans will be conducted. | OP-2024-147007 R2 Q2 | HPC/Security |
| E32 | Data must be encrypted both in transit and at rest at all times. | OP-2024-147007 R2 Q3 | HPC/Security |
| E33 | Solution must not have internet access — confirm air-gapped/isolated. | OP-2024-147007 R1 Q22/Q23 | HPC/Security |
| E34 | Cybersecurity monitoring 24/7 for unauthorized access and malicious activities. | OP-2024-147007 R1 Q24 | HPC/Security |
| E35 | Confirm compliance with Schedule B Attachment IV (Cybersecurity requirements). | OP-2024-147007 R1 Q25 | HPC/Security |
| E36 | Confirm compliance with Saudi Aramco Cyber Security GI, SACS, NCA guidelines. | NVidia Questionnaire Req 4 | HPC/AI |
| E37 | Complete the IT ICS Security Architecture Assessment in full detail. | NVidia Questionnaire Req 4 | HPC/AI |
| E38 | Security measures must follow Aramco cybersecurity controls (NCA and NIST). | WAED Clarifications Q112, Q145 | Hosting |
| E39 | Data center must be certified: Uptime Tier 3+, ISO 27001. | WAED Clarifications Q146 | Hosting |
| E40 | Penetration testing at what level and frequency? VM-level or application-level? | WAED Clarifications Q26, Q43, Q180 | Hosting |
| E41 | Monthly vulnerability assessment: confirm tool and scope. | WAED Clarifications Q29, Q152–153 | Hosting |
| E42 | Is an existing SOC implemented? Is it managed by third party? | WAED Clarifications Q26, Q36 | Hosting |
| E43 | What IPS/IDS security measures are in place? | WAED Clarifications Q148 | Hosting |
| E44 | Confirm that managed services team operates within KSA, no data shared outside. | WAED Clarifications Q172 | Hosting |
| E45 | What are the required security controls per the RFP? (list all components) | WAED Clarifications Q38 | Hosting |
| E46 | Does the solution utilize encrypted communication protocols for data in transit? | SAOO Technical Evaluation Q10 | Smart City/IoT |
| E47 | Does the existing access control field device distribution match the door hardware layout? | NCD clarifications.xlsx Clarification Q4 | Smart Building |
| E48 | Is PA/Voice Evacuation a standalone system or part of the Fire Alarm System? Share SLD. | NCD clarifications.xlsx Clarification Q10 | Smart Building |
| E49 | What are the BMS control philosophy details? (FCU thermostat by HVAC or DDC?) | NCD clarifications.xlsx Clarification BMS | Smart Building |
| E50 | Are there restrictions on proposing vendors not on the approved vendor list? | NCD clarifications.xlsx Clarification Q11 | Smart Building |

---

### SECTION F — Commercial and Delivery

**Source files:** OP-167881 Notes.txt, OP-181414 Notes.txt, WAED Clarifications, WAF Questions, UCaaS Questions, Smart City Questions (Commercial), VSAT Form 12

| # | Question (verbatim or paraphrased) | Source File | Project Type |
|---|---|---|---|
| F1 | Would price differ between 1-year and 3-year contract? | OP-167881 Notes.txt | Cloud/IaaS |
| F2 | What is the egress traffic pricing? (e.g., SAR 0.67/GB) | OP-167881 Notes.txt | Cloud/IaaS |
| F3 | Is price per month shown in the marketplace? | OP-167881 Notes.txt | Cloud/IaaS |
| F4 | What is the contract duration (1Y / 2Y / 3Y)? | WAED Clarifications Q11 | Hosting |
| F5 | What is the PAYG (Pay-as-you-go) billing model — for compute resources (CPU/RAM/Storage)? | WAED Clarifications Q79 | Hosting |
| F6 | Is migration pricing included in the pricing table or provisional? | WAED Clarifications Q56, Q72 | Hosting |
| F7 | Is commercial proposal to be delivered physically or by email? | WAED Clarifications Q49 | Commercial |
| F8 | Are managed services 24/7 or business hours only? Remote or onsite delivery model? | WAED Clarifications Q7, Q24, Q96 | Managed Services |
| F9 | Can offshore team provide support (outside KSA)? Or must team be within KSA? | WAED Clarifications Q106, Q172, Q173 | Managed Services |
| F10 | Is Arabic or English required for the support team? Or both? | WAED Clarifications Q174 | Managed Services |
| F11 | Is dedicated team required, or leverage managed services model acceptable? | WAED Clarifications Q7 | Managed Services |
| F12 | Are annual DR drills in scope? How many per year? | WAED Clarifications Q97 | DR |
| F13 | What migration timeline is accepted? (1 month for WAED) | WAED Clarifications Q136, Q161 | Migration |
| F14 | Is online migration required, or is offline migration acceptable? | WAED Clarifications Q162 | Migration |
| F15 | Who provides all licenses (OS, antivirus, application) during migration? | WAED Clarifications Q54 | Migration |
| F16 | Is it a must that Professional Services are provided directly from OEM (e.g., Fortinet) or can SI provide? | WAF Questions Q2 | Security/WAF |
| F17 | What exact tasks does the client want PS to perform? | WAF Questions Q3 | Security/WAF |
| F18 | Will PS engagement be T&M-based and limited to a signed SOW? | WAF Questions Q3 | Security/WAF |
| F19 | What level and scope of support for field devices? (8x5xNBD, onsite, OEM direct?) | Smart City Questions (Field devices) | Smart City/IoT |
| F20 | How many years of warranty for field devices? | Smart City Questions (Field devices) | Smart City/IoT |
| F21 | For IoT platform pricing: differentiate items in Schedule C Material Price vs. Construction Price. | Smart City Questions (Commercial) | Smart City/IoT |
| F22 | How to price future additions/licenses for the platform? (per 10/100/1000 devices?) | Smart City Questions (Commercial) | Smart City/IoT |
| F23 | What are the HA and SLA requirements for the PaaS platform? | Smart City Questions (Managed Services) | Smart City/IoT |
| F24 | Are managed services for field devices (edge, gateways, cameras) in scope? | Smart City Questions (Managed Services) | Smart City/IoT |
| F25 | Who handles field device updates, maintenance, and replacement — Aramco directly or managed? | Smart City Questions (Managed Services) | Smart City/IoT |
| F26 | Can Fortinet/Aramco provide remote access (RDP) for troubleshooting on a 24/7 basis? | WAF Questions Q4 | Security/WAF |
| F27 | Who is responsible for scope of cabling (fiber and UTP): bidder or Aramco? | Smart City Questions (Cabling) | Smart City/IoT |
| F28 | Are civil works (trenching, manholes) in scope for the bidder? | Smart City Questions (Cabling) | Smart City/IoT |
| F29 | Does VSAT contractor have existing in-Kingdom storage for spare parts? | VSAT Form 7 | VSAT/Telco |
| F30 | What is the minimum mobilization timeframe after contract award? | VSAT Form 10 | VSAT/Telco |

---

## Section 2: Question Formats Found

### Format Type 1 — Structured Excel Grid Form (TYPE_F1)

Used in: NCD/Gathering Sheet.xlsx, DR Questionnaire, WAED Clarifications

**Structure:**
```
Column A: SN (sequential number)
Column B: Scope Reference / Clause
Column C: Original Article / Section Title
Column D: Contractor Clarification / Question
Column E: Client Feedback / Answer
```

**Characteristics:**
- Each row = one question
- Clause cross-reference (RFP section, schedule, paragraph number)
- Client answer in rightmost column
- Blank when submitted; completed when answered
- Iterative (R1 → R2 rounds)

**Parser detection:** Header row contains "Contractor Clarification" AND "Feedback"

---

### Format Type 2 — Structured Excel Intake Form (TYPE_F2)

Used in: NCD/Gathering Sheet.xlsx (ICT tab, Security tab), DR Questionnaire (RTO-RPO tab, Application Inventory, DC Inventory)

**Structure:**
```
Row 1: Column headers (S/N, Floor, IDF Zone, Rack, device type counts...)
Row 2+: One zone/IDF/application per row
Cells: Numeric quantities, not free-text questions
```

**Characteristics:**
- Quantitative, not interrogative
- Captures scope counts per location
- Used for design-phase intake, not RFP clarification
- Each column = a device type or system
- Formulas present (Active+20% = quantity * 1.2)

**Parser detection:** Contains floor/zone columns + numeric device counts

---

### Format Type 3 — Free-Text Discovery Notes (TYPE_F3)

Used in: Tabuk Emara/Information Gathering.txt, OP-167881 Notes.txt, OP-181414 Notes.txt, OP-167357 Notes.txt

**Structure:**
```
!!!CATEGORY!!!
- bullet question or note
- answer inline (if captured)
contact: person@domain.com
```

**Characteristics:**
- Taken during or after customer meeting
- Rough, abbreviated, mixed language (English/Arabic shorthand)
- Category delimiters: `!!!!HCS!!!!`, `!!BRanches!!!`, `!!!!Wireless!!!`
- High signal-to-noise; good for understanding pre-sales flow
- Not parseable without NLP; used as training data for question generation

---

### Format Type 4 — Technical Evaluation Questionnaire (TYPE_F4)

Used in: NVidia Technical Evaluation Questionnaire V4, SAOO Technical Evaluation Questionnaire, 5G Private Network Qualification Questionnaire, VSAT Technical Questionnaire Forms

**Structure:**
```
Column A: Req# / Form#
Column B: Requirement Description
Column C: Question text
Column D: Bidder Compliance (Supported / Will be Customized / Not Supported)
Column E: Bidder Comment / Technical Answer
```

**Characteristics:**
- Formal compliance questionnaire (Supported / Will be Customized / Not Supported)
- Client asks bidder to confirm capabilities and design choices
- Often spans multiple rounds
- Answers can be multi-paragraph technical narratives
- Common in Aramco HPC/AI procurement

---

### Format Type 5 — Security/Cloud Compliance Questionnaire (TYPE_F5)

Used in: UCaaS Attachment II Security Questionnaire (Aramco CCA), UCaaS Desktop Endorsement Questionnaire

**Structure:**
```
# | Control Statement | Vendor Response
```

**Characteristics:**
- 29 control statements derived from Saudi Aramco SACS-003 Cloud Cybersecurity Standard
- Yes/No or detailed paragraph answer
- Covers: physical security, HA, DDoS, MFA, encryption, patching, pen testing, WAF, logging, breach notification, data portability, sanitization
- Triggered whenever cloud/hosted solution involves Saudi Aramco data
- Also has a Desktop section (software endorsement) for new software onboarding

---

### Format Type 6 — Post-Submission Clarification Document (TYPE_F6)

Used in: OP-2024-147007 R1, R2, OP-2022-80222 Technical Clarification, ARABIAN INTERNET Clarification V2

**Structure:**
```
Document header: PRS No. | Proposal Option | Vendor | OEM | Revision | Response Deadline
Q[n]. [Aramco question — clause reference]
A[n]. [Vendor response: COMPLY / technical detail]
```

**Characteristics:**
- Issued by client after technical proposal submission
- Iterative rounds (R1, R2, sometimes R3)
- Bidder response format: COMPLY / NOT COMPLY / Technical Explanation
- Clause or page reference always included
- Tight deadline (e.g., 24-48 hours)

---

## Section 3: Project Type to Question Emphasis Matrix

| Project Type | Primary Sections | Emphasized Questions | Least Needed |
|---|---|---|---|
| **Cybersecurity (WAF, SOC, SIEM)** | E (all 29+ CCA controls), B5 (security stack), F (PS sourcing) | E1–E50 (CCA controls), B18–B21 (FW/WAF/SIEM), F16–F18 (OEM vs SI PS) | A (qualifications), C (applications) |
| **Campus/Smart Building Network** | B2–B4 (port counts per zone), A (project scope), D (future scope per system) | NCD Gathering Sheet style intake: Voice/WAP/BMS/security per IDF zone; rack counts; core/edge split | E (compliance), F (commercial) |
| **Enterprise WAN / Network Refresh** | B1 (WAN topology), B2 (LAN users/switches), B5 (security stack), C1 (SaaS), D2 (cloud strategy) | Carrier/bandwidth/contract end per site; firewall model; SD-WAN suitability | Smart Building device counts |
| **Data Center / HPC / AI Compute** | B3 (DC fabric), D (SLC, benchmark specs, GPU export), E (air-gap, cybersecurity, Attachment IV), A (FAT) | OP-147007 Q1–17 style (FAT, benchmark params, SLC, export license, fabric topology) | Smart Building counts, UCaaS |
| **UC / Collaboration (UCaaS, Voice)** | C1–C10 (SIP, AD federation, phones, DMZ), E (PKI, MFA), D (cloud strategy, migration timeline) | UCaaS Q5–Q28; SIP trunk source; IP phone quantities; AD federation model | HPC benchmarks, VSAT |
| **Hosting / DC Migration / Cloud** | B6–B35 (full environment: AD, Exchange, VMs, hypervisor, backup), D1–D5 (DR, connectivity), E (NCA/NIST, certifications), F4–F15 (contract terms, migration scope) | WAED-style 197 Q&A depth; CPU/RAM/OS/App sheet; KVM/VMware; Exchange version; ADFS; Veeam | IoT use-case questions, 5G |
| **Smart City / IoT Platform** | C21–C30 (use-case data volumes, device types, retention), D27–D30 (HA, backup, connectivity), E28–E29 (SIEM, IAM, BCDR), F19–F28 (field device warranty, civil works) | Per-use-case functional questions (parking, irrigation, water, power); Accenture-style matrix | Exchange/AD questions, HPC benchmarks |
| **5G Private Network** | D17–D24 (core specs: slicing, MEC, cloud-native, RAN frequency), A (qualifications, CITC), F (SLA tiers) | 5G Q1–Q17 (pre-qualification style; core throughput, RAN specs, OOK partners) | Smart Building counts, UCaaS |
| **VSAT / Satellite Connectivity** | A5–A7 (CITC license, company qualification), F29–F30 (spare parts, mobilization), B1 (WAN), E (Saudization) | VSAT 12-form structure; 24x7 support tiers (L1/L2/L3/L4); iDirect/Hughes certification | Smart Building, HPC benchmarks |
| **DR / Business Continuity** | D1–D2 (RTO/RPO per app, recovery class), B29 (DC inventory), C20 (application criticality) | DR Questionnaire RTO-RPO sheet: RC0 (1h) → RC5 (normal ops); Application Inventory; DC Inventory | IoT use-cases, 5G |
| **Managed Services Frame Agreement** | A8 (experience), F8–F11 (24x7, onsite/remote, dedicated team), E30–E35 (security posture, SIEM, pen testing) | OP-181414/DC Ops style: services scope, maintenance basis (Release PO), SCOM integration | Smart Building counts, 5G |

---

## Section 4: RFI vs RFP Clarification Mode Comparison

### Mode 1 — RFI Mode: STCS Asking the Client (Pre-Sales Discovery)

**Purpose:** Understand client environment before designing a solution or writing a proposal.

**Format observed:**
- Free-text meeting notes (Information Gathering.txt — Tabuk Emara)
- Structured Excel intake form (NCD Gathering Sheet.xlsx)
- Formal question list submitted to client (WAED Clarifications v1, UCaaS Questions, Smart City Questions, WAF Questions, STCS Questionnaire V1)

**Question characteristics:**
- Scoping: "How many users / branches / devices?"
- Environment: "What is the current firewall / WAN / exchange version?"
- Requirements: "What RTO/RPO is needed per application?"
- Clarification: "What is in scope? What does the original article mean?"
- Commercial: "1Y or 3Y pricing? Dedicated or leveraged managed services?"

**Response expected:** Client fills in answers directly (Wa'ed Feedback column, blank form cells)

**Timing:** Before proposal submission or during proposal preparation

**Examples in knowledge base:**
| File | Mode | Project | Approx # Questions |
|---|---|---|---|
| NCD/Gathering Sheet.xlsx | RFI | NCD Smart Building | 80+ intake rows |
| Tabuk Emara/Information Gathering.txt | RFI | Tabuk Emara ICT | ~20 informal notes |
| WAED Clarifications v1 | RFI | WAED Hosting | 39 questions |
| WAED Answers Clarification Form | RFI | WAED Hosting | 197 Q&A pairs |
| UCaaS Questions | RFI | Aramco UCaaS | 16 questions |
| Smart City Questions v2 | RFI | Aramco Smart City | ~60 questions |
| WAF Questions.xlsx | RFI | Aramco WAF | 12 questions |
| STCS Questionnaire V1 (OP-147007) | RFI | Aramco HPC | 17 questions |
| OP-167881 Notes.txt | RFI | Sutherland Cloud | 9 informal notes |
| OP-181414 Notes.txt | RFI | Aramco Servers | 10 informal notes |

---

### Mode 2 — RFP Clarification Mode: Client Asking STCS (Post-Submission)

**Purpose:** Client evaluates STCS/HPE technical proposal and asks for compliance confirmation, architecture clarification, or commercial alignment.

**Format observed:**
- Post-submission clarification document with numbered Q&A (OP-147007 R1/R2)
- Technical Evaluation Questionnaire with compliance matrix (NVidia, SAOO, 5G, VSAT)
- Cloud Computing Assessment (CCA) security questionnaire (UCaaS Security Questionnaire)

**Question characteristics:**
- Compliance: "COMPLY or NOT COMPLY with [contract clause]?"
- Clarification: "Your proposal states X — explain how Y works"
- Confirmation: "Confirm that [security requirement] is met"
- Gap-filling: "Your proposal did not address [requirement] — respond"
- Technical: "Explain bandwidth capacity between phases / fabric topology"

**Response expected:** COMPLY / NOT COMPLY / Technical explanation + supporting documentation

**Timing:** After technical proposal submission, before award or during evaluation

**Examples in knowledge base:**
| File | Mode | Project | Approx # Questions |
|---|---|---|---|
| OP-147007 R1 | RFP Clarification | Aramco HPC DMM7++ | 25 |
| OP-147007 R2 | RFP Clarification | Aramco HPC DMM7++ | 3 |
| NVidia Technical Evaluation Q4 | RFP Clarification | Aramco AI Supercomputer | 4 |
| SAOO Technical Evaluation | RFP Clarification | SAOO Smart Solution | 11 |
| UCaaS Security Questionnaire | RFP Clarification | Aramco UCaaS | 29 |
| 5G Qualification Questionnaire | RFP Clarification | Aramco 5G Private | 17 |
| VSAT Technical Questionnaire | RFP Clarification | Aramco VSAT | 12 forms |
| DC Ops Questionnaire | RFP Clarification | Aramco DC Operations | 8 forms |

---

### Key Differences Summary

| Dimension | RFI Mode (STCS asks client) | RFP Clarification Mode (client asks STCS) |
|---|---|---|
| Initiator | STCS pre-sales / solutions architect | Client procurement / technical evaluation team |
| Timing | Pre-proposal, during discovery | Post-submission, during evaluation |
| Format | Informal notes, structured intake form, clarification Excel | Technical evaluation questionnaire, compliance matrix, post-submission Q&A |
| Answer type | Client describes current state or future requirements | STCS confirms COMPLY/NOT COMPLY + justification |
| Revision rounds | Usually 1–2 rounds | Usually 2–3 rounds (R1, R2, R3) |
| Clause references | Reference to RFP scope/section | Reference to STCS proposal page/paragraph |
| Consequence | Shapes solution design and BoQ | Shapes final evaluation and award decision |
| Arabic content | Occasionally in free-text notes | Rarely; formal documents in English |

---

## Section 5: Recommended Questionnaire Template

**Synthesized from all patterns above — recommended for BOMATIC RFI engine**

> This template is structured to support both RFI Mode (STCS → client) and brief evaluation (client → STCS).  
> Questions are tagged with section and applicability by project type.  
> Use the Project Type → Section Emphasis matrix in Section 3 to select relevant sections per opportunity.

---

### BOMATIC Standard RFI Questionnaire — v1.0

```
CLIENT:           ___________________________
OPPORTUNITY:      ___________________________
PROJECT TYPE:     [ ] Network  [ ] Security  [ ] Hosting/Cloud  [ ] Smart Building  
                  [ ] HPC/AI   [ ] UCaaS     [ ] Smart City/IoT [ ] VSAT/Telco
DATE:             ___________________________
COMPLETED BY:     ___________________________
```

---

#### SECTION A — Business Context

| # | Question | Client Answer |
|---|---|---|
| A1 | Organization name, industry, and primary business function | |
| A2 | Locations in scope: list all sites (city, type: HQ/branch/DC/remote) | |
| A3 | Total headcount (breakdown by site if multi-site) | |
| A4 | Primary business drivers for this initiative (cost reduction, security compliance, new capability, regulatory, growth) | |
| A5 | Project budget envelope (indicative CAPEX and OPEX, fiscal year) | |
| A6 | Decision timeline and key milestones (RFP issue, proposal submission, award, go-live) | |
| A7 | Key stakeholders: decision-maker, technical evaluator, procurement contact | |
| A8 | Any existing vendor preferences or exclusions? | |

---

#### SECTION B — Current-State Network and Infrastructure

**B.1 WAN and Connectivity**

| # | Question | Client Answer |
|---|---|---|
| B1 | WAN connectivity model: MPLS, internet VPN, VSAT, SD-WAN, dedicated fiber? | |
| B2 | WAN carrier(s), bandwidth per site, contract renewal dates | |
| B3 | Connectivity between branches and HQ: redundant or single path? | |
| B4 | Branch network infrastructure: managed by client or carrier? In place or to be built? | |

**B.2 LAN / Campus Network**

| # | Question | Client Answer |
|---|---|---|
| B5 | Total active ports required (per building / per floor / per IDF zone) | |
| B6 | Number of wired users, wireless users, BMS endpoints, security endpoints per zone | |
| B7 | Switch models in use (core/edge), end-of-life status | |
| B8 | Wireless APs in place: model, controller, Wi-Fi standard (Wi-Fi 6/6E?), coverage issues | |
| B9 | IDF room locations, rack type (42U/24U), UPS requirement per rack | |

**B.3 Data Center / Server Infrastructure**

| # | Question | Client Answer |
|---|---|---|
| B10 | How many VMs (Prod, Dev, DR)? Provide list: CPU/RAM/Storage/OS/Application | |
| B11 | Hypervisor platform: VMware, KVM, Nutanix, VxRail? Version? | |
| B12 | Any physical servers? Specs and running applications? | |
| B13 | Storage capacity (total, daily change rate for backup sizing) | |
| B14 | DC hardware inventory: key devices (servers, switches, storage, firewalls) | |
| B15 | Current backup solution and retention policy (e.g., Veeam, weekly full / daily incremental) | |

**B.4 Microsoft/Identity Services**

| # | Question | Client Answer |
|---|---|---|
| B16 | Active Directory: number of DCs, AD sites, number of users, AD version | |
| B17 | Exchange: number of servers, version, number of mailboxes (user + shared + equipment) | |
| B18 | ADFS: number of servers and proxy/WAP servers, version | |
| B19 | Microsoft 365 plan/license; features in use (Teams, SharePoint, OneDrive, Entra, Intune) | |
| B20 | Is Azure AD Connect/Entra ID in use? Hybrid or cloud-only? | |

**B.5 Security Stack**

| # | Question | Client Answer |
|---|---|---|
| B21 | Perimeter firewall: vendor, model, quantity, locations | |
| B22 | WAF in use: vendor/platform (Fortinet FortiWeb, Cloudflare, F5?) | |
| B23 | SIEM in use? Managed internally or by third party? Tool name? | |
| B24 | Endpoint protection: vendor, version | |
| B25 | IPS/IDS in place? Where deployed? | |
| B26 | Vulnerability Assessment tool: vendor, scan frequency | |
| B27 | Is MFA in use? Platform (Azure Entra ID P1, Duo, RSA?) | |
| B28 | DNS provider (on-premises AD-integrated, Cloudflare, other?) | |

---

#### SECTION C — Applications and Traffic

| # | Question | Client Answer |
|---|---|---|
| C1 | List top 10 business-critical applications (name, type, hosting: on-prem/cloud/SaaS) | |
| C2 | Any SaaS in use? (M365, Salesforce, SAP, ServiceNow, custom ERP?) | |
| C3 | Voice/video collaboration platform: Cisco, Huawei, Teams, Zoom, STC UC? | |
| C4 | What applications generate the most East-West DC traffic? | |
| C5 | Are there backend apps that use email (monitoring tools, websites, ticketing)? | |
| C6 | Peak traffic timing: KSA office hours only, or 24×7? | |
| C7 | IoT devices (if applicable): device types, protocols, data volumes, retention period | |
| C8 | Streaming or real-time analytics workloads? (video analytics, AI inference) | |

---

#### SECTION D — Future-State Requirements

| # | Question | Client Answer |
|---|---|---|
| D1 | What is the primary goal of this initiative? (list top 3 outcomes) | |
| D2 | Growth projections: new sites, user growth, new device categories (OT, IoT, BYOD) over 3–5 years | |
| D3 | Cloud strategy: on-premises, private cloud, hybrid, public cloud (AWS, Azure, GCP, STC Cloud)? Data residency requirements? | |
| D4 | RTO/RPO requirements per application tier (critical: ≤4h / ≤12h; business: ≤24h; normal: ≤72h) | |
| D5 | Which applications require active DR replication to DR site? | |
| D6 | Zero-trust or SASE roadmap: is microsegmentation / identity-first networking planned? | |
| D7 | Required SLAs for managed services (incident response: P1/P2/P3 response and resolution times) | |
| D8 | Should managed services team be onsite or remote? 24/7 or business hours? Within KSA? | |
| D9 | Is phased delivery acceptable? (Phase 1 POC, Phase 2 full rollout) | |
| D10 | Preferred contract duration (1Y / 3Y / 5Y) and commercial model (CAPEX, OPEX, PAYG) | |

---

#### SECTION E — Compliance and Regulatory (MENA)

| # | Question | Client Answer |
|---|---|---|
| E1 | Which regulatory frameworks apply? (NCA ECC, PDPL, SAMA CSF, NIST, ISO 27001, Aramco SACS/GI, NESA, ADHICS) | |
| E2 | Is data residency within KSA mandatory? Any sovereign cloud requirement? | |
| E3 | Are there sector-specific overlays? (banking: SAMA, oil & gas: Aramco SACS, healthcare: NPHIES) | |
| E4 | Is a cloud computing assessment (CCA / Cloud Security Assessment) required before onboarding? | |
| E5 | Penetration testing: annual or more frequent? Third-party or internal? VM-level or application-level? | |
| E6 | Monthly vulnerability scans required? What tool is acceptable? | |
| E7 | Data encrypted in transit and at rest? AES-256 or specific algorithm required? | |
| E8 | SIEM required? Aggregate from FW, IPS/IDS, AV? Managed by client or provider? | |
| E9 | Breach notification SLA: how quickly must Aramco/client be notified of a breach? | |
| E10 | Background check required for admins with access to sensitive data? | |
| E11 | Data sanitization on exit: NIST 800-88 wipe? Certification of destruction required? | |
| E12 | Saudization: what percentage is required? Can your team meet it? | |
| E13 | Bilingual (Arabic/English) operator interface required? | |

---

#### SECTION F — Commercial and Delivery

| # | Question | Client Answer |
|---|---|---|
| F1 | Preferred vendor(s) or OEM(s)? Any vendor exclusions? | |
| F2 | Existing maintenance/support contracts: vendor, expiry date, annual value | |
| F3 | Payment terms preference: advance payment, milestone-based, NET 30/60/90? | |
| F4 | Is PS required to come from OEM directly, or can the integrator (SI) provide it? | |
| F5 | Acceptance criteria and testing expectations: FAT, SAT, pilot period? | |
| F6 | Warranty expectations: duration and RMA service level (NBD, 4-hour on-site)? | |
| F7 | Training: how many staff, what format (classroom, lab, on-the-job)? | |
| F8 | Migration: online or offline? Downtime window available? Max acceptable migration window? | |
| F9 | Who supplies licenses during migration (OS, AV, application)? Client or vendor? | |
| F10 | What is the commercial proposal submission format? (email, physical delivery, e-procurement portal?) | |

---

## Section 6: Gap Analysis

### Coverage by Section

| Section 2.4 Area | Coverage in Real Data | Strength | Key Gaps |
|---|---|---|---|
| **A — Business Context** | Good | Tabuk Emara notes, VSAT/DC qualification forms, SAOO | No systematic budget/CAPEX questions found |
| **B1 — WAN** | Partial | Tabuk notes mention MPLS; WAED mentions S2S/IPSec; UCaaS Q5 covers SIP/connectivity | No systematic "WAN inventory" — carrier names, bandwidth per circuit, contract end dates never asked |
| **B2 — Campus LAN** | Strong | NCD Gathering Sheet is a comprehensive floor-by-floor intake model | No port-speed / PoE requirement columns in observed forms |
| **B3 — Data Center** | Strong | WAED CPU/RAM/OS/App sheet is gold-standard DC inventory; DR Questionnaire DC Inventory | East-West traffic patterns (Playbook C4) never explicitly asked |
| **B4 — Wireless** | Weak | Only informal Tabuk note ("WAP - Abdul Rahman") | No structured wireless intake: AP count, controller, Wi-Fi standard, density issues — not asked in any file |
| **B5 — Security Stack** | Strong | Tabuk notes, UCaaS CCA (29 controls), WAED (FW/WAF/SIEM/VA) | No NAC or web gateway discovery questions found |
| **B6 — Management Tools** | None | Not systematically asked in any file | No questions on: SolarWinds, PRTG, Nagios, SCOM, or unified monitoring tools |
| **B7 — Pain Points** | Partial | Implied in clarification Q&A but never directly asked | "What incidents occurred in last 12 months?" never explicitly asked |
| **C1–C2 — Applications + SaaS** | Partial | UCaaS questions cover collaboration; WAED covers Exchange/AD/Teams | Top 10 critical apps list never asked as a structured question; SaaS breakout strategy not asked |
| **C3 — Voice/Video** | Good | UCaaS questions cover collaboration platform thoroughly | |
| **C4 — East-West DC Traffic** | None | Never asked in any observed file | Gap: no "describe DC traffic patterns" or "what is your east-west bandwidth?" |
| **D1 — Growth Projections** | Partial | Smart City asks 5-year device forecast; IoT questions have data volume questions | User/site growth projections not asked in non-IoT projects |
| **D2 — Cloud Strategy** | Partial | WAED Q2–3 (private vs public cloud); Smart City connectivity questions | AWS/Azure/GCP preference not systematically collected |
| **D3 — Zero-Trust / SASE** | None | Not asked in any observed file | Gap: "Do you have a SASE or zero-trust roadmap?" never collected |
| **D4 — SLAs (RTO/RPO)** | Strong | DR Questionnaire RC0–RC5 system; WAED DR servers list (all with 8h/12h RTO/RPO) | |
| **E1 — Data Residency** | Partial | WAED confirms KSA-only; UCaaS asks about Kingdom hosting compliance | No systematic "which frameworks: NCA/PDPL/SAMA?" question |
| **E2 — Sector Overlays** | Weak | Aramco SACS/GI referenced in HPC projects only | Banking (SAMA CSF), healthcare (NPHIES), government not found |
| **E3 — Saudization** | Good | VSAT and DC Ops questionnaires have detailed Saudization tables | |
| **E4 — Bilingual UI** | None | Not asked in any file | Gap: "Is Arabic interface required for operations team?" |
| **E5 — Sovereign Cloud** | Partial | WAED: must be within KSA; Smart City mentions In-Kingdom hosting | |
| **F1 — Preferred Vendors** | Partial | WAF notes OEM vs SI preference; Smart City asks for top-tier AV (not Bitdefender) | No structured "preferred vendor list" question |
| **F2 — Existing Contracts** | Partial | OP-167881 asks about 1Y vs 3Y pricing; WAED asks about active licenses | Renewal dates for existing maintenance contracts not systematically asked |
| **F3 — Payment Terms** | Partial | WAED asks about PAYG model; OP-147007 references GIB §9.3 | No structured "NET 30/60/90 or advance payment" question |
| **F4 — Acceptance Criteria** | Good | OP-147007 covers FAT Phase I/II in detail; SAOO asks for project plan and timeline | |

---

### Summary Gaps (Sections with Zero Real Examples)

1. **B4 — Wireless inventory** — AP count, controller model, Wi-Fi standard, density issues never systematically collected
2. **B6 — Management/monitoring tools** — No questions on SolarWinds, Nagios, SCOM, PRTG, unified monitoring
3. **B7 — Pain points / recent incidents** — Never explicitly asked ("What incidents in last 12 months?")
4. **C4 — East-West DC traffic** — Never asked in any observed format
5. **D3 — Zero-trust / SASE roadmap** — Not collected in any format
6. **E2 — Sector-specific regulatory overlays** — Banking (SAMA), healthcare, government sectors not covered
7. **E4 — Bilingual UI requirement** — Not asked

### Recommendation for BOMATIC Questionnaire Engine

- **Use WAED Clarifications as the template for Hosting/Migration** — the 197-Q depth with answered examples is the most complete model in the knowledge base
- **Use NCD Gathering Sheet as the template for Smart Building** — floor-by-floor port count + security device count is a real, deployable intake form
- **Use UCaaS CCA Security Questionnaire as the template for Compliance Section E** — all 29 controls are Aramco-approved and Aramco-compliant
- **Use DR Questionnaire RTO-RPO sheet as the template for DR section of D** — RC0–RC5 recovery class system maps cleanly to BOMATIC's tiered SLA model
- **Add 7 new questions** to cover the identified gaps: B4 (wireless), B6 (monitoring tools), B7 (pain points), C4 (east-west traffic), D3 (zero-trust), E2 (sector regulatory), E4 (bilingual UI)

---

*End of Discovery_Patterns.md*  
*Sources: 20+ files extracted from /stc-knowledge/ — questionnaire, clarification, intake, and qualification documents across 2019–2025 STCS opportunities*
