import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  buildRfpHldIntakeQuestionnaireDraftingRequest,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT,
  type RfpHldIntakeQuestionnaireDraftingUserPayload,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-prompt";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN,
  type RfpHldIntakeQuestionnaireDraftingInput,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";
import {
  RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
  RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE,
  type RfpHldApprovedDesignKnowledgeContent,
} from "@/lib/projects/project-rfp-hld-design-knowledge-content";
import { RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-domain-readiness";

function makeContent(): RfpHldApprovedDesignKnowledgeContent {
  return {
    contentKind: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
    artifactId: "art-dkp-1",
    artifactType: "design_knowledge_pack",
    stageId: "hld_design_delta_review",
    status: "approved",
    version: 4,
    payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
    domain: "campus_switching",
    title: "Campus switching guidance",
    source: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE,
    designPrinciples: ["Prefer a collapsed core for small campuses"],
    topologyGuidance: [],
    constraints: [],
    assumptions: [],
    exclusions: [],
    validationNotes: [],
    entryCount: 1,
    sectionCounts: {
      designPrinciples: 1,
      topologyGuidance: 0,
      constraints: 0,
      assumptions: 0,
      exclusions: 0,
      validationNotes: 0,
    },
  };
}

function makeInput(): RfpHldIntakeQuestionnaireDraftingInput {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
    createdBy: "engineer-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    sourceArtifactIds: ["art-source-bundle-1"],
    sourceRefs: [
      {
        refId: "ref-1",
        artifactId: "art-source-bundle-1",
        artifactType: "hld_source_bundle",
        stageId: "hld_source_bundle_review",
        status: "approved",
        version: 2,
        payloadKind: "rfp_hld_source_bundle",
        label: "Source bundle",
      },
    ],
    approvedSourceContexts: [
      {
        contextKind: "approved_project_artifact_context",
        sourceRefId: "source-evidence",
        artifactId: "art-evidence-1",
        artifactType: "evidence_package",
        stageId: "intake_package_review",
        status: "approved",
        version: 3,
        payloadKind: "rfp_evidence_package",
        label: "Approved evidence package",
        summary: "Approved evidence package with 4 evidence item(s).",
        excerpts: ["Two-building campus with a shared core."],
      },
    ],
    designKnowledgePackContents: [makeContent()],
    instructions: {
      candidateOnly: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
      forbidden: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN.slice(),
    },
  };
}

const WHITELIST_KEYS = [
  "payloadKind",
  "createdBy",
  "createdAt",
  "sourceArtifactIds",
  "sourceRefs",
  "approvedSourceContexts",
  "designKnowledgePackContents",
  "instructions",
];

describe("RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT", () => {
  const s = RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT;

  it("frames drafting as candidate HLD intake questions only", () => {
    expect(s).toContain("CANDIDATE HLD intake questions only");
    expect(s.toLowerCase()).toContain("candidate-only");
  });

  it("requires strict JSON shaped exactly as { \"questions\": [...] }", () => {
    expect(s).toContain("strict JSON only");
    expect(s).toContain('{ "questions": [ ... ] }');
    expect(s).toContain("no other top-level key");
  });

  it("forbids answers, validation, approvals, artifact status, designs, diagrams, and documents", () => {
    const lowered = s.toLowerCase();
    expect(lowered).toContain("never output engineer answers");
    expect(lowered).toContain("validation");
    expect(lowered).toContain("approvals");
    expect(lowered).toContain("artifact metadata or");
    expect(lowered).toContain("status");
    expect(lowered).toContain("hld designs");
    expect(lowered).toContain("diagrams");
    expect(lowered).toContain("documents");
  });

  it("forbids proposal/export, pricing/SKU/catalog/config, provider, and certification content", () => {
    const lowered = s.toLowerCase();
    expect(lowered).toContain("proposal");
    expect(lowered).toContain("export");
    expect(lowered).toContain("pricing");
    expect(lowered).toContain("sku");
    expect(lowered).toContain("catalog");
    expect(lowered).toContain("configuration");
    expect(lowered).toContain("provider");
    expect(lowered).toContain("certified or final authority");
  });
});

