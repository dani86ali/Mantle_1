import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRfpHldDesignModelOpenAiReviewRequest,
  RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-prompt";
import type { RfpHldDesignModelOpenAiReviewInput } from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import type { RfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";

function reviewInput(
  modelExtra: Record<string, unknown> = {},
  bundleExtra: Record<string, unknown> = {}
): RfpHldDesignModelOpenAiReviewInput {
  return {
    model: {
      id: "hdm-1",
      version: 3,
      payload: {
        payloadKind: "rfp_hld_design_model",
        createdBy: "drafter@example.com",
        createdAt: "2026-06-26T00:00:00.000Z",
        sourceArtifactIds: ["hsb-1"],
        sourceHldSourceBundleArtifactId: "hsb-1",
        sourceBundleVersion: 2,
        sourceBundlePayloadKind: "rfp_hld_source_bundle",
        coveredDomains: ["campus_switching"],
        excludedDomains: [],
        sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: "hsb-1" }],
        assumptionRefs: [],
        constraintRefs: [],
        designSections: [],
        topology: { nodes: [], links: [], zones: [] },
        diagramIntents: [],
        traceability: {
          requirementRefs: [],
          complianceRefs: [],
          configurationRefs: [],
          sourceBundleRefs: [],
        },
        validationFindings: [],
        // Smuggled pricing/raw-doc fields must never be serialized.
        sku: "C9300",
        rawText: "SECRET RAW DOC",
        ...modelExtra,
      } as unknown as RfpHldDesignModelPayload,
    },
    sourceBundle: {
      id: "hsb-1",
      version: 2,
      payload: {
        payloadKind: "rfp_hld_source_bundle",
        createdBy: "engineer@example.com",
        createdAt: "2026-06-26T00:00:00.000Z",
        sourceArtifactIds: ["evp-1"],
        coveredDomains: ["campus_switching"],
        excludedDomains: [],
        missingDomains: [],
        assumptions: [{ id: "a1", statement: "Existing core remains." }],
        constraints: [],
        warnings: [],
        blockers: [],
        designKnowledgePackRefs: [
          {
            artifactId: "dkp-1",
            artifactType: "design_knowledge_pack",
            stageId: "hld_design_delta_review",
            status: "approved",
            version: 5,
            payloadKind: "rfp_hld_design_knowledge_pack",
            domain: "campus_switching",
          },
        ],
        // Smuggled config/raw-doc fields must never be serialized.
        catalogDecision: "APPROVE",
        sourceFileId: "file-SECRET",
        ...bundleExtra,
      } as unknown as RfpHldSourceBundlePayload,
    },
    reviewedBy: "u-1",
    reviewedAt: "2026-06-26T01:00:00.000Z",
  };
}

describe("buildRfpHldDesignModelOpenAiReviewRequest", () => {
  it("returns the fixed advisory system prompt", () => {
    const request = buildRfpHldDesignModelOpenAiReviewRequest(reviewInput());
    expect(request.system).toBe(RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT);
  });

  it("guardrails frame the reviewer as advisory-only with no authority and strict findings JSON", () => {
    const s = RFP_HLD_DESIGN_MODEL_OPENAI_REVIEW_SYSTEM_PROMPT.toLowerCase();
    expect(s).toContain("advisory");
    expect(s).toContain("not final design authority");
    expect(s).toContain("pricing, sku, catalog, or configuration");
    expect(s).toContain("diagrams");
    expect(s).toContain("exports");
    expect(s).toContain('{ "findings": [ ... ] }');
  });

  it("serializes only the whitelisted top-level and nested keys in a stable order", () => {
    const request = buildRfpHldDesignModelOpenAiReviewRequest(reviewInput());
    const user = JSON.parse(request.user);
    expect(Object.keys(user)).toEqual(["reviewedBy", "reviewedAt", "model", "sourceBundle"]);
    expect(Object.keys(user.model)).toEqual([
      "artifactId",
      "version",
      "coveredDomains",
      "excludedDomains",
      "sourceReferences",
      "assumptionRefs",
      "constraintRefs",
      "designSections",
      "topology",
      "diagramIntents",
      "traceability",
      "validationFindings",
    ]);
    expect(Object.keys(user.sourceBundle)).toEqual([
      "artifactId",
      "version",
      "coveredDomains",
      "excludedDomains",
      "missingDomains",
      "assumptions",
      "constraints",
      "warnings",
      "blockers",
      "designKnowledgePackDomains",
    ]);
    expect(user.model.artifactId).toBe("hdm-1");
    expect(user.sourceBundle.designKnowledgePackDomains).toEqual([
      { domain: "campus_switching", version: 5 },
    ]);
  });

  it("never serializes smuggled pricing/SKU/catalog/config or raw-doc/source-file fields", () => {
    const request = buildRfpHldDesignModelOpenAiReviewRequest(reviewInput());
    for (const forbidden of [
      "sku",
      "C9300",
      "rawText",
      "SECRET RAW DOC",
      "catalogDecision",
      "sourceFileId",
      "file-SECRET",
    ]) {
      expect(request.user, forbidden).not.toContain(forbidden);
    }
  });

  it("mirrors optional DKP content and intake answers when present", () => {
    const request = buildRfpHldDesignModelOpenAiReviewRequest(
      reviewInput({}, {
        designKnowledgePackContents: [{ domain: "campus_switching", title: "Pack" }],
        hldIntakeAnswers: {
          sourceHldIntakeArtifactId: "hint-1",
          sourceHldIntakeVersion: 1,
          sourceMode: "manual_override",
          answers: [],
          answerCount: 0,
          statusCounts: { answered: 0, unknown: 0, not_applicable: 0 },
        },
      })
    );
    const user = JSON.parse(request.user);
    expect(user.sourceBundle.designKnowledgePackContents).toEqual([
      { domain: "campus_switching", title: "Pack" },
    ]);
    expect(user.sourceBundle.hldIntakeAnswers.sourceHldIntakeArtifactId).toBe("hint-1");
  });

  it("does not alias the input payloads", () => {
    const input = reviewInput();
    const request = buildRfpHldDesignModelOpenAiReviewRequest(input);
    const user = JSON.parse(request.user);
    user.model.coveredDomains.push("mutated");
    expect(input.model.payload.coveredDomains).toEqual(["campus_switching"]);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-openai-review-prompt.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no provider SDK, store, fs/path, or env", () => {
    for (const forbidden of ['from "openai"', "@anthropic-ai", "node:fs", "process.env", "@/lib/db/"]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
