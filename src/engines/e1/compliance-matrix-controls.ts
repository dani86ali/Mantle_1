// Hardcoded keyword → framework control mapping (Step 10a).
// At least 12 topics; each topic maps to a control in NCA ECC, ISO 27001, and SAMA CSF.
// Used deterministically (no AI) to map requirements to controls.

export interface ControlRef {
  id: string;
  name: string;
}

export interface ControlTopic {
  keywords: RegExp;
  controls: Partial<Record<string, ControlRef>>;
}

export const CONTROL_TOPICS: ControlTopic[] = [
  {
    keywords: /\b(encrypt(?:ion|ed)?|cryptograph(?:y|ic)|tls|ssl|aes)\b/i,
    controls: {
      NCA_ECC: { id: '2-8', name: 'Cryptography' },
      ISO_27001: { id: 'A.8.24', name: 'Use of cryptography' },
      SAMA_CSF: { id: '3.3.13', name: 'Cryptography' },
    },
  },
  {
    keywords: /\b(access\s+control|authoriz(?:ation|ed\s+access)|least\s+privilege|rbac)\b/i,
    controls: {
      NCA_ECC: { id: '2-2', name: 'Identity and Access Management' },
      ISO_27001: { id: 'A.5.15', name: 'Access control' },
      SAMA_CSF: { id: '3.3.5', name: 'Identity and Access Management' },
    },
  },
  {
    keywords: /\b(authenticat(?:e|ion)|mfa|multi.?factor|password|credential)\b/i,
    controls: {
      NCA_ECC: { id: '2-2-3', name: 'Authentication' },
      ISO_27001: { id: 'A.5.17', name: 'Authentication information' },
      SAMA_CSF: { id: '3.3.5.2', name: 'Authentication Mechanisms' },
    },
  },
  {
    keywords: /\b(logging|audit\s+log|log\s+retention|siem|event\s+monitor)\b/i,
    controls: {
      NCA_ECC: { id: '2-12', name: 'Cybersecurity Event Logs and Monitoring' },
      ISO_27001: { id: 'A.8.15', name: 'Logging' },
      SAMA_CSF: { id: '3.3.14', name: 'Cybersecurity Event Management' },
    },
  },
  {
    keywords: /\b(backup|disaster\s+recovery|business\s+continuit|bcp\b|\bdr\b|rto|rpo)\b/i,
    controls: {
      NCA_ECC: { id: '2-9', name: 'Backup and Recovery Management' },
      ISO_27001: { id: 'A.5.29', name: 'Information security during disruption' },
      SAMA_CSF: { id: '3.3.16', name: 'Business Continuity Management' },
    },
  },
  {
    keywords: /\b(network\s+security|firewall|segmentation|\bids\b|\bips\b|dmz)\b/i,
    controls: {
      NCA_ECC: { id: '2-5', name: 'Network Security' },
      ISO_27001: { id: 'A.8.20', name: 'Network security' },
      SAMA_CSF: { id: '3.3.10', name: 'Network Security' },
    },
  },
  {
    keywords: /\b(vulnerabilit(?:y|ies)|patch(?:ing|\s+management)?|penetration\s+test)\b/i,
    controls: {
      NCA_ECC: { id: '2-10', name: 'Vulnerability Management' },
      ISO_27001: { id: 'A.8.8', name: 'Management of technical vulnerabilities' },
      SAMA_CSF: { id: '3.3.15', name: 'Vulnerability Management' },
    },
  },
  {
    keywords: /\b(malware|virus|anti.?virus|anti.?malware|ransomware|endpoint\s+protect)\b/i,
    controls: {
      NCA_ECC: { id: '2-3', name: 'Information System and Processing Facilities Protection' },
      ISO_27001: { id: 'A.8.7', name: 'Protection against malware' },
      SAMA_CSF: { id: '3.3.11', name: 'Malware Protection' },
    },
  },
  {
    keywords: /\b(incident\s+(?:response|management|handling)|breach\s+notification)\b/i,
    controls: {
      NCA_ECC: { id: '2-13', name: 'Cybersecurity Incident and Threat Management' },
      ISO_27001: { id: 'A.5.24', name: 'Information security incident management' },
      SAMA_CSF: { id: '3.3.18', name: 'Cybersecurity Incident Management' },
    },
  },
  {
    keywords: /\b(physical\s+(?:security|access)|cctv|video\s+surveillance|locked\s+rack|facility\s+access)\b/i,
    controls: {
      NCA_ECC: { id: '2-14', name: 'Physical Security' },
      ISO_27001: { id: 'A.7.1', name: 'Physical security perimeters' },
      SAMA_CSF: { id: '3.3.4', name: 'Physical Security' },
    },
  },
  {
    keywords: /\b(data\s+(?:classification|protection|privacy|loss\s+prevention)|\bdlp\b|pii)\b/i,
    controls: {
      NCA_ECC: { id: '2-7', name: 'Data and Information Protection' },
      ISO_27001: { id: 'A.5.34', name: 'Privacy and protection of PII' },
      SAMA_CSF: { id: '3.3.6', name: 'Information Asset Protection' },
    },
  },
  {
    keywords: /\b(third.?party|vendor\s+(?:management|risk)|supplier\s+(?:risk|security)|outsourc)\b/i,
    controls: {
      NCA_ECC: { id: '4-2', name: 'Third-Party and Cloud Computing Cybersecurity' },
      ISO_27001: { id: 'A.5.19', name: 'Information security in supplier relationships' },
      SAMA_CSF: { id: '3.4', name: 'Third-Party Cybersecurity' },
    },
  },
];

export function frameworkControls(frameworkId: string): Map<string, ControlRef> {
  const map = new Map<string, ControlRef>();
  for (const t of CONTROL_TOPICS) {
    const c = t.controls[frameworkId];
    if (c) map.set(c.id, c);
  }
  return map;
}
