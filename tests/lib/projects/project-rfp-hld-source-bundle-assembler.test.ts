import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectStageId,
} from "@/types/project";
import { validateRfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";

// Mock the composed boundaries only; the pure readiness / BoQ / domain helpers and
// the Stage 6B-001 contract all run for real over the supplied fixtures.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-file-store", () => ({ listProjectFiles: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
  listProjectArtifacts: vi.fn(),
}));

import {
  buildRfpHldSourceBundleDraft,
  createRfpHldSourceBundleDraft,
  type CreateRfpHldSourceBundleDraftInput,
} from "@/lib/projects/project-rfp-hld-source-bundle-assembler";
import { getProjectById } from "@/lib/db/project-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const listFilesMock = vi.mocked(listProjectFiles);
const listArtifactsMock = vi.mocked(listProjectArtifacts);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const CREATED_BY = "engineer-1";
const FIXED_CREATED = new Date("2026-06-23T09:15:00.000Z");
const TS = new Date("2026-06-12T00:00:00.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  evidence_package: "intake_package_review",
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  configuration_expansion: "configuration_expansion_review",
  hld_intake: "hld_design_delta_review",
  design_knowledge_pack: "hld_design_delta_review",
  hld_readiness_snapshot: "hld_design_delta_review",
};

function mk(
  id: string,
  type: ProjectArtifactType,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "hld_design_delta_review",
    type,
    status,
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function boqFile(): ProjectFile {
  return {
    id: "file-boq-1",
    projectId: PROJECT,
    fileRole: "boq",
    fileName: "customer-boq.xlsx",
    storagePath: "s3://bucket/customer-boq.xlsx",
    uploadedAt: TS,
    retainUntil: new Date("2027-06-12T00:00:00.000Z"),
  };
}

// ---- normal (BoQ present, one campus pack) happy fixtures ------------------

const MANUAL_OVERRIDE_REASON = "Engineer entered the intake manually.";

const NORMAL_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "dkp-1"];

function normalArtifacts(): ProjectArtifact[] {
  return [
    mk("evp-1", "evidence_package", "approved"),
    mk("req-1", "requirements_baseline", "approved", {
      payload: {
        requirements: [
          { id: "r1", text: "Campus switching refresh using Catalyst 9300 access switches." },
        ],
      },
    }),
    mk("cmx-1", "compliance_matrix", "approved", {
      payload: {
        payloadKind: "rfp_compliance_matrix",
        sourceConfigurationExpansionArtifactId: "cfg-1",
        rows: [],
      },
    }),
    mk("cfg-1", "configuration_expansion", "approved", {
      payload: {
        acceptedLines: [{ sku: "C9300-48P", description: "Catalyst 9300 access switch" }],
      },
    }),
    mk("hint-1", "hld_intake", "approved", {
      payload: {
        payloadKind: "rfp_hld_intake",
        sourceMode: "manual_override",
        manualOverrideReason: MANUAL_OVERRIDE_REASON,
        answers: [
          {
            fieldId: "resiliency_expectations",
            label: "Resiliency expectations",
            status: "unknown",
            notes: "awaiting customer",
          },
        ],
      },
    }),
    mk("dkp-1", "design_knowledge_pack", "approved", {
      payload: {
        payloadKind: "rfp_hld_design_knowledge_pack",
        source: "manual_operator_entry",
        domain: "campus_switching",
        title: "Campus switching pack",
        designPrinciples: ["  Collapsed core for the campus.  ", ""],
        topologyGuidance: ["Dual uplinks per access switch."],
        constraints: [],
        assumptions: [],
        exclusions: [],
        validationNotes: [],
      },
    }),
    mk("hrs-1", "hld_readiness_snapshot", "approved", {
      sourceArtifactIds: [...NORMAL_SOURCE_IDS],
      payload: {
        payloadKind: "rfp_hld_readiness_snapshot",
        readinessStatus: "ready",
        missingInputs: [],
        sourceEvidencePackageArtifactId: "evp-1",
        sourceRequirementsBaselineArtifactId: "req-1",
        sourceComplianceMatrixArtifactId: "cmx-1",
        sourceConfigurationArtifactId: "cfg-1",
        sourceHldIntakeArtifactId: "hint-1",
        hldIntakeSource: { sourceMode: "manual_override", manualOverrideReason: MANUAL_OVERRIDE_REASON },
        sourceArtifactIds: [...NORMAL_SOURCE_IDS],
      },
    }),
  ];
}

