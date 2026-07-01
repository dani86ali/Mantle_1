/**
 * Read-only deterministic HLD CLOSE-STATUS gate (Stage 6J-A).
 *
 * Makes the HLD close state explicit for later TP handoff, WITHOUT starting any TP
 * work. It derives close status solely from {@link selectRfpHldFinalAuthority}: the
 * approved SE MANUAL draw.io `hld_document` authority is the ONLY basis for a closed
 * HLD. It NEVER falls back to `hld_document_model`, `hld_diagram`, an HLD design model,
 * AI output, or raw files, and human approval / manual final upload remains the
 * runtime/customer authority.
 *
 * This gate generates, regenerates, approves, exports, downloads, or closes nothing;
 * creates no artifact/approval; calls no provider/AI; reads no raw source file; and
 * makes no pricing/SKU/catalog/configuration decision. It calls the selector exactly
 * once and maps its result through: not_found -> not_found, wrong_mode -> wrong_mode,
 * not_finalized -> blocked/not_closed, stale_final_authority -> blocked/
 * stale_final_authority, ok -> closed. Closed carries the sanitized final-authority
 * summary only - never the selector payload or draw.io XML - and blocked results never
 * carry a payload or draw.io XML either.
 *
 * This service imports only the final-authority selector/types and mutates nothing.
 */
import {
  selectRfpHldFinalAuthority,
  type RfpHldFinalAuthorityProjectSummary,
  type RfpHldFinalAuthorityArtifactSummary,
  type RfpHldFinalAuthorityPayloadSummary,
  type RfpHldFinalAuthorityNotFinalizedCode,
  type RfpHldFinalAuthorityStaleCode,
  type RFP_HLD_FINAL_AUTHORITY_STATUS,
} from "@/lib/projects/project-rfp-hld-document-final-authority";

/** Stable close-status string once an approved final HLD authority exists. */
export const RFP_HLD_CLOSE_STATUS = "hld_closed_on_final_authority" as const;

/** Stable close-kind: the only recognised basis is an approved manual draw.io upload. */
export const RFP_HLD_CLOSE_KIND = "approved_manual_drawio_upload_final" as const;

export interface GetRfpHldCloseStatusInput {
  tenantId: string;
  projectId: string;
}

/** Lean, sanitized final-authority summary. NEVER the payload / draw.io body. */
export interface RfpHldCloseFinalAuthoritySummary {
  artifact: RfpHldFinalAuthorityArtifactSummary;
  payloadSummary: RfpHldFinalAuthorityPayloadSummary;
  finalAuthorityStatus: typeof RFP_HLD_FINAL_AUTHORITY_STATUS;
}

export type GetRfpHldCloseStatusResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldFinalAuthorityProjectSummary }
  | {
      status: "blocked";
      blocker: "not_closed";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityNotFinalizedCode;
      latestArtifact?: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "blocked";
      blocker: "stale_final_authority";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityStaleCode;
      artifact: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "closed";
      project: RfpHldFinalAuthorityProjectSummary;
      closeStatus: typeof RFP_HLD_CLOSE_STATUS;
      closeKind: typeof RFP_HLD_CLOSE_KIND;
      /** Derived from the selected final-authority artifact updatedAt. */
      closedAt: string;
      /** Sanitized authority summary; NEVER the full payload / draw.io body. */
      finalAuthority: RfpHldCloseFinalAuthoritySummary;
    };

/**
 * Compute the deterministic HLD close status for an RFP project, tenant scoped. All
 * gating (project existence, rfp mode, final approval, payload/source-chain re-proof)
 * is delegated to {@link selectRfpHldFinalAuthority}, called exactly once. Non-ok
 * selector states map to fail-closed not_found / wrong_mode / blocked results, and the
 * ok state maps to a closed result whose closedAt is the selected final-authority
 * artifact updatedAt. It never exposes the selector payload or draw.io XML, mutates
 * nothing, and is read-only.
 */
export async function getRfpHldCloseStatus(
  input: GetRfpHldCloseStatusInput
): Promise<GetRfpHldCloseStatusResult> {
  const { tenantId, projectId } = input;

  const result = await selectRfpHldFinalAuthority({ tenantId, projectId });

  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "wrong_mode") {
    return { status: "wrong_mode", project: result.project };
  }
  if (result.status === "not_finalized") {
    return {
      status: "blocked",
      blocker: "not_closed",
      project: result.project,
      blockerCode: result.blockerCode,
      ...(result.latestArtifact !== undefined
        ? { latestArtifact: result.latestArtifact }
        : {}),
    };
  }
  if (result.status === "stale_final_authority") {
    return {
      status: "blocked",
      blocker: "stale_final_authority",
      project: result.project,
      blockerCode: result.blockerCode,
      artifact: result.artifact,
    };
  }

  return {
    status: "closed",
    project: result.project,
    closeStatus: RFP_HLD_CLOSE_STATUS,
    closeKind: RFP_HLD_CLOSE_KIND,
    closedAt: result.authority.artifact.updatedAt,
    finalAuthority: result.authority,
  };
}
