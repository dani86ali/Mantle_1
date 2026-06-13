import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getRfpBoqReadinessReport,
  type RfpBoqReadinessReport,
} from "@/lib/projects/project-rfp-boq-readiness";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectFileRole,
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

function file(
  id: string,
  fileRole: ProjectFileRole,
  overrides: Partial<ProjectFile> = {}
): ProjectFile {
  return {
    id,
    projectId: PROJECT,
    fileRole,
    fileName: `${id}.xlsx`,
    storagePath: `s3://bucket/${id}`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 1024,
    uploadedAt: new Date("2026-06-01T00:00:00.000Z"),
    retainUntil: new Date("2027-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

function report(
  files: ProjectFile[],
  artifacts: ProjectArtifact[]
): RfpBoqReadinessReport {
  return getRfpBoqReadinessReport({ projectId: PROJECT, files, artifacts });
}

const BOQ = file("boq-1", "boq");
const NORMALIZED = art("normalized_boq", 1, "generated");
const APPROVED_CHAIN = [
  art("normalized_boq", 1, "generated"),
  art("sku_resolution", 1, "approved"),
  art("configuration_expansion", 1, "approved"),
  art("priced_boq", 1, "approved"),
  art("export_package", 1, "approved"),
];

describe("no BoQ files", () => {
  it("reports no_boq_file with every action false, ignoring stray artifacts", () => {
    const r = report([file("rfp-1", "rfp"), file("sow-1", "scope_of_work")], APPROVED_CHAIN);
    expect(r.status).toBe("no_boq_file");
    expect(r.hasBoqFiles).toBe(false);
    expect(r.boqFileCount).toBe(0);
    expect(r.boqFiles).toEqual([]);
    expect(r.normalizationCandidateFileIds).toEqual([]);
    expect(r.canNormalizeBoq).toBe(false);
    expect(r.canCreateSkuResolution).toBe(false);
    expect(r.canCreateConfigurationExpansion).toBe(false);
    expect(r.canCreatePricedBoq).toBe(false);
    expect(r.canCreateExportPackage).toBe(false);
    expect(r.isCustomerDeliverableReady).toBe(false);
    // Even though the Quick BoM chain is fully approved, no BoQ file => not ready.
    expect(r.quickBomReadiness.isCustomerDeliverableReady).toBe(true);
    expect(r.messages).toHaveLength(1);
  });

  it("never leaks storagePath into the output", () => {
    const r = report([file("rfp-1", "rfp")], []);
    expect(JSON.stringify(r)).not.toContain("storagePath");
    expect(JSON.stringify(r)).not.toContain("s3://");
  });
});

describe("one BoQ file, no normalized_boq", () => {
  it("is ready_to_normalize with the BoQ file as a candidate", () => {
    const r = report([BOQ], []);
    expect(r.status).toBe("ready_to_normalize");
    expect(r.canNormalizeBoq).toBe(true);
    expect(r.boqFileCount).toBe(1);
    expect(r.normalizationCandidateFileIds).toEqual(["boq-1"]);
    expect(r.boqFiles[0].fileRole).toBe("boq");
    expect(r.boqFiles[0].uploadedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(r.boqFiles[0].retainUntil).toBe("2027-06-01T00:00:00.000Z");
    expect("storagePath" in r.boqFiles[0]).toBe(false);
  });
});

describe("multiple BoQ files", () => {
  it("reports all in input order with no auto-selection field", () => {
    const r = report([file("boq-a", "boq"), file("boq-b", "boq"), file("boq-c", "boq")], []);
    expect(r.boqFileCount).toBe(3);
    expect(r.normalizationCandidateFileIds).toEqual(["boq-a", "boq-b", "boq-c"]);
    expect(r).not.toHaveProperty("selectedBoqFileId");
    expect(r).not.toHaveProperty("primaryBoqFileId");
  });
});

describe("normalized_boq presence and staleness", () => {
  it("a non-stale normalized_boq makes canNormalizeBoq false and follows quickBomReadiness", () => {
    const r = report([BOQ], [NORMALIZED]);
    expect(r.canNormalizeBoq).toBe(false);
    expect(r.status).toBe("quick_bom_in_progress");
    expect(r.canCreateSkuResolution).toBe(true);
    expect(r.canCreateSkuResolution).toBe(r.quickBomReadiness.canCreateSkuResolution);
  });

  it("a stale latest normalized_boq makes canNormalizeBoq true and ready_to_normalize", () => {
    const r = report([BOQ], [art("normalized_boq", 1, "generated"), art("normalized_boq", 2, "stale")]);
    expect(r.canNormalizeBoq).toBe(true);
    expect(r.status).toBe("ready_to_normalize");
  });

  it("a missing-status normalized_boq makes canNormalizeBoq true", () => {
    const r = report([BOQ], [art("normalized_boq", 1, "missing")]);
    expect(r.canNormalizeBoq).toBe(true);
  });
});

describe("full approved Quick BoM chain", () => {
  it("is customer_deliverable_ready when a BoQ file exists", () => {
    const r = report([BOQ], APPROVED_CHAIN);
    expect(r.status).toBe("customer_deliverable_ready");
    expect(r.isCustomerDeliverableReady).toBe(true);
    expect(r.canNormalizeBoq).toBe(false);
    expect(r.messages.length).toBeGreaterThan(1);
  });
});

describe("project scoping", () => {
  it("ignores files and artifacts from other projects and picks latest version", () => {
    const r = report(
      [BOQ, file("boq-other", "boq", { projectId: OTHER_PROJECT })],
      [
        NORMALIZED,
        art("normalized_boq", 2, "stale", { projectId: OTHER_PROJECT, id: "nb-other" }),
      ]
    );
    expect(r.boqFileCount).toBe(1);
    expect(r.normalizationCandidateFileIds).toEqual(["boq-1"]);
    // Other project's stale normalized_boq must not flip this project to ready_to_normalize.
    expect(r.canNormalizeBoq).toBe(false);
    expect(r.status).toBe("quick_bom_in_progress");
  });
});

describe("defensive copies and immutability", () => {
  it("does not mutate the input files or artifacts", () => {
    const files = [BOQ, file("rfp-1", "rfp")];
    const artifacts = [NORMALIZED, art("sku_resolution", 1, "approved")];
    const filesSnapshot = structuredClone(files);
    const artifactsSnapshot = structuredClone(artifacts);
    getRfpBoqReadinessReport({ projectId: PROJECT, files, artifacts });
    expect(files).toEqual(filesSnapshot);
    expect(artifacts).toEqual(artifactsSnapshot);
  });

  it("returns fresh arrays not aliased to input file ids", () => {
    const r = report([BOQ], []);
    const before = r.normalizationCandidateFileIds.length;
    r.normalizationCandidateFileIds.push("mutated");
    const again = report([BOQ], []);
    expect(again.normalizationCandidateFileIds).toHaveLength(before);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-boq-readiness.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-boq-readiness.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only canonical project types and the Quick BoM readiness helper", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms.sort()).toEqual(["@/lib/projects/quick-bom-readiness", "@/types/project"]);
  });

  it("references no DB, fs, parser, pricing, SKU, config, export, AI, catalog, coordinator, engine, route, or UI module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "node:fs',
      'from "node:path',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/export',
      'from "@/lib/projects/normaliz',
      'from "@/lib/projects/project-rfp-upload',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never reads the storagePath property when constructing output", () => {
    expect(source).not.toMatch(/\.storagePath\b/);
    expect(source).not.toMatch(/\bstoragePath\s*:/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
