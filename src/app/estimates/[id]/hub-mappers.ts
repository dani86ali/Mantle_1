import type { IntakeMode, EngineId, CheckpointStatus } from "@/coordinator/types";

export type StageState = "not_started" | "processing" | "needs_review" | "approved";

export interface StageView {
  engine: EngineId;
  label: string;
  detail: string;
  state: StageState;
}

export interface CheckpointView {
  id: string;
  engine: EngineId;
  label: string;
  status: CheckpointStatus | "not_started";
  revisionsUsed: number;
  href: string;
}

export interface SummaryView {
  requirementsCount: number | null;
  riskFlagsCritical: number | null;
  bomLines: number | null;
  grandTotalIncVat: number | null;
  marginPct: number | null;
}

export interface PipelineLike {
  id: string;
  mode: IntakeMode;
  currentEngine: EngineId;
  checkpoints: Array<{
    id: string;
    engine: EngineId;
    label: string;
    status: CheckpointStatus;
    revisionsUsed: number;
  }>;
}

export interface NavItem {
  label: string;
  href: string;
  state: StageState;
}

export interface ApiResponse {
  estimate: {
    id: string;
    estimateId?: string;
    customerName?: string;
    status?: string;
    createdAt?: string;
  };
  e1: { requirements?: unknown[]; riskFlags?: Array<{ severity?: string }> } | null;
  e2: { bom?: unknown[]; totals?: { grandTotalIncVat?: number } | null } | null;
  e3: { margin?: { grossMarginPct?: number } } | null;
  pipeline: PipelineLike | null;
}

export interface HubData {
  estimateId: string;
  rawId: string;
  customerName: string;
  status: string;
  createdAt: string;
  mode: IntakeMode;
  pipeline: PipelineLike | null;
  summary: SummaryView;
}

const STAGES_RFP: Array<{ engine: EngineId; label: string }> = [
  { engine: "e1", label: "Analyzing RFP" },
  { engine: "e2", label: "Building BoM" },
  { engine: "e3", label: "Generating Proposal" },
];

const STAGES_QUICK: Array<{ engine: EngineId; label: string }> = [
  { engine: "e2", label: "Building BoM" },
  { engine: "e3", label: "Generating Proposal" },
];

const CHECKPOINT_DEFS: { id: string; engine: EngineId; label: string; href: string }[] = [
  { id: "e1-requirements", engine: "e1", label: "Requirements Review", href: "/checkpoint" },
  { id: "e1-compliance", engine: "e1", label: "Compliance Matrix", href: "/compliance" },
  { id: "e2-sku-confirmation", engine: "e2", label: "SKU Confirmation", href: "/bom" },
  { id: "e2-pricing-review", engine: "e2", label: "Pricing Review", href: "/bom" },
  { id: "e3-proposal", engine: "e3", label: "Proposal Review", href: "/proposal" },
];

function engineState(pipeline: PipelineLike | null, engine: EngineId): StageState {
  const cps = pipeline?.checkpoints.filter((c) => c.engine === engine) ?? [];
  const needs = cps.filter((c) => c.status === "pending" || c.status === "revision_requested");
  if (cps.length > 0 && cps.every((c) => c.status === "approved")) return "approved";
  if (needs.length > 0) return "needs_review";
  if (pipeline?.currentEngine === engine && cps.length === 0) return "processing";
  return "not_started";
}

function checkpointState(pipeline: PipelineLike | null, cpId: string): StageState {
  const cp = pipeline?.checkpoints.find((c) => c.id === cpId);
  if (!cp) return "not_started";
  if (cp.status === "approved") return "approved";
  if (cp.status === "pending" || cp.status === "revision_requested") return "needs_review";
  return "not_started";
}

