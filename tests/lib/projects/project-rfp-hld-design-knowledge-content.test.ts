import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
  RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE,
  selectRfpHldApprovedDesignKnowledgeContent,
  validateRfpHldApprovedDesignKnowledgeContentObject,
  type RfpHldApprovedDesignKnowledgeContent,
} from "@/lib/projects/project-rfp-hld-design-knowledge-content";

const TS = new Date("2026-06-12T00:00:00.000Z");

/** A fully-valid approved design_knowledge_pack artifact. Fresh per call. */
function validPackArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "dkp-1",
    projectId: "proj-1",
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "approved",
    version: 2,
    payload: {
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: "engineer@example.com",
      createdAt: "2026-06-10T00:00:00.000Z",
      domain: "campus_switching",
      title: "Campus switching pack",
      designPrinciples: ["  Collapsed core for the campus.  ", ""],
      topologyGuidance: ["Dual uplinks per access switch."],
      constraints: [],
      assumptions: [],
      exclusions: [],
      validationNotes: [],
      entryCount: 2,
      sectionCounts: {
        designPrinciples: 1, topologyGuidance: 1, constraints: 0,
        assumptions: 0, exclusions: 0, validationNotes: 0,
      },
    },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/** A fully-valid compact content object. Fresh per call. */
function validContent(): RfpHldApprovedDesignKnowledgeContent {
  return {
    contentKind: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND,
    artifactId: "dkp-1",
    artifactType: "design_knowledge_pack",
    stageId: "hld_design_delta_review",
    status: "approved",
    version: 2,
    payloadKind: "rfp_hld_design_knowledge_pack",
    domain: "campus_switching",
    title: "Campus switching pack",
    source: RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE,
    designPrinciples: ["Collapsed core for the campus."],
    topologyGuidance: ["Dual uplinks per access switch."],
    constraints: [],
    assumptions: [],
    exclusions: [],
    validationNotes: [],
    entryCount: 2,
    sectionCounts: {
      designPrinciples: 1, topologyGuidance: 1, constraints: 0,
      assumptions: 0, exclusions: 0, validationNotes: 0,
    },
  };
}

function mutableContent(): Record<string, unknown> {
  return structuredClone(validContent()) as unknown as Record<string, unknown>;
}

describe("selectRfpHldApprovedDesignKnowledgeContent - happy path", () => {
  it("compacts an approved pack into source-proven content, trimming and dropping blanks", () => {
    const result = selectRfpHldApprovedDesignKnowledgeContent(validPackArtifact());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const c = result.content;
    expect(c.contentKind).toBe(RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_KIND);
    expect(c.artifactId).toBe("dkp-1");
    expect(c.artifactType).toBe("design_knowledge_pack");
    expect(c.stageId).toBe("hld_design_delta_review");
    expect(c.status).toBe("approved");
    expect(c.version).toBe(2);
    expect(c.payloadKind).toBe("rfp_hld_design_knowledge_pack");
    expect(c.domain).toBe("campus_switching");
    expect(c.title).toBe("Campus switching pack");
    expect(c.source).toBe(RFP_HLD_APPROVED_DESIGN_KNOWLEDGE_CONTENT_SOURCE);
    // Trimmed, and the blank entry was dropped.
    expect(c.designPrinciples).toEqual(["Collapsed core for the campus."]);
    expect(c.topologyGuidance).toEqual(["Dual uplinks per access switch."]);
    expect(c.entryCount).toBe(2);
    expect(c.sectionCounts).toEqual({
      designPrinciples: 1, topologyGuidance: 1, constraints: 0,
      assumptions: 0, exclusions: 0, validationNotes: 0,
    });
  });

  it("omits source when the pack has no source, and copies no arbitrary payload keys", () => {
    const artifact = validPackArtifact();
    const payload = artifact.payload as Record<string, unknown>;
    delete payload.source;
    payload.filePath = "s3://bucket/secret.docx";
    payload.rawDocumentBody = "RAW RFP TEXT";
    payload.unitPrice = 999;
    const result = selectRfpHldApprovedDesignKnowledgeContent(artifact);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("source" in result.content).toBe(false);
    const serialized = JSON.stringify(result.content);
    expect(serialized).not.toContain("filePath");
    expect(serialized).not.toContain("RAW RFP TEXT");
    expect(serialized).not.toContain("unitPrice");
  });
});

