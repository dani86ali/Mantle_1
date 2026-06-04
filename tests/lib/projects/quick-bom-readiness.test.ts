import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getQuickBomReadinessReport,
  type QuickBomReadinessReport,
  type QuickBomReadinessStepId,
} from "@/lib/projects/quick-bom-readiness";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
};

/** Build a ProjectArtifact stub; only projectId/type/version/status/id are read. */
function art(
  type: ProjectArtifactType,
  version: number,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  const ts = new Date("2026-06-04T00:00:00.000Z");
  return {
    id: `${type}-v${version}`,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "boq_pricing_review",
    type,
    status,
    version,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function report(artifacts: ProjectArtifact[]): QuickBomReadinessReport {
  return getQuickBomReadinessReport({ projectId: PROJECT, artifacts });
}

function step(r: QuickBomReadinessReport, id: QuickBomReadinessStepId) {
  const found = r.steps.find((s) => s.stepId === id);
  if (!found) throw new Error(`missing step ${id}`);
  return found;
}

// A normalized_boq present and non-stale is the entry condition for the spine.
const NORMALIZED = art("normalized_boq", 1, "generated");

describe("report shape", () => {
  it("always emits the five spine steps in workflow order", () => {
    const r = report([]);
    expect(r.steps.map((s) => s.stepId)).toEqual([
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ]);
    expect(r.steps.every((s) => s.artifactType === s.stepId)).toBe(true);
    expect(r.projectId).toBe(PROJECT);
  });

  it("reports the gate each step must reach for its next step", () => {
    const r = report([]);
    expect(step(r, "normalized_boq").requiredStatusForNextStep).toBe("present_non_stale");
    for (const id of [
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ] as const) {
      expect(step(r, id).requiredStatusForNextStep).toBe("approved");
    }
  });

  it("nextStepId always equals blockingStepId in the linear spine", () => {
    for (const artifacts of [
      [],
      [NORMALIZED],
      [NORMALIZED, art("sku_resolution", 1, "needs_review")],
      [NORMALIZED, art("sku_resolution", 1, "approved")],
    ]) {
      const r = report(artifacts);
      expect(r.nextStepId).toBe(r.blockingStepId);
    }
  });
});

describe("normalized_boq gate", () => {
  it("missing all artifacts reports normalized_boq as the first blocker", () => {
    const r = report([]);
    expect(r.blockingStepId).toBe("normalized_boq");
    expect(r.nextStepId).toBe("normalized_boq");
    expect(r.canCreateSkuResolution).toBe(false);
    expect(r.isCustomerDeliverableReady).toBe(false);
    const nb = step(r, "normalized_boq");
    expect(nb.isPresent).toBe(false);
    expect(nb.status).toBe("not_started");
    expect(nb.blocksNextStep).toBe(true);
    expect("latestArtifactId" in nb).toBe(false);
    expect(r.messages[0]).toContain("normalized_boq");
  });

  it("a present generated normalized_boq enables canCreateSkuResolution", () => {
    const r = report([NORMALIZED]);
    expect(r.canCreateSkuResolution).toBe(true);
    const nb = step(r, "normalized_boq");
    expect(nb.isPresent).toBe(true);
    expect(nb.isStale).toBe(false);
    expect(nb.status).toBe("available");
    expect(nb.blocksNextStep).toBe(false);
    expect(nb.latestArtifactVersion).toBe(1);
    expect(nb.latestArtifactStatus).toBe("generated");
    // The frontier has moved to sku_resolution.
    expect(r.blockingStepId).toBe("sku_resolution");
    expect(r.canCreateConfigurationExpansion).toBe(false);
  });

  it("a stale normalized_boq blocks SKU resolution", () => {
    const r = report([art("normalized_boq", 1, "stale")]);
    expect(r.canCreateSkuResolution).toBe(false);
    const nb = step(r, "normalized_boq");
    expect(nb.isPresent).toBe(true);
    expect(nb.isStale).toBe(true);
    expect(nb.status).toBe("stale");
    expect(nb.blocksNextStep).toBe(true);
    expect(r.blockingStepId).toBe("normalized_boq");
  });
});

describe("sku_resolution gate", () => {
  it("a generated sku_resolution blocks configuration_expansion", () => {
    const r = report([NORMALIZED, art("sku_resolution", 1, "generated")]);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    const sku = step(r, "sku_resolution");
    expect(sku.status).toBe("needs_review");
    expect(sku.blocksNextStep).toBe(true);
    expect(r.blockingStepId).toBe("sku_resolution");
  });

  it("a needs_review sku_resolution blocks configuration_expansion", () => {
    const r = report([NORMALIZED, art("sku_resolution", 1, "needs_review")]);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    expect(step(r, "sku_resolution").status).toBe("needs_review");
  });

  it("an approved sku_resolution enables canCreateConfigurationExpansion", () => {
    const r = report([NORMALIZED, art("sku_resolution", 1, "approved")]);
    expect(r.canCreateConfigurationExpansion).toBe(true);
    expect(step(r, "sku_resolution").status).toBe("approved");
    expect(step(r, "configuration_expansion").status).toBe("not_started");
    expect(r.blockingStepId).toBe("configuration_expansion");
    expect(r.canCreatePricedBoq).toBe(false);
  });
});

describe("configuration_expansion gate", () => {
  const base = [NORMALIZED, art("sku_resolution", 1, "approved")];

  it("a needs_review configuration_expansion blocks pricing", () => {
    const r = report([...base, art("configuration_expansion", 1, "needs_review")]);
    expect(r.canCreatePricedBoq).toBe(false);
    const cfg = step(r, "configuration_expansion");
    expect(cfg.status).toBe("needs_review");
    expect(cfg.blocksNextStep).toBe(true);
    expect(r.blockingStepId).toBe("configuration_expansion");
  });

  it("an approved configuration_expansion enables canCreatePricedBoq", () => {
    const r = report([...base, art("configuration_expansion", 1, "approved")]);
    expect(r.canCreatePricedBoq).toBe(true);
    expect(r.canCreateExportPackage).toBe(false);
    expect(r.blockingStepId).toBe("priced_boq");
  });
});

describe("priced_boq gate", () => {
  const base = [
    NORMALIZED,
    art("sku_resolution", 1, "approved"),
    art("configuration_expansion", 1, "approved"),
  ];

  it("a needs_review priced_boq blocks export", () => {
    const r = report([...base, art("priced_boq", 1, "needs_review")]);
    expect(r.canCreateExportPackage).toBe(false);
    expect(step(r, "priced_boq").status).toBe("needs_review");
    expect(r.blockingStepId).toBe("priced_boq");
  });

  it("an approved priced_boq enables canCreateExportPackage", () => {
    const r = report([...base, art("priced_boq", 1, "approved")]);
    expect(r.canCreateExportPackage).toBe(true);
    expect(step(r, "export_package").status).toBe("not_started");
    expect(r.blockingStepId).toBe("export_package");
    expect(r.isCustomerDeliverableReady).toBe(false);
  });
});

describe("export_package and customer deliverable", () => {
  const base = [
    NORMALIZED,
    art("sku_resolution", 1, "approved"),
    art("configuration_expansion", 1, "approved"),
    art("priced_boq", 1, "approved"),
  ];

  it("a needs_review export_package means the deliverable is not ready", () => {
    const r = report([...base, art("export_package", 1, "needs_review")]);
    expect(r.isCustomerDeliverableReady).toBe(false);
    const exp = step(r, "export_package");
    expect(exp.status).toBe("needs_review");
    expect(exp.blocksNextStep).toBe(true);
    expect(r.blockingStepId).toBe("export_package");
  });

  it("an approved export_package means isCustomerDeliverableReady is true", () => {
    const r = report([...base, art("export_package", 1, "approved")]);
    expect(r.isCustomerDeliverableReady).toBe(true);
    expect(step(r, "export_package").status).toBe("approved");
    expect(r.blockingStepId).toBeNull();
    expect(r.nextStepId).toBeNull();
    expect(r.messages[0].toLowerCase()).toContain("ready");
  });
});

describe("latest-version selection and scoping", () => {
  it("the highest version wins even if an older version is approved", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "approved"),
      art("sku_resolution", 2, "needs_review"),
    ]);
    const sku = step(r, "sku_resolution");
    expect(sku.latestArtifactVersion).toBe(2);
    expect(sku.latestArtifactStatus).toBe("needs_review");
    expect(r.canCreateConfigurationExpansion).toBe(false);
  });

  it("the highest version wins when the newest version is the approved one", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "needs_review"),
      art("sku_resolution", 2, "approved"),
    ]);
    expect(step(r, "sku_resolution").latestArtifactVersion).toBe(2);
    expect(r.canCreateConfigurationExpansion).toBe(true);
  });

  it("ignores artifacts from other projects", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "approved", { projectId: OTHER_PROJECT, id: "sku-other" }),
    ]);
    expect(r.canCreateSkuResolution).toBe(true);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    expect(step(r, "sku_resolution").isPresent).toBe(false);
  });
});

