/**
 * Tenant-scoped FINAL HLD authority REGENERATION GUARD (Stage 6H-0I-C).
 *
 * A small shared boundary that HLD generation/rebuild mutation services consult
 * AFTER their own project-existence / RFP-mode checks and BEFORE any expensive
 * readiness/executor work, artifact creation, or rebuild-request retirement. It
 * asks the Stage 6H-0I-B selector whether an approved, source-valid FINAL HLD
 * document authority already exists - either an SE-approved generated HLD document or
 * an SE manual draw.io upload; if so, callers must stop and write nothing so an
 * approved final HLD is never silently regenerated (in particular, never over an
 * approved manual upload).
 *
 * It blocks ONLY when the selector returns `status: "ok"` (an approved, re-proved
 * final `hld_document`). It deliberately does NOT block on `not_finalized`,
 * `manual_upload_pending_review`, `stale_final_authority`, `not_found`, or
 * `wrong_mode`; the caller's existing project/mode/readiness gates still own those
 * outcomes. The block carries ONLY the selector's already-sanitized project,
 * artifact, and lean payload summaries (drawio XML is exposed only as a length) and
 * NEVER the full validated payload or the draw.io XML body.
 *
 * It imports only the read-only final-authority selector. It performs no approval
 * mutation, constructs no provider/AI adapter, reads no raw file/parser, makes no
 * pricing/SKU/catalog/configuration decision, and imports no route/UI module.
 */
import {
  selectRfpHldFinalAuthority,
  type RfpHldFinalAuthorityArtifactSummary,
  type RfpHldFinalAuthorityPayloadSummary,
  type RfpHldFinalAuthorityProjectSummary,
  type SelectRfpHldFinalAuthorityInput,
  type SelectRfpHldFinalAuthorityResult,
} from "@/lib/projects/project-rfp-hld-document-final-authority";

/** The selector's `ok` branch, the only state this guard blocks on. */
type SelectRfpHldFinalAuthorityOkResult = Extract<
  SelectRfpHldFinalAuthorityResult,
  { status: "ok" }
>;

/**
 * Sanitized final-authority summary handed to blocked callers. It carries only the
 * selector's lean project/artifact/payload summaries and the final-authority status
 * literal - never the full validated payload or the draw.io XML body.
 */
export interface RfpHldFinalAuthorityRegenerationSummary {
  project: RfpHldFinalAuthorityProjectSummary;
  artifact: RfpHldFinalAuthorityArtifactSummary;
  payloadSummary: RfpHldFinalAuthorityPayloadSummary;
  finalAuthorityStatus: SelectRfpHldFinalAuthorityOkResult["authority"]["finalAuthorityStatus"];
}

export type RfpHldFinalAuthorityRegenerationGuardResult =
  | { blocked: false }
  | { blocked: true; finalAuthority: RfpHldFinalAuthorityRegenerationSummary };

export type RfpHldFinalAuthorityRegenerationGuardInput =
  SelectRfpHldFinalAuthorityInput;

/**
 * Evaluate the FINAL HLD regeneration guard for an RFP project, tenant-scoped. Runs
 * the read-only final-authority selector and blocks ONLY on its `ok` state,
 * returning a sanitized summary drawn from the selector's lean projections; every
 * other selector status (including not_finalized / pending / stale / not_found /
 * wrong_mode) is a pass-through `{ blocked: false }` so the caller's own gates keep
 * ownership. It never touches the selector's full validated payload, so the draw.io
 * XML body never crosses this boundary.
 */
export async function evaluateRfpHldFinalAuthorityRegenerationGuard(
  input: RfpHldFinalAuthorityRegenerationGuardInput
): Promise<RfpHldFinalAuthorityRegenerationGuardResult> {
  const selection = await selectRfpHldFinalAuthority(input);
  if (selection.status !== "ok") {
    return { blocked: false };
  }
  return {
    blocked: true,
    finalAuthority: {
      project: selection.project,
      artifact: selection.authority.artifact,
      payloadSummary: selection.authority.payloadSummary,
      finalAuthorityStatus: selection.authority.finalAuthorityStatus,
    },
  };
}
