import { describe, it, expect } from "vitest";
import {
  getDirectDownstreamArtifactTypes,
  getTransitiveDownstreamArtifactTypes,
  isArtifactTypeDownstreamOf,
  shouldMarkArtifactStale,
  planStaleArtifactUpdates,
  type ProjectArtifactForStaleness,
} from "@/lib/projects/staleness";
import type {
  ProjectArtifactStatus,
  ProjectArtifactType,
} from "@/types/project";

/** Canonical artifact type set, for graph completeness/determinism checks. */
const ALL_ARTIFACT_TYPES: readonly ProjectArtifactType[] = [
  "input_package",
  "extraction_delta",
  "evidence_package",
  "normalized_boq",
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "requirements_baseline",
  "compliance_matrix",
  "hld_design_delta",
  "hld_intake",
  "hld_readiness_snapshot",
  "hld_source_bundle",
  "hld_design_model",
  "hld_design_model_review",
  "hld_design_model_rebuild_request",
  "hld_diagram",
  "hld_document_model",
  "hld_document",
  "design_knowledge_pack",
  "technical_proposal",
  "export_package",
];

const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";

/** Build a staleness-artifact stub with sensible defaults. */
function artifact(
  overrides: Partial<ProjectArtifactForStaleness> &
    Pick<ProjectArtifactForStaleness, "id" | "type" | "version">
): ProjectArtifactForStaleness {
  return {
    projectId: PROJECT,
    status: "generated",
    ...overrides,
  };
}

