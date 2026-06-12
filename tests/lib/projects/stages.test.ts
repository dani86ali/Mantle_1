import { describe, it, expect } from "vitest";
import {
  PROJECT_STAGE_DEFINITIONS,
  getProjectStageDefinitions,
  getActiveProjectStageDefinitions,
  isProjectStageApplicable,
  materializeProjectStages,
} from "@/lib/projects/stages";
import type { ProjectArtifactType } from "@/types/project";

const VALID_ARTIFACT_TYPES: readonly ProjectArtifactType[] = [
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
  "technical_proposal",
  "export_package",
];

const ids = (defs: readonly { stageId: string }[]) => defs.map((d) => d.stageId);

describe("active stage sequences", () => {
  it("quick_bom active sequence is exactly the five BoM stages in order", () => {
    expect(ids(getActiveProjectStageDefinitions("quick_bom"))).toEqual([
      "boq_format_validation",
      "sku_resolution",
      "configuration_expansion_review",
      "boq_pricing_review",
      "export_approval",
    ]);
  });

  it("rfp active sequence is exactly the canonical RFP stages in order", () => {
    expect(ids(getActiveProjectStageDefinitions("rfp"))).toEqual([
      "intake_package_review",
      "requirements_baseline_review",
      "compliance_matrix_review",
      "hld_design_delta_review",
      "boq_pricing_review",
      "proposal_review",
      "export_approval",
    ]);
  });

  it("getProjectStageDefinitions defaults to active stages only", () => {
    expect(ids(getProjectStageDefinitions("quick_bom"))).toEqual(
      ids(getActiveProjectStageDefinitions("quick_bom"))
    );
  });
});

describe("global stage order", () => {
  it("uses the exact stable id->order mapping", () => {
    expect(
      PROJECT_STAGE_DEFINITIONS.map((d) => [d.stageId, d.order])
    ).toEqual([
      ["intake_package_review", 10],
      ["boq_format_validation", 20],
      ["sku_resolution", 30],
      ["configuration_expansion_review", 35],
      ["requirements_baseline_review", 40],
      ["compliance_matrix_review", 50],
      ["hld_design_delta_review", 60],
      ["boq_pricing_review", 70],
      ["proposal_review", 80],
      ["export_approval", 90],
    ]);
  });

  it("has unique stage ids and unique, ascending order values", () => {
    const stageIds = PROJECT_STAGE_DEFINITIONS.map((d) => d.stageId);
    const orders = PROJECT_STAGE_DEFINITIONS.map((d) => d.order);
    expect(new Set(stageIds).size).toBe(stageIds.length);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("preserves global order numbers across modes (no per-mode renumbering)", () => {
    const pricingInQuickBom = getActiveProjectStageDefinitions("quick_bom").find(
      (d) => d.stageId === "boq_pricing_review"
    );
    const pricingInRfp = getActiveProjectStageDefinitions("rfp").find(
      (d) => d.stageId === "boq_pricing_review"
    );
    expect(pricingInQuickBom?.order).toBe(70);
    expect(pricingInRfp?.order).toBe(70);
  });
});

describe("isProjectStageApplicable", () => {
  it("matches the active sets for each mode", () => {
    expect(isProjectStageApplicable("quick_bom", "boq_format_validation")).toBe(true);
    expect(isProjectStageApplicable("quick_bom", "configuration_expansion_review")).toBe(true);
    expect(isProjectStageApplicable("quick_bom", "intake_package_review")).toBe(false);
    expect(isProjectStageApplicable("rfp", "proposal_review")).toBe(true);
    expect(isProjectStageApplicable("rfp", "sku_resolution")).toBe(false);
    expect(isProjectStageApplicable("rfp", "configuration_expansion_review")).toBe(false);
  });
});

describe("materializeProjectStages", () => {
  const base = { projectId: "proj-1", tenantId: "tenant-1" } as const;

  it("quick_bom without not_applicable returns only active stages, all not_started", () => {
    const rows = materializeProjectStages({ ...base, mode: "quick_bom" });
    expect(rows.map((r) => r.stageId)).toEqual([
      "boq_format_validation",
      "sku_resolution",
      "configuration_expansion_review",
      "boq_pricing_review",
      "export_approval",
    ]);
    expect(rows.every((r) => r.status === "not_started")).toBe(true);
    expect(rows.every((r) => r.projectId === "proj-1" && r.tenantId === "tenant-1")).toBe(true);
    expect(rows.map((r) => r.stageOrder)).toEqual([20, 30, 35, 70, 90]);
  });

  it("quick_bom with includeNotApplicable returns all canonical stages, RFP-only as not_applicable", () => {
    const rows = materializeProjectStages({
      ...base,
      mode: "quick_bom",
      includeNotApplicable: true,
    });
    expect(rows).toHaveLength(PROJECT_STAGE_DEFINITIONS.length);
    const byId = Object.fromEntries(rows.map((r) => [r.stageId, r.status]));
    expect(byId["boq_format_validation"]).toBe("not_started");
    expect(byId["intake_package_review"]).toBe("not_applicable");
    expect(byId["proposal_review"]).toBe("not_applicable");
  });

  it("rfp without not_applicable excludes quick_bom-only top-level stages", () => {
    const rows = materializeProjectStages({ ...base, mode: "rfp" });
    const stageIds = rows.map((r) => r.stageId);
    expect(stageIds).toEqual([
      "intake_package_review",
      "requirements_baseline_review",
      "compliance_matrix_review",
      "hld_design_delta_review",
      "boq_pricing_review",
      "proposal_review",
      "export_approval",
    ]);
    expect(stageIds).not.toContain("boq_format_validation");
    expect(stageIds).not.toContain("sku_resolution");
    expect(rows.every((r) => r.status === "not_started")).toBe(true);
  });

  it("rfp with includeNotApplicable surfaces quick_bom-only stages as not_applicable", () => {
    const rows = materializeProjectStages({
      ...base,
      mode: "rfp",
      includeNotApplicable: true,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.stageId, r.status]));
    expect(byId["boq_format_validation"]).toBe("not_applicable");
    expect(byId["sku_resolution"]).toBe("not_applicable");
    expect(byId["intake_package_review"]).toBe("not_started");
  });

  it("uses a single timestamp for createdAt and updatedAt", () => {
    const [row] = materializeProjectStages({ ...base, mode: "quick_bom" });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.createdAt.getTime()).toBe(row.updatedAt.getTime());
  });
});

describe("artifact metadata", () => {
  it("only references existing ProjectArtifactType values", () => {
    for (const def of PROJECT_STAGE_DEFINITIONS) {
      for (const type of def.artifactTypes) {
        expect(VALID_ARTIFACT_TYPES).toContain(type);
      }
    }
  });

  it("intake_package_review exposes the RFP evidence-chain artifact kinds", () => {
    const intake = PROJECT_STAGE_DEFINITIONS.find(
      (d) => d.stageId === "intake_package_review"
    );
    // extraction_delta is candidate/review metadata; evidence_package is the
    // human-approved final evidence artifact. Both live under intake review.
    expect(intake?.artifactTypes).toEqual([
      "input_package",
      "extraction_delta",
      "evidence_package",
    ]);
  });
});
