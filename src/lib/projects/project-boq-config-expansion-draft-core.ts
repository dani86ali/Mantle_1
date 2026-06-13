/**
 * Shared configuration-expansion DRAFT core: turn one already-APPROVED
 * `sku_resolution` artifact (and its `normalized_boq` source) into a versioned
 * `configuration_expansion` DRAFT artifact for the
 * `configuration_expansion_review` stage. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 * Canonical shapes: src/types/project.ts.
 *
 * This is the lane-agnostic core behind the Quick BoM (and, later, RFP BoQ)
 * configuration-expansion draft step. The single product step is "approved
 * sku_resolution -> configuration_expansion draft". It verifies the Project
 * (not_found / wrong_mode against the caller-supplied `expectedMode`), the exact
 * source `sku_resolution` artifact (existence / type / approved status / payload
 * shape), and the referenced `normalized_boq` artifact (existence / type /
 * version match / readiness / payload shape), then builds the draft
 * deterministically from the existing pure builder and the approved Honeywell
 * rule pack and persists exactly ONE new artifact via createProjectArtifactVersion
 * with status `needs_review`.
 *
 * It writes a DRAFT payload (`payloadKind: "configuration_expansion_draft"`), NOT
 * the reviewed/accepted expansion payload: the explicit per-line review is a later
 * step, and the draft marker keeps the generic approval path from approving it. It
 * does NO catalog lookup, pricing, SKU acceptance/replacement, approval creation,
 * staleness propagation, stage-status update, or export; it never imports the
 * reviewed config-expansion artifact service, the engineer-review helper, the
 * quick-bom runner, any approval/evidence store, pricing, mantle/export, AI,
 * catalog, engine, coordinator, or adapter module. It returns lean, serializable
 * summaries only (no full lines, no full artifact payload) and never mutates its
 * input, the source artifacts, their arrays, the source payload arrays, the rule
 * pack, or the draft lines.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import { getProjectById } from "@/lib/db/project-store";
import { buildConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import type {
  ConfigurationAuthorityTrace,
  ConfigurationExpansionDraftArtifactPayload,
} from "@/lib/projects/config-expansion-types";
import {
  getHoneywellDemoConfigAuthorityProfile,
  getHoneywellDemoConfigAuthorityForSku,
} from "@/lib/projects/honeywell-demo-config-authority";
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import type {
  CanonicalBoqLine,
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
  SkuResolutionDecision,
} from "@/types/project";

/**
 * Source `normalized_boq` statuses that may seed a configuration-expansion draft.
 * Allowlist (fail-closed): `generated` is the normalizer's fresh output and
 * `approved` is the human-blessed version; every other status is treated as not
 * ready. The source `sku_resolution` artifact must additionally be `approved`
 * (the approval gate between SKU review and config expansion).
 */
const READY_NORMALIZED_STATUSES: ProjectArtifactStatus[] = [
  "generated",
  "approved",
];

