/**
 * Narrow Project-domain service: turn one existing `normalized_boq` artifact
 * into a versioned `sku_resolution` artifact for the Quick BoM `sku_resolution`
 * stage. Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8, 13, 15).
 *
 * This module only COMPOSES two narrow primitives: the artifact repository
 * (read one source artifact, persist one new version) and the pure SKU
 * resolution draft helper (exact + normalized catalog suggestions). It does NO
 * pricing, fuzzy/AI matching, SKU acceptance/rejection, approvals, staleness
 * propagation, stage-status updates, or evidence creation - those belong to
 * later prompts. It never sets acceptedSku/decidedBy/decidedAt (the draft does
 * not either), imports no engines, schema, AI, or API/UI code, and never mutates
 * its input, the source artifact, its source arrays, the source payload lines,
 * or the draft decisions.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  buildSkuResolutionDraft,
  type SkuResolutionDraft,
  type SkuResolutionDraftSummary,
} from "@/lib/projects/sku-resolution";
import type {
  CanonicalBoqLine,
  ProjectArtifact,
  SkuResolutionDecision,
} from "@/types/project";

/** Thrown when the (tenant, project, id) triple resolves to no recorded artifact. */
const MISSING_ARTIFACT_MESSAGE = "Normalized BoQ artifact not found.";

/** Thrown when the source artifact's type is not `normalized_boq`. */
const WRONG_TYPE_MESSAGE = "Artifact is not a normalized_boq artifact.";

/** Thrown when the source artifact payload has no `lines` array. */
const INVALID_PAYLOAD_MESSAGE = "Normalized BoQ artifact payload is invalid.";

/**
 * JSONB payload stored on the `sku_resolution` artifact. Declared as a type
 * alias (not an interface) so it carries an implicit index signature and is
 * assignable to the repository's `Record<string, unknown>` payload. Holds only
 * human-reviewable draft decisions and counts: no pricing fields and no accepted
 * SKUs - every decision stays `needs_review`/`unresolved` until a human decides.
 */
export type SkuResolutionArtifactPayload = {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  /** Copied from the source `normalized_boq` artifact's `sourceFileIds`. */
  sourceFileIds: string[];
  lineCount: number;
  decisions: SkuResolutionDecision[];
  summary: SkuResolutionDraftSummary;
};

/** Input for {@link createSkuResolutionArtifact}. */
export interface CreateSkuResolutionArtifactInput {
  tenantId: string;
  projectId: string;
  normalizedBoqArtifactId: string;
}

/** The created artifact, the source artifact, and the exact payload created with. */
export interface CreateSkuResolutionArtifactResult {
  artifact: ProjectArtifact;
  sourceArtifact: ProjectArtifact;
  payload: SkuResolutionArtifactPayload;
}

/**
 * Build the `sku_resolution` payload from a source `normalized_boq` artifact and
 * a draft. Pure: copies the source `sourceFileIds` array (so the payload never
 * aliases the source artifact) and passes the draft's decisions/summary through.
 * Never includes pricing fields or accepted SKUs. Does not mutate its inputs.
 */
export function buildSkuResolutionArtifactPayload(
  normalizedBoqArtifact: ProjectArtifact,
  draft: SkuResolutionDraft
): SkuResolutionArtifactPayload {
  return {
    sourceNormalizedBoqArtifactId: normalizedBoqArtifact.id,
    sourceNormalizedBoqArtifactVersion: normalizedBoqArtifact.version,
    sourceFileIds: [...normalizedBoqArtifact.sourceFileIds],
    lineCount: draft.decisions.length,
    decisions: draft.decisions,
    summary: draft.summary,
  };
}

/**
 * Create a `sku_resolution` artifact version from one existing `normalized_boq`
 * artifact. Loads the source artifact (throwing the exact missing/wrong-type/
 * invalid-payload messages), builds a human-reviewable SKU resolution draft from
 * its canonical lines, and creates exactly one artifact in the `sku_resolution`
 * stage with `status: "needs_review"`, sourced from the same files and the source
 * artifact id. Returns the created artifact, the source artifact, and the payload.
 * Does not mutate input, the source artifact, its arrays, or the source lines.
 */
export async function createSkuResolutionArtifact(
  input: CreateSkuResolutionArtifactInput
): Promise<CreateSkuResolutionArtifactResult> {
  const { tenantId, projectId, normalizedBoqArtifactId } = input;

  const sourceArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    normalizedBoqArtifactId
  );
  if (!sourceArtifact) throw new Error(MISSING_ARTIFACT_MESSAGE);
  if (sourceArtifact.type !== "normalized_boq") {
    throw new Error(WRONG_TYPE_MESSAGE);
  }

  const lines = sourceArtifact.payload.lines;
  if (!Array.isArray(lines)) throw new Error(INVALID_PAYLOAD_MESSAGE);

  const draft = buildSkuResolutionDraft({ lines: lines as CanonicalBoqLine[] });
  const payload = buildSkuResolutionArtifactPayload(sourceArtifact, draft);

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    payload,
    sourceFileIds: [...sourceArtifact.sourceFileIds],
    sourceArtifactIds: [sourceArtifact.id],
  });

  return { artifact, sourceArtifact, payload };
}
