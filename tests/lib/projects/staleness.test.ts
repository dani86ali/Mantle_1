import { describe, it, expect } from "vitest";
import {
  getDirectDownstreamArtifactTypes,
  getTransitiveDownstreamArtifactTypes,
  isArtifactTypeDownstreamOf,
  shouldMarkArtifactStale,
  planStaleArtifactUpdates,
  type ProjectArtifactForStaleness,
} from "@/lib/projects/staleness";
import type { ProjectArtifactStatus } from "@/types/project";

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
    expect(getDirectDownstreamArtifactTypes("configuration_expansion")).toEqual([
      "priced_boq",
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
    // requirements_baseline still leads to the compliance matrix.
    expect(getDirectDownstreamArtifactTypes("requirements_baseline")).toEqual([
      "compliance_matrix",
    ]);
  });

  it("export_package has no downstream artifact types", () => {
    expect(getDirectDownstreamArtifactTypes("export_package")).toEqual([]);
    expect(getTransitiveDownstreamArtifactTypes("export_package")).toEqual([]);
  });
});

describe("getTransitiveDownstreamArtifactTypes", () => {
  it("returns unique downstream types in deterministic BFS order", () => {
    // Locked to breadth-first discovery order, not canonical-union order.
    // normalized_boq -> {sku_resolution, hld_design_delta}; sku_resolution ->
    // configuration_expansion -> priced_boq, so configuration_expansion is
    // discovered before priced_boq.
    expect(getTransitiveDownstreamArtifactTypes("normalized_boq")).toEqual([
      "sku_resolution",
      "hld_design_delta",
      "configuration_expansion",
      "technical_proposal",
      "priced_boq",
      "export_package",
    ]);
  });

  it("routes sku_resolution through configuration_expansion before pricing", () => {
    expect(getTransitiveDownstreamArtifactTypes("sku_resolution")).toEqual([
      "configuration_expansion",
      "priced_boq",
      "technical_proposal",
      "export_package",
    ]);
  });

  it("input_package reaches requirements_baseline and compliance_matrix only through the evidence chain", () => {
    const downstream = getTransitiveDownstreamArtifactTypes("input_package");
    expect(downstream).toContain("extraction_delta");
    expect(downstream).toContain("evidence_package");
    expect(downstream).toContain("requirements_baseline");
    expect(downstream).toContain("compliance_matrix");
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
      "export_package",
      "compliance_matrix",
    ]);
  });

  it("extraction_delta and evidence_package flow downstream into requirements and compliance", () => {
    expect(getTransitiveDownstreamArtifactTypes("extraction_delta")).toEqual([
      "evidence_package",
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
    ]);
    expect(getTransitiveDownstreamArtifactTypes("evidence_package")).toEqual([
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
    ]);
  });

  it("technical_proposal is only upstream of export_package", () => {
    expect(getTransitiveDownstreamArtifactTypes("technical_proposal")).toEqual([
      "export_package",
    ]);
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
