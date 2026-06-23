import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { getRfpHldReadinessReport } from "@/lib/projects/project-rfp-hld-readiness";
import type {
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectFileRole,
  ProjectStageId,
} from "@/types/project";

const PROJECT = "proj-rfp-1";
const TS = new Date("2026-06-12T00:00:00.000Z");

const STAGE_BY_TYPE: Partial<Record<ProjectArtifactType, ProjectStageId>> = {
  evidence_package: "intake_package_review",
  requirements_baseline: "requirements_baseline_review",
  compliance_matrix: "compliance_matrix_review",
  normalized_boq: "boq_format_validation",
  sku_resolution: "sku_resolution",
  configuration_expansion: "configuration_expansion_review",
  hld_intake: "hld_design_delta_review",
  design_knowledge_pack: "hld_design_delta_review",
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
    payload: { secret: "payload-not-leaked" },
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

// An approved no-BoQ / service-only exception that satisfies the configuration gate
// without any BoQ file or hardware packs.
function noBoqException(version: number, status: ProjectArtifactStatus = "approved") {
  return artifact("configuration_expansion", version, status, {
    payload: { payloadKind: "rfp_no_boq_service_only_exception", reason: "Services only" },
  });
}

// An approved hld_intake whose unknown/NA answers become sanitized assumptions.
function hldIntake(version: number, status: ProjectArtifactStatus = "approved") {
  return artifact("hld_intake", version, status, {
    payload: {
      payloadKind: "rfp_hld_intake",
      answers: [
        { fieldId: "existing_network_context", label: "Existing network context", status: "answered", value: "brownfield" },
        { fieldId: "resiliency_expectations", label: "Resiliency expectations", status: "unknown", notes: "  awaiting customer  " },
        { fieldId: "rack_power_assumptions", label: "Rack and power assumptions", status: "not_applicable" },
      ],
    },
  });
}

function report(files: ProjectFile[], artifacts: ProjectArtifact[]) {
  return getRfpHldReadinessReport({ projectId: PROJECT, files, artifacts });
}

// A fully ready service-only set: the three core approvals, the no-BoQ exception,
// and the approved hld_intake. No technical domains claimed -> no packs required.
const READY_SERVICE_ONLY = [
  artifact("evidence_package", 1, "approved"),
  artifact("requirements_baseline", 1, "approved"),
  artifact("compliance_matrix", 1, "approved"),
  noBoqException(1),
  hldIntake(1),
];

describe("getRfpHldReadinessReport - blocking chain", () => {
  it("blocks with empty inputs and lists every missing input", () => {
    const r = report([], []);
    expect(r.status).toBe("blocked");
    expect(r.canCreateReadinessSnapshot).toBe(false);
    expect(r.sourceArtifactIds).toEqual([]);
    expect(r.missingInputs).toContain("evidence_package");
    expect(r.missingInputs).toContain("requirements_baseline");
    expect(r.missingInputs).toContain("compliance_matrix");
    expect(r.missingInputs).toContain("configuration");
    expect(r.missingInputs).toContain("hld_intake");
  });

  it("blocks when evidence_package latest is not approved", () => {
    const r = report([], [
      artifact("evidence_package", 1, "needs_review"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1),
    ]);
    expect(r.status).toBe("blocked");
    expect(r.missingInputs).toEqual(["evidence_package"]);
  });

  it("blocks when requirements_baseline latest is not approved", () => {
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "needs_review"),
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1),
    ]);
    expect(r.missingInputs).toEqual(["requirements_baseline"]);
  });

  it("blocks when the configuration gate is unsatisfied and surfaces its message", () => {
    // A BoQ file with no approved configuration_expansion leaves the gate unsatisfied.
    const r = report([file("boq", "boq")], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      hldIntake(1),
    ]);
    expect(r.missingInputs).toContain("configuration");
    expect(r.validationMessages.join(" ")).toMatch(/normaliz|configuration/i);
  });

  it("blocks when hld_intake latest is not approved", () => {
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1, "needs_review"),
    ]);
    expect(r.missingInputs).toEqual(["hld_intake"]);
  });
});

describe("getRfpHldReadinessReport - latest-version staleness", () => {
  it("blocks when the latest hld_intake is stale even if an older approved version exists", () => {
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1),
      hldIntake(2, "stale"),
    ]);
    expect(r.missingInputs).toEqual(["hld_intake"]);
  });

  it("blocks when the latest compliance_matrix is stale even if an older approved version exists", () => {
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      artifact("compliance_matrix", 2, "stale"),
      noBoqException(1),
      hldIntake(1),
    ]);
    expect(r.missingInputs).toEqual(["compliance_matrix"]);
  });

  it("blocks a BoQ project when the latest configuration_expansion is stale over an approved one", () => {
    const r = report([file("boq", "boq")], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      artifact("configuration_expansion", 1, "approved"),
      artifact("configuration_expansion", 2, "stale"),
      hldIntake(1),
    ]);
    expect(r.status).toBe("blocked");
    expect(r.missingInputs).toEqual(["configuration"]);
  });

  it("blocks a no-BoQ project when a stale configuration_expansion supersedes the approved exception", () => {
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      artifact("requirements_baseline", 1, "approved"),
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      artifact("configuration_expansion", 2, "stale"),
      hldIntake(1),
    ]);
    expect(r.status).toBe("blocked");
    expect(r.missingInputs).toEqual(["configuration"]);
  });
});

