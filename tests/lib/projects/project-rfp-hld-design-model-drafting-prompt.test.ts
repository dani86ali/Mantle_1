import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import {
  buildRfpHldDesignModelCandidateInput,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  buildRfpHldDesignModelDraftingRequest,
  RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-prompt";
import type { ProjectArtifact } from "@/types/project";

const PROJECT_ID = "proj-1";
const ARTIFACT_ID = "hsb-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";

const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

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

function validBundle(): RfpHldDesignModelCandidateInputBundle {
  const result = buildRfpHldDesignModelCandidateInput({
    projectId: PROJECT_ID,
    artifact: validArtifact(),
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
  });
  if (result.status !== "ok") throw new Error("expected ok bundle");
  return result.bundle;
}

const WHITELIST_KEYS = [
  "payloadKind",
  "targetPayloadKind",
  "createdBy",
  "createdAt",
  "sourceHldSourceBundleArtifactId",
  "sourceHldSourceBundleVersion",
  "sourceHldSourceBundlePayloadKind",
  "sourceArtifactIds",
  "coveredDomains",
  "excludedDomains",
  "authorities",
  "designKnowledgePackRefs",
  "assumptions",
  "constraints",
  "warnings",
  "instructions",
];

describe("buildRfpHldDesignModelDraftingRequest - shape", () => {
  it("returns a deterministic, serializable { system, user } request", () => {
    const a = buildRfpHldDesignModelDraftingRequest(validBundle());
    const b = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(typeof a.system).toBe("string");
    expect(typeof a.user).toBe("string");
    expect(a).toEqual(b);
    expect(JSON.parse(a.user)).toEqual(JSON.parse(b.user));
  });

  it("uses the fixed system prompt constant", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(req.system).toBe(RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT);
  });

  it("user JSON contains exactly the whitelisted keys", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(WHITELIST_KEYS.slice().sort());
  });

  it("carries through approved candidate input verbatim", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user);
    expect(parsed.createdBy).toBe("drafter@example.com");
    expect(parsed.createdAt).toBe(CREATED_AT);
    expect(parsed.sourceHldSourceBundleArtifactId).toBe(ARTIFACT_ID);
    expect(parsed.sourceHldSourceBundleVersion).toBe(3);
    expect(parsed.sourceHldSourceBundlePayloadKind).toBe(RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND);
    expect(parsed.targetPayloadKind).toBe(RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND);
    expect(parsed.coveredDomains).toEqual(["campus_switching"]);
    expect(parsed.excludedDomains).toEqual(["service_only"]);
    expect(parsed.authorities.evidencePackage.artifactId).toBe("evp-1");
    expect(parsed.designKnowledgePackRefs[0].domain).toBe("campus_switching");
    expect(parsed.assumptions[0].id).toBe("a1");
    expect(parsed.constraints[0].id).toBe("c1");
    expect(parsed.warnings[0].id).toBe("w1");
  });

  it("keeps sourceArtifactIds as exactly [source bundle id]", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user);
    expect(parsed.sourceArtifactIds).toEqual([ARTIFACT_ID]);
    for (const upstream of UPSTREAM_IDS) {
      expect(parsed.sourceArtifactIds).not.toContain(upstream);
    }
  });

  it("throws on a wrong payloadKind bundle", () => {
    const bad = { ...(validBundle() as unknown as Record<string, unknown>), payloadKind: "nope" };
    expect(() =>
      buildRfpHldDesignModelDraftingRequest(
        bad as unknown as RfpHldDesignModelCandidateInputBundle
      )
    ).toThrow();
  });
});

