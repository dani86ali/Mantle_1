/**
 * Tenant-scoped deterministic RFP HLD design-model REVIEW service (Stage 6E-B-002).
 *
 * Produces exactly ONE advisory, reviewable (`needs_review`)
 * `hld_design_model_review` artifact on the existing `hld_design_delta_review`
 * stage. The review is quality metadata about a candidate `hld_design_model`,
 * checked deterministically against its approved `hld_source_bundle`. It is
 * advisory only: it never approves the model, it always precedes the human
 * engineer gate, and it carries no SKU/pricing/catalog/configuration/AI/design
 * authority. Findings and the optional bounded redraft directive are derived by
 * pure TypeScript over the persisted artifacts - no LLM, no runtime math/lookup.
 *
 * The flow is fail-closed: verify the project within its tenant, load the exact
 * artifact, gate on rfp mode / `hld_design_model` type on the right stage /
 * reviewable status, resolve an approved source bundle (the model's own bundle id
 * when still approved, else the current ready bundle), build the advisory payload,
 * HARD-GATE it with the Stage 6E-B-001 fail-closed validator BEFORE any write, and
 * persist exactly one artifact. Only lean, serializable summaries are returned -
 * never the model body, the review body, or the tenant id.
 *
 * It reads only Project state through the project/artifact stores. It reads NO raw
 * RFP/PDF/DOCX/XLSX file, storage path, evidence/file store, parser, or legacy
 * engine; constructs NO provider adapter and imports NO provider SDK; and makes NO
 * pricing/SKU/catalog/configuration/topology/scope/design-approval decision. It adds
 * no route, UI, approval-gate, AI reviewer, rebuild execution, or final-output
 * (document/HTML/draw.io/diagram/proposal/export) behavior.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { RFP_HLD_DESIGN_DOMAIN_DEFINITIONS } from "@/lib/projects/project-rfp-hld-domain-readiness";
import { validateRfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewFinding,
  type RfpHldDesignModelReviewFindingSeverity,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

/** Generated final-output / certification markers scanned for in the model body. */
const FINAL_OUTPUT_MARKER_RE =
  /```|<html|<body|<svg|<mxfile|<\?xml|graph TD|flowchart|sequenceDiagram|draw\.io|mermaid|final hld|technical proposal|export package/i;
const CERT_MARKER_RE =
  /cisco-certified|cvd-certified|bomatic-certified|ai-certified|cisco validated design certified/i;

const MODEL_REF_ID = "ref-model";
const BUNDLE_REF_ID = "ref-bundle";
const MIN_LABEL_LEN = 4;

const REBUILD_SUMMARY =
  "Redraft the design model from the approved source bundle to resolve the listed review findings.";
const REBUILD_INSTRUCTIONS =
  "Use the same approved source bundle. Fix only the listed review findings. " +
  "Do not add facts, products, quantities, costs, output files, or authority decisions.";

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDesignModelDeterministicReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelDeterministicReviewArtifactSummary {
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

export interface RfpHldDesignModelReviewSeverityCounts {
  blocking: number;
  warning: number;
  suggestion: number;
}

/** Stable sub-reason for an unresolvable approved source bundle. */
export type RfpHldDesignModelReviewSourceBundleBlockedCode = "source_bundle_not_resolved";

export interface CreateRfpHldDesignModelDeterministicReviewInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  reviewedBy: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  reviewedAt?: Date;
}

export type CreateRfpHldDesignModelDeterministicReviewResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelDeterministicReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_design_model";
      artifact: RfpHldDesignModelDeterministicReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDesignModelDeterministicReviewArtifactSummary;
    }
  | {
      status: "source_bundle_unavailable";
      code: RfpHldDesignModelReviewSourceBundleBlockedCode;
    }
  | { status: "invalid_review_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelDeterministicReviewArtifactSummary;
      recommendation: RfpHldDesignModelReviewRecommendation;
      findingCount: number;
      findingCountsBySeverity: RfpHldDesignModelReviewSeverityCounts;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function containsMarker(value: unknown, re: RegExp): boolean {
  if (typeof value === "string") return re.test(value);
  if (Array.isArray(value)) return value.some((v) => containsMarker(v, re));
  const o = asObject(value);
  return o ? Object.values(o).some((v) => containsMarker(v, re)) : false;
}

function toProjectSummary(
  project: Project
): RfpHldDesignModelDeterministicReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignModelDeterministicReviewArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function countBySeverity(
  findings: readonly RfpHldDesignModelReviewFinding[]
): RfpHldDesignModelReviewSeverityCounts {
  const counts: RfpHldDesignModelReviewSeverityCounts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function isApprovedBundle(a: ProjectArtifact | null, projectId: string): boolean {
  return (
    a !== null &&
    a.projectId === projectId &&
    a.type === "hld_source_bundle" &&
    a.stageId === HLD_STAGE &&
    a.status === "approved" &&
    validateRfpHldSourceBundlePayload(a.payload).valid
  );
}

/**
 * Resolve the approved `hld_source_bundle` to review against. Always prefer the
 * current ready approved bundle reported by the Stage 6C readiness helper - even
 * when the model row/payload declares a different bundle id. A mismatch means the
 * payload builder will record a blocking `source_mismatch` finding. Only when no
 * current ready bundle exists does the service fall back to the model-declared
 * approved bundle. Returns null when neither resolves (so the service writes nothing).
 */
async function resolveApprovedSourceBundle(
  tenantId: string,
  projectId: string,
  model: ProjectArtifact
): Promise<ProjectArtifact | null> {
  const artifacts = await listProjectArtifacts(tenantId, projectId);
  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status === "ready" && readiness.sourceBundle !== undefined) {
    const bundleId = readiness.sourceBundle.artifactId;
    const ready = artifacts.find((a) => a.id === bundleId) ?? null;
    if (isApprovedBundle(ready, projectId)) return ready;
  }

  // No current ready bundle - fall back to the model-declared approved bundle.
  const candidateIds: string[] = [];
  const payloadBundleId = str(asObject(model.payload)?.sourceHldSourceBundleArtifactId).trim();
  if (payloadBundleId !== "") candidateIds.push(payloadBundleId);
  if (model.sourceArtifactIds.length === 1) {
    const rowId = str(model.sourceArtifactIds[0]).trim();
    if (rowId !== "") candidateIds.push(rowId);
  }
  for (const id of Array.from(new Set(candidateIds))) {
    const candidate = await getProjectArtifactById(tenantId, projectId, id);
    if (isApprovedBundle(candidate, projectId)) return candidate;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pure advisory-payload builder (exported for focused testing)
// ---------------------------------------------------------------------------

/**
 * Build the advisory `rfp_hld_design_model_review` payload deterministically from
 * the candidate model and its approved source bundle. The payload references only
 * the model and bundle artifact ids (never raw bodies), carries safe finding
 * messages that never echo a forbidden marker, and recommends proceeding only when
 * there are no findings - otherwise a bounded, validator-safe redraft directive.
 */
export function buildRfpHldDesignModelReviewPayload(input: {
  model: ProjectArtifact;
  bundle: ProjectArtifact;
  reviewedBy: string;
  reviewedAt: string;
}): RfpHldDesignModelReviewPayload {
  const { model, bundle, reviewedBy, reviewedAt } = input;
  const mp = asObject(model.payload);
  const bp = bundle.payload as unknown as RfpHldSourceBundlePayload;

  const findings: RfpHldDesignModelReviewFinding[] = [];
  let seq = 0;
  const both = [MODEL_REF_ID, BUNDLE_REF_ID];
  const add = (
    severity: RfpHldDesignModelReviewFindingSeverity,
    category: RfpHldDesignModelReviewFinding["category"],
    message: string,
    refs: string[]
  ): void => {
    seq += 1;
    findings.push({ id: `rf-${seq}`, severity, category, message, sourceReferenceIds: refs });
  };

  const modelRefs = asArray(mp?.sourceReferences).map(asObject);
  const modelRefIdSet = new Set(
    modelRefs.map((r) => str(r?.id)).filter((s) => s !== "")
  );
  const modelCovered = asArray(mp?.coveredDomains).filter(
    (d): d is string => typeof d === "string"
  );
  const sections = asArray(mp?.designSections).map(asObject);

  // Finding: model contract OR source-compatibility failure.
  const modelValid = validateRfpHldDesignModelPayload(model.payload).valid;
  const compatValid = validateRfpHldDesignModelSourceCompatibility({
    payload: model.payload,
    sourceBundleArtifact: bundle,
  }).valid;
  if (!modelValid || !compatValid) {
    add(
      "blocking",
      "validation_gap",
      "The design model does not pass deterministic contract or source-compatibility checks.",
      both
    );
  }

  // Finding: row / payload / domain alignment with the resolved bundle.
  const rowOk =
    model.sourceArtifactIds.length === 1 && model.sourceArtifactIds[0] === bundle.id;
  const payloadOk = str(mp?.sourceHldSourceBundleArtifactId) === bundle.id;
  const bundleCovered = Array.isArray(bp?.coveredDomains) ? (bp.coveredDomains as string[]) : [];
  const coveredSet = new Set(bundleCovered);
  const domainsOk =
    modelCovered.length === bundleCovered.length &&
    modelCovered.every((d) => coveredSet.has(d));
  if (!rowOk || !payloadOk || !domainsOk) {
    add(
      "blocking",
      "source_mismatch",
      "The design model is not aligned with the resolved approved source bundle.",
      both
    );
  }

  // Finding: the model cites an artifact outside the approved source bundle.
  const bundleSourceIds = Array.isArray(bp?.sourceArtifactIds) ? bp.sourceArtifactIds : [];
  const allowedArtifactIds = new Set<string>([bundle.id, ...bundleSourceIds]);
  if (
    modelRefs.some((r) => {
      const aid = str(r?.artifactId);
      return aid !== "" && !allowedArtifactIds.has(aid);
    })
  ) {
    add(
      "blocking",
      "validation_gap",
      "The design model cites an artifact that is not part of the approved source bundle.",
      both
    );
  }

  // Finding: a claimed design domain lacks a source-bundle knowledge pack.
  const packDomains = asArray(bp?.designKnowledgePackRefs)
    .map((r) => str(asObject(r)?.domain))
    .filter((s) => s !== "");
  const packSet = new Set(packDomains);
  const claimed = new Set<string>(modelCovered);
  for (const s of sections) {
    const d = str(s?.domain);
    if (d !== "") claimed.add(d);
  }
  if (Array.from(claimed).some((d) => !packSet.has(d))) {
    add(
      "blocking",
      "unsupported_domain",
      "The design model claims a design domain that has no approved knowledge pack in the source bundle.",
      both
    );
  }

  // Finding: topology references an unknown node, source reference, or domain.
  const topo = asObject(mp?.topology);
  const nodes = asArray(topo?.nodes).map(asObject);
  const nodeIdSet = new Set(nodes.map((n) => str(n?.id)).filter((s) => s !== ""));
  const refsKnown = (ids: unknown): boolean =>
    asArray(ids).every((x) => modelRefIdSet.has(str(x)));
  const domainOk = (d: unknown): boolean =>
    d === undefined || (typeof d === "string" && KNOWN_DOMAINS.has(d));
  let topologyRisk = false;
  for (const n of nodes) {
    if (!domainOk(n?.domain) || !refsKnown(n?.sourceRefIds)) topologyRisk = true;
  }
  for (const l of asArray(topo?.links).map(asObject)) {
    if (
      !nodeIdSet.has(str(l?.fromNodeId)) ||
      !nodeIdSet.has(str(l?.toNodeId)) ||
      !refsKnown(l?.sourceRefIds)
    ) {
      topologyRisk = true;
    }
  }
  for (const z of asArray(topo?.zones).map(asObject)) {
    const zoneNodesOk = asArray(z?.nodeIds).every((x) => nodeIdSet.has(str(x)));
    if (!zoneNodesOk || !domainOk(z?.domain) || !refsKnown(z?.sourceRefIds)) {
      topologyRisk = true;
    }
  }
  if (topologyRisk) {
    add(
      "blocking",
      "topology_risk",
      "The design model topology references an unknown node, source reference, or domain.",
      both
    );
  }

  // Finding: text resembling a generated final output or a certification claim.
  if (containsMarker(model.payload, FINAL_OUTPUT_MARKER_RE)) {
    add(
      "blocking",
      "validation_gap",
      "The design model contains text that resembles a generated final output.",
      [MODEL_REF_ID]
    );
  }
  if (containsMarker(model.payload, CERT_MARKER_RE)) {
    add(
      "blocking",
      "validation_gap",
      "The design model contains text that resembles a certification claim.",
      [MODEL_REF_ID]
    );
  }

  // Finding: source-bundle context exists but the model references none of it.
  const bundleContext =
    asArray(bp?.assumptions).length +
      asArray(bp?.constraints).length +
      asArray(bp?.warnings).length +
      asArray(bp?.blockers).length >
    0;
  const modelCoverage =
    asArray(mp?.assumptionRefs).length > 0 ||
    asArray(mp?.constraintRefs).length > 0 ||
    asArray(mp?.validationFindings).length > 0;
  if (bundleContext && !modelCoverage) {
    add(
      "warning",
      "missing_assumption",
      "The approved source bundle records assumptions or constraints that the design model does not reference.",
      both
    );
  }

  // Finding(s): low-value design narrative.
  if (sections.length === 0) {
    add("warning", "unclear_narrative", "The design model has no design sections.", [MODEL_REF_ID]);
  } else {
    let shortTitle = false;
    let noDecisions = false;
    let shortDecision = false;
    for (const s of sections) {
      if (str(s?.title).trim().length < MIN_LABEL_LEN) shortTitle = true;
      const decisions = asArray(s?.decisions).map(asObject);
      if (decisions.length === 0) noDecisions = true;
      for (const d of decisions) {
        if (str(d?.label).trim().length < MIN_LABEL_LEN) shortDecision = true;
      }
    }
    if (shortTitle) {
      add("suggestion", "unclear_narrative", "A design section title is too short to be meaningful.", [MODEL_REF_ID]);
    }
    if (noDecisions) {
      add("suggestion", "unclear_narrative", "A design section records no design decisions.", [MODEL_REF_ID]);
    }
    if (shortDecision) {
      add("suggestion", "unclear_narrative", "A design decision label is too short to be meaningful.", [MODEL_REF_ID]);
    }
  }

  let recommendation: RfpHldDesignModelReviewRecommendation;
  let bounded: RfpHldDesignModelReviewPayload["boundedRebuildInstructions"];
  if (findings.length === 0) {
    recommendation = "proceed_to_engineer_review";
  } else {
    recommendation = "rebuild_recommended";
    bounded = { summary: REBUILD_SUMMARY, instructions: REBUILD_INSTRUCTIONS, maxAttempts: 1 };
  }

  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [model.id, bundle.id],
    sourceHldDesignModelArtifactId: model.id,
    sourceHldSourceBundleArtifactId: bundle.id,
    reviewedAt,
    reviewer: { type: "deterministic", id: reviewedBy },
    sourceReferences: [
      { id: MODEL_REF_ID, artifactId: model.id },
      { id: BUNDLE_REF_ID, artifactId: bundle.id },
    ],
    findings,
    recommendation,
    ...(bounded !== undefined ? { boundedRebuildInstructions: bounded } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE advisory `needs_review` `hld_design_model_review` on the
 * `hld_design_delta_review` stage, tenant-scoped, only after every deterministic
 * gate passes. Throws on blank artifactId or reviewedBy before any store call.
 * Verifies the project within its tenant (not_found / wrong_mode), loads the exact
 * artifact (artifact_not_found, including a route-project id match), gates type +
 * stage (artifact_not_hld_design_model) and reviewable status
 * (artifact_not_reviewable), resolves an approved source bundle
 * (source_bundle_unavailable when none, writing nothing), builds the advisory
 * payload and HARD-GATES it with the Stage 6E-B-001 validator
 * (invalid_review_payload, writing nothing) BEFORE persisting. Returns lean
 * summaries plus the recommendation and finding counts; never the model/review
 * body or the tenant id.
 */
export async function createRfpHldDesignModelDeterministicReview(
  input: CreateRfpHldDesignModelDeterministicReviewInput
): Promise<CreateRfpHldDesignModelDeterministicReviewResult> {
  const artifactId = str(input.artifactId).trim();
  const reviewedBy = str(input.reviewedBy).trim();
  if (artifactId === "") throw new Error("HLD design-model review requires an artifactId.");
  if (reviewedBy === "") throw new Error("HLD design-model review requires a reviewedBy.");

  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const model = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (model === null || model.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (model.type !== MODEL_TYPE || model.stageId !== HLD_STAGE) {
    return { status: "artifact_not_hld_design_model", artifact: toArtifactSummary(model) };
  }
  if (!isArtifactReviewable(model)) {
    return { status: "artifact_not_reviewable", artifact: toArtifactSummary(model) };
  }

  const bundle = await resolveApprovedSourceBundle(tenantId, projectId, model);
  if (bundle === null) {
    return { status: "source_bundle_unavailable", code: "source_bundle_not_resolved" };
  }

  const reviewedAt = (input.reviewedAt ?? new Date()).toISOString();
  const payload = buildRfpHldDesignModelReviewPayload({ model, bundle, reviewedBy, reviewedAt });

  // HARD GATE: the advisory payload must validate before any persistence.
  const validation = validateRfpHldDesignModelReviewPayload(payload);
  if (!validation.valid) {
    return { status: "invalid_review_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: REVIEW_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [model.id, bundle.id],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    recommendation: payload.recommendation,
    findingCount: payload.findings.length,
    findingCountsBySeverity: countBySeverity(payload.findings),
  };
}