/** Input for {@link createProjectBoqConfigurationExpansionDraftCore}. */
export interface CreateProjectBoqConfigurationExpansionDraftCoreInput {
  tenantId: string;
  projectId: string;
  /** The exact approved `sku_resolution` artifact to seed the draft from. */
  skuResolutionArtifactId: string;
  /** The project mode this lane is allowed to operate on; others get wrong_mode. */
  expectedMode: ProjectMode;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface ProjectBoqConfigExpansionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface ProjectBoqConfigExpansionArtifactSummary {
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

/** Serializable payload summary: provenance ids, rule-pack metadata, counts; never the lines. */
export interface ProjectBoqConfigExpansionPayloadSummary {
  payloadKind: "configuration_expansion_draft";
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
  summary: ConfigurationExpansionDraftArtifactPayload["summary"];
  /** Lean configuration-authority trace; present when the service wired a config authority profile. */
  configurationAuthority?: ConfigurationAuthorityTrace;
}

/** The `sku_resolution` payload fields this service requires to seed the draft. */
interface ParsedSkuResolutionPayload {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  decisions: SkuResolutionDecision[];
}

/** Discriminated result of {@link createProjectBoqConfigurationExpansionDraftCore}. */
export type CreateProjectBoqConfigurationExpansionDraftCoreResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectBoqConfigExpansionProjectSummary }
  | { status: "sku_resolution_not_found" }
  | {
      status: "artifact_not_sku_resolution";
      artifact: ProjectBoqConfigExpansionArtifactSummary;
    }
  | {
      status: "sku_resolution_not_approved";
      artifact: ProjectBoqConfigExpansionArtifactSummary;
    }
  | { status: "invalid_sku_resolution_payload" }
  | { status: "normalized_boq_not_found" }
  | {
      status: "artifact_not_normalized_boq";
      artifact: ProjectBoqConfigExpansionArtifactSummary;
    }
  | {
      status: "normalized_boq_version_mismatch";
      artifact: ProjectBoqConfigExpansionArtifactSummary;
    }
  | { status: "normalized_boq_not_ready" }
  | { status: "invalid_normalized_boq_payload" }
  | {
      status: "ok";
      artifact: ProjectBoqConfigExpansionArtifactSummary;
      payloadSummary: ProjectBoqConfigExpansionPayloadSummary;
    };

/** True for a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for an array whose every element is a string. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): ProjectBoqConfigExpansionProjectSummary {
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
): ProjectBoqConfigExpansionArtifactSummary {
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

/** Project the draft payload to a lean summary; the full lines array is dropped. */
function toPayloadSummary(
  payload: ConfigurationExpansionDraftArtifactPayload
): ProjectBoqConfigExpansionPayloadSummary {
  const base: ProjectBoqConfigExpansionPayloadSummary = {
    payloadKind: payload.payloadKind,
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: payload.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: payload.sourceSkuResolutionArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    rulePackId: payload.rulePackId,
    rulePackVersion: payload.rulePackVersion,
    rulePackStatus: payload.rulePackStatus,
    rulePackSourceScope: payload.rulePackSourceScope,
    lineCount: payload.lineCount,
    summary: { ...payload.summary },
  };
  if (payload.configurationAuthority !== undefined) {
    base.configurationAuthority = {
      ...payload.configurationAuthority,
      dispositionSummary: { ...payload.configurationAuthority.dispositionSummary },
    };
  }
  return base;
}

/** Unique source file ids across both artifacts, in first-seen order (no input mutation). */
function unionSourceFileIds(
  first: readonly string[],
  second: readonly string[]
): string[] {
  const ids: string[] = [];
  for (const id of [...first, ...second]) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Validate and narrow the `sku_resolution` payload to the fields this service
 * needs. Requires the provenance ids/version, the copied `sourceFileIds`, the
 * `decisions` array, and a `summary` object; returns null when any is missing or
 * the wrong shape so the caller can fail with invalid_sku_resolution_payload.
 */
function parseSkuResolutionPayload(
  payload: Record<string, unknown>
): ParsedSkuResolutionPayload | null {
  const {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds,
    decisions,
    summary,
  } = payload;
  if (
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds) ||
    !Array.isArray(decisions) ||
    !isPlainObject(summary)
  ) {
    return null;
  }
  return {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds: sourceFileIds as string[],
    decisions: decisions as SkuResolutionDecision[],
  };
}

/**
 * Create a configuration-expansion DRAFT for one already-recorded
 * `sku_resolution` artifact, tenant-scoped on every store call. The Project mode
 * is gated against the caller-supplied `expectedMode` so each lane (Quick BoM,
 * RFP BoQ) keeps its own surface while sharing this deterministic core. Runs the
 * Project and source-artifact gates in the order declared on the result union; no
 * gate persists anything. On a passing chain it builds the draft deterministically
 * from the pure builder and the approved Honeywell rule pack and creates exactly
 * one `needs_review` `configuration_expansion` draft artifact, returning lean
 * summaries (no full lines, no full payload). Inputs/sources are never mutated.
 */
export async function createProjectBoqConfigurationExpansionDraftCore(
  input: CreateProjectBoqConfigurationExpansionDraftCoreInput
): Promise<CreateProjectBoqConfigurationExpansionDraftCoreResult> {
  const { tenantId, projectId, skuResolutionArtifactId, expectedMode } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== expectedMode) {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const skuArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    skuResolutionArtifactId
  );
  if (skuArtifact === null) return { status: "sku_resolution_not_found" };
  if (skuArtifact.type !== "sku_resolution") {
    return {
      status: "artifact_not_sku_resolution",
      artifact: toArtifactSummary(skuArtifact),
    };
  }
  if (skuArtifact.status !== "approved") {
    return {
      status: "sku_resolution_not_approved",
      artifact: toArtifactSummary(skuArtifact),
    };
  }

