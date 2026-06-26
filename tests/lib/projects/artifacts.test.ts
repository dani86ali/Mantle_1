import { describe, it, expect } from "vitest";
import {
  getArtifactTypesForStage,
  isArtifactTypeAllowedForStage,
  getLatestArtifactVersion,
  getNextArtifactVersion,
  isArtifactVersionFrozen,
  materializeProjectArtifactVersion,
  type ExistingProjectArtifactVersion,
} from "@/lib/projects/artifacts";
import * as artifactsModule from "@/lib/projects/artifacts";

const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";
const TENANT = "tenant-1";

/** Build an existing-version stub with sensible defaults. */
function existing(
  overrides: Partial<ExistingProjectArtifactVersion> &
    Pick<ExistingProjectArtifactVersion, "type" | "version">
): ExistingProjectArtifactVersion {
  return {
    projectId: PROJECT,
    status: "generated",
    ...overrides,
  };
}

describe("getArtifactTypesForStage", () => {
  it("returns the stage metadata", () => {
    // Pricing review now consumes the accepted configuration_expansion and
    // produces priced_boq (section 11A.3).
    expect(getArtifactTypesForStage("boq_pricing_review")).toEqual([
      "configuration_expansion",
      "priced_boq",
    ]);
    // Intake review now also carries the RFP evidence chain: extraction_delta
    // (review candidates, never authority) and the human-approved
    // evidence_package.
    expect(getArtifactTypesForStage("intake_package_review")).toEqual([
      "input_package",
      "extraction_delta",
      "evidence_package",
    ]);
  });

  it("returns the configuration_expansion_review stage metadata", () => {
    expect(getArtifactTypesForStage("configuration_expansion_review")).toEqual([
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
    ]);
  });

  it("returns the Stage 6 HLD readiness spine for hld_design_delta_review", () => {
    // The legacy delta plus the Stage 6 HLD intake/readiness/source-bundle/
    // model/model-review/diagram/document-model/document contracts all flow
    // through the existing HLD stage metadata. design_knowledge_pack is added in
    // Stage 6.3; hld_design_model_review is the advisory quality-review contract
    // (6E-B); hld_document_model is the internal structured document spine (6H-A),
    // sitting before the still-reserved final hld_document.
    expect(getArtifactTypesForStage("hld_design_delta_review")).toEqual([
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
    ]);
  });
});

describe("isArtifactTypeAllowedForStage", () => {
  it("accepts valid stage/type pairs", () => {
    expect(
      isArtifactTypeAllowedForStage("boq_pricing_review", "priced_boq")
    ).toBe(true);
    expect(
      isArtifactTypeAllowedForStage("compliance_matrix_review", "compliance_matrix")
    ).toBe(true);
    expect(
      isArtifactTypeAllowedForStage("intake_package_review", "extraction_delta")
    ).toBe(true);
    expect(
      isArtifactTypeAllowedForStage("intake_package_review", "evidence_package")
    ).toBe(true);
  });

  it("allows every Stage 6 HLD artifact under hld_design_delta_review", () => {
    for (const type of [
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
    ] as const) {
      expect(isArtifactTypeAllowedForStage("hld_design_delta_review", type)).toBe(
        true
      );
    }
  });

  it("design_knowledge_pack is allowed on hld_design_delta_review", () => {
    expect(
      isArtifactTypeAllowedForStage("hld_design_delta_review", "design_knowledge_pack")
    ).toBe(true);
  });

  it("design_knowledge_pack is not allowed on unrelated stages", () => {
    for (const stageId of [
      "intake_package_review",
      "boq_format_validation",
      "sku_resolution",
      "requirements_baseline_review",
      "compliance_matrix_review",
      "boq_pricing_review",
      "proposal_review",
      "export_approval",
    ] as const) {
      expect(isArtifactTypeAllowedForStage(stageId, "design_knowledge_pack")).toBe(false);
    }
  });

  it("rejects invalid stage/type pairs", () => {
    expect(
      isArtifactTypeAllowedForStage("intake_package_review", "priced_boq")
    ).toBe(false);
    expect(
      isArtifactTypeAllowedForStage("sku_resolution", "technical_proposal")
    ).toBe(false);
    // The evidence chain lives only under intake review.
    expect(
      isArtifactTypeAllowedForStage("requirements_baseline_review", "evidence_package")
    ).toBe(false);
    expect(
      isArtifactTypeAllowedForStage("boq_format_validation", "extraction_delta")
    ).toBe(false);
    // The Stage 6 HLD artifacts belong only to the HLD stage, nowhere else.
    expect(
      isArtifactTypeAllowedForStage("boq_pricing_review", "hld_readiness_snapshot")
    ).toBe(false);
    expect(
      isArtifactTypeAllowedForStage("intake_package_review", "hld_document")
    ).toBe(false);
    expect(
      isArtifactTypeAllowedForStage("proposal_review", "hld_design_model")
    ).toBe(false);
    // The internal document model belongs only to the HLD stage.
    expect(
      isArtifactTypeAllowedForStage("proposal_review", "hld_document_model")
    ).toBe(false);
  });
});

