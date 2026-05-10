import { z } from "zod";

// --- Schema & Types ---

const SectorSchema = z.enum([
  "oil_and_gas",
  "banking",
  "government",
  "hospitality",
  "healthcare",
  "telecom",
  "petrochemical",
  "general",
]);
type Sector = z.infer<typeof SectorSchema>;

export const SectorDetectionSchema = z.object({
  sector: SectorSchema,
  confidence: z.number().min(0).max(1),
  method: z.enum(["client_lookup", "content_keywords", "standard_reference"]),
  evidence: z.string(),
});
export type SectorDetection = z.infer<typeof SectorDetectionSchema>;

// --- Lookup Tables ---

const CLIENT_LOOKUP: { pattern: RegExp; sector: Sector }[] = [
  { pattern: /\b(saudi\s+)?aramco\b/i,                                                    sector: "oil_and_gas"   },
  { pattern: /\b(sme\s+bank|riyad\s+bank|al\s+rajhi|alinma|bank\s+aljazeera|bsf|anb)\b/i, sector: "banking"       },
  { pattern: /\b(diriyah|ministry\s+of|emara|municipality|national\s+center|ncd)\b/i,     sector: "government"    },
  { pattern: /\b(nesma|red\s+sea|sindalah|neom|amaala)\b/i,                               sector: "hospitality"   },
  { pattern: /\b(sabic|chemanol|yanbu|sipchem|petro\s+rabigh)\b/i,                        sector: "petrochemical" },
  { pattern: /\b(stc|mobily|zain|salam|integrated\s+telecom)\b/i,                         sector: "telecom"       },
  { pattern: /\b(king\s+\w+\s+hospital|kfshrc|ksmc|kfmc|seha|ngha|kfhc)\b/i,             sector: "healthcare"    },
];

const KEYWORD_MAP: { pattern: RegExp; sector: Sector }[] = [
  { pattern: /\b(upstream|downstream|refinery|drilling|pipeline|feed|epc|brownfield|greenfield|wellhead|crude|oilfield)\b/gi, sector: "oil_and_gas"   },
  { pattern: /\b(core\s+banking|atm|branch\s+network|swift|pci\s+dss|card\s+processing|anti.money.laundering|aml|kyc)\b/gi, sector: "banking"       },
  { pattern: /\b(e.government|etimad|government\s+portal|ministry|municipal|citizen\s+services|nafath|absher)\b/gi,          sector: "government"    },
  { pattern: /\b(hospital|clinic|pacs|his|emr|patient\s+record|healthcare|ehr)\b/gi,                                        sector: "healthcare"    },
  { pattern: /\b(hotel|resort|guest\s+room|iptv|hospitality|pms|key\s+card|front\s+desk)\b/gi,                              sector: "hospitality"   },
  { pattern: /\b(bss|oss|core\s+network|ran|5g|spectrum|subscriber|mvno|lte)\b/gi,                                          sector: "telecom"       },
  { pattern: /\b(petrochemical|chemical\s+plant|distillation|catalyst|polyethylene|polypropylene)\b/gi,                     sector: "petrochemical" },
];

const STANDARD_MAP: { pattern: RegExp; sector: Sector }[] = [
  { pattern: /\bsama\s+csf\b/i,                                           sector: "banking"     },
  { pattern: /\b(sacs-\d+|saes-[a-z]-\d+|saep-\d+|aramco\s+standard)\b/i, sector: "oil_and_gas" },
  { pattern: /\badhics\b/i,                                               sector: "healthcare"  },
  { pattern: /\bnca\s+ecc\b/i,                                            sector: "government"  },
];

// --- Detection Methods ---

function clientLookup(clientName: string): SectorDetection | null {
  for (const { pattern, sector } of CLIENT_LOOKUP) {
    const m = pattern.exec(clientName);
    if (m) {
      return SectorDetectionSchema.parse({
        sector,
        confidence: 0.95,
        method: "client_lookup",
        evidence: `Client name "${clientName}" matched ${sector} pattern`,
      });
    }
  }
  return null;
}

function contentKeywords(text: string): SectorDetection | null {
  const counts: Partial<Record<Sector, number>> = {};
  for (const { pattern, sector } of KEYWORD_MAP) {
    const matches = text.match(new RegExp(pattern.source, "gi")) ?? [];
    if (matches.length > 0) counts[sector] = (counts[sector] ?? 0) + matches.length;
  }
  const entries = Object.entries(counts) as [Sector, number][];
  if (entries.length === 0) return null;
  const [sector, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return SectorDetectionSchema.parse({
    sector,
    confidence: Math.min(0.5 + count * 0.05, 0.85),
    method: "content_keywords",
    evidence: `${count} keyword match(es) for ${sector}`,
  });
}

function standardReference(standards: string[]): SectorDetection | null {
  const combined = standards.join(" ");
  for (const { pattern, sector } of STANDARD_MAP) {
    const m = pattern.exec(combined);
    if (m) {
      return SectorDetectionSchema.parse({
        sector,
        confidence: 0.9,
        method: "standard_reference",
        evidence: `Referenced standard "${m[0]}" implies ${sector}`,
      });
    }
  }
  return null;
}

// --- Public Function ---
// Priority: client_lookup → content_keywords → standard_reference → general

export function detectSector(
  clientName: string,
  rfpText?: string,
  referencedStandards?: string[]
): SectorDetection {
  const byClient = clientLookup(clientName);
  if (byClient) return byClient;

  if (rfpText) {
    const byKeywords = contentKeywords(rfpText);
    if (byKeywords) return byKeywords;
  }

  if (referencedStandards?.length) {
    const byStandard = standardReference(referencedStandards);
    if (byStandard) return byStandard;
  }

  return SectorDetectionSchema.parse({
    sector: "general",
    confidence: 0.3,
    method: "content_keywords",
    evidence: "No sector-specific signals found",
  });
}
