/**
 * Tenant-scoped deterministic RFP HLD DOCUMENT MODEL DRAFT service (Stage 6H-A-002).
 *
 * Produces exactly ONE internal, reviewable (`needs_review`) `hld_document_model`
 * artifact on the existing `hld_design_delta_review` stage. The document model is a
 * pure, deterministic spine compiled from an approved `hld_design_model`, its
 * approved `hld_diagram`, and the approved `hld_source_bundle`, gated by the Stage
 * 6F generation-readiness service. It is internal engineer-review material only: it
 * is NOT the final rendered/reviewable `hld_document`, and it produces NO HTML,
 * draw.io/XML, Mermaid/SVG, technical proposal, export, or customer deliverable,
 * approves nothing, and carries NO SKU/pricing/catalog/configuration/provider/AI
 * authority. Provenance is coarse: every derived entry traces only to the three
 * approved upstream artifact ids (source bundle, design model, diagram).
 *
 * The flow is fail-closed: verify the project within its tenant, run the Stage 6F
 * readiness gate and proceed only when it is ready, resolve the approved
 * model/source-bundle/review ids from the readiness report (never from client
 * input), load and re-gate each artifact, validate the upstream payloads, re-check
 * the source chain, resolve the current approved diagram, derive the document model
 * deterministically, HARD-GATE it with the Stage 6H-A-001 contract validator BEFORE
 * any write, and persist exactly one artifact. Only lean, serializable summaries are
 * returned - never an upstream payload body or the tenant id.
 *
 * It reads only Project state through the project/artifact stores plus the read-only
 * readiness service. It reads NO raw RFP/PDF/DOCX/XLSX file, storage path,
 * evidence/file store, or parser; constructs NO provider adapter and imports NO
 * provider SDK; and makes NO pricing/SKU/catalog/configuration decision.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import { loadRfpHldGenerationReadiness } from "@/lib/projects/project-rfp-hld-generation-readiness";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import {
  RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
  validateRfpHldDocumentModelPayload,
  type RfpHldDocumentModelDiagramReference,
  type RfpHldDocumentModelPayload,
  type RfpHldDocumentModelSummarySection,
  type RfpHldDocumentModelTextEntry,
  type RfpHldDocumentModelTraceSummary,
  type RfpHldDocumentModelValidationFinding,
} from "@/lib/projects/project-rfp-hld-document-model";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";
const DIAGRAM_TYPE: ProjectArtifactType = "hld_diagram";
const DOCUMENT_MODEL_TYPE: ProjectArtifactType = "hld_document_model";

/**
 * Active advisory-review status boundary, mirroring the Stage 6F readiness gate
 * exactly ("generated" | "needs_review" | "approved"). Declared locally so this
 * service depends on no Stage 6F private internals.
 */
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

const DOCUMENT_MODEL_TITLE = "HLD Document Model";
const DOCUMENT_MODEL_PURPOSE =
  "Internal structured HLD document spine compiled from the approved HLD design " +
  "model and topology diagram for engineer review before HLD document rendering.";
const DEFAULT_DIAGRAM_REFERENCE_TITLE = "HLD Topology Diagram";

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDocumentModelDraftProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentModelDraftArtifactSummary {
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

export interface RfpHldDocumentModelDraftPayloadSummary {
  payloadKind: typeof RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND;
  title: string;
  coveredDomainCount: number;
  excludedDomainCount: number;
  assumptionCount: number;
  designSummaryCount: number;
  topologySummaryCount: number;
  siteOrScopeSummaryCount: number;
  implementationNoteCount: number;
  dependencyCount: number;
  riskCount: number;
  complianceTraceCount: number;
  boqTraceCount: number;
  diagramReferenceCount: number;
  validationFindingCount: number;
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
}

/** Stable precondition sub-reason when a readiness-approved chain fails re-gating. */
export type RfpHldDocumentModelDraftPreconditionCode =
  | "readiness_audit_incomplete"
  | "source_bundle_unavailable"
  | "approved_model_unavailable"
  | "review_unavailable"
  | "source_bundle_invalid"
  | "approved_model_invalid"
  | "source_ids_mismatch"
  | "approved_diagram_unavailable"
  | "approved_diagram_stale_or_invalid";

export interface CreateRfpHldDocumentModelDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
}

export type CreateRfpHldDocumentModelDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentModelDraftProjectSummary }
  | { status: "readiness_blocked"; readinessStatus: string; nextAction: string }
  | { status: "precondition_failed"; code: RfpHldDocumentModelDraftPreconditionCode }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDocumentModelDraftArtifactSummary;
      payloadSummary: RfpHldDocumentModelDraftPayloadSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDocumentModelDraftProjectSummary {
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
): RfpHldDocumentModelDraftArtifactSummary {
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

function toPayloadSummary(
  p: RfpHldDocumentModelPayload
): RfpHldDocumentModelDraftPayloadSummary {
  return {
    payloadKind: p.payloadKind,
    title: p.title,
    coveredDomainCount: p.coveredDomains.length,
    excludedDomainCount: p.excludedDomains.length,
    assumptionCount: p.assumptions.length,
    designSummaryCount: p.designSummary.length,
    topologySummaryCount: p.topologySummary.length,
    siteOrScopeSummaryCount: p.siteOrScopeSummary.length,
    implementationNoteCount: p.implementationNotes.length,
    dependencyCount: p.dependencies.length,
    riskCount: p.risksAndCaveats.length,
    complianceTraceCount: p.complianceTraceSummary.length,
    boqTraceCount: p.boqTraceSummary.length,
    diagramReferenceCount: p.diagramReferences.length,
    validationFindingCount: p.validationFindings.length,
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceModelVersion: p.sourceModelVersion,
    sourceDiagramVersion: p.sourceDiagramVersion,
  };
}

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifactType
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

function isActiveReviewOnStage(artifact: ProjectArtifact | null, projectId: string): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * From approved `hld_diagram` candidates, choose the newest (by version, then
 * createdAt) whose payload is contract-valid AND whose row + payload source chain
 * matches the approved model/bundle/review and the current approved model version.
 * Returns null when no approved candidate is both valid and source-compatible.
 */
function selectCurrentApprovedDiagram(
  approved: readonly ProjectArtifact[],
  expect: { modelId: string; bundleId: string; reviewId: string; modelVersion: number }
): ProjectArtifact | null {
  const ordered = approved
    .slice()
    .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime());
  for (const diagram of ordered) {
    if (!validateRfpHldDiagramDraftPayload(diagram.payload).valid) continue;
    if (!sameOrdered(diagram.sourceArtifactIds, [expect.modelId, expect.bundleId, expect.reviewId])) {
      continue;
    }
    const payload = diagram.payload as unknown as RfpHldDiagramDraftPayload;
    if (
      payload.sourceHldDesignModelArtifactId === expect.modelId &&
      payload.sourceHldSourceBundleArtifactId === expect.bundleId &&
      payload.sourceReviewArtifactId === expect.reviewId &&
      payload.sourceModelVersion === expect.modelVersion
    ) {
      return diagram;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure deterministic document-model builder (exported for focused testing)
// ---------------------------------------------------------------------------

function textEntry(id: string, text: string, refId: string): RfpHldDocumentModelTextEntry {
  return { id, text, sourceRefIds: [refId] };
}

/**
 * Compile an approved design model, its approved diagram, and the approved source
 * bundle into a deterministic document-model payload. Covered/excluded domains come
 * from the model; assumptions/implementation notes/risk caveats from the source
 * bundle (plus the model's non-blocking findings); design summaries from the model's
 * sections/decisions; topology summaries from the diagram's node/link/zone counts
 * and labels; scope summaries from the bundle's covered domains and the model's
 * topology zones; compliance/BoQ traces are COUNT-ONLY projections of the model
 * traceability (never SKU/pricing/catalog/config authority); and the single diagram
 * reference points at the approved diagram artifact id only. Every entry traces only
 * to the three coarse upstream artifact ids. No raw bundle/model/diagram body is
 * copied. The caller must HARD-GATE the result with
 * {@link validateRfpHldDocumentModelPayload} before persistence; the builder assumes
 * its inputs are already contract-valid and mutually consistent.
 */
export function buildRfpHldDocumentModelPayload(input: {
  bundle: ProjectArtifact;
  model: ProjectArtifact;
  diagram: ProjectArtifact;
  createdBy: string;
  createdAt: string;
}): RfpHldDocumentModelPayload {
  const bundlePayload = input.bundle.payload as unknown as RfpHldSourceBundlePayload;
  const modelPayload = input.model.payload as unknown as RfpHldDesignModelPayload;
  const diagramPayload = input.diagram.payload as unknown as RfpHldDiagramDraftPayload;
  const bundleId = input.bundle.id;
  const modelId = input.model.id;
  const diagramId = input.diagram.id;

  // Domains: the approved design model is the only domain authority.
  const coveredDomains = [...modelPayload.coveredDomains];
  const excludedDomains = [...modelPayload.excludedDomains];

  // Assumptions: source-bundle assumptions, traced coarsely to the bundle.
  const assumptions = bundlePayload.assumptions.map((entry, i) =>
    textEntry("assumption-" + (i + 1), entry.statement, bundleId)
  );

  // Design summary: one section per model design section, decisions become items.
  const designSummary: RfpHldDocumentModelSummarySection[] = modelPayload.designSections.map(
    (section, i) => {
      const sectionId = "design-section-" + (i + 1);
      return {
        id: sectionId,
        title: section.title,
        items: section.decisions.map((decision, j) =>
          textEntry(sectionId + "-decision-" + (j + 1), decision.label, modelId)
        ),
        sourceRefIds: [modelId],
      };
    }
  );

  // Topology summary: diagram node/link/zone counts, plus zone labels when present.
  const topologySummary: RfpHldDocumentModelSummarySection[] = [
    {
      id: "topology-overview",
      title: "Topology Overview",
      items: [
        textEntry(
          "topology-overview-nodes",
          "Topology contains " + diagramPayload.nodes.length + " node(s).",
          diagramId
        ),
        textEntry(
          "topology-overview-links",
          "Topology contains " + diagramPayload.links.length + " link(s).",
          diagramId
        ),
        textEntry(
          "topology-overview-zones",
          "Topology contains " + diagramPayload.zones.length + " zone(s).",
          diagramId
        ),
      ],
      sourceRefIds: [diagramId],
    },
  ];
  if (diagramPayload.zones.length > 0) {
    topologySummary.push({
      id: "topology-zones",
      title: "Topology Zones",
      items: diagramPayload.zones.map((zone, i) =>
        textEntry("topology-zone-" + (i + 1), "Topology zone: " + zone.label, diagramId)
      ),
      sourceRefIds: [diagramId],
    });
  }

  // Site/scope summary: bundle covered domains and model topology zones.
  const scopeItems: RfpHldDocumentModelTextEntry[] = [
    ...bundlePayload.coveredDomains.map((domain, i) =>
      textEntry("scope-domain-" + (i + 1), "Covered domain: " + domain, bundleId)
    ),
    ...modelPayload.topology.zones.map((zone, i) =>
      textEntry("scope-zone-" + (i + 1), "Topology zone: " + zone.label, modelId)
    ),
  ];
  const siteOrScopeSummary: RfpHldDocumentModelSummarySection[] =
    scopeItems.length > 0
      ? [
          {
            id: "scope-overview",
            title: "Site and Scope",
            items: scopeItems,
            sourceRefIds: [bundleId, modelId],
          },
        ]
      : [];

  // Implementation notes: source-bundle constraints, traced to the bundle.
  const implementationNotes = bundlePayload.constraints.map((entry, i) =>
    textEntry("implementation-" + (i + 1), entry.statement, bundleId)
  );

  // Dependencies: no deterministic source in this slice; left empty by design.
  const dependencies: RfpHldDocumentModelTextEntry[] = [];

  // Risks and caveats: source-bundle warnings and the model's non-blocking findings.
  const risksAndCaveats: RfpHldDocumentModelTextEntry[] = [];
  let riskIndex = 0;
  for (const warning of bundlePayload.warnings) {
    riskIndex += 1;
    risksAndCaveats.push(textEntry("risk-" + riskIndex, warning.message, bundleId));
  }
  for (const finding of modelPayload.validationFindings) {
    riskIndex += 1;
    risksAndCaveats.push(textEntry("risk-" + riskIndex, finding.message, modelId));
  }

  // Compliance trace: count-only projection of the model traceability.
  const complianceTraceSummary: RfpHldDocumentModelTraceSummary[] = [
    {
      id: "compliance-trace-compliance",
      label: "Compliance references mapped in the design model",
      referencedCount: modelPayload.traceability.complianceRefs.length,
      sourceRefIds: [modelId],
    },
    {
      id: "compliance-trace-requirements",
      label: "Requirement references mapped in the design model",
      referencedCount: modelPayload.traceability.requirementRefs.length,
      sourceRefIds: [modelId],
    },
  ];

  // BoQ trace: count-only projection of the model configuration references. Trace
  // only - it carries no SKU/pricing/catalog/configuration authority.
  const boqTraceSummary: RfpHldDocumentModelTraceSummary[] = [
    {
      id: "boq-trace-configuration",
      label: "Configuration references mapped in the design model",
      referencedCount: modelPayload.traceability.configurationRefs.length,
      sourceRefIds: [modelId],
    },
  ];

  // Diagram reference: the approved diagram artifact id only, topology projection.
  const diagramReferences: RfpHldDocumentModelDiagramReference[] = [
    {
      id: "diagram-reference-1",
      diagramArtifactId: diagramId,
      diagramTitle: isNonBlank(diagramPayload.title)
        ? diagramPayload.title
        : DEFAULT_DIAGRAM_REFERENCE_TITLE,
      diagramType: "topology",
      sourceRefIds: [diagramId],
    },
  ];

  // Findings: advisory only. A single info draft marker; never a blocker.
  const validationFindings: RfpHldDocumentModelValidationFinding[] = [
    {
      id: "document-model-draft",
      severity: "info",
      code: "document_model_draft",
      message: "Deterministic HLD document model draft for engineer review.",
      sourceRefIds: [],
    },
  ];

  return {
    payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    sourceArtifactIds: [bundleId, modelId, diagramId],
    sourceHldSourceBundleArtifactId: bundleId,
    sourceHldDesignModelArtifactId: modelId,
    sourceHldDiagramArtifactId: diagramId,
    sourceModelVersion: input.model.version,
    sourceDiagramVersion: input.diagram.version,
    title: DOCUMENT_MODEL_TITLE,
    documentPurpose: DOCUMENT_MODEL_PURPOSE,
    coveredDomains,
    excludedDomains,
    assumptions,
    designSummary,
    topologySummary,
    siteOrScopeSummary,
    implementationNotes,
    dependencies,
    risksAndCaveats,
    complianceTraceSummary,
    boqTraceSummary,
    diagramReferences,
    validationFindings,
  };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE internal `needs_review` `hld_document_model` draft on the
 * `hld_design_delta_review` stage, tenant-scoped, only after every gate passes.
 * Throws on blank projectId or createdBy before any store call. Returns explicit
 * result statuses for not_found, wrong_mode, readiness_blocked, precondition_failed
 * (writing nothing), invalid_payload (writing nothing), and ok. Source ids come from
 * the Stage 6F readiness report, never from input. Never approves anything and never
 * produces a final HLD document / HTML / draw.io / diagram-markup / proposal /
 * export.
 */
export async function createRfpHldDocumentModelDraft(
  input: CreateRfpHldDocumentModelDraftInput
): Promise<CreateRfpHldDocumentModelDraftResult> {
  const projectId = str(input.projectId).trim();
  const createdBy = str(input.createdBy).trim();
  if (projectId === "") throw new Error("HLD document model draft requires a projectId.");
  if (createdBy === "") throw new Error("HLD document model draft requires a createdBy.");

  const { tenantId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Stage 6F readiness is the only gate; proceed only when it is ready.
  const readiness = await loadRfpHldGenerationReadiness({ tenantId, projectId });
  if (readiness.status !== "ready" || readiness.ready !== true) {
    return {
      status: "readiness_blocked",
      readinessStatus: readiness.status,
      nextAction: readiness.nextAction,
    };
  }

  // Resolve the approved bundle/model/review ids from the readiness audit only.
  const audit = readiness.technicalAudit;
  const bundleId = str(audit?.sourceBundleArtifactId).trim();
  const modelId = str(audit?.approvedModelArtifactId).trim();
  const reviewId = str(audit?.reviewArtifactId).trim();
  if (bundleId === "" || modelId === "" || reviewId === "") {
    return { status: "precondition_failed", code: "readiness_audit_incomplete" };
  }

  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return { status: "precondition_failed", code: "source_bundle_unavailable" };
  }
  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return { status: "precondition_failed", code: "approved_model_unavailable" };
  }
  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return { status: "precondition_failed", code: "review_unavailable" };
  }

  const bundleArtifact = bundle as ProjectArtifact;
  const modelArtifact = model as ProjectArtifact;
  const reviewArtifact = review as ProjectArtifact;

  // The approved upstream payloads must still pass their own contracts.
  if (!validateRfpHldSourceBundlePayload(bundleArtifact.payload).valid) {
    return { status: "precondition_failed", code: "source_bundle_invalid" };
  }
  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return { status: "precondition_failed", code: "approved_model_invalid" };
  }

  // Defense in depth on top of readiness: the model points at exactly the bundle
  // (row + payload), and the review points at exactly [model, bundle].
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (
    !sameOrdered(modelArtifact.sourceArtifactIds, [bundleId]) ||
    modelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    !sameOrdered(modelPayload.sourceArtifactIds, [bundleId])
  ) {
    return { status: "precondition_failed", code: "source_ids_mismatch" };
  }
  if (!sameOrdered(reviewArtifact.sourceArtifactIds, [modelId, bundleId])) {
    return { status: "precondition_failed", code: "source_ids_mismatch" };
  }

  // The model may only cover domains established by its approved source bundle.
  const bundlePayload = bundleArtifact.payload as unknown as RfpHldSourceBundlePayload;
  const bundleCovered = new Set<string>(bundlePayload.coveredDomains);
  if (modelPayload.coveredDomains.some((domain) => !bundleCovered.has(domain))) {
    return { status: "precondition_failed", code: "source_ids_mismatch" };
  }

  // Resolve the current approved diagram from the project's approved candidates.
  const diagramRows = await listProjectArtifactsByType(tenantId, projectId, DIAGRAM_TYPE);
  const approvedDiagrams = diagramRows.filter((row) =>
    isApprovedTypeOnStage(row, projectId, DIAGRAM_TYPE)
  );
  if (approvedDiagrams.length === 0) {
    return { status: "precondition_failed", code: "approved_diagram_unavailable" };
  }
  const diagram = selectCurrentApprovedDiagram(approvedDiagrams, {
    modelId,
    bundleId,
    reviewId,
    modelVersion: modelArtifact.version,
  });
  if (diagram === null) {
    return { status: "precondition_failed", code: "approved_diagram_stale_or_invalid" };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload = buildRfpHldDocumentModelPayload({
    bundle: bundleArtifact,
    model: modelArtifact,
    diagram,
    createdBy,
    createdAt,
  });

  // HARD GATE: the derived document model must validate before any persistence.
  const validation = validateRfpHldDocumentModelPayload(payload);
  if (!validation.valid) {
    return { status: "invalid_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: DOCUMENT_MODEL_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [bundleId, modelId, diagram.id],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
