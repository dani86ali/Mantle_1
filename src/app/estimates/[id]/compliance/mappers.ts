import type { ApiResponse, HubData } from "../hub-mappers";
import { toHubData } from "../hub-mappers";
import type {
  EditableRow,
  CoverageGapView,
  OrphanView,
  Status,
} from "./sections";

export interface PageData {
  hub: HubData;
  pipelineId: string | null;
  rows: EditableRow[];
  gaps: { coverageGaps: CoverageGapView[]; orphans: OrphanView[] };
  frameworkIds: string[];
}

interface RawRow {
  requirementId?: string;
  requirementText?: string;
  classification?: string;
  frameworkId?: string;
  controlId?: string;
  controlName?: string;
  status?: string;
  notes?: string;
  tpSection?: string;
}

interface RawGap {
  frameworkId?: string;
  controlId?: string;
  controlName?: string;
}

interface RawOrphan {
  requirementId?: string;
  requirementText?: string;
}

interface RawMatrix {
  rows?: RawRow[];
  gaps?: { coverageGaps?: RawGap[]; orphanRequirements?: RawOrphan[] };
}

const VALID_STATUSES: Status[] = [
  "Compliant",
  "Partially Compliant",
  "Non-Compliant",
  "Alternative Proposed",
];

function normalizeStatus(s: string | undefined): Status {
  return VALID_STATUSES.includes(s as Status)
    ? (s as Status)
    : "Partially Compliant";
}

export function toPageData(
  json: ApiResponse & { e1?: { complianceMatrix?: RawMatrix } | null },
  fallbackId: string,
): PageData {
  const hub = toHubData(json, fallbackId);
  const matrix: RawMatrix = json.e1?.complianceMatrix ?? {};
  const rawRows = matrix.rows ?? [];

  const rows: EditableRow[] = rawRows.map((r) => {
    const requirementId = r.requirementId ?? "";
    const frameworkId = r.frameworkId ?? "";
    const controlId = r.controlId ?? "";
    return {
      key: `${requirementId}#${frameworkId}#${controlId}`,
      requirementId,
      requirementText: r.requirementText ?? "",
      classification: r.classification ?? "Functional",
      frameworkId,
      controlId,
      controlName: r.controlName ?? "",
      status: normalizeStatus(r.status),
      notes: r.notes ?? "",
      tpSection: r.tpSection ?? "",
    };
  });

  const coverageGaps: CoverageGapView[] = (matrix.gaps?.coverageGaps ?? []).map(
    (g) => ({
      frameworkId: g.frameworkId ?? "",
      controlId: g.controlId ?? "",
      controlName: g.controlName ?? "",
      message: "No requirement matched this control during keyword analysis.",
    }),
  );
  const orphans: OrphanView[] = (matrix.gaps?.orphanRequirements ?? []).map(
    (o) => ({
      requirementId: o.requirementId ?? "",
      requirementText: o.requirementText ?? "",
      reason: "No matching control found in the selected frameworks.",
    }),
  );

  const frameworkIds = Array.from(new Set(rows.map((r) => r.frameworkId)))
    .filter(Boolean)
    .sort();

  return {
    hub,
    pipelineId: json.pipeline?.id ?? null,
    rows,
    gaps: { coverageGaps, orphans },
    frameworkIds,
  };
}
