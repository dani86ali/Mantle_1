/**
 * E4 — Discovery questionnaire template.
 * Derived from Playbook §2.4 (sections A–F base questions) and expanded with
 * the detailed sub-questions a senior pre-sales engineer would ask.
 */

import {
  QUESTIONNAIRE_SECTIONS,
  type Question,
} from './types';

const VALID_SECTION_IDS = new Set(QUESTIONNAIRE_SECTIONS.map((s) => s.id));

export const QUESTION_BANK: Question[] = [
  // ─── Section A — Business Context ──────────────────────────────────────────
  { id: 'A1', section: 'A', priority: 'required',    responseType: 'table',       text: 'Industry vertical, total headcount, and sites in scope (country + address).', helpText: 'List every site to be touched; include greenfield sites separately.' },
  { id: 'A1a', section: 'A', priority: 'required',   responseType: 'table',       text: 'Per-site headcount and primary site type (HQ, branch, DC, factory, retail).' },
  { id: 'A1b', section: 'A', priority: 'recommended', responseType: 'text',       text: 'Industry sub-vertical (e.g. retail banking vs investment banking).' },
  { id: 'A2', section: 'A', priority: 'required',    responseType: 'text',        text: 'Primary business drivers for this initiative.', helpText: 'Free text — quote the executive sponsor verbatim if possible.' },
  { id: 'A2a', section: 'A', priority: 'required',   responseType: 'multiselect', text: 'Top business KPIs targeted by this project.', options: ['cost_reduction', 'agility', 'security_posture', 'user_experience', 'compliance', 'sustainability'] },
  { id: 'A3', section: 'A', priority: 'required',    responseType: 'text',        text: 'Project budget envelope (CAPEX/OPEX split, fiscal year).' },
  { id: 'A3a', section: 'A', priority: 'required',   responseType: 'select',      text: 'CAPEX vs OPEX preference.', options: ['capex_heavy', 'opex_heavy', 'balanced', 'tbd'] },
  { id: 'A3b', section: 'A', priority: 'recommended', responseType: 'text',       text: 'Fiscal year end and budget approval cycle.' },
  { id: 'A4', section: 'A', priority: 'required',    responseType: 'text',        text: 'Decision timeline and key milestones.' },
  { id: 'A4a', section: 'A', priority: 'required',   responseType: 'text',        text: 'Target production cut-over date.' },
  { id: 'A5', section: 'A', priority: 'recommended', responseType: 'text',        text: 'Decision-makers and evaluation committee (names, roles, influence).' },

  // ─── Section B — Current-State Network ─────────────────────────────────────
  { id: 'B1', section: 'B', priority: 'required',    responseType: 'text',        text: 'WAN topology and circuits (carrier, bandwidth, contract end dates).' },
  { id: 'B1a', section: 'B', priority: 'recommended', responseType: 'table',      text: 'MPLS vs SD-WAN vs internet breakout per site.' },
  { id: 'B2', section: 'B', priority: 'required',    responseType: 'table',       text: 'Campus LAN: users per site, switch models, end-of-life status.', helpText: 'Pull from Cisco EoL/EoS bulletins where vendor is known.' },
  { id: 'B2a', section: 'B', priority: 'recommended', responseType: 'table',      text: 'Switch counts by model and floor/IDF location.' },
  { id: 'B2b', section: 'B', priority: 'recommended', responseType: 'text',       text: 'PoE budget needs and IoT/OT endpoint counts requiring PoE.' },
  { id: 'B3', section: 'B', priority: 'required',    responseType: 'text',        text: 'Data center sites: location, fabric type, virtualization stack.' },
  { id: 'B3a', section: 'B', priority: 'recommended', responseType: 'text',       text: 'East-west traffic volume and storage protocol (FC, iSCSI, NVMe-oF).' },
  { id: 'B4', section: 'B', priority: 'required',    responseType: 'table',       text: 'Wireless: AP count, controller model, Wi-Fi generation, density issues.' },
  { id: 'B4a', section: 'B', priority: 'recommended', responseType: 'text',       text: 'Coverage gaps and guest/IoT SSID requirements.' },
  { id: 'B5', section: 'B', priority: 'required',    responseType: 'text',        text: 'Security stack: perimeter firewall, NAC, web gateway, sandboxing.' },
  { id: 'B5a', section: 'B', priority: 'recommended', responseType: 'text',       text: 'EDR/XDR and SIEM platforms currently in use.' },
  { id: 'B6', section: 'B', priority: 'recommended', responseType: 'text',        text: 'Management and monitoring tools currently deployed.' },
  { id: 'B7', section: 'B', priority: 'required',    responseType: 'text',        text: 'Pain points and known incidents in the last 12 months.' },

  // ─── Section C — Applications & Traffic ────────────────────────────────────
  { id: 'C1', section: 'C', priority: 'required',    responseType: 'table',       text: 'Top 10 business-critical applications (name, hosting, users, bandwidth).' },
  { id: 'C1a', section: 'C', priority: 'recommended', responseType: 'text',       text: 'Legacy / EOL applications that constrain network design.' },
  { id: 'C2', section: 'C', priority: 'required',    responseType: 'multiselect', text: 'SaaS platforms adopted.', options: ['m365', 'salesforce', 'sap', 'servicenow', 'workday', 'other'] },
  { id: 'C2a', section: 'C', priority: 'recommended', responseType: 'select',     text: 'Internet breakout strategy for SaaS traffic.', options: ['central', 'regional', 'local', 'mixed'] },
  { id: 'C3', section: 'C', priority: 'recommended', responseType: 'select',      text: 'Voice/video collaboration platform.', options: ['teams', 'webex', 'zoom', 'other'] },
  { id: 'C3a', section: 'C', priority: 'optional',   responseType: 'text',        text: 'Contact-center platform (if any).' },
  { id: 'C4', section: 'C', priority: 'recommended', responseType: 'text',        text: 'East-West DC traffic patterns and microsegmentation needs.' },
  { id: 'C4a', section: 'C', priority: 'recommended', responseType: 'text',       text: 'Real-time / low-latency workloads (trading, OT, voice).' },
  { id: 'C4b', section: 'C', priority: 'recommended', responseType: 'text',       text: 'Backup and replication traffic volumes between sites.' },

  // ─── Section D — Future-State Requirements ────────────────────────────────
  { id: 'D1', section: 'D', priority: 'required',    responseType: 'table',       text: 'Growth projections (sites, users, devices, IoT, OT) over 3 years.' },
  { id: 'D1a', section: 'D', priority: 'recommended', responseType: 'text',       text: 'BYOD policy and projected mobile device count.' },
  { id: 'D2', section: 'D', priority: 'required',    responseType: 'multiselect', text: 'Cloud strategy.', options: ['aws', 'azure', 'gcp', 'sovereign_cloud', 'oracle', 'none'] },
  { id: 'D2a', section: 'D', priority: 'recommended', responseType: 'text',       text: 'Direct-connect / ExpressRoute / cloud-interconnect plans.' },
  { id: 'D3', section: 'D', priority: 'recommended', responseType: 'text',        text: 'Zero-trust / SASE roadmap and target architecture.' },
  { id: 'D3a', section: 'D', priority: 'recommended', responseType: 'text',       text: 'Identity provider and MFA platform.' },
  { id: 'D4', section: 'D', priority: 'required',    responseType: 'table',       text: 'Required SLAs (availability, latency, RTO/RPO).' },
  { id: 'D4a', section: 'D', priority: 'required',   responseType: 'select',      text: 'DR strategy.', options: ['active_active', 'active_passive', 'pilot_light', 'backup_only', 'tbd'] },
  { id: 'D4b', section: 'D', priority: 'recommended', responseType: 'text',       text: 'Maintenance window tolerance.' },

  // ─── Section E — Compliance & Regulatory (MENA) ───────────────────────────
  { id: 'E1', section: 'E', priority: 'required',    responseType: 'multiselect', text: 'Data-residency frameworks in scope.', options: ['nca_ecc', 'pdpl', 'sama', 'nesa', 'adhics', 'none'], helpText: 'NCA ECC and SAMA are KSA-specific; NESA and ADHICS are UAE-specific.' },
  { id: 'E1a', section: 'E', priority: 'recommended', responseType: 'text',      text: 'Internal data classification policy and confidential-data volumes.' },
  { id: 'E2', section: 'E', priority: 'required',    responseType: 'select',      text: 'Sector overlay.', options: ['banking', 'healthcare', 'government', 'oil_and_gas', 'general'] },
  { id: 'E2a', section: 'E', priority: 'recommended', responseType: 'select',    text: 'Critical National Infrastructure (CNI) designation status.', options: ['yes', 'no', 'unknown'] },
  { id: 'E3', section: 'E', priority: 'recommended', responseType: 'text',       text: 'Saudization / Emiratization workforce conditions.' },
  { id: 'E3a', section: 'E', priority: 'recommended', responseType: 'text',      text: 'Local partner / SI engagement requirements (in-Kingdom resources).' },
  { id: 'E4', section: 'E', priority: 'recommended', responseType: 'select',     text: 'Bilingual Arabic/English operator-interface needs.', options: ['yes', 'no', 'partial'] },
  { id: 'E4a', section: 'E', priority: 'recommended', responseType: 'select',    text: 'Arabic documentation and training deliverables required.', options: ['yes', 'no', 'partial'] },
  { id: 'E5', section: 'E', priority: 'optional',    responseType: 'text',       text: 'Sovereign-cloud or in-Kingdom hosting mandates.' },
  { id: 'E5a', section: 'E', priority: 'optional',   responseType: 'text',       text: 'Cross-border data transfer restrictions.' },

  // ─── Section F — Commercial & Delivery ────────────────────────────────────
  { id: 'F1', section: 'F', priority: 'required',    responseType: 'multiselect', text: 'Preferred vendors and explicit exclusions.', options: ['cisco', 'fortinet', 'palo_alto', 'hpe', 'juniper', 'dell', 'arista', 'aruba', 'no_preference'] },
  { id: 'F1a', section: 'F', priority: 'recommended', responseType: 'text',      text: 'Vendor certifications required of the bidder (CCIE, Gold Partner, etc.).' },
  { id: 'F2', section: 'F', priority: 'recommended', responseType: 'table',      text: 'Existing maintenance/support contracts and renewal dates.' },
  { id: 'F2a', section: 'F', priority: 'recommended', responseType: 'text',      text: 'Spare-parts and on-site engineer expectations.' },
  { id: 'F3', section: 'F', priority: 'recommended', responseType: 'select',     text: 'Required payment terms.', options: ['advance', 'milestone', 'net30', 'net60', 'net90'] },
  { id: 'F3a', section: 'F', priority: 'recommended', responseType: 'text',      text: 'Performance bonds or advance-payment guarantees required.' },
  { id: 'F4', section: 'F', priority: 'optional',    responseType: 'text',       text: 'Acceptance criteria, warranty, and training expectations.' },
  { id: 'F4a', section: 'F', priority: 'recommended', responseType: 'text',      text: 'Penalty / liquidated-damages clauses in the RFP.' },
];

export function getQuestionsBySection(sectionId: string): Question[] {
  return QUESTION_BANK.filter((q) => q.section === sectionId);
}

export function getRequiredQuestions(): Question[] {
  return QUESTION_BANK.filter((q) => q.priority === 'required');
}

export function isValidSectionId(sectionId: string): boolean {
  return VALID_SECTION_IDS.has(sectionId);
}
