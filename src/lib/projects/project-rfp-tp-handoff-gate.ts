/**
 * Read-only deterministic TP HANDOFF gate (Stage TP-H0).
 *
 * Decides whether technical-proposal (TP) work may begin, WITHOUT starting any TP
 * work. TP handoff is a stretch gate that opens ONLY once the HLD is closed: the sole
 * ready path is a closed HLD reported by {@link getRfpHldCloseStatus}, which itself
 * derives close state from the approved final SE manual draw.io `hld_document`
 * authority. Every non-closed upstream HLD state - draft, pending SE review, pending
 * manual upload, stale final authority, or an AI/provider-blocked upstream - keeps this
 * gate blocked, because only the closed close-status result maps to ready.
 *
 * This gate generates no TP/proposal content, creates no technical_proposal artifact or
 * approval, inspects no pricing/commercial authority, and starts no TP generation. It
 * calls {@link getRfpHldCloseStatus} exactly once and derives the handoff state solely
 * from that result: not_found -> not_found, wrong_mode -> wrong_mode, blocked/not_closed
 * -> blocked (hld_not_closed / hld_manual_upload_pending_review), blocked/
 * stale_final_authority -> blocked (hld_final_authority_stale), closed -> ready. Ready
 * carries only a sanitized hldClose summary; neither ready nor blocked results ever
 * expose the HLD document payload or draw.io XML.
 *
 * This service imports only the close-status service/types/constants and mutates
 * nothing. It reads no store/route/approval/upload/download/provider/AI/catalog/pricing/
 * SKU/config module, no raw source file, and no Next.js primitive.
 */
import {
  getRfpHldCloseStatus,
  RFP_HLD_CLOSE_STATUS,
  RFP_HLD_CLOSE_KIND,
  type GetRfpHldCloseStatusResult,
} from "@/lib/projects/project-rfp-hld-close-status";

// The close-status module owns the lean summary shapes; derive them from its result
// union so this gate imports only that one module (no store/final-authority coupling).
type CloseWrongMode = Extract<GetRfpHldCloseStatusResult, { status: "wrong_mode" }>;
type CloseNotClosed = Extract<
  GetRfpHldCloseStatusResult,
  { status: "blocked"; blocker: "not_closed" }
>;
type CloseStale = Extract<
  GetRfpHldCloseStatusResult,
  { status: "blocked"; blocker: "stale_final_authority" }
>;
type CloseClosed = Extract<GetRfpHldCloseStatusResult, { status: "closed" }>;

type RfpTpHandoffProjectSummary = CloseWrongMode["project"];
type RfpTpHandoffArtifactSummary = CloseStale["artifact"];
type CloseNotClosedBlockerCode = CloseNotClosed["blockerCode"];
type CloseStaleBlockerCode = CloseStale["blockerCode"];
type RfpTpHandoffHldCloseFinalAuthority = CloseClosed["finalAuthority"];

/** Stable gate status once a closed HLD makes TP handoff available. */
export const RFP_TP_HANDOFF_GATE_STATUS_READY = "tp_handoff_ready" as const;

/** Stable gate status while any non-closed HLD state blocks TP handoff. */
export const RFP_TP_HANDOFF_GATE_STATUS_BLOCKED = "tp_handoff_blocked" as const;

/** Stable TP-handoff blocker codes, derived from the HLD close blocker. */
export type RfpTpHandoffBlockerCode =
  | "hld_not_closed"
  | "hld_manual_upload_pending_review"
  | "hld_final_authority_stale";

export interface GetRfpTpHandoffGateInput {
  tenantId: string;
  projectId: string;
}

/** Sanitized closed-HLD summary. NEVER the HLD payload / draw.io body. */
export interface RfpTpHandoffHldCloseSummary {
  closeStatus: typeof RFP_HLD_CLOSE_STATUS;
  closeKind: typeof RFP_HLD_CLOSE_KIND;
  closedAt: string;
  finalAuthority: RfpTpHandoffHldCloseFinalAuthority;
}

export type GetRfpTpHandoffGateResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpTpHandoffProjectSummary }
  | {
      status: "blocked";
      gateStatus: typeof RFP_TP_HANDOFF_GATE_STATUS_BLOCKED;
      blockerCode: "hld_not_closed" | "hld_manual_upload_pending_review";
      hldCloseBlockerCode: CloseNotClosedBlockerCode;
      project: RfpTpHandoffProjectSummary;
      latestArtifact?: RfpTpHandoffArtifactSummary;
    }
  | {
      status: "blocked";
      gateStatus: typeof RFP_TP_HANDOFF_GATE_STATUS_BLOCKED;
      blockerCode: "hld_final_authority_stale";
      hldCloseBlockerCode: CloseStaleBlockerCode;
      project: RfpTpHandoffProjectSummary;
      artifact: RfpTpHandoffArtifactSummary;
    }
  | {
      status: "ready";
      gateStatus: typeof RFP_TP_HANDOFF_GATE_STATUS_READY;
      project: RfpTpHandoffProjectSummary;
      hldClose: RfpTpHandoffHldCloseSummary;
    };

/**
 * Compute the deterministic TP handoff gate for an RFP project, tenant scoped. All HLD
 * gating (project existence, rfp mode, final approval, close state) is delegated to
 * {@link getRfpHldCloseStatus}, called exactly once. Only its closed result opens the
 * gate (ready); every other state fails closed to not_found / wrong_mode / blocked. It
 * never exposes the HLD payload or draw.io XML, mutates nothing, and is read-only.
 */
export async function getRfpTpHandoffGate(
  input: GetRfpTpHandoffGateInput
): Promise<GetRfpTpHandoffGateResult> {
  const { tenantId, projectId } = input;

  const close = await getRfpHldCloseStatus({ tenantId, projectId });

  if (close.status === "not_found") return { status: "not_found" };
  if (close.status === "wrong_mode") {
    return { status: "wrong_mode", project: close.project };
  }
  if (close.status === "blocked" && close.blocker === "not_closed") {
    return {
      status: "blocked",
      gateStatus: RFP_TP_HANDOFF_GATE_STATUS_BLOCKED,
      blockerCode:
        close.blockerCode === "manual_upload_pending_review"
          ? "hld_manual_upload_pending_review"
          : "hld_not_closed",
      hldCloseBlockerCode: close.blockerCode,
      project: close.project,
      ...(close.latestArtifact !== undefined
        ? { latestArtifact: close.latestArtifact }
        : {}),
    };
  }
  if (close.status === "blocked" && close.blocker === "stale_final_authority") {
    return {
      status: "blocked",
      gateStatus: RFP_TP_HANDOFF_GATE_STATUS_BLOCKED,
      blockerCode: "hld_final_authority_stale",
      hldCloseBlockerCode: close.blockerCode,
      project: close.project,
      artifact: close.artifact,
    };
  }

  return {
    status: "ready",
    gateStatus: RFP_TP_HANDOFF_GATE_STATUS_READY,
    project: close.project,
    hldClose: {
      closeStatus: close.closeStatus,
      closeKind: close.closeKind,
      closedAt: close.closedAt,
      finalAuthority: close.finalAuthority,
    },
  };
}