describe("selectRfpHldApprovedDesignKnowledgeContent - fail closed", () => {
  const cases: Array<[string, Partial<ProjectArtifact>]> = [
    ["wrong type", { type: "hld_intake" }],
    ["wrong stage", { stageId: "requirements_baseline_review" }],
    ["not approved", { status: "needs_review" }],
    ["bad version", { version: 0 }],
    ["blank id", { id: "  " }],
  ];
  for (const [name, overrides] of cases) {
    it(`rejects ${name}`, () => {
      const result = selectRfpHldApprovedDesignKnowledgeContent(validPackArtifact(overrides));
      expect(result.status).toBe("invalid");
    });
  }

  const payloadCases: Array<[string, (p: Record<string, unknown>) => void]> = [
    ["wrong payloadKind", (p) => { p.payloadKind = "nope"; }],
    ["unknown domain", (p) => { p.domain = "made_up"; }],
    ["blank title", (p) => { p.title = "   "; }],
    ["forbidden title claim", (p) => { p.title = "Cisco-certified campus design"; }],
    ["unexpected source", (p) => { p.source = "ai_generated"; }],
    ["malformed section (non-array)", (p) => { p.designPrinciples = "not-an-array"; }],
    ["non-string section entry", (p) => { p.topologyGuidance = [42]; }],
    ["forbidden section content", (p) => { p.designPrinciples = ["This is the final authority."]; }],
    ["empty content", (p) => {
      p.designPrinciples = [];
      p.topologyGuidance = [];
    }],
  ];
  for (const [name, mutate] of payloadCases) {
    it(`rejects ${name}`, () => {
      const artifact = validPackArtifact();
      mutate(artifact.payload as Record<string, unknown>);
      const result = selectRfpHldApprovedDesignKnowledgeContent(artifact);
      expect(result.status).toBe("invalid");
      if (result.status !== "invalid") throw new Error("unreachable");
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }

  it("rejects a non-object payload", () => {
    const result = selectRfpHldApprovedDesignKnowledgeContent(
      validPackArtifact({ payload: [] as unknown as Record<string, unknown> })
    );
    expect(result.status).toBe("invalid");
  });
});

describe("validateRfpHldApprovedDesignKnowledgeContentObject - happy path", () => {
  it("accepts a valid content object and returns its bijection identity", () => {
    const { errors, identity } = validateRfpHldApprovedDesignKnowledgeContentObject("c", validContent());
    expect(errors).toEqual([]);
    expect(identity).toEqual({
      artifactId: "dkp-1", version: 2,
      payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
    });
  });

  it("accepts a content object without the optional source", () => {
    const c = mutableContent();
    delete c.source;
    const { errors } = validateRfpHldApprovedDesignKnowledgeContentObject("c", c);
    expect(errors).toEqual([]);
  });
});

describe("validateRfpHldApprovedDesignKnowledgeContentObject - fail closed", () => {
  const cases: Array<[string, (c: Record<string, unknown>) => void]> = [
    ["non-object", () => {}],
    ["unexpected key", (c) => { c.evil = "smuggled"; }],
    ["wrong contentKind", (c) => { c.contentKind = "nope"; }],
    ["blank artifactId", (c) => { c.artifactId = " "; }],
    ["wrong artifactType", (c) => { c.artifactType = "hld_intake"; }],
    ["wrong stageId", (c) => { c.stageId = "requirements_baseline_review"; }],
    ["not approved", (c) => { c.status = "needs_review"; }],
    ["bad version", (c) => { c.version = 0; }],
    ["wrong payloadKind", (c) => { c.payloadKind = "nope"; }],
    ["invalid domain", (c) => { c.domain = "made_up"; }],
    ["unexpected source", (c) => { c.source = "ai_generated"; }],
    ["blank title", (c) => { c.title = "  "; }],
    ["forbidden title claim", (c) => { c.title = "AI-certified topology"; }],
    ["malformed section", (c) => { c.designPrinciples = "x"; }],
    ["blank section entry", (c) => { c.designPrinciples = ["ok", "  "]; }],
    ["forbidden section content", (c) => { c.designPrinciples = ["provider response dump"]; }],
    ["section count mismatch", (c) => {
      (c.sectionCounts as Record<string, number>).designPrinciples = 5;
    }],
    ["entryCount mismatch", (c) => { c.entryCount = 99; }],
    ["empty content", (c) => {
      c.designPrinciples = [];
      c.topologyGuidance = [];
      c.entryCount = 0;
      c.sectionCounts = {
        designPrinciples: 0, topologyGuidance: 0, constraints: 0,
        assumptions: 0, exclusions: 0, validationNotes: 0,
      };
    }],
  ];
  for (const [name, mutate] of cases) {
    it(`rejects ${name}`, () => {
      const c = name === "non-object" ? ("nope" as unknown as Record<string, unknown>) : mutableContent();
      mutate(c);
      const { errors, identity } = validateRfpHldApprovedDesignKnowledgeContentObject("c", c);
      expect(errors.length).toBeGreaterThan(0);
      if (name === "blank artifactId" || name === "bad version" || name === "invalid domain") {
        expect(identity).toBeNull();
      }
    });
  }
});

describe("project-rfp-hld-design-knowledge-content module purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-knowledge-content.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-knowledge-content.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l) || /from\s+["']/.test(l));

  it("imports only canonical project types and the HLD design-domain contract", () => {
    const froms = Array.from(source.matchAll(/from\s+["']([^"']+)["']/g)).map((m) => m[1]);
    expect(froms.sort()).toEqual(
      ["@/lib/projects/project-rfp-hld-domain-readiness", "@/types/project"].sort()
    );
  });

  it("does not import stores, fs/path, routes, React, AI, catalog, pricing, or config services", () => {
    const forbidden = [
      "/db/", "project-store", "artifact-store", "file-store",
      "node:fs", "node:path", "next/server", "next/navigation", "react",
      "anthropic", "@anthropic", "openai", "/adapters/", "catalog", "pricing", "sku",
      "config-expansion", "configuration-expansion", "design-knowledge-pack",
    ];
    for (const needle of forbidden) {
      for (const line of importLines) {
        expect(line.includes(needle)).toBe(false);
      }
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
