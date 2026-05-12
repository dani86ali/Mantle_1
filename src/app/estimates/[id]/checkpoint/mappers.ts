import { toHubData, type ApiResponse, type HubData } from "../hub-mappers";
import type {
  ClassifiedFile,
  Classification,
  DeadlineRow,
  EvalCriteriaView,
  EvalMethodology,
  FileType,
  MissingDocRow,
  RequirementRow,
  RequirementStats,
  RiskCategory,
  RiskFlagRow,
  RiskSeverity,
  SectorView,
  VendorRow,
  VendorStatus,
  DocSeverity,
} from "./sections/types";

type Row = Record<string, unknown>;

const FILE_TYPES = ["technical", "commercial", "legal", "administrative", "compliance", "unknown"] as const;
const CLASSIFICATIONS = ["mandatory", "optional", "conditional"] as const;
const RISK_CATS = ["disqualification", "discretionary", "breach"] as const;
const RISK_SEVS = ["critical", "high", "medium"] as const;
const DOC_SEVS = ["critical", "high", "medium", "low"] as const;
const VENDOR_STATUSES = ["required", "preferred", "or_equivalent"] as const;
const METHODOLOGIES = [
  "sequential_envelope", "weighted_score", "pass_fail", "best_value", "unknown",
] as const;

function pick<T extends string>(v: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return typeof v === "string" && (allowed as ReadonlyArray<string>).includes(v)
    ? (v as T) : fallback;
}
const str = (v: unknown, f = "") => (typeof v === "string" ? v : f);
const num = (v: unknown, f = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : f;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

interface E1Shape {
  fileClassifications?: Row[];
  requirements?: Row[];
  riskFlags?: Row[];
  deadlines?: Row[];
  missingDocuments?: Row[];
  evalCriteria?: Row;
  vendorPreferences?: Row[];
  sectorDetection?: Row;
  stats?: Row;
}

export interface CheckpointData {
  hub: HubData;
  pipelineId: string | null;
  files: ClassifiedFile[];
  requirements: RequirementRow[];
  requirementStats: RequirementStats;
  riskFlags: RiskFlagRow[];
  deadlines: DeadlineRow[];
  missingDocs: MissingDocRow[];
  evalCriteria: EvalCriteriaView | null;
  vendorPreferences: VendorRow[];
  sector: SectorView | null;
}

function mapFiles(rows: Row[]): ClassifiedFile[] {
  return rows.map((f) => ({
    filename: str(f.filename, str(f.path)),
    path: str(f.path),
    type: pick<FileType>(f.type, FILE_TYPES, "unknown"),
    subtype: str(f.subtype),
    confidence: num(f.confidence),
    format: str(f.format),
  }));
}

function mapRequirements(rows: Row[]): RequirementRow[] {
  return rows.map((r) => ({
    id: str(r.id),
    text: str(r.text),
    classification: pick<Classification>(r.classification, CLASSIFICATIONS, "optional"),
    confidence: num(r.confidence),
    sourceFile: str(r.sourceFile),
    indicators: strArr(r.indicators),
  }));
}

function mapStats(rows: RequirementRow[], stats: Row | undefined): RequirementStats {
  return {
    total: num(stats?.totalRequirements, rows.length),
    mandatory: num(
      stats?.mandatoryCount,
      rows.filter((r) => r.classification === "mandatory").length,
    ),
    optional: rows.filter((r) => r.classification === "optional").length,
    conditional: rows.filter((r) => r.classification === "conditional").length,
  };
}

function mapRiskFlags(rows: Row[]): RiskFlagRow[] {
  return rows.map((r) => ({
    category: pick<RiskCategory>(r.category, RISK_CATS, "discretionary"),
    pattern: str(r.pattern),
    matchedText: str(r.matchedText),
    severity: pick<RiskSeverity>(r.severity, RISK_SEVS, "medium"),
    source: str(r.source),
  }));
}

function mapDeadlines(rows: Row[]): DeadlineRow[] {
  return rows
    .map((d) => {
      const deadline = str(d.deadline);
      const parsed = Date.parse(deadline);
      return {
        event: str(d.event),
        deadline,
        source: str(d.source),
        sortKey: Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

function mapMissingDocs(rows: Row[]): MissingDocRow[] {
  return rows.map((d) => ({
    referencedDoc: str(d.referencedDoc),
    referencedIn: str(d.referencedIn),
    pattern: str(d.pattern),
    severity: pick<DocSeverity>(d.severity, DOC_SEVS, "medium"),
  }));
}

function mapEvalCriteria(raw: Row | undefined): EvalCriteriaView | null {
  if (!raw) return null;
  const envRaw = Array.isArray(raw.envelopes) ? raw.envelopes : [];
  const envelopes = envRaw
    .filter((e): e is Row => typeof e === "object" && e !== null)
    .map((e) => ({
      name: str(e.name),
      weight: num(e.weight),
      passThreshold: num(e.passThreshold),
    }));
  const t = raw.passingThreshold;
  return {
    methodology: pick<EvalMethodology>(raw.methodology, METHODOLOGIES, "unknown"),
    envelopes,
    passingThreshold: typeof t === "number" ? t : null,
    iktvaRequired: raw.iktvaRequired === true,
    source: str(raw.source),
  };
}

function mapVendors(rows: Row[]): VendorRow[] {
  return rows.map((v) => ({
    vendor: str(v.vendor),
    category: str(v.category),
    status: pick<VendorStatus>(v.status, VENDOR_STATUSES, "or_equivalent"),
    source: str(v.source),
    specificModels: strArr(v.specificModels),
  }));
}

function mapSector(raw: Row | undefined): SectorView | null {
  if (!raw) return null;
  return {
    sector: str(raw.sector, "general"),
    confidence: num(raw.confidence),
    method: str(raw.method),
    evidence: str(raw.evidence),
  };
}

export function toCheckpointData(json: ApiResponse, fallbackId: string): CheckpointData {
  const e1 = (json.e1 as unknown as E1Shape | null) ?? {};
  const requirements = mapRequirements(e1.requirements ?? []);
  return {
    hub: toHubData(json, fallbackId),
    pipelineId: json.pipeline?.id ?? null,
    files: mapFiles(e1.fileClassifications ?? []),
    requirements,
    requirementStats: mapStats(requirements, e1.stats),
    riskFlags: mapRiskFlags(e1.riskFlags ?? []),
    deadlines: mapDeadlines(e1.deadlines ?? []),
    missingDocs: mapMissingDocs(e1.missingDocuments ?? []),
    evalCriteria: mapEvalCriteria(e1.evalCriteria),
    vendorPreferences: mapVendors(e1.vendorPreferences ?? []),
    sector: mapSector(e1.sectorDetection),
  };
}