describe("getRfpHldReadinessReport - knowledge pack domains", () => {
  it("blocks on a claimed technical domain that lacks an approved design_knowledge_pack", () => {
    const claimsWireless = artifact("requirements_baseline", 1, "approved", {
      payload: { requirements: [{ id: "r1", text: "Deploy wireless access points across the building" }] },
    });
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      claimsWireless,
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1),
    ]);
    expect(r.status).toBe("blocked");
    expect(r.missingInputs).toContain("design_knowledge_packs");
    expect(r.missingKnowledgePackDomains).toContain("wireless");
  });

  it("becomes ready once the claimed domain has an approved knowledge pack, including its id as a source", () => {
    const claimsWireless = artifact("requirements_baseline", 1, "approved", {
      payload: { requirements: [{ id: "r1", text: "Deploy wireless access points across the building" }] },
    });
    const pack = artifact("design_knowledge_pack", 1, "approved", {
      id: "pack-wireless",
      payload: { payloadKind: "rfp_hld_design_knowledge_pack", domain: "wireless", title: "Wireless design" },
    });
    const r = report([], [
      artifact("evidence_package", 1, "approved"),
      claimsWireless,
      artifact("compliance_matrix", 1, "approved"),
      noBoqException(1),
      hldIntake(1),
      pack,
    ]);
    expect(r.status).toBe("ready");
    expect(r.coveredDomains).toContain("wireless");
    expect(r.sourceArtifactIds).toContain("pack-wireless");
  });
});

describe("getRfpHldReadinessReport - ready report", () => {
  it("a service-only exception satisfies configuration with no hardware packs required", () => {
    const r = report([], READY_SERVICE_ONLY);

    expect(r.status).toBe("ready");
    expect(r.canCreateReadinessSnapshot).toBe(true);
    expect(r.missingInputs).toEqual([]);
    expect(r.missingKnowledgePackDomains).toEqual([]);
  });

  it("exposes the source authority ids", () => {
    const r = report([], READY_SERVICE_ONLY);

    expect(r.sourceEvidencePackageArtifactId).toBe("evidence_package-v1");
    expect(r.sourceRequirementsBaselineArtifactId).toBe("requirements_baseline-v1");
    expect(r.sourceComplianceMatrixArtifactId).toBe("compliance_matrix-v1");
    expect(r.sourceConfigurationArtifactId).toBe("configuration_expansion-v1");
    expect(r.sourceHldIntakeArtifactId).toBe("hld_intake-v1");
    expect(r.sourceArtifactIds).toEqual([
      "evidence_package-v1",
      "requirements_baseline-v1",
      "compliance_matrix-v1",
      "configuration_expansion-v1",
      "hld_intake-v1",
    ]);
  });

  it("includes covered/excluded domains and sanitized assumptions from the hld_intake", () => {
    const r = report([], READY_SERVICE_ONLY);

    expect(r.coveredDomains).toContain("service_only");
    expect(r.excludedDomains).toContain("wireless");
    expect(r.excludedDomains).not.toContain("service_only");

    expect(r.assumptions).toEqual([
      {
        fieldId: "resiliency_expectations",
        label: "Resiliency expectations",
        status: "unknown",
        note: "awaiting customer",
      },
      {
        fieldId: "rack_power_assumptions",
        label: "Rack and power assumptions",
        status: "not_applicable",
      },
    ]);
  });

  it("does not leak storagePath, raw payload bodies, or upstream payload secrets", () => {
    const r = report([file("boq", "boq")], [
      ...READY_SERVICE_ONLY.filter((a) => a.type !== "configuration_expansion"),
      artifact("configuration_expansion", 1, "approved"),
    ]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("s3://");
    expect(json).not.toContain("payload-not-leaked");
    expect(json).not.toContain("brownfield");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-readiness.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-readiness.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only canonical types, the BoQ readiness gate, and the domain readiness helper", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]).sort();
    expect(froms).toEqual(
      [
        "@/lib/projects/project-rfp-boq-readiness",
        "@/lib/projects/project-rfp-hld-domain-readiness",
        "@/types/project",
      ].sort()
    );
  });

  it("does not read stores/files, price, export, resolve SKUs, lookup catalog, or call AI", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "node:fs',
      'from "node:path',
      "createProjectArtifactVersion",
      "createProjectApproval",
      ".storagePath",
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
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
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
