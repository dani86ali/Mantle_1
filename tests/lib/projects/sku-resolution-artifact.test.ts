import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Both composed dependencies are mocked: no real DB, no real catalog lookup.
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));
vi.mock("@/lib/projects/sku-resolution", () => ({
  buildSkuResolutionDraft: vi.fn(),
}));

import * as service from "@/lib/projects/sku-resolution-artifact";
import {
  createSkuResolutionArtifact,
  buildSkuResolutionArtifactPayload,
  type CreateSkuResolutionArtifactInput,
} from "@/lib/projects/sku-resolution-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { buildSkuResolutionDraft } from "@/lib/projects/sku-resolution";
import type { SkuResolutionDraft } from "@/lib/projects/sku-resolution";
import type {
  CanonicalBoqLine,
  ProjectArtifact,
} from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);
const draftMock = vi.mocked(buildSkuResolutionDraft);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const SOURCE_ID = "art-nb-1";

function makeLine(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300-48P-E",
    description: "Catalyst 9300 switch",
    quantity: 1,
    originalCells: {},
    ...overrides,
  };
}

function makeSourceArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  return {
    id: SOURCE_ID,
    projectId: PROJECT,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    version: 3,
    payload: {
      sourceFileId: "file-1",
      lineCount: 2,
      lines: [
        makeLine({ originalLineNumber: "1", sku: "SKU-A", sourceRowNumber: 2 }),
        makeLine({ originalLineNumber: "2", sku: "NOPE", sourceRowNumber: 3 }),
      ],
    },
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  const now = new Date("2026-05-21T09:00:00.000Z");
  return {
    id: "art-skur-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [SOURCE_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDraft(): SkuResolutionDraft {
  return {
    decisions: [
      {
        sourceFileId: "file-1",
        sourceRowNumber: 2,
        originalLineNumber: "1",
        originalSku: "SKU-A",
        status: "needs_review",
        suggestions: [
          { suggestedSku: "SKU-A", source: "exact", rationale: "catalog match" },
        ],
      },
      {
        sourceFileId: "file-1",
        sourceRowNumber: 3,
        originalLineNumber: "2",
        originalSku: "NOPE",
        status: "unresolved",
        suggestions: [],
      },
    ],
    summary: {
      totalLines: 2,
      needsReviewCount: 1,
      unresolvedCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      exactSuggestionCount: 1,
      normalizedSuggestionCount: 0,
      ambiguousCount: 0,
      zeroPriceSuggestionCount: 0,
      catalogSource: "local_stc_historical_mock",
    },
  };
}

function input(): CreateSkuResolutionArtifactInput {
  return { tenantId: TENANT, projectId: PROJECT, normalizedBoqArtifactId: SOURCE_ID };
}

beforeEach(() => {
  vi.clearAllMocks();
  draftMock.mockReturnValue(makeDraft());
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createSkuResolutionArtifact - guards", () => {
  it("throws the exact missing message and does not draft or create", async () => {
    getArtifactMock.mockResolvedValue(null);
    await expect(createSkuResolutionArtifact(input())).rejects.toThrow(
      "Normalized BoQ artifact not found."
    );
    expect(draftMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-type message and does not draft or create", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ type: "priced_boq" })
    );
    await expect(createSkuResolutionArtifact(input())).rejects.toThrow(
      "Artifact is not a normalized_boq artifact."
    );
    expect(draftMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact invalid-payload message when lines is not an array", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ payload: { lineCount: 0 } })
    );
    await expect(createSkuResolutionArtifact(input())).rejects.toThrow(
      "Normalized BoQ artifact payload is invalid."
    );
    expect(draftMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createSkuResolutionArtifact - composition", () => {
  beforeEach(() => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
  });

  it("builds the draft from the source payload lines", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    await createSkuResolutionArtifact(input());
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[0][0].lines).toBe(source.payload.lines);
  });

  it("omits catalogIndex from buildSkuResolutionDraft call when not supplied", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    await createSkuResolutionArtifact(input());
    expect(draftMock.mock.calls[0][0].catalogIndex).toBeUndefined();
  });

  it("passes the exact catalogIndex reference to buildSkuResolutionDraft when supplied", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    const fakeCatalogIndex = {
      exact: new Map(),
      normalized: new Map(),
      catalogSource: "explicit_test_source",
    };
    await createSkuResolutionArtifact({ ...input(), catalogIndex: fakeCatalogIndex });
    expect(draftMock.mock.calls[0][0].catalogIndex).toBe(fakeCatalogIndex);
  });

  it("does not persist catalogIndex into the artifact payload or create call", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    const fakeCatalogIndex = {
      exact: new Map(),
      normalized: new Map(),
      catalogSource: "explicit_test_source",
    };
    const { payload } = await createSkuResolutionArtifact({ ...input(), catalogIndex: fakeCatalogIndex });
    expect(payload).not.toHaveProperty("catalogIndex");
    const createArg = createMock.mock.calls[0][0];
    expect((createArg.payload as Record<string, unknown>)).not.toHaveProperty("catalogIndex");
  });

  it("creates exactly one artifact with the expected stage/type/status", async () => {
    await createSkuResolutionArtifact(input());
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "sku_resolution",
      type: "sku_resolution",
      status: "needs_review",
    });
  });

  it("sources from the normalized BoQ artifact: sourceArtifactIds [source.id]", async () => {
    await createSkuResolutionArtifact(input());
    expect(createMock.mock.calls[0][0].sourceArtifactIds).toEqual([SOURCE_ID]);
  });

  it("copies sourceFileIds from the normalized BoQ artifact", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ sourceFileIds: ["file-1", "file-2"] })
    );
    await createSkuResolutionArtifact(input());
    expect(createMock.mock.calls[0][0].sourceFileIds).toEqual(["file-1", "file-2"]);
  });
});