describe("buildRfpHldDesignModelDraftingRequest - purity of serialized payload", () => {
  it("does not serialize smuggled decoy fields", () => {
    const bundle = validBundle();
    const smuggled = bundle as unknown as Record<string, unknown>;
    smuggled.tenantId = "tenant-secret";
    smuggled.rawDocumentBody = "RAW RFP TEXT BODY";
    smuggled.prices = [{ sku: "C9300", price: 999 }];
    smuggled.evil = "should-not-appear";
    const req = buildRfpHldDesignModelDraftingRequest(bundle);
    expect(req.user).not.toContain("tenant-secret");
    expect(req.user).not.toContain("RAW RFP TEXT BODY");
    expect(req.user).not.toContain("should-not-appear");
    expect(req.user).not.toContain("tenantId");
    expect(req.user).not.toContain("rawDocumentBody");
  });

  it("does not serialize raw docs, files, storage paths, or compiled ids", () => {
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    expect(req.user).not.toContain("filePath");
    expect(req.user).not.toContain("storagePath");
    expect(req.user).not.toContain("sourceFileIds");
    expect(req.user).not.toContain("compiledArtifactIds");
  });
});

describe("RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT - guardrails", () => {
  const text = RFP_HLD_DESIGN_MODEL_DRAFTING_SYSTEM_PROMPT.toLowerCase();

  it("frames the run as candidate-only and human-gated", () => {
    expect(text).toContain("candidate-only");
    expect(text).toContain("unapproved");
    expect(text).toContain("human engineer review");
    expect(text).toContain("deterministic validation");
  });

  it("forbids inventing facts and authority decisions", () => {
    expect(text).toContain("never invent");
    expect(text).toContain("sku");
    expect(text).toContain("pricing");
    expect(text).toContain("catalog");
    expect(text).toContain("configuration");
  });

  it("forbids final deliverable output and certification claims", () => {
    expect(text).toContain("html");
    expect(text).toContain("diagram");
    expect(text).toContain("mermaid");
    expect(text).toContain("draw.io");
    expect(text).toContain("tp/proposal");
    expect(text).toContain("cisco-certified");
    expect(text).toContain("ai-certified");
  });

  it("requires strict JSON and one rfp_hld_design_model payload", () => {
    expect(text).toContain("strict json");
    expect(text).toContain("no markdown");
    expect(text).toContain("no code fences");
    expect(text).toContain("rfp_hld_design_model");
  });

  it("forbids final-output terms only as instructions, not as emitted content", () => {
    // The forbidden terms appear in the SYSTEM prompt (instructions), never as
    // generated content fields in the serialized user payload.
    const req = buildRfpHldDesignModelDraftingRequest(validBundle());
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("html");
    expect(Object.keys(parsed)).not.toContain("diagram");
    expect(Object.keys(parsed)).not.toContain("drawio");
  });
});

describe("project-rfp-hld-design-model-drafting-prompt - source purity", () => {
  const sourcePath = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-drafting-prompt.ts"
  );
  const source = readFileSync(sourcePath, "utf8");

  it("is ASCII-only (source and test)", () => {
    const testSource = readFileSync(
      join(
        process.cwd(),
        "tests/lib/projects/project-rfp-hld-design-model-drafting-prompt.test.ts"
      ),
      "utf8"
    );
    expect(/^[\x00-\x7F]*$/.test(source)).toBe(true);
    expect(/^[\x00-\x7F]*$/.test(testSource)).toBe(true);
  });

  it("imports only the candidate-input contract and the design-model kind", () => {
    const specifiers = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m: RegExpMatchArray) => m[1]
    );
    const allowed = new Set([
      "@/lib/projects/project-rfp-hld-design-model-candidate-input",
      "@/lib/projects/project-rfp-hld-design-model",
    ]);
    for (const spec of specifiers) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it("references no forbidden provider/env/io modules or calls", () => {
    const forbidden = [
      "node:fs",
      "node:path",
      "next/server",
      "react",
      "@anthropic-ai",
      "openai",
      "gemini",
      "process.env",
      "fetch(",
      "require(",
      "readFile",
      "writeFile",
      "generateText",
      "generateObject",
      "chat.completions",
      "pdf-parse",
      "mammoth",
    ];
    for (const token of forbidden) {
      expect(source.includes(token)).toBe(false);
    }
  });
});
