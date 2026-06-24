import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import type { ProjectArtifact } from "@/types/project";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-source-bundle";
import type { RfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";

const CREATED_AT = "2026-06-23T00:00:00.000Z";
const PROJECT_ID = "proj-1";
const BUNDLE_ARTIFACT_ID = "hsb-1";

function validBundlePayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    },
    authorities: {
      evidencePackage: {
        artifactId: "evp-1", artifactType: "evidence_package",
        stageId: "intake_package_review", status: "approved", version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1", artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review", status: "approved", version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1", artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review", status: "approved", version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1", artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review", status: "approved", version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1", artifactType: "hld_intake",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1", artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1", artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
      },
    ],
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [{ id: "a1", statement: "Existing core remains." }],
    constraints: [{ id: "c1", statement: "No BoQ change." }],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

const BUNDLE_SOURCE_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: validBundlePayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: BUNDLE_SOURCE_IDS,
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(CREATED_AT),
    ...overrides,
  };
}

function validModelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [BUNDLE_ARTIFACT_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ARTIFACT_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [
      { id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ARTIFACT_ID },
    ],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1", domain: "campus_switching", title: "Campus Switching Design",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "Use C9300 series", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "l-1", label: "Uplink", fromNodeId: "n-1", toNodeId: "n-2",
          linkType: "ethernet", sourceRefIds: ["sr-1"],
        },
      ],
      zones: [
        { id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] },
      ],
    },
    diagramIntents: [
      { id: "di-1", title: "Campus Topology", intentType: "physical", sourceRefIds: ["sr-1"] },
    ],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [],
  };
}

// ---------------------------------------------------------------------------
// getRfpHldDesignModelReadinessReport
// ---------------------------------------------------------------------------

describe("getRfpHldDesignModelReadinessReport - blocked: missing source bundle", () => {
  it("returns blocked when no artifacts exist", () => {
    const report = getRfpHldDesignModelReadinessReport({ projectId: PROJECT_ID, artifacts: [] });
    expect(report.status).toBe("blocked");
    expect(report.canCreateDesignModel).toBe(false);
    expect(report.blockedCode).toBe("missing_source_bundle");
  });

  it("ignores source bundles from other projects", () => {
    const otherBundle = makeArtifact({ projectId: "other-proj" });
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [otherBundle],
    });
    expect(report.blockedCode).toBe("missing_source_bundle");
  });
});

describe("getRfpHldDesignModelReadinessReport - blocked: latest not approved", () => {
  it("blocks when latest bundle is in needs_review status", () => {
    const bundle = makeArtifact({ status: "needs_review" });
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(report.status).toBe("blocked");
    expect(report.blockedCode).toBe("latest_source_bundle_not_approved");
  });

  it("blocks on latest non-approved even if an older approved bundle exists", () => {
    const olderApproved = makeArtifact({ version: 1, status: "approved" });
    const newerNotApproved = makeArtifact({ id: "hsb-2", version: 2, status: "needs_review" });
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [olderApproved, newerNotApproved],
    });
    expect(report.blockedCode).toBe("latest_source_bundle_not_approved");
  });
});

describe("getRfpHldDesignModelReadinessReport - blocked: invalid payload", () => {
  it("blocks when bundle payload fails validation and surfaces errors", () => {
    const badPayload = { ...validBundlePayload(), payloadKind: "wrong_kind" };
    const bundle = makeArtifact({
      payload: badPayload as unknown as Record<string, unknown>,
    });
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(report.blockedCode).toBe("invalid_source_bundle_payload");
    expect(report.messages.length).toBeGreaterThan(0);
  });
});

describe("getRfpHldDesignModelReadinessReport - blocked: artifact mismatch", () => {
  it("blocks when artifact row sourceArtifactIds does not match payload sourceArtifactIds", () => {
    const bundle = makeArtifact({ sourceArtifactIds: ["evp-1"] });
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(report.blockedCode).toBe("source_bundle_artifact_mismatch");
  });
});

