import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

const {
  mockRequireAuth,
  mockGetProjectById,
  mockGetArtifactById,
  mockListArtifactsByType,
  mockCreateArtifact,
  mockCreateApproval,
  state,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListArtifactsByType: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockCreateApproval: vi.fn(),
  state: {
    project: null as Project | null,
    artifacts: [] as ProjectArtifact[],
    approvals: [] as ProjectApproval[],
    seq: 0,
  },
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListArtifactsByType,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import { POST as postGeneratedDocument } from "@/app/api/projects/[id]/rfp/hld-document/generated/route";
import {
  GET as getFinalAuthority,
  POST as postManualDocument,
} from "@/app/api/projects/[id]/rfp/hld-document/route";
import { GET as getCandidateDownload } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/download/route";
import { POST as postDocumentReview } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/review/route";
import { GET as getHldClose } from "@/app/api/projects/[id]/rfp/hld-close/route";
import { GET as getTpHandoff } from "@/app/api/projects/[id]/rfp/tp-handoff-gate/route";

const TENANT = "99999999-9999-9999-9999-999999999999";
const PROJECT = "proj-rhld2";
const CREATED = new Date("2026-07-03T08:00:00.000Z");
const ISO = "2026-07-03T08:00:00.000Z";
const USER = "u-se-rhld2";

const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const REVIEW_ID = "hdmr-1";
const DIAGRAM_ID = "hdg-1";
const DIAGRAM_OUTPUT_ID = "hdgo-1";
const DOCMODEL_ID = "hdocm-1";
const DOCMODEL_2_ID = "hdocm-2";

const VALID_MANUAL_DRAWIO =
  "<mxfile host=\"app\"><diagram id=\"manual\" name=\"Page-1\">" +
  "<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>" +
  "</diagram></mxfile>";

const SESSION = {
  userId: USER,
  tenantId: TENANT,
  email: "se@example.com",
  name: "SE",
  role: "engineer" as const,
};

function req(body: unknown = undefined): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

function params(id = PROJECT) {
  return { params: { id } };
}

function artifactParams(artifactId: string, id = PROJECT) {
  return { params: { id, artifactId } };
}

function nextDate(): Date {
  state.seq += 1;
  return new Date(Date.UTC(2026, 6, 3, 9, 0, state.seq));
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "R-HLD-2 RFP",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

function baseArtifact(overrides: Partial<ProjectArtifact>): ProjectArtifact {
  return {
    id: overrides.id ?? `art-${state.seq + 1}`,
    projectId: overrides.projectId ?? PROJECT,
    stageId: overrides.stageId ?? "hld_design_delta_review",
    type: overrides.type ?? "hld_document",
    status: overrides.status ?? "approved",
    version: overrides.version ?? 1,
    payload: overrides.payload ?? {},
    sourceFileIds: overrides.sourceFileIds ?? [],
    sourceArtifactIds: overrides.sourceArtifactIds ?? [],
    createdAt: overrides.createdAt ?? CREATED,
    updatedAt: overrides.updatedAt ?? CREATED,
  };
}

function sourceBundlePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_source_bundle",
    createdBy: USER,
    createdAt: ISO,
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    },
    authorities: {
      evidencePackage: {
        artifactId: "evp-1",
        artifactType: "evidence_package",
        stageId: "intake_package_review",
        status: "approved",
        version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1",
        artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review",
        status: "approved",
        version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1",
        artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review",
        status: "approved",
        version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1",
        artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review",
        status: "approved",
        version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1",
        artifactType: "hld_intake",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1",
        artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1",
        artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review",
        status: "approved",
        version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack",
        domain: "campus_switching",
      },
    ],
    hldIntakeAnswers: {
      sourceHldIntakeArtifactId: "hint-1",
      sourceHldIntakeVersion: 1,
      sourceMode: "manual_override",
      answers: [
        {
          fieldId: "target_topology_intent",
          label: "Target topology intent",
          status: "answered",
          value: "Collapsed core campus.",
        },
      ],
      answerCount: 1,
      statusCounts: { answered: 1, unknown: 0, not_applicable: 0 },
    },
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [{ id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" }],
    constraints: [{ id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" }],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: ISO },
  };
}

function designModelPayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_design_model",
    createdBy: USER,
    createdAt: ISO,
    sourceArtifactIds: [BUNDLE_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ID }],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1",
        domain: "campus_switching",
        title: "Campus Switching Design",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "Use redundant switching", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "l-1",
          label: "Core to Access",
          fromNodeId: "n-1",
          toNodeId: "n-2",
          linkType: "ethernet",
          sourceRefIds: ["sr-1"],
        },
      ],
      zones: [{ id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] }],
    },
    diagramIntents: [{ id: "di-1", title: "Campus Topology", intentType: "physical", sourceRefIds: ["sr-1"] }],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [
      {
        id: "vf-1",
        severity: "warning",
        code: "PARTIAL_DETAIL",
        message: "Some rack detail missing.",
        sourceRefIds: ["sr-1"],
      },
    ],
    engineerReview: { status: "pending", requiredActions: ["Review topology diagram"] },
  };
}

function diagramPayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_diagram_draft",
    createdAt: ISO,
    createdBy: USER,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: 2,
    diagramType: "topology",
    title: "Campus Topology Diagram Draft",
    nodes: [
      {
        id: "n1",
        label: "Core Switch",
        nodeType: "switch",
        domain: "campus_switching",
        zoneId: "z1",
        sourceRefIds: ["ref-model"],
      },
      { id: "n2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["ref-model"] },
    ],
    links: [
      {
        id: "l1",
        label: "Uplink",
        fromNodeId: "n1",
        toNodeId: "n2",
        linkType: "ethernet",
        sourceRefIds: ["ref-model"],
      },
    ],
    zones: [{ id: "z1", label: "Campus Core", nodeIds: ["n1"], sourceRefIds: ["ref-bundle"] }],
    sourceReferences: [
      { id: "ref-model", artifactId: MODEL_ID, artifactType: "hld_design_model" },
      { id: "ref-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
      { id: "ref-review", artifactId: REVIEW_ID, artifactType: "hld_design_model_review" },
    ],
    validationFindings: [],
  };
}

function diagramOutputPayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_diagram_output",
    createdAt: ISO,
    createdBy: USER,
    sourceArtifactIds: [DIAGRAM_ID],
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceDiagramVersion: 5,
    outputFormat: "drawio_compatible_v1",
    diagramType: "topology",
    title: "Core Topology Output",
    canvas: { width: 1200, height: 800, gridSize: 10 },
    zones: [
      {
        id: "zone-core",
        label: "Core",
        geometry: { x: 0, y: 0, width: 400, height: 300 },
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    nodes: [
      {
        id: "node-a",
        label: "Router A",
        zoneId: "zone-core",
        geometry: { x: 10, y: 10, width: 80, height: 40 },
        sourceRefIds: [DIAGRAM_ID],
      },
      {
        id: "node-b",
        label: "Switch B",
        geometry: { x: 200, y: 10, width: 80, height: 40 },
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    links: [
      {
        id: "link-1",
        sourceNodeId: "node-a",
        targetNodeId: "node-b",
        label: "uplink",
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    validationFindings: [],
  };
}

function documentModelPayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_document_model",
    createdAt: ISO,
    createdBy: USER,
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceModelVersion: 2,
    sourceDiagramVersion: 5,
    title: "HLD Document Model",
    documentPurpose: "Internal structured HLD document spine for engineer review.",
    coveredDomains: ["campus_switching"],
    excludedDomains: [],
    assumptions: [{ id: "as-1", text: "Existing power and rack space are sufficient.", sourceRefIds: [MODEL_ID] }],
    designSummary: [
      {
        id: "ds-1",
        title: "Core Design",
        items: [{ id: "ds-1-i1", text: "Collapsed core with redundant uplinks.", sourceRefIds: [MODEL_ID] }],
        sourceRefIds: [MODEL_ID],
      },
    ],
    topologySummary: [
      {
        id: "ts-1",
        title: "Topology Overview",
        items: [{ id: "ts-1-i1", text: "Two-tier campus topology.", sourceRefIds: [DIAGRAM_ID] }],
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    siteOrScopeSummary: [
      {
        id: "ss-1",
        title: "Single Site",
        items: [{ id: "ss-1-i1", text: "One primary data hall.", sourceRefIds: [BUNDLE_ID] }],
        sourceRefIds: [BUNDLE_ID],
      },
    ],
    implementationNotes: [{ id: "in-1", text: "Stage migration after hours.", sourceRefIds: [MODEL_ID] }],
    dependencies: [{ id: "dp-1", text: "Depends on the approved cabling plan.", sourceRefIds: [BUNDLE_ID] }],
    risksAndCaveats: [{ id: "rk-1", text: "Lead times may shift the schedule.", sourceRefIds: [MODEL_ID] }],
    complianceTraceSummary: [{ id: "ct-1", label: "Mapped compliance items", referencedCount: 12, sourceRefIds: [BUNDLE_ID] }],
    boqTraceSummary: [{ id: "bt-1", label: "Referenced BoQ groups", referencedCount: 5, sourceRefIds: [BUNDLE_ID] }],
    diagramReferences: [
      {
        id: "dr-1",
        diagramArtifactId: DIAGRAM_ID,
        diagramTitle: "HLD Topology Diagram",
        diagramType: "topology",
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    validationFindings: [{ id: "vf-1", severity: "info", code: "draft", message: "Draft for review.", sourceRefIds: [] }],
  };
}

function addArtifact(artifact: ProjectArtifact): ProjectArtifact {
  state.artifacts.push(artifact);
  return artifact;
}

function findArtifact(id: string): ProjectArtifact {
  const artifact = state.artifacts.find((a) => a.id === id);
  if (!artifact) throw new Error(`missing artifact ${id}`);
  return artifact;
}

function seedApprovedChain(): void {
  addArtifact(baseArtifact({
    id: BUNDLE_ID,
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: sourceBundlePayload(),
  }));
  addArtifact(baseArtifact({
    id: MODEL_ID,
    type: "hld_design_model",
    status: "approved",
    version: 2,
    payload: designModelPayload(),
    sourceArtifactIds: [BUNDLE_ID],
  }));
  addArtifact(baseArtifact({
    id: REVIEW_ID,
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    payload: { payloadKind: "rfp_hld_design_model_review" },
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
  }));
  addArtifact(baseArtifact({
    id: DIAGRAM_ID,
    type: "hld_diagram",
    status: "approved",
    version: 5,
    payload: diagramPayload(),
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
  }));
  addArtifact(baseArtifact({
    id: DIAGRAM_OUTPUT_ID,
    type: "hld_diagram_output",
    status: "approved",
    version: 2,
    payload: diagramOutputPayload(),
    sourceArtifactIds: [DIAGRAM_ID],
  }));
  addArtifact(baseArtifact({
    id: DOCMODEL_ID,
    type: "hld_document_model",
    status: "approved",
    version: 3,
    payload: documentModelPayload(),
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
  }));
}

function addSecondDocumentModel(): ProjectArtifact {
  return addArtifact(baseArtifact({
    id: DOCMODEL_2_ID,
    type: "hld_document_model",
    status: "approved",
    version: 4,
    payload: documentModelPayload(),
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    createdAt: nextDate(),
    updatedAt: nextDate(),
  }));
}

function artifactStatusForDecision(decision: ProjectApproval["decision"]): ProjectArtifactStatus {
  return decision === "approved" ? "approved" : "rejected";
}

function stageStatusForDecision(decision: ProjectApproval["decision"]): ProjectStageStatus {
  return decision === "approved" ? "approved" : "rejected";
}

function resetState(mode: Project["mode"] = "rfp"): void {
  state.seq = 0;
  state.project = project({ mode });
  state.artifacts = [];
  state.approvals = [];
  seedApprovedChain();

  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockGetProjectById.mockReset().mockImplementation(async (tenantId: string, projectId: string) => {
    if (tenantId !== TENANT || projectId !== PROJECT) return null;
    return state.project;
  });
  mockGetArtifactById.mockReset().mockImplementation(
    async (tenantId: string, projectId: string, artifactId: string) => {
      if (tenantId !== TENANT || projectId !== PROJECT) return null;
      return state.artifacts.find((a) => a.id === artifactId) ?? null;
    }
  );
  mockListArtifactsByType.mockReset().mockImplementation(
    async (tenantId: string, projectId: string, type: ProjectArtifactType) => {
      if (tenantId !== TENANT || projectId !== PROJECT) return [];
      return state.artifacts
        .filter((a) => a.projectId === projectId && a.type === type)
        .sort((a, b) => a.version - b.version);
    }
  );
  mockCreateArtifact.mockReset().mockImplementation(
    async (input: {
      projectId: string;
      stageId: ProjectStageId;
      type: ProjectArtifactType;
      status?: ProjectArtifactStatus;
      payload?: Record<string, unknown>;
      sourceFileIds?: string[];
      sourceArtifactIds?: string[];
    }) => {
      const sameType = state.artifacts.filter((a) => a.projectId === input.projectId && a.type === input.type);
      const version = Math.max(0, ...sameType.map((a) => a.version)) + 1;
      const createdAt = nextDate();
      const artifact = baseArtifact({
        id: `created-${input.type}-${version}-${state.seq}`,
        projectId: input.projectId,
        stageId: input.stageId,
        type: input.type,
        status: input.status ?? "generated",
        version,
        payload: input.payload ?? {},
        sourceFileIds: input.sourceFileIds ?? [],
        sourceArtifactIds: input.sourceArtifactIds ?? [],
        createdAt,
        updatedAt: createdAt,
      });
      state.artifacts.push(artifact);
      return artifact;
    }
  );
  mockCreateApproval.mockReset().mockImplementation(
    async (input: {
      projectId: string;
      artifactId: string;
      decision: ProjectApproval["decision"];
      decidedBy: string;
      decidedAt?: Date;
      note?: string;
    }) => {
      const artifact = state.artifacts.find((a) => a.projectId === input.projectId && a.id === input.artifactId);
      if (!artifact) return null;
      const decidedAt = input.decidedAt ?? nextDate();
      const approval: ProjectApproval = {
        id: `approval-${state.approvals.length + 1}`,
        projectId: input.projectId,
        stageId: artifact.stageId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        decision: input.decision,
        decidedBy: input.decidedBy,
        decidedAt,
        ...(input.note !== undefined ? { note: input.note } : {}),
      };
      artifact.status = artifactStatusForDecision(input.decision);
      artifact.updatedAt = decidedAt;
      state.approvals.push(approval);
      return {
        approval,
        artifactStatus: artifact.status,
        stageStatus: stageStatusForDecision(input.decision),
      };
    }
  );
}

async function createGeneratedCandidate(): Promise<string> {
  const res = await postGeneratedDocument(req({ documentModelArtifactId: DOCMODEL_ID }), params());
  expect(res.status).toBe(201);
  const json = await res.json();
  expectNoJsonLeak(json);
  expect(json.payloadSummary.sourceMode).toBe("generated_drawio_output");
  return json.artifact.id as string;
}

async function uploadManualCandidate(documentModelArtifactId = DOCMODEL_ID): Promise<string> {
  const res = await postManualDocument(
    req({
      documentModelArtifactId,
      title: "SE Manual Final HLD",
      uploadedFileName: "se-edited.drawio",
      drawioXml: VALID_MANUAL_DRAWIO,
      note: "SE edited candidate in draw.io.",
    }),
    params()
  );
  expect(res.status).toBe(201);
  const json = await res.json();
  expectNoJsonLeak(json);
  expect(json.payloadSummary.sourceMode).toBe("manual_drawio_upload");
  return json.artifact.id as string;
}

async function reviewArtifact(artifactId: string, decision: "approve" | "reject" = "approve"): Promise<Response> {
  return postDocumentReview(req({ decision }), artifactParams(artifactId));
}

async function approveArtifact(artifactId: string): Promise<void> {
  const res = await reviewArtifact(artifactId, "approve");
  expect(res.status).toBe(200);
  expectNoJsonLeak(await res.json());
}

async function rejectArtifact(artifactId: string): Promise<void> {
  const res = await reviewArtifact(artifactId, "reject");
  expect(res.status).toBe(200);
  expectNoJsonLeak(await res.json());
}

async function expectCandidateDownloadOk(artifactId: string): Promise<void> {
  const res = await getCandidateDownload(req(), artifactParams(artifactId));
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("application/vnd.jgraph.mxfile");
  expect(res.headers.get("Content-Disposition")).toContain(".drawio");
  const body = Buffer.from(await res.arrayBuffer()).toString("utf8");
  expect(body).toContain("<mxfile");
  expect(body).toContain("Router A");
  expect(body).toContain("Switch B");
}

async function expectCloseBlocked(code: string, blockerCode?: string): Promise<void> {
  const close = await getHldClose(req(), params());
  expect(close.status).toBe(409);
  const closeJson = await close.json();
  expect(closeJson.code).toBe(code);
  if (blockerCode !== undefined) expect(closeJson.blockerCode).toBe(blockerCode);
  expectNoJsonLeak(closeJson);

  const handoff = await getTpHandoff(req(), params());
  expect(handoff.status).toBe(409);
  const handoffJson = await handoff.json();
  expect(handoffJson.code).toBe("tp_handoff_blocked");
  expectNoJsonLeak(handoffJson);
}

async function expectReadyAuthority(finalAuthorityStatus: string, closeKind: string): Promise<void> {
  const final = await getFinalAuthority(req(), params());
  expect(final.status).toBe(200);
  const finalJson = await final.json();
  expect(finalJson.finalAuthority.finalAuthorityStatus).toBe(finalAuthorityStatus);
  expectNoJsonLeak(finalJson);

  const close = await getHldClose(req(), params());
  expect(close.status).toBe(200);
  const closeJson = await close.json();
  expect(closeJson.closeKind).toBe(closeKind);
  expectNoJsonLeak(closeJson);

  const handoff = await getTpHandoff(req(), params());
  expect(handoff.status).toBe(200);
  const handoffJson = await handoff.json();
  expect(handoffJson.gateStatus).toBe("tp_handoff_ready");
  expect(handoffJson.hldClose.closeKind).toBe(closeKind);
  expectNoJsonLeak(handoffJson);
}

function expectNoJsonLeak(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toContain(VALID_MANUAL_DRAWIO);
  expect(text).not.toContain("<mxfile");
  expect(text).not.toContain("drawioXml\"");
  expect(text).not.toContain("providerResponse");
  expect(text).not.toContain("rawResponse");
  expect(text).not.toContain("C:\\");
  expect(text).not.toContain(TENANT);
}

beforeEach(() => resetState());

describe("R-HLD-2 final HLD authority API chain - generated path", () => {
  it("goes from approved diagram output to generated candidate approval, final selector, HLD close, and TP handoff ready", async () => {
    const generatedId = await createGeneratedCandidate();

    await expectCloseBlocked("hld_not_closed", "generated_hld_document_pending_review");
    await approveArtifact(generatedId);
    await expectReadyAuthority(
      "approved_generated_hld_document",
      "approved_generated_hld_document_final"
    );
  });
});

describe("R-HLD-2 final HLD authority API chain - manual edit path", () => {
  it("downloads the generated candidate, uploads the SE-edited draw.io, approves manual authority, closes HLD, and opens TP handoff", async () => {
    const generatedId = await createGeneratedCandidate();
    await expectCandidateDownloadOk(generatedId);

    const manualId = await uploadManualCandidate();
    await expectCloseBlocked("hld_not_closed", "manual_upload_pending_review");

    await approveArtifact(manualId);
    await expectReadyAuthority(
      "approved_manual_drawio_upload",
      "approved_manual_drawio_upload_final"
    );
  });
});

describe("R-HLD-2 final HLD authority API chain - failure and stale paths", () => {
  it("blocks close and TP handoff for an approved generated authority whose source chain went stale", async () => {
    const generatedId = await createGeneratedCandidate();
    await approveArtifact(generatedId);

    findArtifact(DIAGRAM_OUTPUT_ID).status = "stale";

    const final = await getFinalAuthority(req(), params());
    expect(final.status).toBe(409);
    const finalJson = await final.json();
    expect(finalJson.code).toBe("hld_document_final_authority_stale");
    expect(finalJson.blockerCode).toBe("source_diagram_output_unavailable");
    expectNoJsonLeak(finalJson);

    await expectCloseBlocked("hld_close_final_authority_stale", "source_diagram_output_unavailable");
  });

  it("keeps a stale approved manual authority fail-closed and does not fall back to an older valid generated authority", async () => {
    const generatedId = await createGeneratedCandidate();
    await approveArtifact(generatedId);

    const manualDocumentModel = addSecondDocumentModel();
    const manualId = await uploadManualCandidate(manualDocumentModel.id);
    await approveArtifact(manualId);
    await expectReadyAuthority(
      "approved_manual_drawio_upload",
      "approved_manual_drawio_upload_final"
    );

    manualDocumentModel.status = "stale";

    const final = await getFinalAuthority(req(), params());
    expect(final.status).toBe(409);
    const finalJson = await final.json();
    expect(finalJson.code).toBe("hld_document_final_authority_stale");
    expect(finalJson.blockerCode).toBe("source_document_model_unavailable");
    expect(finalJson.artifact.id).toBe(manualId);
    expectNoJsonLeak(finalJson);

    await expectCloseBlocked("hld_close_final_authority_stale", "source_document_model_unavailable");
  });

  it("does not open HLD close or TP handoff for pending generated or manual artifacts", async () => {
    await createGeneratedCandidate();
    await expectCloseBlocked("hld_not_closed", "generated_hld_document_pending_review");

    resetState();
    await uploadManualCandidate();
    await expectCloseBlocked("hld_not_closed", "manual_upload_pending_review");
  });

  it("does not treat rejected generated or manual artifacts as final authority", async () => {
    const generatedId = await createGeneratedCandidate();
    await rejectArtifact(generatedId);
    await expectCloseBlocked("hld_not_closed", "no_final_hld_document");

    const manualId = await uploadManualCandidate();
    await rejectArtifact(manualId);
    await expectCloseBlocked("hld_not_closed", "no_final_hld_document");
  });
});