export function buildStages(pipeline: PipelineLike | null, mode: IntakeMode): StageView[] {
  const base = mode === "quick_bom" ? STAGES_QUICK : STAGES_RFP;
  return base.map((s) => {
    const cps = pipeline?.checkpoints.filter((c) => c.engine === s.engine) ?? [];
    const needs = cps.filter((c) => c.status === "pending" || c.status === "revision_requested");
    const state = engineState(pipeline, s.engine);
    let detail = "Not started";
    if (state === "approved") detail = "Approved";
    else if (state === "needs_review")
      detail = `${needs.length} item${needs.length === 1 ? "" : "s"} need review`;
    else if (state === "processing") detail = "Processing...";
    return { engine: s.engine, label: s.label, state, detail };
  });
}

export function buildCheckpoints(
  pipeline: PipelineLike | null,
  mode: IntakeMode,
  estimateId: string
): CheckpointView[] {
  const defs = mode === "quick_bom" ? CHECKPOINT_DEFS.filter((d) => d.engine !== "e1") : CHECKPOINT_DEFS;
  return defs.map((d) => {
    const live = pipeline?.checkpoints.find((c) => c.id === d.id);
    return {
      id: d.id,
      engine: d.engine,
      label: d.label,
      status: live?.status ?? "not_started",
      revisionsUsed: live?.revisionsUsed ?? 0,
      href: `/estimates/${estimateId}${d.href}`,
    };
  });
}

export function buildNavItems(
  estimateId: string,
  pipeline: PipelineLike | null,
  mode: IntakeMode,
  estimateStatus: string
): NavItem[] {
  const base = `/estimates/${estimateId}`;
  const items: NavItem[] = [{ label: "Overview", href: base, state: "not_started" }];
  if (mode === "rfi") {
    items.push(
      { label: "Questionnaire", href: `${base}/questionnaire`, state: checkpointState(pipeline, "e4-questionnaire") },
      { label: "Responses", href: `${base}/responses`, state: checkpointState(pipeline, "e4-requirements") },
      { label: "Design", href: `${base}/design`, state: engineState(pipeline, "e5") }
    );
  } else if (mode !== "quick_bom") {
    items.push(
      { label: "Requirements", href: `${base}/checkpoint`, state: checkpointState(pipeline, "e1-requirements") },
      { label: "Compliance", href: `${base}/compliance`, state: checkpointState(pipeline, "e1-compliance") },
      { label: "Clarifications", href: `${base}/clarifications`, state: "not_started" }
    );
  }
  items.push(
    { label: "Pricing", href: `${base}/pricing`, state: engineState(pipeline, "e2") },
    { label: "BoM Review", href: `${base}/bom`, state: checkpointState(pipeline, "e2-sku-confirmation") },
    { label: "Proposal", href: `${base}/proposal`, state: checkpointState(pipeline, "e3-proposal") },
    { label: "Margin Review", href: `${base}/margin`, state: engineState(pipeline, "e3") },
    { label: "Export", href: `${base}/export`, state: estimateStatus === "APPROVED" ? "approved" : "not_started" }
  );
  return items;
}

export function toHubData(json: ApiResponse, fallbackId: string): HubData {
  const mode: IntakeMode = json.pipeline?.mode ?? "rfp";
  const critical = (json.e1?.riskFlags ?? []).filter(
    (r) => r?.severity === "critical" || r?.severity === "high"
  ).length;
  return {
    rawId: fallbackId,
    estimateId: json.estimate.estimateId ?? fallbackId.slice(0, 12).toUpperCase(),
    customerName: json.estimate.customerName ?? "Unknown customer",
    status: json.estimate.status ?? "DRAFT",
    createdAt: json.estimate.createdAt ?? new Date().toISOString(),
    mode,
    pipeline: json.pipeline,
    summary: {
      requirementsCount: json.e1?.requirements?.length ?? null,
      riskFlagsCritical: json.e1?.riskFlags ? critical : null,
      bomLines: json.e2?.bom?.length ?? null,
      grandTotalIncVat: json.e2?.totals?.grandTotalIncVat ?? null,
      marginPct: json.e3?.margin?.grossMarginPct ?? null,
    },
  };
}

export function anyStageProcessing(data: HubData): boolean {
  return buildStages(data.pipeline, data.mode).some((s) => s.state === "processing");
}
