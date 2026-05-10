import { z } from "zod";

// --- Schema & Types ---

export const TPSectionRefSchema = z.object({
  section: z.string(),
  sectionName: z.string(),
});
export type TPSectionRef = z.infer<typeof TPSectionRefSchema>;

// --- Topic-to-Section Mapping ---
// Ordered by priority: more specific/discriminating topics first.
// First match wins; §6 (Proposed Solution) is the catch-all default.

const TOPIC_MAP: { regex: RegExp; section: string; sectionName: string }[] = [
  {
    // Payment / commercial terms are never in the TP
    regex: /\b(payment|pric(e|ing|ed)|cost\b|invoice|billing|commercial\s+term)\b/i,
    section: "commercial",
    sectionName: "Commercial Proposal (not in TP)",
  },
  {
    // IKTVA / local content → Compliance Matrix
    regex: /\b(local\s+content|iktva|saudization|in.kingdom|saudi\s+content)\b/i,
    section: "§9",
    sectionName: "Compliance Matrix",
  },
  {
    // Company profile / experience evidence
    regex: /\b(experience|reference|cv\b|curriculum\s+vitae|case\s+stud(y|ies)|track\s+record|similar\s+project|company\s+profile)\b/i,
    section: "§15",
    sectionName: "Company Profile + Annexure",
  },
  {
    // Security wins over generic compliance when both keywords present
    regex: /\b(security|cybersecurity|access\s+control|encryption|authentication|firewall|vulnerability|cyber|malware|intrusion)\b/i,
    section: "§10",
    sectionName: "Security",
  },
  {
    // Standards / certifications / regulatory frameworks
    regex: /\b(compliance|standard|certification|regulatory|nca\b|iso\b|sama\b|sacs|nist\b|framework)\b/i,
    section: "§9",
    sectionName: "Compliance Matrix",
  },
  {
    // SLA, uptime, warranty, maintenance, support
    regex: /\b(sla\b|uptime|availability|response\s+time|recovery\s+time|warranty|maintenance|support\b)\b/i,
    section: "§8",
    sectionName: "SLA / Support",
  },
  {
    // Delivery, training, milestones
    regex: /\b(implementation|timeline|milestone|schedule|deployment|commissioning|training|knowledge\s+transfer|handover)\b/i,
    section: "§7",
    sectionName: "Scope + Implementation",
  },
];

// --- Public Function ---

export function linkToTPSection(requirementText: string): TPSectionRef {
  for (const { regex, section, sectionName } of TOPIC_MAP) {
    if (regex.test(requirementText)) {
      return TPSectionRefSchema.parse({ section, sectionName });
    }
  }
  return TPSectionRefSchema.parse({ section: "§6", sectionName: "Proposed Solution" });
}