describe("getLatestArtifactVersion", () => {
  it("returns undefined when none exist", () => {
    expect(getLatestArtifactVersion([], PROJECT, "priced_boq")).toBeUndefined();
    expect(
      getLatestArtifactVersion(
        [existing({ type: "normalized_boq", version: 3 })],
        PROJECT,
        "priced_boq"
      )
    ).toBeUndefined();
  });

  it("returns the max version for matching projectId + type only", () => {
    const artifacts: ExistingProjectArtifactVersion[] = [
      existing({ type: "priced_boq", version: 1 }),
      existing({ type: "priced_boq", version: 2 }),
      existing({ type: "normalized_boq", version: 9 }), // other type
      existing({ type: "priced_boq", version: 5, projectId: OTHER_PROJECT }), // other project
    ];
    const latest = getLatestArtifactVersion(artifacts, PROJECT, "priced_boq");
    expect(latest?.version).toBe(2);
  });
});

describe("getNextArtifactVersion", () => {
  it("returns 1 for the first version", () => {
    expect(getNextArtifactVersion([], PROJECT, "priced_boq")).toBe(1);
  });

  it("increments after existing versions, including approved", () => {
    const artifacts: ExistingProjectArtifactVersion[] = [
      existing({ type: "priced_boq", version: 1 }),
      existing({ type: "priced_boq", version: 2, status: "approved" }),
    ];
    expect(getNextArtifactVersion(artifacts, PROJECT, "priced_boq")).toBe(3);
  });
});

