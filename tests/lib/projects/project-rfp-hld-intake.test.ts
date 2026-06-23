import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the two composed boundaries: the project store (verify the project) and the
// artifact store (the single write). No real DB; the service is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-rfp-hld-intake";
import {
  createRfpHldIntakeDraft,
  RFP_HLD_INTAKE_FIELDS,
  type CreateRfpHldIntakeDraftInput,
  type RfpHldIntakeAnswerInput,
} from "@/lib/projects/project-rfp-hld-intake";
import { getProjectById } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const CREATED_BY = "engineer-1";
const ARTIFACT_ID = "art-hld-intake-1";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const FIXED_CREATED = new Date("2026-06-20T09:15:00.000Z");
const ART_CREATED = new Date("2026-06-20T09:15:01.000Z");
const ART_UPDATED = new Date("2026-06-20T09:15:02.000Z");

const FIELD_IDS = RFP_HLD_INTAKE_FIELDS.map((f) => f.fieldId);

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

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
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

// A complete, valid answer per catalog field. The first field is `answered` with
// caller-supplied padding (to prove trimming) and a bogus label (to prove it is
// ignored); the next two carry unknown/not_applicable with leakable values that must
// be dropped; the rest are answered.
function makeAnswers(): RfpHldIntakeAnswerInput[] {
  return RFP_HLD_INTAKE_FIELDS.map((field, index) => {
    if (index === 1) {
      return {
        fieldId: field.fieldId,
        status: "unknown",
        value: "DROP-ME-UNKNOWN-VALUE",
        notes: "  unknown note  ",
        label: "CALLER LABEL IGNORED",
      };
    }
    if (index === 2) {
      return {
        fieldId: field.fieldId,
        status: "not_applicable",
        value: "DROP-ME-NA-VALUE",
        label: "CALLER LABEL IGNORED",
      };
    }
    return {
      fieldId: field.fieldId,
      status: "answered",
      value: `  value for ${field.fieldId}  `,
      label: "CALLER LABEL IGNORED",
    };
  });
}