function pureInput(
  artifacts: ProjectArtifact[],
  files: ProjectFile[]
): Parameters<typeof buildRfpHldSourceBundleDraft>[0] {
  return { projectId: PROJECT, files, artifacts, createdBy: CREATED_BY, createdAt: FIXED_CREATED };
}

// ---- no-BoQ / service-only exception happy fixtures ------------------------

const NO_BOQ_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-exc-1", "hint-1"];

function noBoqArtifacts(): ProjectArtifact[] {
  return [
    mk("evp-1", "evidence_package", "approved"),
    mk("req-1", "requirements_baseline", "approved", {
      payload: {
        requirements: [{ id: "r1", text: "The customer seeks an outcome-based engagement." }],
      },
    }),
    mk("cmx-1", "compliance_matrix", "approved", {
      payload: {
        payloadKind: "rfp_compliance_matrix",
        sourceConfigurationExpansionArtifactId: "cfg-exc-1",
        rows: [],
      },
    }),
    mk("cfg-exc-1", "configuration_expansion", "approved", {
      payload: { payloadKind: "rfp_no_boq_service_only_exception", reason: "Services only" },
    }),
    mk("hint-1", "hld_intake", "approved", {
      payload: {
        payloadKind: "rfp_hld_intake",
        sourceMode: "manual_override",
        manualOverrideReason: MANUAL_OVERRIDE_REASON,
        answers: [],
      },
    }),
    mk("hrs-1", "hld_readiness_snapshot", "approved", {
      sourceArtifactIds: [...NO_BOQ_SOURCE_IDS],
      payload: {
        payloadKind: "rfp_hld_readiness_snapshot",
        readinessStatus: "ready",
        missingInputs: [],
        sourceEvidencePackageArtifactId: "evp-1",
        sourceRequirementsBaselineArtifactId: "req-1",
        sourceComplianceMatrixArtifactId: "cmx-1",
        sourceConfigurationArtifactId: "cfg-exc-1",
        sourceHldIntakeArtifactId: "hint-1",
        hldIntakeSource: { sourceMode: "manual_override", manualOverrideReason: MANUAL_OVERRIDE_REASON },
        sourceArtifactIds: [...NO_BOQ_SOURCE_IDS],
      },
    }),
  ];
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP Bid",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "art-bundle-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [...NORMAL_SOURCE_IDS, "hrs-1"],
    createdAt: new Date("2026-06-23T09:15:01.000Z"),
    updatedAt: new Date("2026-06-23T09:15:02.000Z"),
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateRfpHldSourceBundleDraftInput> = {}
): CreateRfpHldSourceBundleDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

// ============================================================================
// Pure assembler
// ============================================================================