describe("getRfpHldDesignModelReadinessReport - ready", () => {
  it("returns ready with canCreateDesignModel true", () => {
    const bundle = makeArtifact();
    const report = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(report.status).toBe("ready");
    expect(report.canCreateDesignModel).toBe(true);
    expect(report.blockedCode).toBeUndefined();
    expect(report.messages).toEqual([]);
  });

  it("returns correct source bundle summary", () => {
    const bundle = makeArtifact();
    const { sourceBundle } = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(sourceBundle).toBeDefined();
    expect(sourceBundle!.artifactId).toBe(BUNDLE_ARTIFACT_ID);
    expect(sourceBundle!.version).toBe(1);
    expect(sourceBundle!.status).toBe("approved");
    expect(sourceBundle!.coveredDomains).toEqual(["campus_switching"]);
    expect(sourceBundle!.excludedDomains).toEqual(["service_only"]);
  });

  it("returns correct expectedSource fields", () => {
    const bundle = makeArtifact();
    const { expectedSource } = getRfpHldDesignModelReadinessReport({
      projectId: PROJECT_ID,
      artifacts: [bundle],
    });
    expect(expectedSource).toBeDefined();
    expect(expectedSource!.sourceHldSourceBundleArtifactId).toBe(BUNDLE_ARTIFACT_ID);
    expect(expectedSource!.sourceBundleVersion).toBe(1);
    expect(expectedSource!.sourceBundlePayloadKind).toBe(RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND);
    expect(expectedSource!.sourceArtifactIds).toEqual([BUNDLE_ARTIFACT_ID]);
    expect(expectedSource!.coveredDomains).toEqual(["campus_switching"]);
    expect(expectedSource!.excludedDomains).toEqual(["service_only"]);
  });
});

// ---------------------------------------------------------------------------
// validateRfpHldDesignModelSourceCompatibility
// ---------------------------------------------------------------------------

describe("validateRfpHldDesignModelSourceCompatibility - accepts valid pair", () => {
  it("returns valid:true for a matching model and bundle artifact", () => {
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: validModelPayload(),
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validateRfpHldDesignModelSourceCompatibility - rejects mismatched source bundle id", () => {
  it("rejects when model sourceHldSourceBundleArtifactId does not match artifact id", () => {
    const model = {
      ...validModelPayload(),
      sourceHldSourceBundleArtifactId: "wrong-id",
      sourceArtifactIds: ["wrong-id"],
    };
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: model,
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sourceHldSourceBundleArtifactId"))).toBe(true);
  });
});

describe("validateRfpHldDesignModelSourceCompatibility - rejects wrong version", () => {
  it("rejects when model sourceBundleVersion does not match artifact version", () => {
    const model = { ...validModelPayload(), sourceBundleVersion: 99 };
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: model,
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("sourceBundleVersion"))).toBe(true);
  });
});

describe("validateRfpHldDesignModelSourceCompatibility - rejects domain drift", () => {
  it("rejects when model coveredDomains differ from bundle", () => {
    const model = { ...validModelPayload(), coveredDomains: ["datacenter_core"] as never };
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: model,
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("coveredDomains"))).toBe(true);
  });

  it("rejects when model excludedDomains differ from bundle", () => {
    const model = { ...validModelPayload(), excludedDomains: ["datacenter_core"] as never };
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: model,
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("excludedDomains"))).toBe(true);
  });
});

describe("validateRfpHldDesignModelSourceCompatibility - rejects missing source-bundle reference", () => {
  it("rejects when no sourceReferences entry with kind source_bundle", () => {
    const model: RfpHldDesignModelPayload = {
      ...validModelPayload(),
      sourceReferences: [{ id: "sr-1", kind: "authority", artifactId: BUNDLE_ARTIFACT_ID }],
    };
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: model,
      sourceBundleArtifact: makeArtifact(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("source_bundle"))).toBe(true);
  });
});

describe("validateRfpHldDesignModelSourceCompatibility - rejects non-approved or wrong-type artifact", () => {
  it("rejects when sourceBundleArtifact type is not hld_source_bundle", () => {
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: validModelPayload(),
      sourceBundleArtifact: makeArtifact({ type: "hld_design_model" }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("rejects when sourceBundleArtifact status is not approved", () => {
    const result = validateRfpHldDesignModelSourceCompatibility({
      payload: validModelPayload(),
      sourceBundleArtifact: makeArtifact({ status: "needs_review" }),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static purity: allowed imports only
// ---------------------------------------------------------------------------

describe("static purity - allowed imports", () => {
  it("source file contains only allowed imports", () => {
    const src = readFileSync(
      join(__dirname, "../../../src/lib/projects/project-rfp-hld-design-model-readiness.ts"),
      "utf8"
    );
    const importLines = src.split("\n").filter((l) => l.trim().startsWith("import"));
    const forbidden = [
      "drizzle", "node:fs", "node:path", "react", "next/", "ai/", "anthropic",
      "openai", "catalog", "pricing", "config-expansion",
    ];
    for (const line of importLines) {
      for (const bad of forbidden) {
        expect(line.toLowerCase()).not.toContain(bad);
      }
    }
  });

  it("source file contains only ASCII characters", () => {
    const src = readFileSync(
      join(__dirname, "../../../src/lib/projects/project-rfp-hld-design-model-readiness.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("test file contains only ASCII characters", () => {
    const src = readFileSync(
      join(__dirname, "project-rfp-hld-design-model-readiness.test.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });
});
