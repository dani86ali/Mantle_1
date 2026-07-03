/**
 * Read-only RFP SKU resolution review projection (Prompt 127): load ONE
 * `sku_resolution` artifact and project a lean, serializable line-review view for
 * the workspace UI. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8).
 *
 * This loader is a pure read model. It verifies the Project (not_found /
 * wrong_mode) and the exact artifact (sku_resolution_not_found /
 * artifact_not_sku_resolution / invalid_sku_resolution_payload) within the input
 * tenant, then ALLOWLIST-projects the stored payload into review lines. It never
 * persists, never auto-accepts/rejects, creates no approval, and imports no
 * artifact-write helper, approval store, pricing, configuration expansion, export,
 * runner, AI, catalog, engine, coordinator, or adapter. It exposes only the fields
 * an engineer needs to choose accept/reject per line: no full payload, no
 * originalCells, no pricing, no file/workbook paths, and no customer source-row
 * cells beyond the projected fields. It may also stamp an advisory reject/defer
 * recommendation (action/reasonCode/note - never a replacement/current SKU) on a
 * `needs_review` line whose original SKU is in the pure deferred/non-priced review set;
 * the recommendation is advisory only - nothing is auto-rejected here. Every array/
 * object in the result is copied, so the projection never aliases the stored artifact
 * payload. Review counts are counted in TypeScript from the projected line statuses,
 * never inferred by an LLM.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
  SkuResolutionStatus,
  SkuResolutionSuggestion,
} from "@/types/project";
import { getDeferredSkuReviewGuidance } from "@/lib/projects/sku-deferred-review-set";

/** Lean project summary for the review header. */
export interface RfpSkuResolutionReviewWorkspaceProject {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpSkuResolutionReviewWorkspaceArtifact {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance + counts only, never decisions/pricing/paths. */
export interface RfpSkuResolutionReviewWorkspacePayload {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  lineCount: number;
  summary: Record<string, unknown>;
}

/** Deterministic review-state counts, counted from the projected line statuses. */
export interface RfpSkuResolutionReviewWorkspaceCounts {
  totalLineCount: number;
  needsReviewCount: number;
  acceptedCount: number;
  rejectedCount: number;
  unresolvedCount: number;
  manualCount: number;
  outOfScopeCount: number;
}

/** One candidate SKU match, projected to the fields the UI shows. */
export interface RfpSkuResolutionReviewLineSuggestion {
  suggestedSku: string;
  description?: string;
  source: SkuResolutionSuggestion["source"];
  confidence?: number;
  rationale?: string;
}

/**
 * Payload-safe reject/defer recommendation for a `needs_review` line whose original
 * SKU is a known deferred/non-priced authority-pack row. Carries only a reject action, a
 * reason code, and a safe note: never a replacement/current/substitute SKU, price,
 * or path. It is advisory - the engineer still triggers every reject explicitly.
 */
export interface RfpSkuResolutionReviewLineGuidance {
  action: "reject";
  reasonCode: string;
  note: string;
}

/** One BoQ line's current resolution state, projected for line-level review. */
export interface RfpSkuResolutionReviewLine {
  sourceFileId: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  originalSku: string;
  status: SkuResolutionStatus;
  suggestions: RfpSkuResolutionReviewLineSuggestion[];
  acceptedSku?: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  /** Present only on `needs_review` lines in the deferred/non-priced guidance set. */
  reviewGuidance?: RfpSkuResolutionReviewLineGuidance;
}

/** The lean, serializable SKU line-review projection returned on `ok`. */
export interface RfpSkuResolutionReviewWorkspace {
  project: RfpSkuResolutionReviewWorkspaceProject;
  artifact: RfpSkuResolutionReviewWorkspaceArtifact;
  payloadSummary: RfpSkuResolutionReviewWorkspacePayload;
  reviewSummary: RfpSkuResolutionReviewWorkspaceCounts;
  lines: RfpSkuResolutionReviewLine[];
}

/** Discriminated result of {@link loadRfpSkuResolutionReviewWorkspace}. */
export type LoadRfpSkuResolutionReviewWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode" }
  | { status: "sku_resolution_not_found" }
  | { status: "artifact_not_sku_resolution" }
  | { status: "invalid_sku_resolution_payload" }
  | { status: "ok"; review: RfpSkuResolutionReviewWorkspace };

/** Validated payload after parsing; lines are already allowlist-projected. */
interface ParsedSkuResolutionPayload {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  lineCount: number;
  summary: Record<string, unknown>;
  lines: RfpSkuResolutionReviewLine[];
}

const REVIEW_STATUSES: ReadonlySet<string> = new Set([
  "needs_review",
  "accepted",
  "rejected",
  "unresolved",
  "manual",
  "out_of_scope",
]);
const SUGGESTION_SOURCES: ReadonlySet<string> = new Set([
  "exact",
  "normalized",
  "fuzzy",
  "ai",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** JSONB stores dates as ISO strings; accept that (or a Date) and normalize. */
function toIsoString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/** Project one raw suggestion to the allowed fields, or null if malformed. */
function toReviewSuggestion(
  raw: unknown
): RfpSkuResolutionReviewLineSuggestion | null {
  if (!isPlainObject(raw)) return null;
  const { suggestedSku, description, source, confidence, rationale } = raw;
  if (typeof suggestedSku !== "string") return null;
  if (typeof source !== "string" || !SUGGESTION_SOURCES.has(source)) return null;
  return {
    suggestedSku,
    ...(typeof description === "string" ? { description } : {}),
    source: source as SkuResolutionSuggestion["source"],
    ...(typeof confidence === "number" ? { confidence } : {}),
    ...(typeof rationale === "string" ? { rationale } : {}),
  };
}

/** Project one raw decision to a review line, or null if malformed. */
function toReviewLine(raw: unknown): RfpSkuResolutionReviewLine | null {
  if (!isPlainObject(raw)) return null;
  const {
    sourceFileId,
    sourceRowNumber,
    originalLineNumber,
    originalSku,
    status,
    suggestions,
    acceptedSku,
    decidedBy,
    decidedAt,
    note,
  } = raw;
  if (
    typeof sourceFileId !== "string" ||
    typeof sourceRowNumber !== "number" ||
    typeof originalLineNumber !== "string" ||
    typeof originalSku !== "string" ||
    typeof status !== "string" ||
    !REVIEW_STATUSES.has(status) ||
    !Array.isArray(suggestions)
  ) {
    return null;
  }

  const projectedSuggestions: RfpSkuResolutionReviewLineSuggestion[] = [];
  for (const rawSuggestion of suggestions) {
    const suggestion = toReviewSuggestion(rawSuggestion);
    if (suggestion === null) return null;
    projectedSuggestions.push(suggestion);
  }

  const decidedAtIso = toIsoString(decidedAt);
  // Reject/defer recommendation is advisory and only for lines still needing review
  // whose original SKU is a known deferred/non-priced authority-pack row. It is
  // projected field-by-field so no replacement/current SKU or other helper field can
  // survive.
  const guidance =
    status === "needs_review" ? getDeferredSkuReviewGuidance(originalSku) : null;
  return {
    sourceFileId,
    sourceRowNumber,
    originalLineNumber,
    originalSku,
    status: status as SkuResolutionStatus,
    suggestions: projectedSuggestions,
    ...(typeof acceptedSku === "string" ? { acceptedSku } : {}),
    ...(typeof decidedBy === "string" ? { decidedBy } : {}),
    ...(decidedAtIso !== undefined ? { decidedAt: decidedAtIso } : {}),
    ...(typeof note === "string" ? { note } : {}),
    ...(guidance !== null
      ? {
          reviewGuidance: {
            action: guidance.action,
            reasonCode: guidance.reasonCode,
            note: guidance.note,
          },
        }
      : {}),
  };
}

/**
 * Validate and allowlist-project a stored `sku_resolution` payload. Requires the
 * provenance fields plus a decisions array and a summary object; each decision and
 * suggestion is projected field-by-field (so extra payload fields never survive).
 * Returns null when anything is structurally wrong. Copies every array/object so
 * the projection never aliases the stored payload.
 */
function parseSkuResolutionPayload(
  payload: Record<string, unknown>
): ParsedSkuResolutionPayload | null {
  const {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds,
    lineCount,
    decisions,
    summary,
  } = payload;
  if (
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds) ||
    !isPlainObject(summary) ||
    !Array.isArray(decisions)
  ) {
    return null;
  }

  const lines: RfpSkuResolutionReviewLine[] = [];
  for (const rawDecision of decisions) {
    const line = toReviewLine(rawDecision);
    if (line === null) return null;
    lines.push(line);
  }

  return {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds: [...sourceFileIds],
    lineCount: typeof lineCount === "number" ? lineCount : lines.length,
    summary: { ...summary },
    lines,
  };
}

/** Lean project header; tenant/project authority fields are not echoed. */
function toProjectSummary(
  project: Project
): RfpSkuResolutionReviewWorkspaceProject {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpSkuResolutionReviewWorkspaceArtifact {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Allowlist-project the stored sku_resolution summary into a safe subset. Only
 * named review/count fields survive; source/catalog/pricing keys and extra JSONB
 * keys are dropped field-by-field, never via spread.
 */
function toSummarySafe(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const numKeys = [
    "totalLines",
    "needsReviewCount",
    "unresolvedCount",
    "acceptedCount",
    "rejectedCount",
    "manualCount",
    "outOfScopeCount",
    "exactSuggestionCount",
    "normalizedSuggestionCount",
    "ambiguousCount",
  ] as const;
  for (const key of numKeys) {
    if (typeof raw[key] === "number") out[key] = raw[key];
  }
  return out;
}

/** Lean payload provenance + counts; summary is allowlist-projected, never spread wholesale. */
function toPayloadSummary(
  payload: ParsedSkuResolutionPayload
): RfpSkuResolutionReviewWorkspacePayload {
  return {
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    lineCount: payload.lineCount,
    summary: toSummarySafe(payload.summary),
  };
}

/** Count review-state totals deterministically from the projected line statuses. */
function toReviewCounts(
  lines: readonly RfpSkuResolutionReviewLine[]
): RfpSkuResolutionReviewWorkspaceCounts {
  let needsReviewCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let unresolvedCount = 0;
  let manualCount = 0;
  let outOfScopeCount = 0;
  for (const line of lines) {
    if (line.status === "needs_review") needsReviewCount++;
    else if (line.status === "accepted") acceptedCount++;
    else if (line.status === "rejected") rejectedCount++;
    else if (line.status === "unresolved") unresolvedCount++;
    else if (line.status === "manual") manualCount++;
    else if (line.status === "out_of_scope") outOfScopeCount++;
  }
  return {
    totalLineCount: lines.length,
    needsReviewCount,
    acceptedCount,
    rejectedCount,
    unresolvedCount,
    manualCount,
    outOfScopeCount,
  };
}

/**
 * Load the read-only SKU line-review projection for one `sku_resolution` artifact,
 * tenant-scoped on every store call. Returns `not_found` when the Project is
 * missing, `wrong_mode` when it is not a RFP project, `sku_resolution_not_found`
 * when the artifact is absent, `artifact_not_sku_resolution` when it is the wrong
 * type, `invalid_sku_resolution_payload` when its payload is not the expected SKU
 * resolution shape, else `ok` with a lean, serializable review object. Never
 * persists and never exposes the full payload, originalCells, pricing, or paths.
 */
export async function loadRfpSkuResolutionReviewWorkspace(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<LoadRfpSkuResolutionReviewWorkspaceResult> {
  // Read-only review loader: archived Projects stay inspectable.
  const project = await getProjectById(tenantId, projectId, { includeArchived: true });
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") return { status: "wrong_mode" };

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "sku_resolution_not_found" };
  if (artifact.type !== "sku_resolution") {
    return { status: "artifact_not_sku_resolution" };
  }

  const payload = parseSkuResolutionPayload(artifact.payload);
  if (payload === null) return { status: "invalid_sku_resolution_payload" };

  return {
    status: "ok",
    review: {
      project: toProjectSummary(project),
      artifact: toArtifactSummary(artifact),
      payloadSummary: toPayloadSummary(payload),
      reviewSummary: toReviewCounts(payload.lines),
      lines: payload.lines,
    },
  };
}
