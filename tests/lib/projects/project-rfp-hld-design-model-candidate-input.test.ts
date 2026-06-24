import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  buildRfpHldDesignModelCandidateInput,
  type BuildRfpHldDesignModelCandidateInputInput,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import type { ProjectArtifact } from "@/types/project";

const PROJECT_ID = "proj-1";
const ARTIFACT_ID = "hsb-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";

/** Upstream authority ids referenced by the source bundle (NOT the model's). */
const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

/** A coherent, fully-valid source-bundle payload. Fresh object per call. */
function validBundlePayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: UPSTREAM_IDS.slice(),
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
    assumptions: [
      { id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" },
    ],
    constraints: [
      { id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" },
    ],
    warnings: [
      { id: "w1", code: "PARTIAL_DETAIL", message: "Some rack detail missing.", severity: "warning" },
    ],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

/** A fully-valid approved source-bundle artifact. Fresh object per call. */
function validArtifact(): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 3,
    payload: validBundlePayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(CREATED_AT),
  };
}

function validInput(
  overrides: Partial<BuildRfpHldDesignModelCandidateInputInput> = {}
): BuildRfpHldDesignModelCandidateInputInput {
  return {
    projectId: PROJECT_ID,
    artifact: validArtifact(),
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("buildRfpHldDesignModelCandidateInput - happy path", () => {
  it("accepts an approved hld_source_bundle and returns the bundle", () => {
    const result = buildRfpHldDesignModelCandidateInput(validInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const b = result.bundle;
    expect(b.payloadKind).toBe(RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND);
    expect(b.createdBy).toBe("drafter@example.com");
    expect(b.createdAt).toBe(CREATED_AT);
    expect(b.sourceHldSourceBundleArtifactId).toBe(ARTIFACT_ID);
    expect(b.sourceHldSourceBundleVersion).toBe(3);
    expect(b.sourceHldSourceBundlePayloadKind).toBe(RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND);
    expect(b.instructions.targetPayloadKind).toBe(RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND);
  });

  it("sets future model sourceArtifactIds to exactly [source bundle id]", () => {
    const result = buildRfpHldDesignModelCandidateInput(validInput());
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.bundle.sourceArtifactIds).toEqual([ARTIFACT_ID]);
    // NOT the source bundle's upstream authority ids.
    for (const upstream of UPSTREAM_IDS) {
      expect(result.bundle.sourceArtifactIds).not.toContain(upstream);
    }
  });

  it("copies covered/excluded domains and source-bundle references", () => {
    const result = buildRfpHldDesignModelCandidateInput(validInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const b = result.bundle;
    expect(b.coveredDomains).toEqual(["campus_switching"]);
    expect(b.excludedDomains).toEqual(["service_only"]);
    expect(b.authorities.evidencePackage.artifactId).toBe("evp-1");
    expect(b.authorities.hldReadinessSnapshot.artifactId).toBe("hrs-1");
    expect(b.designKnowledgePackRefs).toHaveLength(1);
    expect(b.designKnowledgePackRefs[0].domain).toBe("campus_switching");
    expect(b.assumptions[0].id).toBe("a1");
    expect(b.constraints[0].id).toBe("c1");
    expect(b.warnings[0].id).toBe("w1");
  });

  it("returns fresh copies, not aliases of the input payload", () => {
    const input = validInput();
    const payload = input.artifact.payload as unknown as RfpHldSourceBundlePayload;
    const result = buildRfpHldDesignModelCandidateInput(input);
    if (result.status !== "ok") throw new Error("expected ok");
    const b = result.bundle;
    expect(b.coveredDomains).not.toBe(payload.coveredDomains);
    expect(b.excludedDomains).not.toBe(payload.excludedDomains);
    expect(b.authorities).not.toBe(payload.authorities);
    expect(b.authorities.evidencePackage).not.toBe(payload.authorities.evidencePackage);
    expect(b.designKnowledgePackRefs).not.toBe(payload.designKnowledgePackRefs);
    expect(b.assumptions).not.toBe(payload.assumptions);
    expect(b.constraints).not.toBe(payload.constraints);
    expect(b.warnings).not.toBe(payload.warnings);
    // Mutating the bundle must not reach back into the source payload.
    b.coveredDomains.push("wireless");
    b.assumptions[0].statement = "changed";
    expect(payload.coveredDomains).toEqual(["campus_switching"]);
    expect(payload.assumptions[0].statement).toBe("Existing core remains.");
  });

  it("does not carry upstream payload bodies, files, or storage paths", () => {
    const result = buildRfpHldDesignModelCandidateInput(validInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(result.bundle);
    expect(serialized).not.toContain("filePath");
    expect(serialized).not.toContain("sourceFileIds");
    expect(serialized).not.toContain("compiledArtifactIds");
  });
});

describe("buildRfpHldDesignModelCandidateInput - gates", () => {
  it("blocks an artifact from a different project", () => {
    const result = buildRfpHldDesignModelCandidateInput(
      validInput({ projectId: "other-project" })
    );
    expect(result).toEqual({ status: "blocked", reason: "wrong_project" });
  });

  it("blocks a wrong stage", () => {
    const artifact = validArtifact();
    artifact.stageId = "requirements_baseline_review";
    const result = buildRfpHldDesignModelCandidateInput(validInput({ artifact }));
    expect(result).toEqual({ status: "blocked", reason: "wrong_stage" });
  });

  it("blocks a wrong type", () => {
    const artifact = validArtifact();
    artifact.type = "hld_readiness_snapshot";
    const result = buildRfpHldDesignModelCandidateInput(validInput({ artifact }));
    expect(result).toEqual({ status: "blocked", reason: "wrong_type" });
  });

  it("blocks a non-approved status", () => {
    const artifact = validArtifact();
    artifact.status = "needs_review";
    const result = buildRfpHldDesignModelCandidateInput(validInput({ artifact }));
    expect(result).toEqual({ status: "blocked", reason: "not_approved" });
  });

  it("rejects an invalid source-bundle payload", () => {
    const artifact = validArtifact();
    (artifact.payload as Record<string, unknown>).payloadKind = "nope";
    const result = buildRfpHldDesignModelCandidateInput(validInput({ artifact }));
    expect(result.status).toBe("invalid_source_bundle_payload");
    if (result.status !== "invalid_source_bundle_payload") return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("blocks a row/payload sourceArtifactIds mismatch", () => {
    const artifact = validArtifact();
    artifact.sourceArtifactIds = UPSTREAM_IDS.slice(0, 6); // drops dkp-1
    const result = buildRfpHldDesignModelCandidateInput(validInput({ artifact }));
    expect(result).toEqual({
      status: "blocked",
      reason: "source_artifact_ids_mismatch",
    });
  });

  it("throws on blank projectId/createdBy and non-ISO createdAt", () => {
    expect(() => buildRfpHldDesignModelCandidateInput(validInput({ projectId: " " }))).toThrow();
    expect(() => buildRfpHldDesignModelCandidateInput(validInput({ createdBy: "" }))).toThrow();
    expect(() => buildRfpHldDesignModelCandidateInput(validInput({ createdAt: "2026-06-24" }))).toThrow();
  });
});

describe("buildRfpHldDesignModelCandidateInput - drafting instructions", () => {
  it("forbids rereads, final output, authority decisions, and certification claims", () => {
    const result = buildRfpHldDesignModelCandidateInput(validInput());
    if (result.status !== "ok") throw new Error("expected ok");
    const instr = result.bundle.instructions;
    expect(instr.candidateOnly.toLowerCase()).toContain("candidate");
    expect(instr.candidateOnly.toLowerCase()).toContain("approval");
    const text = instr.forbidden.join("\n").toLowerCase();
    expect(text).toContain("reread");
    expect(text).toContain("html");
    expect(text).toContain("diagram");
    expect(text).toContain("draw.io");
    expect(text).toContain("proposal");
    expect(text).toContain("sku");
    expect(text).toContain("pricing");
    expect(text).toContain("catalog");
    expect(text).toContain("configuration");
    expect(text).toContain("certified");
    expect(text).toContain("approval");
  });
});

describe("buildRfpHldDesignModelCandidateInput - source purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-candidate-input.ts"
  );
  const source = readFileSync(sourcePath, "utf8");

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-candidate-input.test.ts"
      ),
      "utf8"
    );
    expect(/^[\x00-\x7F]*$/.test(source)).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(testSource)).toBe(true);
  });

  it("imports only canonical project types and the two HLD contracts", () => {
    const specifiers = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m: RegExpMatchArray) => m[1]
    );
    const allowed = new Set([
      "@/types/project",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-design-model",
    ]);
    for (const spec of specifiers) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it("references no forbidden runtime/provider/io modules or calls", () => {
    const forbidden = [
      "node:fs",
      "node:path",
      "next/server",
      "react",
      "@anthropic-ai",
      "openai",
      "generateText",
      "generateObject",
      "chat.completions",
      "pdf-parse",
      "mammoth",
      "readFileSync",
      "require(",
    ];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });
});