describe("robustness and purity", () => {
  it("flags a stale upstream as the blocker even when a downstream artifact exists", () => {
    // normalized_boq went stale after sku_resolution was approved.
    const r = report([
      art("normalized_boq", 1, "stale"),
      art("sku_resolution", 1, "approved"),
    ]);
    expect(r.canCreateSkuResolution).toBe(false);
    expect(r.blockingStepId).toBe("normalized_boq");
    expect(step(r, "normalized_boq").blocksNextStep).toBe(true);
  });

  it("does not mutate the input artifacts array or its elements", () => {
    const artifacts = [
      NORMALIZED,
      art("sku_resolution", 2, "needs_review"),
      art("sku_resolution", 1, "approved"),
    ];
    const snapshot = structuredClone(artifacts);
    getQuickBomReadinessReport({ projectId: PROJECT, artifacts });
    expect(artifacts).toEqual(snapshot);
  });
});

describe("transitive creation gates", () => {
  it("stale normalized_boq with an approved sku_resolution keeps configuration_expansion uncreatable", () => {
    const r = report([
      art("normalized_boq", 1, "stale"),
      art("sku_resolution", 1, "approved"),
    ]);
    expect(r.canCreateSkuResolution).toBe(false);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    expect(r.blockingStepId).toBe("normalized_boq");
  });

  it("missing normalized_boq with approved downstream artifacts keeps every canCreate flag false", () => {
    const r = report([
      art("sku_resolution", 1, "approved"),
      art("configuration_expansion", 1, "approved"),
      art("priced_boq", 1, "approved"),
    ]);
    expect(r.canCreateSkuResolution).toBe(false);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    expect(r.canCreatePricedBoq).toBe(false);
    expect(r.canCreateExportPackage).toBe(false);
    expect(r.blockingStepId).toBe("normalized_boq");
  });

  it("stale configuration_expansion with an approved priced_boq blocks pricing and export creation", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "approved"),
      art("configuration_expansion", 1, "stale"),
      art("priced_boq", 1, "approved"),
    ]);
    expect(r.canCreatePricedBoq).toBe(false);
    expect(r.canCreateExportPackage).toBe(false);
    // Gates upstream of configuration_expansion still hold, so it can be regenerated.
    expect(r.canCreateConfigurationExpansion).toBe(true);
    expect(r.blockingStepId).toBe("configuration_expansion");
  });
});