describe("buildRfpHldSourceBundleDraft - happy path (normal configuration_expansion)", () => {
  it("compiles a valid bundle over approved authorities and the campus pack", () => {
    const result = buildRfpHldSourceBundleDraft(pureInput(normalArtifacts(), [boqFile()]));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const { payload } = result;

    expect(validateRfpHldSourceBundlePayload(payload).errors).toEqual([]);
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toBe(FIXED_CREATED.toISOString());
    expect(payload.coveredDomains).toEqual(["campus_switching"]);
    expect(payload.missingDomains).toEqual([]);
    expect(payload.excludedDomains).not.toContain("campus_switching");
    expect(payload.designKnowledgePackRefs.map((r) => r.artifactId)).toEqual(["dkp-1"]);
    expect(payload.authorities.configurationAuthority.sourceKind).toBe("configuration_expansion");
    expect("payloadKind" in payload.authorities.configurationAuthority).toBe(false);
    expect(payload.lineage.compiledFromReadinessSnapshotArtifactId).toBe("hrs-1");
    expect(new Set(payload.sourceArtifactIds)).toEqual(
      new Set([...NORMAL_SOURCE_IDS, "hrs-1"])
    );
    expect(payload.assumptions).toEqual([
      { id: "assumption-resiliency_expectations", statement: "awaiting customer", sourceArtifactId: "hint-1" },
    ]);
    expect(payload.blockers).toEqual([]);

    // Compact approved DKP content, source-proven and bijective with the ref.
    const contents = payload.designKnowledgePackContents ?? [];
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({
      contentKind: "rfp_hld_approved_design_knowledge_content",
      artifactId: "dkp-1",
      artifactType: "design_knowledge_pack",
      stageId: "hld_design_delta_review",
      status: "approved",
      version: 1,
      payloadKind: "rfp_hld_design_knowledge_pack",
      domain: "campus_switching",
      source: "manual_operator_entry",
      entryCount: 2,
    });
    // Trimmed and blank-dropped by the pure content selector.
    expect(contents[0].designPrinciples).toEqual(["Collapsed core for the campus."]);
    expect(contents[0].topologyGuidance).toEqual(["Dual uplinks per access switch."]);

    // Sanitized approved HLD intake answers, copied from the approved hld_intake.
    expect(payload.hldIntakeAnswers).toEqual({
      sourceHldIntakeArtifactId: "hint-1",
      sourceHldIntakeVersion: 1,
      sourceMode: "manual_override",
      answers: [
        {
          fieldId: "resiliency_expectations",
          label: "Resiliency expectations",
          status: "unknown",
          notes: "awaiting customer",
        },
      ],
      answerCount: 1,
      statusCounts: { answered: 0, unknown: 1, not_applicable: 0 },
    });
  });
});

describe("buildRfpHldSourceBundleDraft - happy path (no-BoQ service-only exception)", () => {
  it("compiles a valid bundle with the exception as configuration authority and no packs", () => {
    const result = buildRfpHldSourceBundleDraft(pureInput(noBoqArtifacts(), []));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const { payload } = result;

    expect(validateRfpHldSourceBundlePayload(payload).errors).toEqual([]);
    expect(payload.coveredDomains).toEqual([]);
    expect(payload.designKnowledgePackRefs).toEqual([]);
    expect(payload.designKnowledgePackContents).toEqual([]);
    expect(payload.authorities.configurationAuthority.sourceKind).toBe("no_boq_service_only_exception");
    expect(payload.authorities.configurationAuthority.payloadKind).toBe(
      "rfp_no_boq_service_only_exception"
    );
    expect(new Set(payload.sourceArtifactIds)).toEqual(new Set([...NO_BOQ_SOURCE_IDS, "hrs-1"]));
  });
});