describe("buildRfpHldIntakeQuestionnaireDraftingRequest", () => {
  it("emits the fixed system prompt and a JSON user payload with exactly the whitelist keys", () => {
    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(makeInput());
    expect(req.system).toBe(RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT);
    const parsed = JSON.parse(req.user) as RfpHldIntakeQuestionnaireDraftingUserPayload;
    expect(Object.keys(parsed)).toEqual(WHITELIST_KEYS);
  });

  it("carries the provenance source refs with source-chain proof", () => {
    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(makeInput());
    const parsed = JSON.parse(req.user) as RfpHldIntakeQuestionnaireDraftingUserPayload;
    expect(parsed.sourceRefs).toHaveLength(1);
    expect(parsed.sourceRefs[0]).toEqual({
      refId: "ref-1",
      artifactId: "art-source-bundle-1",
      artifactType: "hld_source_bundle",
      stageId: "hld_source_bundle_review",
      status: "approved",
      version: 2,
      payloadKind: "rfp_hld_source_bundle",
      label: "Source bundle",
    });
  });

  it("carries approved DKP content field-by-field with its source-chain proof", () => {
    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(makeInput());
    const parsed = JSON.parse(req.user) as RfpHldIntakeQuestionnaireDraftingUserPayload;
    expect(parsed.designKnowledgePackContents).toHaveLength(1);
    const c = parsed.designKnowledgePackContents[0];
    expect(c.contentKind).toBe(RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND);
    expect(c.artifactId).toBe("art-dkp-1");
    expect(c.version).toBe(4);
    expect(c.payloadKind).toBe(RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND);
    expect(c.domain).toBe("campus_switching");
    expect(c.status).toBe("approved");
    expect(c.source).toBe(RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE);
    expect(c.designPrinciples).toEqual([
      "Prefer a collapsed core for small campuses",
    ]);
  });

  it("carries approved source-context blocks field-by-field with their source-chain proof", () => {
    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(makeInput());
    const parsed = JSON.parse(req.user) as RfpHldIntakeQuestionnaireDraftingUserPayload;
    expect(parsed.approvedSourceContexts).toHaveLength(1);
    expect(parsed.approvedSourceContexts[0]).toEqual({
      contextKind: "approved_project_artifact_context",
      sourceRefId: "source-evidence",
      artifactId: "art-evidence-1",
      artifactType: "evidence_package",
      stageId: "intake_package_review",
      status: "approved",
      version: 3,
      payloadKind: "rfp_evidence_package",
      label: "Approved evidence package",
      summary: "Approved evidence package with 4 evidence item(s).",
      excerpts: ["Two-building campus with a shared core."],
    });
  });

  it("drops smuggled fields on an approved source-context block by construction", () => {
    const hostile = {
      ...makeInput(),
      approvedSourceContexts: [
        {
          contextKind: "approved_project_artifact_context",
          sourceRefId: "source-evidence",
          artifactId: "art-evidence-1",
          artifactType: "evidence_package",
          stageId: "intake_package_review",
          status: "approved",
          version: 3,
          payloadKind: "rfp_evidence_package",
          label: "Approved evidence package",
          summary: "ok",
          excerpts: [],
          storagePath: "SMUGGLED-ctx-path",
          rawText: "SMUGGLED-ctx-raw",
          pricing: "SMUGGLED-ctx-pricing",
        },
      ],
    } as unknown as RfpHldIntakeQuestionnaireDraftingInput;

    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(hostile);
    expect(req.user).not.toContain("SMUGGLED-");
    const parsed = JSON.parse(req.user) as RfpHldIntakeQuestionnaireDraftingUserPayload;
    expect(Object.keys(parsed.approvedSourceContexts[0]).sort()).toEqual([
      "artifactId",
      "artifactType",
      "contextKind",
      "excerpts",
      "label",
      "payloadKind",
      "sourceRefId",
      "stageId",
      "status",
      "summary",
      "version",
    ]);
  });

  it("drops smuggled top-level and nested fields by construction", () => {
    const hostile = {
      ...makeInput(),
      tenantId: "SMUGGLED-tenant",
      storagePath: "SMUGGLED-storagePath",
      rawDocument: "SMUGGLED-rawDocument",
      provider: "SMUGGLED-provider",
      pricing: "SMUGGLED-pricing",
      sku: "SMUGGLED-sku",
      catalog: "SMUGGLED-catalog",
      config: "SMUGGLED-config",
      answer: "SMUGGLED-answer",
      status: "SMUGGLED-status",
      sourceRefs: [
        {
          refId: "ref-1",
          artifactId: "art-source-bundle-1",
          artifactType: "hld_source_bundle",
          stageId: "hld_source_bundle_review",
          status: "approved",
          version: 2,
          payloadKind: "rfp_hld_source_bundle",
          label: "Source bundle",
          secretField: "SMUGGLED-ref",
        },
      ],
      designKnowledgePackContents: [
        { ...makeContent(), answers: ["SMUGGLED-answers"], evil: "SMUGGLED-content" },
      ],
    } as unknown as RfpHldIntakeQuestionnaireDraftingInput;

    const req = buildRfpHldIntakeQuestionnaireDraftingRequest(hostile);
    expect(req.user).not.toContain("SMUGGLED-");
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(WHITELIST_KEYS);
  });

  it("throws on a wrong payloadKind bundle (programmer misuse)", () => {
    const bad = { ...makeInput(), payloadKind: "nope" } as unknown as RfpHldIntakeQuestionnaireDraftingInput;
    expect(() => buildRfpHldIntakeQuestionnaireDraftingRequest(bad)).toThrow();
  });
});

describe("HLD intake-question drafting prompt module purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-questionnaire-drafting-prompt.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-questionnaire-drafting-prompt.test.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports exactly the drafting-input contract", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input",
    ]);
  });

  it("performs no provider/env/network/store/route/UI work", () => {
    for (const forbidden of [
      "process.env",
      "fetch(",
      "require(",
      'from "openai',
      "@anthropic-ai",
      "@google/generative-ai",
      "langchain",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/db',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/config-expansion',
      "artifact-store",
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
