export type FileType =
  | "technical"
  | "commercial"
  | "legal"
  | "administrative"
  | "compliance"
  | "unknown";

export type Classification = "mandatory" | "optional" | "conditional";

export type RiskCategory = "disqualification" | "discretionary" | "breach";
export type RiskSeverity = "critical" | "high" | "medium";

export type DocSeverity = "critical" | "high" | "medium" | "low";

export type VendorStatus = "required" | "preferred" | "or_equivalent";

export type EvalMethodology =
  | "sequential_envelope"
  | "weighted_score"
  | "pass_fail"
  | "best_value"
  | "unknown";

export interface ClassifiedFile {
  filename: string;
  path: string;
  type: FileType;
  subtype: string;
  confidence: number;
  format: string;
}

export interface RequirementRow {
  id: string;
  text: string;
  classification: Classification;
  confidence: number;
  sourceFile: string;
  indicators: string[];
}

export interface RequirementStats {
  total: number;
  mandatory: number;
  optional: number;
  conditional: number;
}

export interface RiskFlagRow {
  category: RiskCategory;
  pattern: string;
  matchedText: string;
  severity: RiskSeverity;
  source: string;
}

export interface DeadlineRow {
  event: string;
  deadline: string;
  source: string;
  sortKey: number;
}

export interface MissingDocRow {
  referencedDoc: string;
  referencedIn: string;
  pattern: string;
  severity: DocSeverity;
}

export interface EnvelopeRow {
  name: string;
  weight: number;
  passThreshold: number;
}

export interface EvalCriteriaView {
  methodology: EvalMethodology;
  envelopes: EnvelopeRow[];
  passingThreshold: number | null;
  iktvaRequired: boolean;
  source: string;
}

export interface VendorRow {
  vendor: string;
  category: string;
  status: VendorStatus;
  source: string;
  specificModels: string[];
}

export interface SectorView {
  sector: string;
  confidence: number;
  method: string;
  evidence: string;
}
