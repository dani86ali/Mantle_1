import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock the DB store boundaries; the read model is exercised in isolation.
const { mockGetProjectById, mockGetArtifactById, mockListArtifactsByType } =
  vi.hoisted(() => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockListArtifactsByType: vi.fn(),
  }));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListArtifactsByType,
}));

import {
  loadRfpHldIntakeList,
  loadRfpHldIntakeDetail,
} from "@/lib/projects/project-rfp-hld-intake-inspection";
import { RFP_HLD_INTAKE_FIELDS } from "@/lib/projects/project-rfp-hld-intake";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-hld-intake-2";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

const ANSWER_VALUE = "ANSWER-VALUE-SENTINEL";
const NOTES = "NOTES-SENTINEL";
const OVERRIDE_REASON = "OVERRIDE-REASON-SENTINEL";
const STORAGE = "/secret/storage/path";
const RAW = "RAW-DOCUMENT-BODY-SENTINEL";
const SOURCE = "/secret/source/path";

const FIELD_IDS = RFP_HLD_INTAKE_FIELDS.map((f) => f.fieldId);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
    customerName: "STC",
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

// A persisted payload whose first answer carries leakable extra keys (tenant id,
// storage/source paths, raw document text) that the sanitizer must drop.
function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const answers = RFP_HLD_INTAKE_FIELDS.map((field, i) => {
    const base = { fieldId: field.fieldId, label: field.label };
    if (i === 0) {
      return {
        ...base,
        status: "answered",
        value: ANSWER_VALUE,
        notes: NOTES,
        tenantId: TENANT,
        storagePath: STORAGE,
        rawText: RAW,
        sourcePath: SOURCE,
      };
    }
    if (i === 1) return { ...base, status: "unknown" };
    if (i === 2) return { ...base, status: "not_applicable" };
    return { ...base, status: "answered", value: `v-${field.fieldId}` };
  });
  return {
    payloadKind: "rfp_hld_intake",
    createdBy: "engineer-1",
    createdAt: "2026-06-20T09:15:00.000Z",
    sourceMode: "manual_override",
    manualOverrideReason: OVERRIDE_REASON,
    answers,
    answerCount: answers.length,
    statusCounts: { answered: answers.length - 2, unknown: 1, not_applicable: 1 },
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    version: 2,
    payload: makePayload(),
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([makeArtifact()]);
});

describe("loadRfpHldIntakeList - gates", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(
      loadRfpHldIntakeList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found and never lists when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldIntakeList({ tenantId: TENANT, projectId: PROJECT });

    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns a wrong_mode lean summary (no tenantId) and never lists for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldIntakeList({ tenantId: TENANT, projectId: PROJECT });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });
});

describe("loadRfpHldIntakeList - lean summaries", () => {
  it("lists only hld_intake artifacts via the typed store query", async () => {
    await loadRfpHldIntakeList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_intake" as ProjectArtifactType
    );
  });

  it("returns lean payload summaries with counts/ids but no answer values, notes, raw text, or tenant id", async () => {
    const result = await loadRfpHldIntakeList({ tenantId: TENANT, projectId: PROJECT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const summary = result.artifacts[0].payloadSummary;
    expect(summary).toEqual({
      payloadKind: "rfp_hld_intake",
      createdBy: "engineer-1",
      createdAt: "2026-06-20T09:15:00.000Z",
      sourceMode: "manual_override",
      answerCount: FIELD_IDS.length,
      statusCounts: { answered: FIELD_IDS.length - 2, unknown: 1, not_applicable: 1 },
      fieldIds: FIELD_IDS,
    });
    expect("answers" in summary).toBe(false);
    // The override reason is detail-only provenance; it must not ride the list.
    expect("manualOverrideReason" in summary).toBe(false);

    const json = JSON.stringify(result);
    for (const leak of [ANSWER_VALUE, NOTES, OVERRIDE_REASON, STORAGE, RAW, SOURCE, TENANT]) {
      expect(json).not.toContain(leak);
    }
  });
});

describe("loadRfpHldIntakeDetail - gates", () => {
  it("throws on a blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldIntakeDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: " " })
    ).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await loadRfpHldIntakeDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_intake for the wrong type", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ type: "compliance_matrix" as ProjectArtifactType })
    );

    const result = await loadRfpHldIntakeDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_intake");
    if (result.status !== "artifact_not_hld_intake") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns artifact_not_hld_intake for the right type in the wrong stage", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ stageId: "compliance_matrix_review" as ProjectStageId })
    );

    const result = await loadRfpHldIntakeDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_intake");
  });

  it("returns invalid_payload for a malformed payload (wrong kind or non-array answers)", async () => {
    for (const payload of [
      { payloadKind: "something_else", answers: [] },
      { payloadKind: "rfp_hld_intake", answers: "nope" },
      { payloadKind: "rfp_hld_intake", answers: ["not-an-object"] },
    ]) {
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await loadRfpHldIntakeDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });

      expect(result.status).toBe("invalid_payload");
    }
  });
});

describe("loadRfpHldIntakeDetail - sanitized detail", () => {
  it("surfaces whitelisted answer values/notes but drops arbitrary extra keys", async () => {
    const result = await loadRfpHldIntakeDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const first = result.intake.answers[0];
    expect(first).toEqual({
      fieldId: FIELD_IDS[0],
      label: RFP_HLD_INTAKE_FIELDS[0].label,
      status: "answered",
      value: ANSWER_VALUE,
      notes: NOTES,
    });
    // Arbitrary leakable keys are dropped from the sanitized answer.
    for (const key of ["tenantId", "storagePath", "rawText", "sourcePath"]) {
      expect(key in first).toBe(false);
    }

    // unknown / not_applicable answers carry no value.
    expect(result.intake.answers[1].status).toBe("unknown");
    expect("value" in result.intake.answers[1]).toBe(false);
    expect(result.intake.answers[2].status).toBe("not_applicable");

    expect(result.intake.sourceMode).toBe("manual_override");
    expect(result.intake.manualOverrideReason).toBe(OVERRIDE_REASON);

    expect(result.intake.answerCount).toBe(FIELD_IDS.length);
    expect(result.intake.statusCounts).toEqual({
      answered: FIELD_IDS.length - 2,
      unknown: 1,
      not_applicable: 1,
    });

    // The value/notes ARE shown (engineer-authored), but the raw/storage/source
    // and tenant identifiers never leak.
    const json = JSON.stringify(result);
    expect(json).toContain(ANSWER_VALUE);
    for (const leak of [STORAGE, RAW, SOURCE, TENANT]) {
      expect(json).not.toContain(leak);
    }
  });

  it("surfaces the questionnaire source mode without an override reason", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({
        payload: makePayload({
          sourceMode: "questionnaire_assisted",
          manualOverrideReason: OVERRIDE_REASON,
        }),
      })
    );

    const result = await loadRfpHldIntakeDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.intake.sourceMode).toBe("questionnaire_assisted");
    // The override reason belongs only to manual_override; drop it here.
    expect("manualOverrideReason" in result.intake).toBe(false);
    expect(JSON.stringify(result.intake)).not.toContain(OVERRIDE_REASON);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, canonical types, and the HLD intake contract", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-hld-intake",
    ]);
  });

  it("performs no create/update/delete mutation and reads no file/evidence/raw stores, fs/path, pricing/sku/catalog/config, AI, routes, or UI", () => {
    expect(/\b(?:create|update|delete)[A-Z]\w*/.test(source)).toBe(false);
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
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
