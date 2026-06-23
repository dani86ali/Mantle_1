import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the two composed boundaries: the project store (verify the project) and the
// artifact store (the single write). No real DB; the service runs in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
}));

import {
  createRfpHldDesignKnowledgePack,
  isRfpHldDesignKnowledgePackValidationError,
  RfpHldDesignKnowledgePackValidationError,
  type CreateRfpHldDesignKnowledgePackInput,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack";
import { getProjectById } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const CREATED_BY = "engineer-1";
const ARTIFACT_ID = "art-pack-1";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const FIXED_CREATED = new Date("2026-06-20T09:15:00.000Z");
const ART_CREATED = new Date("2026-06-20T09:15:01.000Z");
const ART_UPDATED = new Date("2026-06-20T09:15:02.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP Bid",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: ART_CREATED,
    updatedAt: ART_UPDATED,
    ...overrides,
  };
}

function input(
  overrides: Partial<CreateRfpHldDesignKnowledgePackInput> = {}
): CreateRfpHldDesignKnowledgePackInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    domain: "campus_switching",
    title: "  Campus switching design pack  ",
    designPrinciples: ["  Redundant uplinks  ", "", "   "],
    topologyGuidance: ["Two-tier collapsed core"],
    constraints: [],
    assumptions: ["Existing fiber reused"],
    exclusions: [],
    validationNotes: ["Confirm port counts"],
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createRfpHldDesignKnowledgePack - validation before any store call", () => {
  async function expectValidationError(
    overrides: Partial<CreateRfpHldDesignKnowledgePackInput>
  ) {
    const err = await createRfpHldDesignKnowledgePack(input(overrides)).catch(
      (e) => e
    );
    expect(isRfpHldDesignKnowledgePackValidationError(err)).toBe(true);
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  }

  it("rejects a blank projectId", () => expectValidationError({ projectId: "  " }));
  it("rejects a blank createdBy", () => expectValidationError({ createdBy: " " }));
  it("rejects an unknown domain", () =>
    expectValidationError({ domain: "not_a_domain" }));
  it("rejects a blank title", () => expectValidationError({ title: "   " }));

  it("rejects a non-array list section", () =>
    expectValidationError({
      designPrinciples: "nope" as unknown as string[],
    }));

  it("rejects a non-string list entry", () =>
    expectValidationError({
      designPrinciples: [123] as unknown as string[],
    }));

  it("rejects a pack with no meaningful entries across all sections", () =>
    expectValidationError({
      designPrinciples: ["", "   "],
      topologyGuidance: [],
      constraints: [],
      assumptions: [],
      exclusions: [],
      validationNotes: [],
    }));

  it("throws the exported validation error class", async () => {
    const err = await createRfpHldDesignKnowledgePack(
      input({ title: "" })
    ).catch((e) => e);
    expect(err).toBeInstanceOf(RfpHldDesignKnowledgePackValidationError);
  });
});