describe("buildRfpHldSourceBundleDraft - missing / unapproved authorities", () => {
  for (const dropType of [
    "evidence_package",
    "requirements_baseline",
    "compliance_matrix",
    "hld_intake",
    "hld_readiness_snapshot",
  ] as ProjectArtifactType[]) {
    it(`blocks when ${dropType} is absent`, () => {
      const artifacts = normalArtifacts().filter((a) => a.type !== dropType);
      const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
      expect(result.status).toBe("blocked");
    });
  }

  it("blocks when a required authority is present but not approved", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "compliance_matrix" ? { ...a, status: "needs_review" as ProjectArtifactStatus } : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("hld_readiness_not_ready");
  });

  it("blocks (ignores) artifacts that belong to a different project", () => {
    const foreign = normalArtifacts().map((a) => ({ ...a, projectId: "other-project" }));
    const result = buildRfpHldSourceBundleDraft(pureInput(foreign, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("hld_readiness_not_ready");
  });
});

describe("buildRfpHldSourceBundleDraft - configuration source integrity", () => {
  it("blocks when the compliance matrix cites a different configuration source", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "compliance_matrix"
        ? {
            ...a,
            payload: {
              payloadKind: "rfp_compliance_matrix",
              sourceConfigurationExpansionArtifactId: "cfg-stale",
              rows: [],
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("configuration_source_mismatch");
  });

  it("blocks a no-BoQ exception while the project has a BoQ file", () => {
    // BoQ file present, but the only approved configuration is a no-BoQ exception.
    const artifacts = noBoqArtifacts(); // exception-based set
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
  });
});

describe("buildRfpHldSourceBundleDraft - readiness snapshot integrity", () => {
  it("blocks when no approved readiness snapshot exists", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "hld_readiness_snapshot" ? { ...a, status: "needs_review" as ProjectArtifactStatus } : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("missing_readiness_snapshot");
  });

  it("blocks a stale snapshot whose source ids no longer match current ready inputs", () => {
    const artifacts = normalArtifacts().map((a) => {
      if (a.type !== "hld_readiness_snapshot") return a;
      const staleIds = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1"]; // dropped pack id
      return {
        ...a,
        sourceArtifactIds: staleIds,
        payload: { ...(a.payload as object), sourceArtifactIds: staleIds },
      };
    });
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("stale_readiness_snapshot");
  });
});

// A questionnaire-assisted variant: the intake records questionnaire provenance,
// and the approved snapshot records the matching provenance. The questionnaire id
// is provenance only - it never joins the bundle's source ids.
const QUESTIONNAIRE_ID = "q-src-1";

function questionnaireAssistedArtifacts(): ProjectArtifact[] {
  return normalArtifacts().map((a) => {
    if (a.type === "hld_intake") {
      return {
        ...a,
        sourceArtifactIds: [QUESTIONNAIRE_ID],
        payload: {
          payloadKind: "rfp_hld_intake",
          sourceMode: "questionnaire_assisted",
          sourceQuestionnaireArtifactId: QUESTIONNAIRE_ID,
          questionnaireReview: { sourceQuestionnaireArtifactId: QUESTIONNAIRE_ID },
          answers: [],
        },
      };
    }
    if (a.type === "hld_readiness_snapshot") {
      return {
        ...a,
        payload: {
          ...(a.payload as object),
          hldIntakeSource: {
            sourceMode: "questionnaire_assisted",
            sourceQuestionnaireArtifactId: QUESTIONNAIRE_ID,
          },
        },
      };
    }
    return a;
  });
}

describe("buildRfpHldSourceBundleDraft - hld intake source provenance", () => {
  it("carries manual_override hldIntakeSource without adding any questionnaire id", () => {
    const result = buildRfpHldSourceBundleDraft(pureInput(normalArtifacts(), [boqFile()]));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payload.hldIntakeSource).toEqual({
      sourceMode: "manual_override",
      manualOverrideReason: MANUAL_OVERRIDE_REASON,
    });
    expect(new Set(result.payload.sourceArtifactIds)).toEqual(
      new Set([...NORMAL_SOURCE_IDS, "hrs-1"])
    );
  });

  it("carries questionnaire_assisted provenance but keeps the questionnaire id out of source ids and lineage", () => {
    const result = buildRfpHldSourceBundleDraft(
      pureInput(questionnaireAssistedArtifacts(), [boqFile()])
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payload.hldIntakeSource).toEqual({
      sourceMode: "questionnaire_assisted",
      sourceQuestionnaireArtifactId: QUESTIONNAIRE_ID,
    });
    expect(result.payload.sourceArtifactIds).not.toContain(QUESTIONNAIRE_ID);
    expect(result.payload.lineage.compiledArtifactIds).not.toContain(QUESTIONNAIRE_ID);
    expect(validateRfpHldSourceBundlePayload(result.payload).errors).toEqual([]);
    // Sanitized intake answers record questionnaire-assisted provenance but never
    // the questionnaireReview audit or the source questionnaire id.
    expect(result.payload.hldIntakeAnswers).toEqual({
      sourceHldIntakeArtifactId: "hint-1",
      sourceHldIntakeVersion: 1,
      sourceMode: "questionnaire_assisted",
      answers: [],
      answerCount: 0,
      statusCounts: { answered: 0, unknown: 0, not_applicable: 0 },
    });
    expect(JSON.stringify(result.payload.hldIntakeAnswers)).not.toContain(QUESTIONNAIRE_ID);
    expect(JSON.stringify(result.payload.hldIntakeAnswers)).not.toContain("questionnaireReview");
  });

  it("blocks (stale) when the snapshot hldIntakeSource does not match current readiness", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "hld_readiness_snapshot"
        ? {
            ...a,
            payload: {
              ...(a.payload as object),
              hldIntakeSource: { sourceMode: "manual_override", manualOverrideReason: "A different reason." },
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("stale_readiness_snapshot");
  });

  it("blocks (stale) when the snapshot omits hldIntakeSource entirely", () => {
    const artifacts = normalArtifacts().map((a) => {
      if (a.type !== "hld_readiness_snapshot") return a;
      const payload = { ...(a.payload as Record<string, unknown>) };
      delete payload.hldIntakeSource;
      return { ...a, payload };
    });
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("stale_readiness_snapshot");
  });

  it("blocks (stale) when the snapshot hldIntakeSource has extra keys", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "hld_readiness_snapshot"
        ? {
            ...a,
            payload: {
              ...(a.payload as object),
              hldIntakeSource: {
                sourceMode: "manual_override",
                manualOverrideReason: MANUAL_OVERRIDE_REASON,
                sourceQuestionnaireArtifactId: QUESTIONNAIRE_ID,
              },
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    expect(result.code).toBe("stale_readiness_snapshot");
  });

  it("returns invalid_payload instead of silently dropping malformed approved intake answers", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "hld_intake"
        ? {
            ...a,
            payload: {
              ...(a.payload as object),
              answers: [
                {
                  fieldId: "target_topology_intent",
                  label: "Target topology intent",
                  status: "answered",
                  value: "   ",
                },
              ],
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect(result.errors).toContain("Approved hld_intake answer 0 is malformed.");
  });

  it("returns invalid_payload instead of silently dropping value or notes defects from intake answers", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "hld_intake"
        ? {
            ...a,
            payload: {
              ...(a.payload as object),
              answers: [
                {
                  fieldId: "resiliency_expectations",
                  label: "Resiliency expectations",
                  status: "unknown",
                  value: "smuggled answer",
                },
                {
                  fieldId: "target_topology_intent",
                  label: "Target topology intent",
                  status: "answered",
                  value: "Collapsed core campus.",
                  notes: "   ",
                },
              ],
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect(result.errors).toEqual([
      "Approved hld_intake answer 0 is malformed.",
      "Approved hld_intake answer 1 is malformed.",
    ]);
  });
});

describe("buildRfpHldSourceBundleDraft - domain knowledge", () => {
  it("blocks a claimed technical domain with no approved knowledge pack", () => {
    const artifacts = normalArtifacts().filter((a) => a.type !== "design_knowledge_pack");
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("unreachable");
    // readiness fails closed first on the missing pack.
    expect(["hld_readiness_not_ready", "missing_domain_knowledge_pack"]).toContain(result.code);
  });
});

describe("buildRfpHldSourceBundleDraft - approved DKP content selection", () => {
  it("fails invalid_payload (never silently drops) when a covered pack has no content", () => {
    const artifacts = normalArtifacts().map((a) =>
      a.type === "design_knowledge_pack"
        ? {
            ...a,
            payload: {
              payloadKind: "rfp_hld_design_knowledge_pack",
              source: "manual_operator_entry",
              domain: "campus_switching",
              title: "Campus switching pack",
            },
          }
        : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect(result.errors.some((e) => e.includes("dkp-1") && e.includes("empty content"))).toBe(true);
  });
});

describe("buildRfpHldSourceBundleDraft - contract validation gate", () => {
  it("returns invalid_payload (and does not claim ok) when a compiled ref is malformed", () => {
    // A knowledge pack with a non-positive version produces a contract-invalid ref.
    const artifacts = normalArtifacts().map((a) =>
      a.type === "design_knowledge_pack" ? { ...a, version: 0 } : a
    );
    const result = buildRfpHldSourceBundleDraft(pureInput(artifacts, [boqFile()]));
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tenant-scoped wrapper
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  listFilesMock.mockResolvedValue([boqFile()]);
  listArtifactsMock.mockResolvedValue(normalArtifacts());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createRfpHldSourceBundleDraft - input + project gates", () => {
  it("rejects a blank projectId before touching the stores", async () => {
    await expect(createRfpHldSourceBundleDraft(input({ projectId: "  " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);
    const result = await createRfpHldSourceBundleDraft(input());
    expect(result).toEqual({ status: "not_found" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom", name: "Quick BoM" }));
    const result = await createRfpHldSourceBundleDraft(input());
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldSourceBundleDraft - happy persistence", () => {
  it("persists exactly one needs_review hld_source_bundle with [] files and exact source ids", async () => {
    const result = await createRfpHldSourceBundleDraft(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.type).toBe("hld_source_bundle");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(new Set(arg.sourceArtifactIds)).toEqual(new Set([...NORMAL_SOURCE_IDS, "hrs-1"]));
    expect((arg.payload as Record<string, unknown>).payloadKind).toBe("rfp_hld_source_bundle");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(result.payloadSummary).toMatchObject({
      payloadKind: "rfp_hld_source_bundle",
      createdBy: CREATED_BY,
      coveredDomainCount: 1,
      designKnowledgePackCount: 1,
      blockerCount: 0,
    });
    expect(JSON.stringify(result.payloadSummary)).not.toContain("authorities");
  });

  it("verifies the project before listing artifacts and writing", async () => {
    await createRfpHldSourceBundleDraft(input());
    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      listArtifactsMock.mock.invocationCallOrder[0]
    );
    expect(listArtifactsMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });

  it("persists for the no-BoQ service-only exception with no BoQ files", async () => {
    listFilesMock.mockResolvedValue([]);
    listArtifactsMock.mockResolvedValue(noBoqArtifacts());
    createMock.mockResolvedValue(
      makeCreatedArtifact({ sourceArtifactIds: [...NO_BOQ_SOURCE_IDS, "hrs-1"] })
    );

    const result = await createRfpHldSourceBundleDraft(input());

    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(new Set(arg.sourceArtifactIds)).toEqual(new Set([...NO_BOQ_SOURCE_IDS, "hrs-1"]));
  });
});

describe("createRfpHldSourceBundleDraft - blocked / invalid never persist", () => {
  it("returns blocked and writes nothing when readiness is not ready", async () => {
    listArtifactsMock.mockResolvedValue([mk("evp-1", "evidence_package", "approved")]);
    const result = await createRfpHldSourceBundleDraft(input());
    expect(result.status).toBe("blocked");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns blocked for a no-BoQ exception while a BoQ file is present", async () => {
    listFilesMock.mockResolvedValue([boqFile()]);
    listArtifactsMock.mockResolvedValue(noBoqArtifacts());
    const result = await createRfpHldSourceBundleDraft(input());
    expect(result.status).toBe("blocked");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns invalid_payload and writes nothing when the compiled bundle is contract-invalid", async () => {
    listArtifactsMock.mockResolvedValue(
      normalArtifacts().map((a) => (a.type === "design_knowledge_pack" ? { ...a, version: 0 } : a))
    );
    const result = await createRfpHldSourceBundleDraft(input());
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles a store error from the artifact write", async () => {
    const boom = new Error("store boom");
    createMock.mockRejectedValue(boom);
    await expect(createRfpHldSourceBundleDraft(input())).rejects.toBe(boom);
  });
});

// ============================================================================
// Static purity guard
// ============================================================================

describe("project-rfp-hld-source-bundle-assembler module purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-source-bundle-assembler.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-source-bundle-assembler.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports the stores, the pure readiness/BoQ/domain helpers, the contract, and canonical types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-file-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/project-rfp-hld-readiness"');
    expect(source).toContain('from "@/lib/projects/project-rfp-boq-readiness"');
    expect(source).toContain('from "@/lib/projects/project-rfp-hld-domain-readiness"');
    expect(source).toContain('from "@/lib/projects/project-rfp-hld-source-bundle"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import fs/path/parser, AI/provider, pricing/sku/catalog/config services, or routes/components/legacy", () => {
    for (const forbidden of [
      "node:fs",
      "node:path",
      "pdf",
      "docx",
      "xlsx",
      "parser",
      "@/lib/projects/pricing",
      "@/lib/projects/priced-boq",
      "sku-resolution",
      "catalog",
      "config-expansion",
      "configuration-expansion",
      "@/lib/adapters",
      "@/lib/agent",
      "@/lib/ai",
      "@/lib/llm",
      "@/coordinator",
      "@/engines",
      "@/app",
      "@/components",
      "next/server",
      "next/navigation",
      "react",
      "anthropic",
      "openai",
      "@google/generative-ai",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
