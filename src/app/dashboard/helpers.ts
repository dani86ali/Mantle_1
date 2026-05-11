/** Dashboard helpers — status mapping and pipeline-progress derivation. */

export type RawStatus = string;

export type LifecycleStage =
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "failed";

export interface EstimateRow {
  id: string;
  estimateId: string;
  customer: string;
  domain: string;
  status: RawStatus;
  created: string;
  totalPrice: number;
}

export interface ActivityEntry {
  id: string;
  estimateId: string;
  estimateLinkId: string;
  customer: string;
  engine: "E1" | "E2" | "E3";
  engineLabel: string;
  state: "completed" | "running" | "failed" | "awaiting_review";
  timestamp: string;
}

const IN_PROGRESS = new Set([
  "PENDING",
  "PROCESSING",
  "AGENT_PROCESSING",
  "NEEDS_CLARIFICATION",
]);
const REVIEW = new Set(["READY_FOR_REVIEW", "IN_REVIEW", "COMPLETED"]);
const FAILED = new Set(["AGENT_FAILED", "AGENT_TIMEOUT", "REJECTED"]);

export function lifecycleStage(status: RawStatus): LifecycleStage {
  if (status === "APPROVED") return "approved";
  if (REVIEW.has(status)) return "ready_for_review";
  if (FAILED.has(status)) return "failed";
  if (IN_PROGRESS.has(status)) return "in_progress";
  return "in_progress";
}

export function statusLabel(status: RawStatus): string {
  const map: Record<string, string> = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    AGENT_PROCESSING: "Processing",
    NEEDS_CLARIFICATION: "Needs Info",
    READY_FOR_REVIEW: "Ready for Review",
    IN_REVIEW: "In Review",
    COMPLETED: "Ready for Review",
    APPROVED: "Approved",
    AGENT_FAILED: "Failed",
    AGENT_TIMEOUT: "Timed Out",
    REJECTED: "Rejected",
  };
  return map[status] ?? "Draft";
}

export type EngineState = "pending" | "running" | "done" | "failed";

export interface PipelineProgress {
  e1: EngineState;
  e2: EngineState;
  e3: EngineState;
}

/**
 * Derive a 3-stage pipeline view from the bom_draft status. Since a bom_draft
 * row implies E1 produced enough requirements for E2 to start, we mark E1 as
 * done once we see anything past PENDING. APPROVED implies the post-review
 * E3 stage is done as well.
 */
export function pipelineProgress(status: RawStatus): PipelineProgress {
  if (status === "APPROVED") return { e1: "done", e2: "done", e3: "done" };
  if (REVIEW.has(status)) {
    return { e1: "done", e2: "done", e3: "pending" };
  }
  if (status === "AGENT_PROCESSING" || status === "PROCESSING") {
    return { e1: "done", e2: "running", e3: "pending" };
  }
  if (FAILED.has(status)) {
    return { e1: "done", e2: "failed", e3: "pending" };
  }
  return { e1: "running", e2: "pending", e3: "pending" };
}

/** Build a synthetic activity feed from recent estimate rows. */
export function buildActivityFeed(rows: EstimateRow[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const r of rows) {
    const stage = lifecycleStage(r.status);
    const linkId = r.id;
    const display = r.estimateId;
    if (stage === "approved") {
      out.push({
        id: `${r.id}-approved`,
        estimateId: display,
        estimateLinkId: linkId,
        customer: r.customer,
        engine: "E3",
        engineLabel: "Review & Approval",
        state: "completed",
        timestamp: r.created,
      });
    } else if (stage === "ready_for_review") {
      out.push({
        id: `${r.id}-review`,
        estimateId: display,
        estimateLinkId: linkId,
        customer: r.customer,
        engine: "E2",
        engineLabel: "BoM Engine",
        state: "awaiting_review",
        timestamp: r.created,
      });
    } else if (stage === "failed") {
      out.push({
        id: `${r.id}-failed`,
        estimateId: display,
        estimateLinkId: linkId,
        customer: r.customer,
        engine: "E2",
        engineLabel: "BoM Engine",
        state: "failed",
        timestamp: r.created,
      });
    } else {
      const prog = pipelineProgress(r.status);
      const engine: "E1" | "E2" = prog.e2 === "running" ? "E2" : "E1";
      out.push({
        id: `${r.id}-running`,
        estimateId: display,
        estimateLinkId: linkId,
        customer: r.customer,
        engine,
        engineLabel: engine === "E2" ? "BoM Engine" : "Compliance Engine",
        state: "running",
        timestamp: r.created,
      });
    }
  }
  return out
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 8);
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