describe("createRfpHldDesignKnowledgePack - project gates", () => {
  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createRfpHldDesignKnowledgePack(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and never writes for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "quick_bom", name: "Quick BoM", customerName: "Honeywell" })
    );

    const result = await createRfpHldDesignKnowledgePack(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldDesignKnowledgePack - artifact creation", () => {
  it("writes a needs_review design_knowledge_pack on hld_design_delta_review with empty source arrays and manual source", async () => {
    await createRfpHldDesignKnowledgePack(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.type).toBe("design_knowledge_pack");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([]);
    expect("filePath" in arg).toBe(false);

    const payload = arg.payload as Record<string, unknown>;
    expect(payload.source).toBe("manual_operator_entry");
  });

  it("verifies the project before the write", async () => {
    await createRfpHldDesignKnowledgePack(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });

  it("builds a sanitized payload: trimmed title/entries, blanks dropped, counts derived", async () => {
    await createRfpHldDesignKnowledgePack(input());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_design_knowledge_pack");
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toBe(FIXED_CREATED.toISOString());
    expect(payload.domain).toBe("campus_switching");
    expect(payload.title).toBe("Campus switching design pack");
    expect(payload.designPrinciples).toEqual(["Redundant uplinks"]);
    expect(payload.topologyGuidance).toEqual(["Two-tier collapsed core"]);
    expect(payload.constraints).toEqual([]);
    expect(payload.assumptions).toEqual(["Existing fiber reused"]);
    expect(payload.exclusions).toEqual([]);
    expect(payload.validationNotes).toEqual(["Confirm port counts"]);
    expect(payload.entryCount).toBe(4);
    expect(payload.sectionCounts).toEqual({
      designPrinciples: 1,
      topologyGuidance: 1,
      constraints: 0,
      assumptions: 1,
      exclusions: 0,
      validationNotes: 1,
    });
  });

  it("does not let caller authority/path/body junk leak into the persisted payload", async () => {
    await createRfpHldDesignKnowledgePack(
      input({
        ...({
          tenantId: TENANT,
          storagePath: "/secret/storage",
          filePath: "/secret/file",
          rawText: "RAW-BODY-LEAK",
          payloadKind: "attacker_kind",
          source: "attacker_source",
        } as unknown as Partial<CreateRfpHldDesignKnowledgePackInput>),
      })
    );

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        "assumptions",
        "constraints",
        "createdAt",
        "createdBy",
        "designPrinciples",
        "domain",
        "entryCount",
        "exclusions",
        "payloadKind",
        "sectionCounts",
        "source",
        "title",
        "topologyGuidance",
        "validationNotes",
      ].sort()
    );
    const json = JSON.stringify(payload);
    expect(json).not.toContain("RAW-BODY-LEAK");
    expect(json).not.toContain("attacker_kind");
    expect(json).not.toContain("attacker_source");
    expect(json).not.toContain("/secret/storage");
  });
});

describe("createRfpHldDesignKnowledgePack - ok result summaries", () => {
  it("returns a serializable artifact summary with ISO dates and no payload", async () => {
    const result = await createRfpHldDesignKnowledgePack(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: ARTIFACT_ID,
      projectId: PROJECT,
      stageId: "hld_design_delta_review",
      type: "design_knowledge_pack",
      status: "needs_review",
      version: 1,
      sourceFileIds: [],
      sourceArtifactIds: [],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with counts but not the content strings", async () => {
    const result = await createRfpHldDesignKnowledgePack(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: CREATED_BY,
      createdAt: FIXED_CREATED.toISOString(),
      domain: "campus_switching",
      title: "Campus switching design pack",
      entryCount: 4,
      sectionCounts: {
        designPrinciples: 1,
        topologyGuidance: 1,
        constraints: 0,
        assumptions: 1,
        exclusions: 0,
        validationNotes: 1,
      },
    });
    expect("designPrinciples" in result.payloadSummary).toBe(false);
    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain("Redundant uplinks");
    expect(json).not.toContain("Two-tier collapsed core");
  });

  it("returns defensive copies of the summary objects", async () => {
    const result = await createRfpHldDesignKnowledgePack(input());

    if (result.status !== "ok") throw new Error("unreachable");
    result.payloadSummary.sectionCounts.designPrinciples = 999;
    result.artifact.sourceFileIds.push("injected");

    const again = await createRfpHldDesignKnowledgePack(input());
    if (again.status !== "ok") throw new Error("unreachable");
    expect(again.payloadSummary.sectionCounts.designPrinciples).toBe(1);
    expect(again.artifact.sourceFileIds).toEqual([]);
  });

  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createRfpHldDesignKnowledgePack(inp);

    expect(inp).toEqual(snapshot);
  });

  it("bubbles a store error from the artifact write", async () => {
    const boom = new Error("store boom");
    createMock.mockRejectedValue(boom);

    await expect(createRfpHldDesignKnowledgePack(input())).rejects.toBe(boom);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-knowledge-pack.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-knowledge-pack.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, domain-readiness contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-domain-readiness",
      "@/types/project",
    ]);
  });

  it("reads no file/evidence/raw stores, fs/path, pricing/sku/catalog/config, AI, routes, or UI", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next/server"',
      'from "react"',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
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
