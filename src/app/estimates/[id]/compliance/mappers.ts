import type {
  EditableRow,
  CoverageGap,
  OrphanRequirement,
  Status,
} from "./sections";

export interface PageData {
  customerName: string;
  pipelineId: string | null;
  rows: EditableRow[];
  gaps: { coverageGaps: CoverageGap[]; orphans: OrphanRequirement[] };
}

interface RawMatrix {
  rows?: Array<Record<string, unknown>>;
  gaps?: {
    coverageGaps?: Array<Record<string, unknown>>;
    orphanRequirements?: Array<Record<string, unknown>>;
  };
}

export function toPageData(json: {
  estimate: Record<string, unknown>;
  e1?: { complianceMatrix?: RawMatrix } | null;
  pipeline?: { id?: string } | null;
}): PageData {
  const matrix = json.e1?.complianceMatrix ?? {};
  const rawRows = matrix.rows ?? [];
  const rows: EditableRow[] = rawRows.map((r) => {
    const requirementId = (r.requirementId as string) ?? "";
    const frameworkId = (r.frameworkId as string) ?? "";
    const controlId = (r.controlId as string) ?? "";
    return {
      key: `${requirementId}#${frameworkId}#${controlId}`,
      requirementId,
      requirementText: (r.requirementText as string) ?? "",
      frameworkId,
      controlId,
      controlName: (r.controlName as string) ?? "",
      status: ((r.status as string) ?? "Partially Compliant") as Status,
      notes: (r.notes as string) ?? "",
      tpSection: (r.tpSection as string) ?? "",
    };
  });
  const coverageGaps: CoverageGap[] = (matrix.gaps?.coverageGaps ?? []).map((g) => ({
    frameworkId: (g.frameworkId as string) ?? "",
    controlId: (g.controlId as string) ?? "",
    controlName: (g.controlName as string) ?? "",
  }));
  const orphans: OrphanRequirement[] = (matrix.gaps?.orphanRequirements ?? []).map((o) => ({
    requirementId: (o.requirementId as string) ?? "",
    requirementText: (o.requirementText as string) ?? "",
  }));
  return {
    customerName: (json.estimate.customerName as string) ?? "Unknown customer",
    pipelineId: json.pipeline?.id ?? null,
    rows,
    gaps: { coverageGaps, orphans },
  };
}