  const parsedSku = parseSkuResolutionPayload(skuArtifact.payload);
  if (parsedSku === null) {
    return { status: "invalid_sku_resolution_payload" };
  }

  const normalizedArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    parsedSku.sourceNormalizedBoqArtifactId
  );
  if (normalizedArtifact === null) {
    return { status: "normalized_boq_not_found" };
  }
  if (normalizedArtifact.type !== "normalized_boq") {
    return {
      status: "artifact_not_normalized_boq",
      artifact: toArtifactSummary(normalizedArtifact),
    };
  }
  if (normalizedArtifact.version !== parsedSku.sourceNormalizedBoqArtifactVersion) {
    return {
      status: "normalized_boq_version_mismatch",
      artifact: toArtifactSummary(normalizedArtifact),
    };
  }
  if (!READY_NORMALIZED_STATUSES.includes(normalizedArtifact.status)) {
    return { status: "normalized_boq_not_ready" };
  }

  const lines = normalizedArtifact.payload.lines;
  if (!Array.isArray(lines)) {
    return { status: "invalid_normalized_boq_payload" };
  }

  const rulePack = getHoneywellMvpConfigExpansionRulePack();
  const draft = buildConfigurationExpansionDraft({
    lines: lines as CanonicalBoqLine[],
    decisions: parsedSku.decisions,
    rulePack,
  });

  const authorityProfile = getHoneywellDemoConfigAuthorityProfile();

  const dispositionSummary = {
    expandByApprovedRulePackCount: 0,
    preserveKnownRulePackChildCount: 0,
    preserveStandaloneCustomerLineCount: 0,
    deferUnknownRelationshipCount: 0,
  };
  for (const decision of parsedSku.decisions) {
    if (typeof decision.acceptedSku !== "string") continue;
    const skuResult = getHoneywellDemoConfigAuthorityForSku(decision.acceptedSku);
    switch (skuResult.disposition) {
      case "expand_by_approved_rule_pack":
        dispositionSummary.expandByApprovedRulePackCount++;
        break;
      case "preserve_known_rule_pack_child":
        dispositionSummary.preserveKnownRulePackChildCount++;
        break;
      case "preserve_standalone_customer_line":
        dispositionSummary.preserveStandaloneCustomerLineCount++;
        break;
      case "defer_unknown_relationship":
        dispositionSummary.deferUnknownRelationshipCount++;
        break;
    }
  }

  const configurationAuthority: ConfigurationAuthorityTrace = {
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: authorityProfile.approvalRecordId,
    rulePackId: authorityProfile.rulePackId,
    rulePackVersion: authorityProfile.rulePackVersion,
    rulePackStatus: "approved",
    rulePackSourceScope: authorityProfile.rulePackSourceScope,
    dispositionSummary,
    runtimeAi: false,
    replacementAuthority: false,
    skuSubstitutionAuthority: false,
    unknownRelationshipsDeferred: true,
    attachesOpticsUnderSwitches: false,
  };

  const sourceFileIds = unionSourceFileIds(
    normalizedArtifact.sourceFileIds,
    skuArtifact.sourceFileIds
  );
  const payload: ConfigurationExpansionDraftArtifactPayload = {
    payloadKind: "configuration_expansion_draft",
    sourceNormalizedBoqArtifactId: normalizedArtifact.id,
    sourceNormalizedBoqArtifactVersion: normalizedArtifact.version,
    sourceSkuResolutionArtifactId: skuArtifact.id,
    sourceSkuResolutionArtifactVersion: skuArtifact.version,
    sourceFileIds,
    rulePackId: rulePack.rulePackId,
    rulePackVersion: rulePack.version,
    rulePackStatus: "approved",
    rulePackSourceScope: rulePack.sourceScope,
    lineCount: draft.lines.length,
    lines: draft.lines,
    summary: draft.summary,
    configurationAuthority,
  };

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    payload,
    sourceFileIds: [...sourceFileIds],
    sourceArtifactIds: [normalizedArtifact.id, skuArtifact.id],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