function input(overrides: Partial<CreateRfpHldIntakeDraftInput> = {}): CreateRfpHldIntakeDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    answers: makeAnswers(),
    createdAt: FIXED_CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createRfpHldIntakeDraft - validation before any store call", () => {
  it("rejects a blank projectId before touching the stores", async () => {
    await expect(createRfpHldIntakeDraft(input({ projectId: "   " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a blank createdBy before touching the stores", async () => {
    await expect(createRfpHldIntakeDraft(input({ createdBy: "  " }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a missing catalog field before touching the stores", async () => {
    const answers = makeAnswers().slice(1);
    await expect(createRfpHldIntakeDraft(input({ answers })).catch((e) => e)).resolves.toBeInstanceOf(Error);
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate field id", async () => {
    const answers = makeAnswers();
    answers.push({ fieldId: FIELD_IDS[0], status: "unknown" });
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown field id", async () => {
    const answers = makeAnswers();
    answers[0] = { fieldId: "not_a_real_field", status: "unknown" };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid answer status", async () => {
    const answers = makeAnswers();
    answers[0] = {
      fieldId: FIELD_IDS[0],
      status: "skipped" as unknown as RfpHldIntakeAnswerInput["status"],
    };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects an answered field with a blank value", async () => {
    const answers = makeAnswers();
    answers[0] = { fieldId: FIELD_IDS[0], status: "answered", value: "   " };
    await expect(createRfpHldIntakeDraft(input({ answers }))).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("rejects a non-array answers payload", async () => {
    const bad = { ...input(), answers: "nope" } as unknown as CreateRfpHldIntakeDraftInput;
    await expect(createRfpHldIntakeDraft(bad)).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });
});

describe("createRfpHldIntakeDraft - project gates", () => {
  it("returns not_found and never writes when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await createRfpHldIntakeDraft(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and never writes for a non-rfp project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "quick_bom", name: "Quick BoM", customerName: "Honeywell" })
    );

    const result = await createRfpHldIntakeDraft(input());

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

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("createRfpHldIntakeDraft - artifact creation", () => {
  it("writes a needs_review hld_intake on hld_design_delta_review with empty source arrays", async () => {
    await createRfpHldIntakeDraft(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.tenantId).toBe(TENANT);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.type).toBe("hld_intake");
    expect(arg.status).toBe("needs_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([]);
    expect("filePath" in arg).toBe(false);
  });

  it("verifies the project before the write", async () => {
    await createRfpHldIntakeDraft(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0]
    );
  });

  it("normalizes the persisted payload: full canonical order, trimmed values/notes, caller labels ignored, dropped values", async () => {
    await createRfpHldIntakeDraft(input());

    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe("rfp_hld_intake");
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toBe(FIXED_CREATED.toISOString());
    expect(payload.answerCount).toBe(FIELD_IDS.length);
    expect(payload.statusCounts).toEqual({
      answered: FIELD_IDS.length - 2,
      unknown: 1,
      not_applicable: 1,
    });

    const answers = payload.answers as Array<Record<string, unknown>>;
    expect(answers.map((a) => a.fieldId)).toEqual(FIELD_IDS);
    // Every persisted label is the canonical catalog label, never the caller's.
    for (let i = 0; i < answers.length; i++) {
      expect(answers[i].label).toBe(RFP_HLD_INTAKE_FIELDS[i].label);
      expect(answers[i].label).not.toBe("CALLER LABEL IGNORED");
    }

    // index 0: answered with a trimmed value.
    expect(answers[0].status).toBe("answered");
    expect(answers[0].value).toBe(`value for ${FIELD_IDS[0]}`);

    // index 1: unknown drops value, keeps trimmed note.
    expect(answers[1].status).toBe("unknown");
    expect("value" in answers[1]).toBe(false);
    expect(answers[1].notes).toBe("unknown note");

    // index 2: not_applicable drops value, no note.
    expect(answers[2].status).toBe("not_applicable");
    expect("value" in answers[2]).toBe(false);
    expect("notes" in answers[2]).toBe(false);

    expect(JSON.stringify(payload)).not.toContain("DROP-ME-UNKNOWN-VALUE");
    expect(JSON.stringify(payload)).not.toContain("DROP-ME-NA-VALUE");
  });
});

describe("createRfpHldIntakeDraft - ok result summaries", () => {
  it("returns a serializable artifact summary with ISO dates and no payload", async () => {
    const result = await createRfpHldIntakeDraft(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: ARTIFACT_ID,
      projectId: PROJECT,
      stageId: "hld_design_delta_review",
      type: "hld_intake",
      status: "needs_review",
      version: 1,
      sourceFileIds: [],
      sourceArtifactIds: [],
      createdAt: ART_CREATED.toISOString(),
      updatedAt: ART_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with counts/ids/status counts but not the answer values", async () => {
    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_hld_intake",
      createdBy: CREATED_BY,
      createdAt: FIXED_CREATED.toISOString(),
      answerCount: FIELD_IDS.length,
      statusCounts: { answered: FIELD_IDS.length - 2, unknown: 1, not_applicable: 1 },
      fieldIds: FIELD_IDS,
    });
    expect("answers" in result.payloadSummary).toBe(false);
    expect("value" in result.payloadSummary).toBe(false);
    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain(`value for ${FIELD_IDS[0]}`);
    expect(json).not.toContain("unknown note");
  });

  it("returns defensive copies of the summary arrays/objects", async () => {
    const result = await createRfpHldIntakeDraft(input());

    if (result.status !== "ok") throw new Error("unreachable");
    result.payloadSummary.fieldIds.push("injected" as never);
    result.payloadSummary.statusCounts.answered = 999;
    result.artifact.sourceFileIds.push("injected");

    // A second call's fresh summaries are unaffected by the mutation above.
    const again = await createRfpHldIntakeDraft(input());
    if (again.status !== "ok") throw new Error("unreachable");
    expect(again.payloadSummary.fieldIds).toEqual(FIELD_IDS);
    expect(again.payloadSummary.statusCounts.answered).toBe(FIELD_IDS.length - 2);
    expect(again.artifact.sourceFileIds).toEqual([]);
  });

  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createRfpHldIntakeDraft(inp);

    expect(inp).toEqual(snapshot);
  });

  it("bubbles a store error from the artifact write", async () => {
    const boom = new Error("store boom");
    createMock.mockRejectedValue(boom);

    await expect(createRfpHldIntakeDraft(input())).rejects.toBe(boom);
  });
});

describe("createRfpHldIntakeDraft - field catalog contract", () => {
  it("exposes the exact catalog field ids in order", () => {
    expect(FIELD_IDS).toEqual([
      "existing_network_context",
      "target_topology_intent",
      "site_room_context",
      "resiliency_expectations",
      "wan_lan_boundaries",
      "rack_power_assumptions",
      "implementation_constraints",
      "exclusions",
      "diagram_notes",
    ]);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-intake.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-intake.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");
  const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
  const joinedImports = importLines.join("\n");

  it("imports only the project store, the artifact store, and canonical project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import file/evidence stores, fs/path, pricing/sku/catalog/config authority, AI/provider, or Next/React/app/components", () => {
    for (const forbidden of [
      "@/lib/db/project-file-store",
      "@/lib/projects/evidence",
      "@/lib/projects/files",
      "node:fs",
      "node:path",
      "@/lib/projects/pricing",
      "@/lib/projects/priced-boq",
      "@/lib/projects/catalog-lookup",
      "catalog",
      "config-expansion",
      "@/lib/adapters",
      "@/lib/agent",
      "@/lib/ai",
      "@/lib/llm",
      "@/coordinator",
      "@/engines",
      "@/app",
      "@/components",
      "next/server",
      "react",
      "anthropic",
      "openai",
      "@google/generative-ai",
    ]) {
      expect(joinedImports).not.toContain(forbidden);
    }
  });

  it("exposes the creation service and the field catalog as runtime exports", () => {
    expect(Object.keys(serviceModule).sort()).toEqual(
      ["RFP_HLD_INTAKE_FIELDS", "createRfpHldIntakeDraft"].sort()
    );
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