describe("materializeProjectArtifactVersion", () => {
  const base = {
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review" as const,
    type: "priced_boq" as const,
  };

  it("returns an insert-ready row with default status generated and version 1", () => {
    const row = materializeProjectArtifactVersion({ ...base });
    expect(row).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "generated",
      version: 1,
      payload: {},
      sourceFileIds: [],
      sourceArtifactIds: [],
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.createdAt.getTime()).toBe(row.updatedAt.getTime());
    // No `id` - the DB generates it.
    expect("id" in row).toBe(false);
  });

  it("increments version based on existing artifacts", () => {
    const row = materializeProjectArtifactVersion({
      ...base,
      existingArtifacts: [
        existing({ type: "priced_boq", version: 1 }),
        existing({ type: "priced_boq", version: 2, status: "approved" }),
      ],
    });
    expect(row.version).toBe(3);
  });

  it("materializes evidence_package at intake_package_review awaiting human review", () => {
    // The final evidence package is built from the input package plus reviewed
    // extraction deltas, and starts needs_review - approval stays human-gated.
    const row = materializeProjectArtifactVersion({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "intake_package_review",
      type: "evidence_package",
      status: "needs_review",
      sourceFileIds: ["file-rfp-1", "file-addendum-1"],
      sourceArtifactIds: ["art-input-package-1", "art-extraction-delta-2"],
    });
    expect(row).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "intake_package_review",
      type: "evidence_package",
      status: "needs_review",
      version: 1,
      sourceFileIds: ["file-rfp-1", "file-addendum-1"],
      sourceArtifactIds: ["art-input-package-1", "art-extraction-delta-2"],
    });
  });

  it("materializes a Stage 6 hld_readiness_snapshot at hld_design_delta_review", () => {
    // Contract-level: a versioned row keyed to approved upstream artifacts. This
    // does not create snapshot content - payload stays whatever the caller
    // passes (here empty) and nothing is generated.
    const row = materializeProjectArtifactVersion({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "hld_design_delta_review",
      type: "hld_readiness_snapshot",
      status: "needs_review",
      sourceArtifactIds: [
        "art-requirements-baseline-1",
        "art-compliance-matrix-1",
        "art-configuration-expansion-1",
        "art-hld-intake-1",
      ],
    });
    expect(row).toMatchObject({
      stageId: "hld_design_delta_review",
      type: "hld_readiness_snapshot",
      status: "needs_review",
      version: 1,
      payload: {},
    });
  });

  it("materializes design_knowledge_pack at hld_design_delta_review", () => {
    const row = materializeProjectArtifactVersion({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "hld_design_delta_review",
      type: "design_knowledge_pack",
      status: "needs_review",
    });
    expect(row).toMatchObject({
      stageId: "hld_design_delta_review",
      type: "design_knowledge_pack",
      status: "needs_review",
      version: 1,
      payload: {},
    });
  });

  it("rejects disallowed stage/type combinations", () => {
    expect(() =>
      materializeProjectArtifactVersion({
        ...base,
        stageId: "intake_package_review",
        type: "priced_boq",
      })
    ).toThrow(/not allowed for stage/);
    // A Stage 6 HLD artifact cannot be materialized outside the HLD stage.
    expect(() =>
      materializeProjectArtifactVersion({
        ...base,
        stageId: "boq_pricing_review",
        type: "hld_document",
      })
    ).toThrow(/not allowed for stage/);
  });

  it("rejects approved, rejected, stale, missing, and not_applicable as creation statuses", () => {
    for (const status of [
      "approved",
      "rejected",
      "stale",
      "missing",
      "not_applicable",
    ] as const) {
      expect(() =>
        materializeProjectArtifactVersion({ ...base, status })
      ).toThrow(/Cannot create an artifact version with status/);
    }
  });

  it("accepts the allowed creation statuses", () => {
    for (const status of ["generated", "needs_review", "failed"] as const) {
      expect(
        materializeProjectArtifactVersion({ ...base, status }).status
      ).toBe(status);
    }
  });

  it("copies sourceFileIds and sourceArtifactIds, not retaining by reference", () => {
    const sourceFileIds = ["file-a"];
    const sourceArtifactIds = ["art-a"];
    const row = materializeProjectArtifactVersion({
      ...base,
      sourceFileIds,
      sourceArtifactIds,
    });
    expect(row.sourceFileIds).not.toBe(sourceFileIds);
    expect(row.sourceArtifactIds).not.toBe(sourceArtifactIds);
    // Mutating the inputs afterwards must not affect the returned row.
    sourceFileIds.push("file-b");
    sourceArtifactIds.push("art-b");
    expect(row.sourceFileIds).toEqual(["file-a"]);
    expect(row.sourceArtifactIds).toEqual(["art-a"]);
  });

  it("does not mutate the existing artifact inputs", () => {
    const artifacts: ExistingProjectArtifactVersion[] = [
      existing({ type: "priced_boq", version: 1 }),
      existing({ type: "priced_boq", version: 2 }),
    ];
    const snapshot = structuredClone(artifacts);
    materializeProjectArtifactVersion({ ...base, existingArtifacts: artifacts });
    expect(artifacts).toEqual(snapshot);
  });
});

describe("isArtifactVersionFrozen", () => {
  it("is true only for approved artifacts", () => {
    expect(isArtifactVersionFrozen({ status: "approved" })).toBe(true);
    for (const status of [
      "missing",
      "generated",
      "needs_review",
      "rejected",
      "stale",
      "failed",
      "not_applicable",
    ] as const) {
      expect(isArtifactVersionFrozen({ status })).toBe(false);
    }
  });
});

describe("Stage 6 is contract-only: no HLD generation behavior", () => {
  it("exposes only the pure contract/versioning helpers", () => {
    // Runtime export surface is pinned: this slice adds artifact TYPES, not any
    // HLD model/diagram/document builder. (Checks export names, not source text,
    // so it does not false-match on doc comments.)
    expect(Object.keys(artifactsModule).sort()).toEqual(
      [
        "getArtifactTypesForStage",
        "getLatestArtifactVersion",
        "getNextArtifactVersion",
        "isArtifactTypeAllowedForStage",
        "isArtifactVersionFrozen",
        "materializeProjectArtifactVersion",
      ].sort()
    );
    for (const name of Object.keys(artifactsModule)) {
      expect(name).not.toMatch(
        /generate|build|render|draw|diagram|document|model/i
      );
    }
  });

  it("materializing a future HLD artifact produces an empty contract row, not content", () => {
    for (const type of [
      "hld_design_model",
      "hld_design_model_review",
      "hld_diagram",
      "hld_document_model",
      "hld_document",
    ] as const) {
      const row = materializeProjectArtifactVersion({
        projectId: PROJECT,
        tenantId: TENANT,
        stageId: "hld_design_delta_review",
        type,
      });
      // No generated payload, no file produced - just a versioned contract row.
      expect(row.payload).toEqual({});
      expect("filePath" in row).toBe(false);
      expect(row.version).toBe(1);
      expect(row.type).toBe(type);
    }
  });
});