describe("createSkuResolutionArtifact - payload shape", () => {
  beforeEach(() => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
  });

  it("includes the source artifact id and version", async () => {
    const { payload } = await createSkuResolutionArtifact(input());
    expect(payload.sourceNormalizedBoqArtifactId).toBe(SOURCE_ID);
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(3);
  });

  it("includes lineCount, decisions, and summary from the draft", async () => {
    const draft = makeDraft();
    draftMock.mockReturnValue(draft);
    const { payload } = await createSkuResolutionArtifact(input());
    expect(payload.lineCount).toBe(2);
    expect(payload.decisions).toBe(draft.decisions);
    expect(payload.summary).toBe(draft.summary);
  });

  it("copies sourceFileIds into the payload", async () => {
    const { payload } = await createSkuResolutionArtifact(input());
    expect(payload.sourceFileIds).toEqual(["file-1"]);
  });

  it("does not include pricing fields or accepted SKUs", async () => {
    const { payload } = await createSkuResolutionArtifact(input());
    expect("acceptedSku" in payload).toBe(false);
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("vatRatePercent");
    expect(payload).not.toHaveProperty("ratePercent");
    expect(payload).not.toHaveProperty("pricing");
    for (const decision of payload.decisions) {
      expect("acceptedSku" in decision).toBe(false);
      expect("decidedBy" in decision).toBe(false);
      expect("decidedAt" in decision).toBe(false);
    }
  });
});

describe("createSkuResolutionArtifact - result", () => {
  it("returns the created artifact, the source artifact, and the payload", async () => {
    const source = makeSourceArtifact();
    const created = makeCreatedArtifact({ id: "art-skur-9", version: 4 });
    getArtifactMock.mockResolvedValue(source);
    createMock.mockResolvedValue(created);
    const result = await createSkuResolutionArtifact(input());
    expect(result.artifact).toBe(created);
    expect(result.sourceArtifact).toBe(source);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
  });
});

describe("buildSkuResolutionArtifactPayload", () => {
  it("derives lineCount from the draft decisions and copies source file ids", () => {
    const source = makeSourceArtifact({ sourceFileIds: ["f1", "f2"] });
    const draft = makeDraft();
    const payload = buildSkuResolutionArtifactPayload(source, draft);
    expect(payload.lineCount).toBe(draft.decisions.length);
    expect(payload.sourceFileIds).toEqual(["f1", "f2"]);
    expect(payload.sourceFileIds).not.toBe(source.sourceFileIds);
  });
});

describe("createSkuResolutionArtifact - purity", () => {
  it("does not mutate the input object", async () => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
    const inp = input();
    const snapshot = structuredClone(inp);
    await createSkuResolutionArtifact(inp);
    expect(inp).toEqual(snapshot);
  });

  it("does not mutate the source artifact or its source arrays", async () => {
    const source = makeSourceArtifact();
    const snapshot = structuredClone(source);
    getArtifactMock.mockResolvedValue(source);
    await createSkuResolutionArtifact(input());
    expect(source).toEqual(snapshot);
  });

  it("does not mutate the source payload lines", async () => {
    const source = makeSourceArtifact();
    const linesSnapshot = structuredClone(source.payload.lines);
    getArtifactMock.mockResolvedValue(source);
    await createSkuResolutionArtifact(input());
    expect(source.payload.lines).toEqual(linesSnapshot);
  });

  it("passes fresh source arrays that cannot corrupt the source artifact", async () => {
    const source = makeSourceArtifact({ sourceFileIds: ["file-1"] });
    getArtifactMock.mockResolvedValue(source);
    await createSkuResolutionArtifact(input());
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(source.sourceFileIds).toEqual(["file-1"]);
    expect(source.sourceArtifactIds).toEqual([]);
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/sku-resolution-artifact.ts"),
    "utf8"
  );

  it("does not import DB schema, approvals, staleness, engines, AI, pricing, API, UI, or the Cisco adapter", () => {
    // Inspect import statements only - docstrings legitimately name these
    // domains to declare what the module deliberately omits. The artifact-store
    // repository is the one allowed DB import.
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/lib/db/schema",
      "@/lib/db/index",
      "drizzle",
      "schema",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "pricing",
      "anthropic",
      "adapter",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      ["buildSkuResolutionArtifactPayload", "createSkuResolutionArtifact"].sort()
    );
  });
});
