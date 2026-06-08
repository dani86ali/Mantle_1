/**
 * Read-only Quick BoM configuration-expansion review projection (Prompt 128): load
 * ONE `configuration_expansion` DRAFT artifact and project a lean, serializable
 * line-review view for the workspace UI. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 * Canonical shapes: src/types/project.ts, src/lib/projects/config-expansion-types.ts.
 *
 * This loader is a pure read model. It verifies the Project (not_found /
 * wrong_mode) and the EXACT draft artifact in the same order as the Prompt 91
 * review service (configuration_expansion_draft_not_found /
 * artifact_not_configuration_expansion / configuration_expansion_not_draft /
 * configuration_expansion_draft_not_reviewable /
 * invalid_configuration_expansion_draft_payload) within the input tenant, then
 * ALLOWLIST-projects the stored draft payload into review lines. It never persists,
 * never auto-accepts/rejects, creates no approval, and imports no artifact-write
 * helper, approval store, pricing, export, runner, AI, catalog, engine, coordinator,
 * adapter, the deterministic config-expansion builder, or the lower-level review
 * helper. The only `@/lib/projects` import is the self-contained, type-only
 * config-expansion-types contract. It exposes only the fields an engineer needs to
 * accept/reject per expansion line: no full payload, no originalCells, no pricing,
 * no file/workbook paths, no evidence sourcePath/sheetName/lineNumber/pageNumber/
 * evidenceNote, and no configuration-authority trace. Evidence is reduced to a count
 * and the citation sourceTypes only. Every array/object in the result is copied, so
 * the projection never aliases the stored artifact payload. Review counts are counted
 * in TypeScript from the projected line origins, never inferred by an LLM.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStageId,
} from "@/types/project";
import type {
  ConfigExpansionQuantityRule,
  ConfigExpansionRelationshipType,
} from "@/lib/projects/config-expansion-types";

/** Lean project summary for the review header; tenant-scoped projection. */
export interface QuickBomConfigExpansionReviewWorkspaceProject {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface QuickBomConfigExpansionReviewWorkspaceArtifact {
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

/** Allowlisted draft roll-up counts; only these numeric fields survive. */
export interface QuickBomConfigExpansionReviewDraftSummary {
  customerLineCount?: number;
  addedLineCount?: number;
  totalLineCount?: number;
  requiresReviewCount?: number;
  includedItemCount?: number;
}

/** Lean payload summary: provenance + rule-pack metadata + counts; never the lines. */
export interface QuickBomConfigExpansionReviewWorkspacePayload {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  rulePackStatus: "approved";
  rulePackSourceScope: string;
  lineCount: number;
  summary: QuickBomConfigExpansionReviewDraftSummary;
}

/** Deterministic review-state counts, counted from the projected line origins. */
export interface QuickBomConfigExpansionReviewWorkspaceCounts {
  totalLineCount: number;
  customerLineCount: number;
  expansionLineCount: number;
  /** Expansion lines that each require one explicit accept/reject decision. */
  requiresDecisionCount: number;
  includedItemCount: number;
}

/** One draft line projected to the fields the line-review UI shows. */
export interface QuickBomConfigExpansionReviewLine {
  lineId: string;
  origin: "customer" | "expansion";
  sku: string;
  description: string;
  quantity: number;
  sourceFileId?: string;
  sourceRowNumber?: number;
  originalLineNumber?: string;
  originalSku?: string;
  acceptedSku?: string;
  parentLineId?: string;
  parentLineNumber?: string;
  relationshipType?: ConfigExpansionRelationshipType;
  quantityRule?: ConfigExpansionQuantityRule;
  includedItem?: boolean;
  sourceRuleId?: string;
  /** Number of evidence citations backing this line (expansion lines only). */
  evidenceCount: number;
  /** Citation source-type labels only; no path/sheet/line/page/note ever projected. */
  evidenceSourceTypes: string[];
  approvalRequired?: boolean;
  approved?: boolean;
}

/** The lean, serializable configuration-expansion line-review projection returned on `ok`. */
export interface QuickBomConfigExpansionReviewWorkspace {
  project: QuickBomConfigExpansionReviewWorkspaceProject;
  artifact: QuickBomConfigExpansionReviewWorkspaceArtifact;
  payloadSummary: QuickBomConfigExpansionReviewWorkspacePayload;
  reviewSummary: QuickBomConfigExpansionReviewWorkspaceCounts;
  lines: QuickBomConfigExpansionReviewLine[];
}

/** Discriminated result of {@link loadQuickBomConfigurationExpansionReviewWorkspace}. */
export type LoadQuickBomConfigExpansionReviewWorkspaceResult =
  | { status: "not_found" }
  | { status: "wrong_mode" }
  | { status: "configuration_expansion_draft_not_found" }
  | { status: "artifact_not_configuration_expansion" }
  | { status: "configuration_expansion_not_draft" }
  | { status: "configuration_expansion_draft_not_reviewable" }
  | { status: "invalid_configuration_expansion_draft_payload" }
  | { status: "ok"; review: QuickBomConfigExpansionReviewWorkspace };

/** Validated draft payload after parsing; lines are already allowlist-projected. */
interface ParsedDraftPayload {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
  sourceFileIds: string[];
  rulePackId: string;
  rulePackVersion: string;
  rulePackSourceScope: string;
  lineCount: number;
  summary: Record<string, unknown>;
  lines: QuickBomConfigExpansionReviewLine[];
}

/** Draft discriminator written by the Prompt 90 draft service. */
const DRAFT_PAYLOAD_KIND = "configuration_expansion_draft";

const ORIGINS: ReadonlySet<string> = new Set(["customer", "expansion"]);
const RELATIONSHIP_TYPES: ReadonlySet<string> = new Set([
  "service_or_support",
  "subscription",
  "default_selected",
  "included_zero_price",
  "standalone",
]);
const QUANTITY_RULES: ReadonlySet<string> = new Set([
  "same_as_parent",
  "fixed",
  "fixed_per_parent",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Reduce a raw evidence array to a citation count and the citation sourceTypes only.
 * Drops sourcePath, sheetName, lineNumber, pageNumber, and evidenceNote by never
 * reading them. A non-array (or absent) value yields a zero/empty projection.
 */
function projectEvidence(raw: unknown): { count: number; sourceTypes: string[] } {
  if (!Array.isArray(raw)) return { count: 0, sourceTypes: [] };
  const sourceTypes: string[] = [];
  for (const item of raw) {
    if (isPlainObject(item) && typeof item.sourceType === "string") {
      sourceTypes.push(item.sourceType);
    }
  }
  return { count: raw.length, sourceTypes };
}

/**
 * Project one raw draft line to the allowed review fields, or null if its required
 * structural fields are malformed. Built field-by-field (never via spread) so
 * originalCells, sourceSheetName, evidence internals, and any extra payload keys
 * cannot ride along. `origin` is validated so the UI's per-origin gating is safe.
 */
function toReviewLine(raw: unknown): QuickBomConfigExpansionReviewLine | null {
  if (!isPlainObject(raw)) return null;
  const {
    lineId,
    origin,
    sku,
    description,
    quantity,
    sourceFileId,
    sourceRowNumber,
    originalLineNumber,
    originalSku,
    acceptedSku,
    parentLineId,
    parentLineNumber,
    relationshipType,
    quantityRule,
    includedItem,
    sourceRuleId,
    evidence,
    approvalRequired,
    approved,
  } = raw;
  if (
    typeof lineId !== "string" ||
    typeof origin !== "string" ||
    !ORIGINS.has(origin) ||
    typeof sku !== "string" ||
    typeof description !== "string" ||
    typeof quantity !== "number"
  ) {
    return null;
  }

  const { count, sourceTypes } = projectEvidence(evidence);
  return {
    lineId,
    origin: origin as "customer" | "expansion",
    sku,
    description,
    quantity,
    ...(typeof sourceFileId === "string" ? { sourceFileId } : {}),
    ...(typeof sourceRowNumber === "number" ? { sourceRowNumber } : {}),
    ...(typeof originalLineNumber === "string" ? { originalLineNumber } : {}),
    ...(typeof originalSku === "string" ? { originalSku } : {}),
    ...(typeof acceptedSku === "string" ? { acceptedSku } : {}),
    ...(typeof parentLineId === "string" ? { parentLineId } : {}),
    ...(typeof parentLineNumber === "string" ? { parentLineNumber } : {}),
    ...(typeof relationshipType === "string" && RELATIONSHIP_TYPES.has(relationshipType)
      ? { relationshipType: relationshipType as ConfigExpansionRelationshipType }
      : {}),
    ...(typeof quantityRule === "string" && QUANTITY_RULES.has(quantityRule)
      ? { quantityRule: quantityRule as ConfigExpansionQuantityRule }
      : {}),
    ...(typeof includedItem === "boolean" ? { includedItem } : {}),
    ...(typeof sourceRuleId === "string" ? { sourceRuleId } : {}),
    evidenceCount: count,
    evidenceSourceTypes: sourceTypes,
    ...(typeof approvalRequired === "boolean" ? { approvalRequired } : {}),
    ...(typeof approved === "boolean" ? { approved } : {}),
  };
}

/**
 * Validate and allowlist-project a stored draft payload. Requires both source
 * provenance ids/versions, the copied sourceFileIds, the rule-pack coordinates with
 * an `approved` status and scope, a `summary` object, and a `lines` array; each line
 * is projected field-by-field. Returns null when anything is structurally wrong so
 * the caller can fail with invalid_configuration_expansion_draft_payload. Copies
 * every array/object so the projection never aliases the stored payload.
 */
function parseDraftPayload(
  payload: Record<string, unknown>
): ParsedDraftPayload | null {
  const {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    sourceFileIds,
    rulePackId,
    rulePackVersion,
    rulePackStatus,
    rulePackSourceScope,
    lineCount,
    lines,
    summary,
  } = payload;
  if (
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    typeof sourceSkuResolutionArtifactId !== "string" ||
    typeof sourceSkuResolutionArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds) ||
    typeof rulePackId !== "string" ||
    typeof rulePackVersion !== "string" ||
    rulePackStatus !== "approved" ||
    typeof rulePackSourceScope !== "string" ||
    !isPlainObject(summary) ||
    !Array.isArray(lines)
  ) {
    return null;
  }

  const projectedLines: QuickBomConfigExpansionReviewLine[] = [];
  for (const rawLine of lines) {
    const line = toReviewLine(rawLine);
    if (line === null) return null;
    projectedLines.push(line);
  }

  return {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...sourceFileIds],
    rulePackId,
    rulePackVersion,
    rulePackSourceScope,
    lineCount: typeof lineCount === "number" ? lineCount : projectedLines.length,
    summary: { ...summary },
    lines: projectedLines,
  };
}

/** Lean project header; tenantId and pricingConfig are copied, never aliased. */
function toProjectSummary(
  project: Project
): QuickBomConfigExpansionReviewWorkspaceProject {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): QuickBomConfigExpansionReviewWorkspaceArtifact {
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
 * Allowlist-project the stored draft summary into a safe subset. Only the named
 * numeric roll-up fields survive; extra JSONB keys are dropped field-by-field.
 */
function toDraftSummarySafe(
  raw: Record<string, unknown>
): QuickBomConfigExpansionReviewDraftSummary {
  const out: QuickBomConfigExpansionReviewDraftSummary = {};
  if (typeof raw.customerLineCount === "number") out.customerLineCount = raw.customerLineCount;
  if (typeof raw.addedLineCount === "number") out.addedLineCount = raw.addedLineCount;
  if (typeof raw.totalLineCount === "number") out.totalLineCount = raw.totalLineCount;
  if (typeof raw.requiresReviewCount === "number") out.requiresReviewCount = raw.requiresReviewCount;
  if (typeof raw.includedItemCount === "number") out.includedItemCount = raw.includedItemCount;
  return out;
}

/** Lean payload provenance + rule-pack metadata + counts; summary is allowlist-projected. */
function toPayloadSummary(
  payload: ParsedDraftPayload
): QuickBomConfigExpansionReviewWorkspacePayload {
  return {
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    rulePackId: payload.rulePackId,
    rulePackVersion: payload.rulePackVersion,
    rulePackStatus: "approved",
    rulePackSourceScope: payload.rulePackSourceScope,
    lineCount: payload.lineCount,
    summary: toDraftSummarySafe(payload.summary),
  };
}

/** Count review-state totals deterministically from the projected line origins. */
function toReviewCounts(
  lines: readonly QuickBomConfigExpansionReviewLine[]
): QuickBomConfigExpansionReviewWorkspaceCounts {
  let customerLineCount = 0;
  let expansionLineCount = 0;
  let includedItemCount = 0;
  for (const line of lines) {
    if (line.origin === "customer") {
      customerLineCount++;
    } else if (line.origin === "expansion") {
      expansionLineCount++;
      if (line.includedItem === true) includedItemCount++;
    }
  }
  return {
    totalLineCount: lines.length,
    customerLineCount,
    expansionLineCount,
    requiresDecisionCount: expansionLineCount,
    includedItemCount,
  };
}

/**
 * Load the read-only configuration-expansion line-review projection for one
 * `configuration_expansion` DRAFT artifact, tenant-scoped on every store call. Status
 * order mirrors the Prompt 91 review service: `not_found` when the Project is missing,
 * `wrong_mode` when it is not a Quick BoM project, `configuration_expansion_draft_not_found`
 * when the artifact is absent, `artifact_not_configuration_expansion` when it is the
 * wrong type, `configuration_expansion_not_draft` when it lacks the draft marker (a
 * reviewed artifact), `configuration_expansion_draft_not_reviewable` when its status is
 * not needs_review, `invalid_configuration_expansion_draft_payload` when the draft
 * payload is malformed, else `ok` with a lean, serializable review object. Never
 * persists and never exposes the full payload, originalCells, evidence paths/notes,
 * pricing, or the configuration-authority trace.
 */
export async function loadQuickBomConfigurationExpansionReviewWorkspace(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<LoadQuickBomConfigExpansionReviewWorkspaceResult> {
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") return { status: "wrong_mode" };

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) {
    return { status: "configuration_expansion_draft_not_found" };
  }
  if (artifact.type !== "configuration_expansion") {
    return { status: "artifact_not_configuration_expansion" };
  }
  if (artifact.payload.payloadKind !== DRAFT_PAYLOAD_KIND) {
    return { status: "configuration_expansion_not_draft" };
  }
  if (artifact.status !== "needs_review") {
    return { status: "configuration_expansion_draft_not_reviewable" };
  }

  const payload = parseDraftPayload(artifact.payload);
  if (payload === null) {
    return { status: "invalid_configuration_expansion_draft_payload" };
  }

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