describe("transitive customer deliverable readiness", () => {
  it("an approved export_package over a missing normalized_boq is NOT customer-ready", () => {
    const r = report([
      art("sku_resolution", 1, "approved"),
      art("configuration_expansion", 1, "approved"),
      art("priced_boq", 1, "approved"),
      art("export_package", 1, "approved"),
    ]);
    expect(r.isCustomerDeliverableReady).toBe(false);
    expect(r.blockingStepId).toBe("normalized_boq");
    expect(r.messages[0].toLowerCase()).not.toContain("ready");
  });

  it("an approved export_package over a stale configuration_expansion is NOT customer-ready", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "approved"),
      art("configuration_expansion", 1, "stale"),
      art("priced_boq", 1, "approved"),
      art("export_package", 1, "approved"),
    ]);
    expect(r.isCustomerDeliverableReady).toBe(false);
    expect(r.blockingStepId).toBe("configuration_expansion");
    expect(r.messages[0].toLowerCase()).not.toContain("ready");
  });

  it("the fully approved spine is customer-ready with the ready headline", () => {
    const r = report([
      NORMALIZED,
      art("sku_resolution", 1, "approved"),
      art("configuration_expansion", 1, "approved"),
      art("priced_boq", 1, "approved"),
      art("export_package", 1, "approved"),
    ]);
    expect(r.isCustomerDeliverableReady).toBe(true);
    expect(r.blockingStepId).toBeNull();
    expect(r.nextStepId).toBeNull();
    expect(r.messages[0].toLowerCase()).toContain("ready");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/quick-bom-readiness.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/quick-bom-readiness.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("has exactly one import, a type-only import from @/types/project", () => {
    const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/^import type \{/);
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/types/project"]);
  });

  it("references no DB, service, pricing, catalog, Mantle, engine, AI, or coordinator module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/staleness',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
