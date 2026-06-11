import type {
  ProjectMode,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";
import type { ProjectListStatus } from "@/lib/db/project-store";

export interface ProjectRow {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  status: ProjectListStatus;
  activeStageId?: ProjectStageId;
  activeStageStatus?: ProjectStageStatus;
  stageCounts: {
    total: number;
    approved: number;
    needsReview: number;
    inProgress: number;
    blocked: number;
    rejected: number;
  };
  /** Soft archive timestamp (QBM-LOG-006); absent when active. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type LifecycleStage =
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "failed";

export interface ActivityEntry {
  id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  stageId?: ProjectStageId;
  stageLabel: string;
  state: "completed" | "running" | "failed" | "awaiting_review";
  timestamp: string;
}

const STAGE_LABELS: Record<ProjectStageId, string> = {
  intake_package_review: "Intake Package Review",
  boq_format_validation: "BoQ Format Validation",
  sku_resolution: "SKU Resolution",
  configuration_expansion_review: "Configuration Expansion Review",
  requirements_baseline_review: "Requirements Baseline Review",
  compliance_matrix_review: "Compliance Matrix Review",
  hld_design_delta_review: "HLD / Design Delta Review",
  boq_pricing_review: "BoQ Pricing Review",
  proposal_review: "Proposal Review",
  export_approval: "Export Approval",
};

export function projectLink(row: Pick<ProjectRow, "id" | "mode">): string {
  return row.mode === "quick_bom" ? `/projects/${row.id}/quick-bom` : `/projects/${row.id}`;
}

export function modeLabel(mode: ProjectMode): string {
  return mode === "quick_bom" ? "Quick BoM" : "RFP";
}

export function stageLabel(stageId?: ProjectStageId): string {
  return stageId ? STAGE_LABELS[stageId] : "Project";
}

export function lifecycleStage(status: ProjectListStatus): LifecycleStage {
  if (status === "approved") return "approved";
  if (status === "needs_review") return "ready_for_review";
  if (status === "rejected" || status === "blocked") return "failed";
  return "in_progress";
}

export function statusLabel(status: ProjectListStatus): string {
  const map: Record<ProjectListStatus, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    needs_review: "Needs Review",
    approved: "Approved",
    rejected: "Rejected",
    blocked: "Blocked",
  };
  return map[status];
}

export type StageProgressState = "pending" | "running" | "done" | "failed";

export interface ProjectProgress {
  completed: number;
  total: number;
  state: StageProgressState;
}

export function projectProgress(row: ProjectRow): ProjectProgress {
  const { total, approved } = row.stageCounts;
  if (row.status === "approved") return { completed: total, total, state: "done" };
  if (row.status === "rejected" || row.status === "blocked") {
    return { completed: approved, total, state: "failed" };
  }
  if (row.status === "not_started") return { completed: approved, total, state: "pending" };
  return { completed: approved, total, state: "running" };
}

export function buildActivityFeed(rows: ProjectRow[]): ActivityEntry[] {
  return [...rows]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 8)
    .map((row) => {
      const stage = lifecycleStage(row.status);
      return {
        id: `${row.id}-${row.status}`,
        projectId: row.id,
        projectName: row.name,
        customerName: row.customerName ?? "No customer",
        stageId: row.activeStageId,
        stageLabel: stageLabel(row.activeStageId),
        state:
          stage === "approved"
            ? "completed"
            : stage === "ready_for_review"
            ? "awaiting_review"
            : stage === "failed"
            ? "failed"
            : "running",
        timestamp: row.updatedAt,
      };
    });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