describe("getDirectDownstreamArtifactTypes", () => {
  it("returns the expected immediate children", () => {
    // input_package fans out into the Quick BoM chain (normalized_boq) and the
    // RFP evidence chain (extraction_delta); requirements_baseline is no longer
    // a direct child - it hangs off the approved evidence_package.
    expect(getDirectDownstreamArtifactTypes("input_package")).toEqual([
      "normalized_boq",
      "extraction_delta",
    ]);
    expect(getDirectDownstreamArtifactTypes("normalized_boq")).toEqual([
      "sku_resolution",
      "hld_design_delta",
    ]);
    // Configuration expansion now sits between SKU resolution and pricing.
    expect(getDirectDownstreamArtifactTypes("sku_resolution")).toEqual([
      "configuration_expansion",
    ]);
    // Configured BoQ feeds pricing and, for Stage 6, the HLD readiness snapshot.
    expect(getDirectDownstreamArtifactTypes("configuration_expansion")).toEqual([
      "priced_boq",
      "hld_readiness_snapshot",
    ]);
    expect(getDirectDownstreamArtifactTypes("technical_proposal")).toEqual([
      "export_package",
    ]);
  });

  it("routes the RFP evidence chain extraction_delta -> evidence_package -> requirements_baseline", () => {
    expect(getDirectDownstreamArtifactTypes("extraction_delta")).toEqual([
      "evidence_package",
    ]);
    expect(getDirectDownstreamArtifactTypes("evidence_package")).toEqual([
      "requirements_baseline",
    ]);
    // requirements_baseline leads to the compliance matrix and, for Stage 6,
    // the HLD readiness snapshot.
    expect(getDirectDownstreamArtifactTypes("requirements_baseline")).toEqual([
      "compliance_matrix",
      "hld_readiness_snapshot",
    ]);
  });

  it("wires the Stage 6 HLD readiness spine immediate children", () => {
    // requirements/compliance/config feed the snapshot (added above); intake is
    // a separate input root that also feeds it.
    expect(getDirectDownstreamArtifactTypes("compliance_matrix")).toEqual([
      "hld_design_delta",
      "technical_proposal",
      "hld_readiness_snapshot",
    ]);
    expect(getDirectDownstreamArtifactTypes("hld_intake")).toEqual([
      "hld_readiness_snapshot",
    ]);
    // The readiness snapshot now feeds the deterministic HLD source bundle,
    // which in turn feeds the future HLD design model.
    expect(getDirectDownstreamArtifactTypes("hld_readiness_snapshot")).toEqual([
      "hld_source_bundle",
    ]);
    expect(getDirectDownstreamArtifactTypes("hld_source_bundle")).toEqual([
      "hld_design_model",
    ]);
    // The model now feeds its advisory review, which in turn feeds the future
    // diagram and document.
    expect(getDirectDownstreamArtifactTypes("hld_design_model")).toEqual([
      "hld_design_model_review",
    ]);
    // The advisory review now feeds the diagram and the structured document model
    // (not the final document directly).
    expect(getDirectDownstreamArtifactTypes("hld_design_model_review")).toEqual([
      "hld_diagram",
      "hld_document_model",
    ]);
    // The reviewed diagram feeds the structured document model, which feeds the
    // future rendered document.
    expect(getDirectDownstreamArtifactTypes("hld_diagram")).toEqual([
      "hld_document_model",
    ]);
    expect(getDirectDownstreamArtifactTypes("hld_document_model")).toEqual([
      "hld_document",
    ]);
    // An approved HLD document can feed the technical proposal.
    expect(getDirectDownstreamArtifactTypes("hld_document")).toEqual([
      "technical_proposal",
    ]);
  });

  it("design_knowledge_pack directly feeds hld_readiness_snapshot (Stage 6.3)", () => {
    expect(getDirectDownstreamArtifactTypes("design_knowledge_pack")).toEqual([
      "hld_readiness_snapshot",
    ]);
  });

  it("export_package has no downstream artifact types", () => {
    expect(getDirectDownstreamArtifactTypes("export_package")).toEqual([]);
    expect(getTransitiveDownstreamArtifactTypes("export_package")).toEqual([]);
  });

  it("hld_diagram now feeds the structured document model and its downstream chain", () => {
    // hld_diagram is no longer a leaf: it feeds hld_document_model, which feeds the
    // future hld_document and on to the proposal/export.
    expect(getDirectDownstreamArtifactTypes("hld_diagram")).toEqual([
      "hld_document_model",
    ]);
    expect(getTransitiveDownstreamArtifactTypes("hld_diagram")).toEqual([
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
  });

  it("hld_design_model_rebuild_request is a leaf - request metadata, not authority", () => {
    // Not downstream of any artifact type, so a model/review change never marks
    // it stale; duplicate prevention keys on the specific source model id.
    expect(getDirectDownstreamArtifactTypes("hld_design_model_rebuild_request")).toEqual([]);
    expect(
      getTransitiveDownstreamArtifactTypes("hld_design_model_rebuild_request")
    ).toEqual([]);
    for (const type of ALL_ARTIFACT_TYPES) {
      expect(getDirectDownstreamArtifactTypes(type)).not.toContain(
        "hld_design_model_rebuild_request"
      );
    }
  });
});

describe("getTransitiveDownstreamArtifactTypes", () => {
  it("returns unique downstream types in deterministic BFS order", () => {
    // Locked to breadth-first discovery order, not canonical-union order.
    // normalized_boq -> {sku_resolution, hld_design_delta}; sku_resolution ->
    // configuration_expansion -> {priced_boq, hld_readiness_snapshot}, and the
    // HLD readiness spine (model/diagram/document) trails the BoQ chain.
    expect(getTransitiveDownstreamArtifactTypes("normalized_boq")).toEqual([
      "sku_resolution",
      "hld_design_delta",
      "configuration_expansion",
      "technical_proposal",
      "priced_boq",
      "hld_readiness_snapshot",
      "export_package",
      "hld_source_bundle",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ]);
  });

  it("routes sku_resolution through configuration_expansion before pricing", () => {
    expect(getTransitiveDownstreamArtifactTypes("sku_resolution")).toEqual([
      "configuration_expansion",
      "priced_boq",
      "hld_readiness_snapshot",
      "technical_proposal",
      "export_package",
      "hld_source_bundle",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ]);
  });

  it("input_package reaches requirements_baseline and compliance_matrix only through the evidence chain", () => {
    const downstream = getTransitiveDownstreamArtifactTypes("input_package");
    expect(downstream).toContain("extraction_delta");
    expect(downstream).toContain("evidence_package");
    expect(downstream).toContain("requirements_baseline");
    expect(downstream).toContain("compliance_matrix");
    // The configured BoQ pulls the HLD readiness spine in too.
    expect(downstream).toContain("hld_readiness_snapshot");
    expect(downstream).toContain("hld_document");
    // hld_intake is a separate input root, never downstream of input_package.
    expect(downstream).not.toContain("hld_intake");
    // The full deterministic BFS discovery order from input_package.
    expect(downstream).toEqual([
      "normalized_boq",
      "extraction_delta",
      "sku_resolution",
      "hld_design_delta",
      "evidence_package",
      "configuration_expansion",
      "technical_proposal",
      "requirements_baseline",
      "priced_boq",
      "hld_readiness_snapshot",
      "export_package",
      "compliance_matrix",
      "hld_source_bundle",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ]);
  });

  it("extraction_delta and evidence_package flow downstream into requirements, compliance, and the HLD spine", () => {
    expect(getTransitiveDownstreamArtifactTypes("extraction_delta")).toEqual([
      "evidence_package",
      "requirements_baseline",
      "compliance_matrix",
      "hld_readiness_snapshot",
      "hld_design_delta",
      "technical_proposal",
      "hld_source_bundle",
      "export_package",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ]);
    expect(getTransitiveDownstreamArtifactTypes("evidence_package")).toEqual([
      "requirements_baseline",
      "compliance_matrix",
      "hld_readiness_snapshot",
      "hld_design_delta",
      "technical_proposal",
      "hld_source_bundle",
      "export_package",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ]);
  });

  it("walks the Stage 6 HLD readiness spine deterministically", () => {
    // intake feeds the snapshot, which feeds model -> review ->
    // {diagram, document}, and the document feeds the proposal -> export.
    expect(getTransitiveDownstreamArtifactTypes("hld_intake")).toEqual([
      "hld_readiness_snapshot",
      "hld_source_bundle",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(
      getTransitiveDownstreamArtifactTypes("hld_readiness_snapshot")
    ).toEqual([
      "hld_source_bundle",
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    // The model feeds its advisory review first, then diagram/document.
    expect(getTransitiveDownstreamArtifactTypes("hld_design_model")).toEqual([
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(
      getTransitiveDownstreamArtifactTypes("hld_design_model_review")
    ).toEqual([
      "hld_diagram",
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(getTransitiveDownstreamArtifactTypes("hld_document")).toEqual([
      "technical_proposal",
      "export_package",
    ]);
  });

  it("technical_proposal is only upstream of export_package", () => {
    expect(getTransitiveDownstreamArtifactTypes("technical_proposal")).toEqual([
      "export_package",
    ]);
  });

  it("is type-complete and deterministic for every artifact type", () => {
    for (const type of ALL_ARTIFACT_TYPES) {
      const first = getTransitiveDownstreamArtifactTypes(type);
      const second = getTransitiveDownstreamArtifactTypes(type);
      // Deterministic: identical across calls.
      expect(second).toEqual(first);
      // No duplicates, no self-reference, only valid artifact types.
      expect(new Set(first).size).toBe(first.length);
      expect(first).not.toContain(type);
      for (const downstream of first) {
        expect(ALL_ARTIFACT_TYPES).toContain(downstream);
      }
    }
  });
});

describe("isArtifactTypeDownstreamOf", () => {
  it("is true for transitive downstream types", () => {
    expect(isArtifactTypeDownstreamOf("normalized_boq", "priced_boq")).toBe(true);
    expect(isArtifactTypeDownstreamOf("normalized_boq", "export_package")).toBe(
      true
    );
    // normalized_boq is transitively upstream of configuration_expansion, which
    // is itself upstream of priced_boq.
    expect(
      isArtifactTypeDownstreamOf("normalized_boq", "configuration_expansion")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("configuration_expansion", "priced_boq")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("input_package", "compliance_matrix")
    ).toBe(true);
    // The RFP evidence chain: input_package reaches requirements through
    // extraction_delta and the approved evidence_package.
    expect(
      isArtifactTypeDownstreamOf("input_package", "requirements_baseline")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("extraction_delta", "requirements_baseline")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("evidence_package", "compliance_matrix")
    ).toBe(true);
  });

  it("is true across the Stage 6 HLD readiness spine", () => {
    // Every approved design input is upstream of the readiness snapshot.
    for (const upstream of [
      "requirements_baseline",
      "compliance_matrix",
      "configuration_expansion",
      "hld_intake",
    ] as const) {
      expect(
        isArtifactTypeDownstreamOf(upstream, "hld_readiness_snapshot")
      ).toBe(true);
    }
    expect(
      isArtifactTypeDownstreamOf("hld_readiness_snapshot", "hld_design_model")
    ).toBe(true);
    // The advisory review sits between the model and the diagram/document.
    expect(
      isArtifactTypeDownstreamOf("hld_design_model", "hld_design_model_review")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_design_model_review", "hld_diagram")
    ).toBe(true);
    // The advisory review reaches the structured document model directly, and the
    // diagram also feeds it; the document model in turn feeds the final document.
    expect(
      isArtifactTypeDownstreamOf("hld_design_model_review", "hld_document_model")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_diagram", "hld_document_model")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_document_model", "hld_document")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_design_model_review", "hld_document")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_design_model", "hld_document")
    ).toBe(true);
    expect(
      isArtifactTypeDownstreamOf("hld_document", "technical_proposal")
    ).toBe(true);
    expect(isArtifactTypeDownstreamOf("hld_intake", "export_package")).toBe(
      true
    );
  });

  it("is false for non-downstream types (including self and upstream)", () => {
    expect(isArtifactTypeDownstreamOf("priced_boq", "normalized_boq")).toBe(
      false
    );
    expect(
      isArtifactTypeDownstreamOf("normalized_boq", "normalized_boq")
    ).toBe(false);
    expect(
      isArtifactTypeDownstreamOf("normalized_boq", "requirements_baseline")
    ).toBe(false);
    expect(isArtifactTypeDownstreamOf("export_package", "priced_boq")).toBe(
      false
    );
    // The legacy delta and the Stage 6 model are separate lanes; neither is
    // downstream of the other, and the readiness snapshot is not downstream of
    // pricing.
    expect(
      isArtifactTypeDownstreamOf("hld_design_model", "hld_design_delta")
    ).toBe(false);
    expect(
      isArtifactTypeDownstreamOf("hld_readiness_snapshot", "hld_design_delta")
    ).toBe(false);
    expect(
      isArtifactTypeDownstreamOf("priced_boq", "hld_readiness_snapshot")
    ).toBe(false);
    // The advisory review is downstream of the model, never the reverse.
    expect(
      isArtifactTypeDownstreamOf("hld_design_model_review", "hld_design_model")
    ).toBe(false);
    // hld_intake is an input root: nothing upstream feeds it.
    expect(
      isArtifactTypeDownstreamOf("requirements_baseline", "hld_intake")
    ).toBe(false);
  });
});

describe("shouldMarkArtifactStale", () => {
  it("is true for generated, needs_review, approved, rejected, failed", () => {
    for (const status of [
      "generated",
      "needs_review",
      "approved",
      "rejected",
      "failed",
    ] as const) {
      expect(shouldMarkArtifactStale({ status })).toBe(true);
    }
  });

  it("is false for missing, stale, not_applicable", () => {
    for (const status of ["missing", "stale", "not_applicable"] as const) {
      expect(shouldMarkArtifactStale({ status })).toBe(false);
    }
  });
});

describe("planStaleArtifactUpdates", () => {
  it("ignores artifacts from other projects", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({
          id: "pbq-other",
          type: "priced_boq",
          version: 1,
          projectId: OTHER_PROJECT,
        }),
      ],
    });
    expect(plan).toEqual([]);
  });

  it("excludes the changed artifact itself", () => {
    // The changed artifact appears in the pool typed as one of its own
    // downstream types; it must still never be planned (filtered by id).
    const changed = artifact({ id: "dup", type: "priced_boq", version: 5 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "exp-1", type: "export_package", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.artifactId)).not.toContain("dup");
    expect(plan.map((u) => u.artifactId)).toEqual(["exp-1"]);
  });

  it("selects only the latest version per downstream type", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "pbq-1", type: "priced_boq", version: 1 }),
        artifact({ id: "pbq-2", type: "priced_boq", version: 2 }),
        artifact({ id: "pbq-3", type: "priced_boq", version: 3 }),
      ],
    });
    const priced = plan.filter((u) => u.type === "priced_boq");
    expect(priced).toHaveLength(1);
    expect(priced[0].artifactId).toBe("pbq-3");
    expect(priced[0].version).toBe(3);
  });

  it("plans stale for generated, needs_review, approved, rejected, failed downstream artifacts", () => {
    // Each distinct downstream type of normalized_boq carries one eligible status.
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const downstream: ProjectArtifactForStaleness[] = [
      artifact({ id: "sku", type: "sku_resolution", version: 1, status: "generated" }),
      artifact({ id: "pbq", type: "priced_boq", version: 1, status: "needs_review" }),
      artifact({ id: "hld", type: "hld_design_delta", version: 1, status: "approved" }),
      artifact({ id: "tp", type: "technical_proposal", version: 1, status: "rejected" }),
      artifact({ id: "exp", type: "export_package", version: 1, status: "failed" }),
    ];
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [changed, ...downstream],
    });
    expect(plan.map((u) => u.artifactId).sort()).toEqual(
      ["exp", "hld", "pbq", "sku", "tp"].sort()
    );
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("skips downstream artifacts whose latest version is missing, stale, or not_applicable", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "sku", type: "sku_resolution", version: 1, status: "missing" }),
        artifact({ id: "pbq", type: "priced_boq", version: 1, status: "stale" }),
        artifact({
          id: "hld",
          type: "hld_design_delta",
          version: 1,
          status: "not_applicable",
        }),
      ],
    });
    expect(plan).toEqual([]);
  });

  it("skips a downstream type whose latest version is not stale-eligible even if older versions are", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "pbq-1", type: "priced_boq", version: 1, status: "generated" }),
        artifact({ id: "pbq-2", type: "priced_boq", version: 2, status: "generated" }),
        artifact({ id: "pbq-3", type: "priced_boq", version: 3, status: "stale" }),
      ],
    });
    expect(plan.filter((u) => u.type === "priced_boq")).toEqual([]);
  });

  it("planned updates carry changedArtifactId and changedArtifactType", () => {
    const changed = artifact({ id: "nbq-9", type: "normalized_boq", version: 4 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "pbq-1", type: "priced_boq", version: 1 }),
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].changedArtifactId).toBe("nbq-9");
    expect(plan[0].changedArtifactType).toBe("normalized_boq");
    expect(plan[0]).toMatchObject({
      artifactId: "pbq-1",
      projectId: PROJECT,
      type: "priced_boq",
      version: 1,
      previousStatus: "generated",
      nextStatus: "stale",
    });
  });

  it("uses a single shared updatedAt timestamp for all planned rows", () => {
    const updatedAt = new Date("2026-05-21T12:00:00.000Z");
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      updatedAt,
      artifacts: [
        changed,
        artifact({ id: "sku", type: "sku_resolution", version: 1 }),
        artifact({ id: "pbq", type: "priced_boq", version: 1 }),
        artifact({ id: "hld", type: "hld_design_delta", version: 1 }),
      ],
    });
    expect(plan.length).toBeGreaterThan(1);
    expect(plan.every((u) => u.updatedAt === updatedAt)).toBe(true);
  });

  it("does not mutate its inputs", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const artifacts: ProjectArtifactForStaleness[] = [
      changed,
      artifact({ id: "pbq-1", type: "priced_boq", version: 1 }),
      artifact({ id: "pbq-2", type: "priced_boq", version: 2 }),
    ];
    const snapshot = structuredClone(artifacts);
    planStaleArtifactUpdates({ changedArtifact: changed, artifacts });
    expect(artifacts).toEqual(snapshot);
  });

  it("a change to normalized_boq marks every downstream artifact when latest versions exist", () => {
    const changed = artifact({ id: "nbq-1", type: "normalized_boq", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "sku", type: "sku_resolution", version: 1 }),
        artifact({ id: "cfg", type: "configuration_expansion", version: 1 }),
        artifact({ id: "pbq", type: "priced_boq", version: 1 }),
        artifact({ id: "hld", type: "hld_design_delta", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
      ],
    });
    // Deterministic BFS order of downstream types: configuration_expansion is
    // discovered after hld_design_delta and before priced_boq.
    expect(plan.map((u) => u.type)).toEqual([
      "sku_resolution",
      "hld_design_delta",
      "configuration_expansion",
      "technical_proposal",
      "priced_boq",
      "export_package",
    ]);
  });

  it("a change to sku_resolution marks configuration_expansion and downstream priced_boq/export stale", () => {
    const changed = artifact({ id: "sku-1", type: "sku_resolution", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "cfg", type: "configuration_expansion", version: 1 }),
        artifact({ id: "pbq", type: "priced_boq", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // normalized_boq is upstream of sku_resolution and must not be planned.
        artifact({ id: "nbq", type: "normalized_boq", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ]);
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("a change to extraction_delta marks evidence_package and the requirements chain stale", () => {
    const changed = artifact({ id: "exd-1", type: "extraction_delta", version: 2 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "evp", type: "evidence_package", version: 1, status: "approved" }),
        artifact({ id: "req", type: "requirements_baseline", version: 1, status: "needs_review" }),
        artifact({ id: "cmx", type: "compliance_matrix", version: 1 }),
        // input_package is upstream of extraction_delta and must not be planned.
        artifact({ id: "inp", type: "input_package", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "evidence_package",
      "requirements_baseline",
      "compliance_matrix",
    ]);
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("a change to evidence_package marks requirements_baseline and compliance downstream stale", () => {
    const changed = artifact({ id: "evp-1", type: "evidence_package", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "req", type: "requirements_baseline", version: 1, status: "approved" }),
        artifact({ id: "cmx", type: "compliance_matrix", version: 1 }),
        // Upstream evidence inputs must not be planned.
        artifact({ id: "exd", type: "extraction_delta", version: 1 }),
        artifact({ id: "inp", type: "input_package", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "requirements_baseline",
      "compliance_matrix",
    ]);
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("a change to technical_proposal only marks export_package downstream", () => {
    const changed = artifact({
      id: "tp-1",
      type: "technical_proposal",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // Upstream artifacts must not be planned.
        artifact({ id: "pbq", type: "priced_boq", version: 1 }),
        artifact({ id: "nbq", type: "normalized_boq", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual(["export_package"]);
  });

  it("a change to configuration_expansion now also marks the HLD readiness chain stale", () => {
    const changed = artifact({
      id: "cfg-1",
      type: "configuration_expansion",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "pbq", type: "priced_boq", version: 1 }),
        artifact({ id: "hrs", type: "hld_readiness_snapshot", version: 1 }),
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // sku_resolution is upstream of configuration_expansion; never planned.
        artifact({ id: "sku", type: "sku_resolution", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "priced_boq",
      "hld_readiness_snapshot",
      "technical_proposal",
      "export_package",
      "hld_design_model",
      "hld_diagram",
      "hld_document",
    ]);
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("a change to hld_intake marks the whole HLD readiness chain stale", () => {
    const changed = artifact({ id: "hint-1", type: "hld_intake", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hrs", type: "hld_readiness_snapshot", version: 1 }),
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // requirements_baseline is a sibling input, not downstream of intake.
        artifact({ id: "req", type: "requirements_baseline", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_readiness_snapshot",
      "hld_design_model",
      "hld_diagram",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("requirements_baseline");
  });

  it("a change to hld_readiness_snapshot marks the HLD model/diagram/document and proposal chain stale", () => {
    const changed = artifact({
      id: "hrs-1",
      type: "hld_readiness_snapshot",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // Upstream inputs must not be planned.
        artifact({ id: "cfg", type: "configuration_expansion", version: 1 }),
        artifact({ id: "hint", type: "hld_intake", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_design_model",
      "hld_diagram",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
  });

  it("a change to hld_readiness_snapshot marks the new hld_source_bundle stale when present", () => {
    const changed = artifact({
      id: "hrs-1",
      type: "hld_readiness_snapshot",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hsb-1", type: "hld_source_bundle", version: 1 }),
        artifact({ id: "hdm-1", type: "hld_design_model", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_source_bundle",
      "hld_design_model",
    ]);
    expect(plan.find((u) => u.type === "hld_source_bundle")?.artifactId).toBe("hsb-1");
  });

  it("a change to hld_source_bundle marks the HLD model/diagram/document and proposal chain stale", () => {
    const changed = artifact({
      id: "hsb-1",
      type: "hld_source_bundle",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // The readiness snapshot is upstream of the bundle; never planned.
        artifact({ id: "hrs", type: "hld_readiness_snapshot", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_design_model",
      "hld_diagram",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("hld_readiness_snapshot");
  });

  it("a change to hld_design_model marks its advisory review and the diagram/document chain stale but not the snapshot", () => {
    const changed = artifact({
      id: "hdm-1",
      type: "hld_design_model",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdmr", type: "hld_design_model_review", version: 1 }),
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // hld_readiness_snapshot is upstream of the model; never planned.
        artifact({ id: "hrs", type: "hld_readiness_snapshot", version: 1 }),
      ],
    });
    // The model stales its advisory review, then the future diagram/document.
    expect(plan.map((u) => u.type)).toEqual([
      "hld_design_model_review",
      "hld_diagram",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("hld_readiness_snapshot");
  });

  it("a change to hld_design_model_review stales the diagram, document model, and document chain but not the model", () => {
    const changed = artifact({
      id: "hdmr-1",
      type: "hld_design_model_review",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdmdl", type: "hld_document_model", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // The model and snapshot are upstream of the advisory review; a review
        // change must never mark them stale.
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
        artifact({ id: "hrs", type: "hld_readiness_snapshot", version: 1 }),
      ],
    });
    // The review now stales the diagram and the structured document model
    // directly; the final document follows transitively via the document model.
    expect(plan.map((u) => u.type)).toEqual([
      "hld_diagram",
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("hld_design_model");
    expect(plan.map((u) => u.type)).not.toContain("hld_readiness_snapshot");
  });

  it("a change to hld_diagram now stales the structured document model and the document/proposal chain", () => {
    const changed = artifact({ id: "hdg-1", type: "hld_diagram", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdmdl", type: "hld_document_model", version: 1 }),
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // The review and model are upstream of the diagram; never planned.
        artifact({ id: "hdmr", type: "hld_design_model_review", version: 1 }),
        artifact({ id: "hdm", type: "hld_design_model", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_document_model",
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("hld_design_model_review");
    expect(plan.map((u) => u.type)).not.toContain("hld_design_model");
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
  });

  it("a change to hld_document_model stales the final document and proposal chain but not the diagram", () => {
    const changed = artifact({
      id: "hdmdl-1",
      type: "hld_document_model",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hdoc", type: "hld_document", version: 1 }),
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp", type: "export_package", version: 1 }),
        // The diagram and review are upstream of the document model; never planned.
        artifact({ id: "hdg", type: "hld_diagram", version: 1 }),
        artifact({ id: "hdmr", type: "hld_design_model_review", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toEqual([
      "hld_document",
      "technical_proposal",
      "export_package",
    ]);
    expect(plan.map((u) => u.type)).not.toContain("hld_diagram");
    expect(plan.map((u) => u.type)).not.toContain("hld_design_model_review");
  });

  it("a changed latest design_knowledge_pack marks latest eligible hld_readiness_snapshot stale", () => {
    const changed = artifact({ id: "dkp-1", type: "design_knowledge_pack", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hrs-1", type: "hld_readiness_snapshot", version: 1 }),
        artifact({ id: "hdm-1", type: "hld_design_model", version: 1 }),
        artifact({ id: "tp-1", type: "technical_proposal", version: 1 }),
        artifact({ id: "exp-1", type: "export_package", version: 1 }),
      ],
    });
    expect(plan.map((u) => u.type)).toContain("hld_readiness_snapshot");
    expect(plan.find((u) => u.type === "hld_readiness_snapshot")?.artifactId).toBe("hrs-1");
    expect(plan.every((u) => u.nextStatus === "stale")).toBe(true);
    expect(plan.every((u) => u.changedArtifactType === "design_knowledge_pack")).toBe(true);
  });

  it("design_knowledge_pack does not mark unrelated artifact types stale", () => {
    const changed = artifact({ id: "dkp-1", type: "design_knowledge_pack", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hrs-1", type: "hld_readiness_snapshot", version: 1 }),
        // These artifact types are not downstream of design_knowledge_pack.
        artifact({ id: "req-1", type: "requirements_baseline", version: 1 }),
        artifact({ id: "cfg-1", type: "configuration_expansion", version: 1 }),
        artifact({ id: "pbq-1", type: "priced_boq", version: 1 }),
        artifact({ id: "inp-1", type: "input_package", version: 1 }),
      ],
    });
    const plannedTypes = plan.map((u) => u.type);
    expect(plannedTypes).not.toContain("requirements_baseline");
    expect(plannedTypes).not.toContain("configuration_expansion");
    expect(plannedTypes).not.toContain("priced_boq");
    expect(plannedTypes).not.toContain("input_package");
  });

  it("design_knowledge_pack with no downstream artifacts in pool returns empty plan", () => {
    const changed = artifact({ id: "dkp-1", type: "design_knowledge_pack", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [changed],
    });
    expect(plan).toEqual([]);
  });

  it("design_knowledge_pack does not mark a non-latest hld_readiness_snapshot stale", () => {
    const changed = artifact({ id: "dkp-1", type: "design_knowledge_pack", version: 1 });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "hrs-1", type: "hld_readiness_snapshot", version: 1 }),
        artifact({ id: "hrs-2", type: "hld_readiness_snapshot", version: 2 }),
      ],
    });
    const snapshotUpdates = plan.filter((u) => u.type === "hld_readiness_snapshot");
    expect(snapshotUpdates).toHaveLength(1);
    expect(snapshotUpdates[0].artifactId).toBe("hrs-2");
    expect(snapshotUpdates[0].version).toBe(2);
  });

  it("a change with no downstream artifacts returns an empty plan", () => {
    const changed = artifact({
      id: "exp-1",
      type: "export_package",
      version: 1,
    });
    const plan = planStaleArtifactUpdates({
      changedArtifact: changed,
      artifacts: [
        changed,
        artifact({ id: "tp", type: "technical_proposal", version: 1 }),
      ],
    });
    expect(plan).toEqual([]);
  });
});
