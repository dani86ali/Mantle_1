import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getRfpHldReadinessReport,
} from "@/lib/projects/project-rfp-hld-readiness";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectFileRole,
  ProjectStageId,
} from "@/types/project";

const PROJECT = "proj-rfp-1";
const OTHER_PROJECT = "proj-other";
const TS = new Date("2026-06-12T00:00:00.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  evidence_package: "intake_package_review",
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  priced_boq: "boq_pricing_review",
  export_package: "export_approval",
};

function artifact(
  type: ProjectArtifactType,
  version: number,
  status: ProjectArtifactStatus,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: `${type}-v${version}`,
    projectId: PROJECT,
    stageId: STAGE_BY_TYPE[type] ?? "hld_design_delta_review",
    type,
    status,
    version,
    payload: { secret: "payload-not-read" },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
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
    uploadedAt: TS,
    retainUntil: TS,
    ...overrides,
  };
}

function report(files: ProjectFile[], artifacts: ProjectArtifact[]) {
  return getRfpHldReadinessReport({ projectId: PROJECT, files, artifacts });
}

const REQUIRED_APPROVED = [
  artifact("evidence_package", 1, "approved"),
  artifact("requirements_baseline", 1, "approved"),
  artifact("compliance_matrix", 1, "approved"),
];

describe("RFP HLD readiness gates", () => {
  it("blocks first on the missing approved evidence package", () => {
    const r = report([], []);
    expect(r.status).toBe("blocked");
    expect(r.canCreateHldDesignDelta).toBe(false);
    expect(r.blockingStepId).toBe("evidence_package");
    expect(r.prerequisites.find((p) => p.stepId === "evidence_package")).toMatchObject({
      required: true,
      isApproved: false,
      isSatisfied: false,
    });
  });

  it("then blocks on requirements baseline, then compliance matrix", () => {
    let r = report([], [artifact("evidence_package", 1, "approved")]);
    expect(r.blockingStepId).toBe("requirements_baseline");

    r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
    ]);
    expect(r.blockingStepId).toBe("compliance_matrix");
  });

  it("allows HLD readiness without configuration expansion when there is no BoQ lane", () => {
    const r = report([file("rfp-main", "rfp")], REQUIRED_APPROVED);

    expect(r.status).toBe("ready");
    expect(r.canCreateHldDesignDelta).toBe(true);
    expect(r.requiresConfigurationExpansion).toBe(false);
    expect(r.blockingStepId).toBeNull();
    expect(
      r.prerequisites.find((p) => p.stepId === "configuration_expansion")
    ).toMatchObject({ required: false, isSatisfied: true });
  });

  it("requires approved configuration_expansion when the RFP package has a BoQ file", () => {
    const r = report([file("boq", "boq")], REQUIRED_APPROVED);

    expect(r.status).toBe("blocked");
    expect(r.hasBoqLane).toBe(true);
    expect(r.requiresConfigurationExpansion).toBe(true);
    expect(r.blockingStepId).toBe("configuration_expansion");
    expect(r.canCreateHldDesignDelta).toBe(false);
  });

  it("allows HLD readiness for a BoQ package only after configuration_expansion is approved", () => {
    const r = report(
      [file("boq", "boq")],
      [...REQUIRED_APPROVED, artifact("configuration_expansion", 1, "approved")]
    );

    expect(r.status).toBe("ready");
    expect(r.blockingStepId).toBeNull();
    expect(r.canCreateHldDesignDelta).toBe(true);
  });

  it("treats any existing Quick BoM lane artifact as requiring configuration approval", () => {
    const r = report([], [
      ...REQUIRED_APPROVED,
      artifact("normalized_boq", 1, "generated"),
    ]);

    expect(r.requiresConfigurationExpansion).toBe(true);
    expect(r.blockingStepId).toBe("configuration_expansion");
  });

  it("uses the latest version by artifact type and blocks stale latest artifacts", () => {
    const r = report(
      [file("boq", "boq")],
      [
        artifact("evidence_package", 1, "approved"),
        artifact("requirements_baseline", 1, "approved"),
        artifact("compliance_matrix", 1, "approved"),
        artifact("configuration_expansion", 1, "approved"),
        artifact("configuration_expansion", 2, "stale"),
      ]
    );

    expect(r.blockingStepId).toBe("configuration_expansion");
    const config = r.prerequisites.find(
      (p) => p.stepId === "configuration_expansion"
    );
    expect(config).toMatchObject({
      latestArtifactId: "configuration_expansion-v2",
      latestArtifactStatus: "stale",
      isApproved: false,
    });
  });

  it("ignores files and artifacts from other projects", () => {
    const r = report(
      [file("boq-other", "boq", { projectId: OTHER_PROJECT })],
      [
        ...REQUIRED_APPROVED,
        artifact("configuration_expansion", 1, "approved", {
          projectId: OTHER_PROJECT,
        }),
      ]
    );

    expect(r.requiresConfigurationExpansion).toBe(false);
    expect(r.status).toBe("ready");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-readiness.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-readiness.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only canonical project types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/types/project"]);
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/types\/project";/);
  });

  it("does not implement HLD, read stores/files, price, export, configure, resolve SKUs, or call AI", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "node:fs',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "payload.",
      ".payload",
      ".storagePath",
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
