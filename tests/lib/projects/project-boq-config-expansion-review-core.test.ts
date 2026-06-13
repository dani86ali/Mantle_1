import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
} from "@/types/project";
import type { ConfigurationAuthorityTrace } from "@/lib/projects/config-expansion-types";

// Mock the three composed boundaries: the project store (verify the Project), the
// artifact read store (load + gate the source draft), and the existing deterministic
// reviewed-expansion service (apply decisions + persist a non-draft version). No real
// DB and no real expansion/review run here; the core is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));
vi.mock("@/lib/projects/config-expansion-artifact", () => ({
  createConfigurationExpansionArtifact: vi.fn(),
}));

import * as coreModule from "@/lib/projects/project-boq-config-expansion-review-core";
import {
  reviewProjectBoqConfigurationExpansionDraftCore,
  type ReviewProjectBoqConfigurationExpansionDraftInput,
  type ReviewProjectBoqConfigurationExpansionDraftResult,
} from "@/lib/projects/project-boq-config-expansion-review-core";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createConfigurationExpansionArtifact } from "@/lib/projects/config-expansion-artifact";
import type { CreateConfigurationExpansionArtifactResult } from "@/lib/projects/config-expansion-artifact";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createConfigurationExpansionArtifact);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const FILE_ID = "file-1";
const DRAFT_ID = "art-ce-draft-1";
const DRAFT_VERSION = 4;
const NORM_ID = "art-nb-7";
const NORM_VERSION = 5;
const SKU_ID = "art-skur-3";
const SKU_VERSION = 2;
const CREATED_ID = "art-ce-rev-9";
const REVIEWED_BY = "engineer@stc.com";
const RULE_PACK_ID = "honeywell-scope-rules";
const RULE_PACK_VERSION = "1.0.0";
const RULE_PACK_SCOPE = "honeywell-first-scope";

const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const DRAFT_CREATED = new Date("2026-05-21T08:00:00.000Z");
const DRAFT_UPDATED = new Date("2026-05-21T08:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T09:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T09:30:00.000Z");

// Line-level secrets planted on the reviewed payload returned by the delegate. The
// lean payload summary drops all lines, so none may surface in the core response.
const SECRET_CUSTOMER_SKU = "LEAKED-CUSTOMER-SKU";
const SECRET_CHILD_SKU = "LEAKED-CHILD-SKU";
const SECRET_REJECTED_SKU = "LEAKED-REJECTED-SKU";
const SECRET_EVIDENCE_NOTE = "LEAKED-EVIDENCE-NOTE";

const REVIEW_SUMMARY = {
  customerLineCount: 1,
  acceptedExpansionLineCount: 1,
  rejectedExpansionLineCount: 1,
  totalAcceptedLineCount: 2,
  reviewedExpansionLineCount: 2,
};

const DRAFT_LINES = [
  {
    lineId: "line-1",
    origin: "customer",
    sku: "PARENT-A",
    description: "Parent A",
    quantity: 3,
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "PARENT-A",
    originalCells: { "#": "1", "Part Number": "PARENT-A" },
  },
  {
    lineId: "line-1-x1",
    origin: "expansion",
    sku: "CHILD-1",
    description: "Child one",
    quantity: 3,
    parentLineId: "line-1",
    parentLineNumber: "1",
    relationshipType: "service_or_support",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-a",
    evidence: [
      { sourceType: "ccw_export", sourcePath: "C:/fixture.xlsx", evidenceNote: "fixture" },
    ],
    approvalRequired: true,
    approved: false,
  },
];

const DECISIONS = [
  { lineId: "line-1-x1", action: "accept" as const, note: "looks right" },
];

const DRAFT_SUMMARY = {
  customerLineCount: 1,
  addedLineCount: 1,
  totalLineCount: 2,
  requiresReviewCount: 1,
  includedItemCount: 0,
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
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

function makeDraftPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    payloadKind: "configuration_expansion_draft",
    sourceNormalizedBoqArtifactId: NORM_ID,
    sourceNormalizedBoqArtifactVersion: NORM_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceFileIds: [FILE_ID],
    rulePackId: RULE_PACK_ID,
    rulePackVersion: RULE_PACK_VERSION,
    rulePackStatus: "approved",
    rulePackSourceScope: RULE_PACK_SCOPE,
    lineCount: DRAFT_LINES.length,
    lines: DRAFT_LINES,
    summary: DRAFT_SUMMARY,
    ...overrides,
  };
}

function makeDraftArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DRAFT_ID,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: DRAFT_VERSION,
    payload: makeDraftPayload(),
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORM_ID, SKU_ID],
    createdAt: DRAFT_CREATED,
    updatedAt: DRAFT_UPDATED,
    ...overrides,
  };
}

function makeCreatedArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: CREATED_ID,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [NORM_ID, SKU_ID, DRAFT_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

/** The reviewed payload the delegate persists; line-level secrets must not leak. */
function makeReviewedPayload(): CreateConfigurationExpansionArtifactResult["payload"] {
  return {
    sourceNormalizedBoqArtifactId: NORM_ID,
    sourceNormalizedBoqArtifactVersion: NORM_VERSION,
    sourceSkuResolutionArtifactId: SKU_ID,
    sourceSkuResolutionArtifactVersion: SKU_VERSION,
    sourceConfigurationExpansionDraftArtifactId: DRAFT_ID,
    sourceConfigurationExpansionDraftArtifactVersion: DRAFT_VERSION,
    sourceFileIds: [FILE_ID],
    rulePackId: RULE_PACK_ID,
    rulePackVersion: RULE_PACK_VERSION,
    rulePackStatus: "approved",
    lineCount: 2,
    acceptedLines: [
      {
        lineId: "line-1",
        origin: "customer",
        sku: SECRET_CUSTOMER_SKU,
        description: "Parent A",
        quantity: 3,
        originalCells: { "#": "1" },
      },
      {
        lineId: "line-1-x1",
        origin: "expansion",
        sku: SECRET_CHILD_SKU,
        description: "Child one",
        quantity: 3,
        sourceRuleId: "rule-a",
        evidence: [
          { sourceType: "ccw_export", sourcePath: "C:/f.xlsx", evidenceNote: SECRET_EVIDENCE_NOTE },
        ],
        approvalRequired: false,
        approved: true,
      },
    ],
    rejectedLines: [
      {
        lineId: "line-1-x2",
        origin: "expansion",
        sku: SECRET_REJECTED_SKU,
        description: "Child two",
        quantity: 3,
        sourceRuleId: "rule-a",
        evidence: [
          { sourceType: "ccw_export", sourcePath: "C:/f.xlsx", evidenceNote: "n" },
        ],
      },
    ],
    summary: REVIEW_SUMMARY,
    reviewedBy: REVIEWED_BY,
  };
}

function makeServiceResult(
  overrides: Partial<CreateConfigurationExpansionArtifactResult> = {}
): CreateConfigurationExpansionArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    normalizedBoqArtifact: makeDraftArtifact({ id: NORM_ID, type: "normalized_boq" }),
    skuResolutionArtifact: makeDraftArtifact({ id: SKU_ID, type: "sku_resolution" }),
    payload: makeReviewedPayload(),
    // The core reads only reviewResult.summary; the heavy accepted model is not needed.
    reviewResult: {
      summary: REVIEW_SUMMARY,
    } as unknown as CreateConfigurationExpansionArtifactResult["reviewResult"],
    ...overrides,
  };
}

function input(
  overrides: Partial<ReviewProjectBoqConfigurationExpansionDraftInput> = {}
): ReviewProjectBoqConfigurationExpansionDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    configurationExpansionDraftArtifactId: DRAFT_ID,
    reviewedBy: REVIEWED_BY,
    decisions: DECISIONS,
    expectedMode: "quick_bom",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  getArtifactMock.mockResolvedValue(makeDraftArtifact());
  createMock.mockResolvedValue(makeServiceResult());
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - reviewedBy gate", () => {
  it("throws the exact reviewedBy message before any store call when reviewedBy is blank", async () => {
    await expect(
      reviewProjectBoqConfigurationExpansionDraftCore(input({ reviewedBy: "   " }))
    ).rejects.toThrow("reviewedBy is required.");
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws reviewedBy required for an empty reviewedBy string", async () => {
    await expect(
      reviewProjectBoqConfigurationExpansionDraftCore(input({ reviewedBy: "" }))
    ).rejects.toThrow("reviewedBy is required.");
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - project verification", () => {
  it("returns not_found and does not load the artifact or persist when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not load the artifact for a non-quick_bom project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp", customerName: undefined }));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });

  it("loads the project before loading the draft artifact", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getArtifactMock.mock.invocationCallOrder[0]
    );
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - expectedMode gate", () => {
  it("gates on the supplied expectedMode: a quick_bom project is wrong_mode when expectedMode is rfp, loading no artifact", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(
      input({ expectedMode: "rfp" })
    );

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project.mode).toBe("quick_bom");
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("proceeds past the mode gate when the project mode matches a non-quick_bom expectedMode", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "rfp" }));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(
      input({ expectedMode: "rfp" })
    );

    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - draft artifact gates", () => {
  it("returns configuration_expansion_draft_not_found and writes nothing when the artifact is missing", async () => {
    getArtifactMock.mockResolvedValue(null);

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result).toEqual({ status: "configuration_expansion_draft_not_found" });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, DRAFT_ID);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_configuration_expansion with a payload-free summary for a wrong-type artifact", async () => {
    getArtifactMock.mockResolvedValue(makeDraftArtifact({ type: "priced_boq" }));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result.status).toBe("artifact_not_configuration_expansion");
    if (result.status !== "artifact_not_configuration_expansion") throw new Error("unreachable");
    expect(result.artifact.id).toBe(DRAFT_ID);
    expect(result.artifact.type).toBe("priced_boq");
    expect("payload" in result.artifact).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns configuration_expansion_not_draft with a payload-free summary for a reviewed (marker-less) artifact", async () => {
    getArtifactMock.mockResolvedValue(
      makeDraftArtifact({ payload: makeDraftPayload({ payloadKind: undefined }) })
    );

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result.status).toBe("configuration_expansion_not_draft");
    if (result.status !== "configuration_expansion_not_draft") throw new Error("unreachable");
    expect(result.artifact.id).toBe(DRAFT_ID);
    expect("payload" in result.artifact).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("checks the draft marker before the reviewable status (marker-less + approved is still not_draft)", async () => {
    getArtifactMock.mockResolvedValue(
      makeDraftArtifact({ status: "approved", payload: makeDraftPayload({ payloadKind: undefined }) })
    );

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result.status).toBe("configuration_expansion_not_draft");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns configuration_expansion_draft_not_reviewable for any non-needs_review draft status", async () => {
    const NOT_REVIEWABLE: ProjectArtifactStatus[] = [
      "generated",
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ];
    for (const status of NOT_REVIEWABLE) {
      createMock.mockClear();
      getArtifactMock.mockResolvedValue(makeDraftArtifact({ status }));

      const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

      expect(result.status).toBe("configuration_expansion_draft_not_reviewable");
      if (result.status !== "configuration_expansion_draft_not_reviewable") {
        throw new Error("unreachable");
      }
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(createMock).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_configuration_expansion_draft_payload and writes nothing for a malformed draft payload", async () => {
    const BAD_PAYLOADS: Record<string, unknown>[] = [
      makeDraftPayload({ sourceNormalizedBoqArtifactId: 123 }),
      makeDraftPayload({ sourceNormalizedBoqArtifactVersion: "5" }),
      makeDraftPayload({ sourceSkuResolutionArtifactId: undefined }),
      makeDraftPayload({ sourceSkuResolutionArtifactVersion: "2" }),
      makeDraftPayload({ sourceFileIds: "file-1" }),
      makeDraftPayload({ sourceFileIds: ["file-1", 9] }),
      makeDraftPayload({ rulePackId: 7 }),
      makeDraftPayload({ rulePackVersion: 1 }),
      makeDraftPayload({ rulePackStatus: "candidate" }),
      makeDraftPayload({ rulePackSourceScope: 5 }),
      makeDraftPayload({ lines: "nope" }),
      makeDraftPayload({ summary: [] }),
    ];
    for (const payload of BAD_PAYLOADS) {
      createMock.mockClear();
      getArtifactMock.mockResolvedValue(makeDraftArtifact({ payload }));

      const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

      expect(result).toEqual({ status: "invalid_configuration_expansion_draft_payload" });
      expect(createMock).not.toHaveBeenCalled();
    }
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - delegation", () => {
  it("calls createConfigurationExpansionArtifact once with the draft source ids, rule-pack metadata, lines, decisions, reviewedBy, and source draft provenance", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      normalizedBoqArtifactId: NORM_ID,
      skuResolutionArtifactId: SKU_ID,
      rulePackId: RULE_PACK_ID,
      rulePackVersion: RULE_PACK_VERSION,
      rulePackStatus: "approved",
      lines: DRAFT_LINES,
      decisions: DECISIONS,
      reviewedBy: REVIEWED_BY,
      sourceConfigurationExpansionDraftArtifactId: DRAFT_ID,
      sourceConfigurationExpansionDraftArtifactVersion: DRAFT_VERSION,
    });
  });

  it("never forwards a reviewedAt to the delegate (the review time is never caller-settable)", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    const arg = createMock.mock.calls[0][0];
    expect("reviewedAt" in arg).toBe(false);
  });

  it("never forwards expectedMode to the delegate (it is a gate input only)", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    const arg = createMock.mock.calls[0][0];
    expect("expectedMode" in arg).toBe(false);
  });

  it("forwards an empty decisions array unchanged (a no-expansion draft needs no decisions)", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input({ decisions: [] }));

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].decisions).toEqual([]);
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - known delegate error translation", () => {
  const CASES: Array<[string, ReviewProjectBoqConfigurationExpansionDraftResult]> = [
    ["Normalized BoQ artifact not found.", { status: "normalized_boq_not_found" }],
    ["Artifact is not a normalized_boq artifact.", { status: "artifact_not_normalized_boq" }],
    ["SKU resolution artifact not found.", { status: "sku_resolution_not_found" }],
    ["Artifact is not a sku_resolution artifact.", { status: "artifact_not_sku_resolution" }],
    ["SKU resolution artifact payload is invalid.", { status: "invalid_sku_resolution_payload" }],
    [
      "SKU resolution artifact does not match the normalized BoQ artifact.",
      { status: "sku_resolution_normalized_boq_mismatch" },
    ],
    [
      "SKU resolution artifact must be approved before configuration expansion.",
      { status: "sku_resolution_not_approved" },
    ],
    [
      "Configuration expansion artifact requires an approved rule pack.",
      { status: "rule_pack_not_approved" },
    ],
    [
      "Configuration expansion review has a duplicate decision for a lineId.",
      { status: "duplicate_decision" },
    ],
    [
      "Configuration expansion review decision references an unknown lineId.",
      { status: "decision_target_not_found" },
    ],
    [
      "Configuration expansion review decision must not target a customer line.",
      { status: "customer_line_decision" },
    ],
    [
      "Configuration expansion review requires a decision for every expansion line.",
      { status: "missing_expansion_decision" },
    ],
    [
      "Configuration expansion review decision action must be accept or reject.",
      { status: "invalid_decision_action" },
    ],
    [
      "Accepted configuration expansion line must carry a sourceRuleId.",
      { status: "accepted_line_not_traceable" },
    ],
    [
      "Accepted configuration expansion line must carry evidence.",
      { status: "accepted_line_not_traceable" },
    ],
  ];

  it.each(CASES)("maps %s to the safe status", async (message, expected) => {
    createMock.mockRejectedValue(new Error(message));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result).toEqual(expected);
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - unexpected errors", () => {
  it("re-throws an unexpected delegate error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createMock.mockRejectedValue(boom);

    await expect(reviewProjectBoqConfigurationExpansionDraftCore(input())).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    createMock.mockRejectedValue("plain string failure");

    await expect(reviewProjectBoqConfigurationExpansionDraftCore(input())).rejects.toBe(
      "plain string failure"
    );
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - ok summaries", () => {
  it("returns a serializable created-artifact summary with ISO dates and no payload", async () => {
    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ID,
      projectId: PROJECT,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [NORM_ID, SKU_ID, DRAFT_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with source ids/versions, source draft id/version, rule-pack metadata, and no lines", async () => {
    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      sourceNormalizedBoqArtifactId: NORM_ID,
      sourceNormalizedBoqArtifactVersion: NORM_VERSION,
      sourceSkuResolutionArtifactId: SKU_ID,
      sourceSkuResolutionArtifactVersion: SKU_VERSION,
      sourceConfigurationExpansionDraftArtifactId: DRAFT_ID,
      sourceConfigurationExpansionDraftArtifactVersion: DRAFT_VERSION,
      sourceFileIds: [FILE_ID],
      rulePackId: RULE_PACK_ID,
      rulePackVersion: RULE_PACK_VERSION,
      rulePackStatus: "approved",
      lineCount: 2,
      summary: REVIEW_SUMMARY,
    });
    for (const key of ["acceptedLines", "rejectedLines", "lines", "originalCells", "evidence", "reviewedBy"]) {
      expect(key in result.payloadSummary).toBe(false);
    }
  });

  it("never leaks any accepted/rejected line sku, original cells, or evidence into the response", async () => {
    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_CUSTOMER_SKU);
    expect(json).not.toContain(SECRET_CHILD_SKU);
    expect(json).not.toContain(SECRET_REJECTED_SKU);
    expect(json).not.toContain(SECRET_EVIDENCE_NOTE);
  });

  it("returns the review counts as the reviewSummary", async () => {
    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.reviewSummary).toEqual(REVIEW_SUMMARY);
  });
});

// --- Configuration authority trace (Prompt 118) ----------------------------

function makeAuthorityTrace(): ConfigurationAuthorityTrace {
  return {
    scope: "honeywell_mvp_demo_only",
    approvalRecordId: "approval-record-1",
    rulePackId: RULE_PACK_ID,
    rulePackVersion: RULE_PACK_VERSION,
    rulePackStatus: "approved",
    rulePackSourceScope: RULE_PACK_SCOPE,
    dispositionSummary: {
      expandByApprovedRulePackCount: 2,
      preserveKnownRulePackChildCount: 1,
      preserveStandaloneCustomerLineCount: 1,
      deferUnknownRelationshipCount: 0,
    },
    runtimeAi: false,
    replacementAuthority: false,
    skuSubstitutionAuthority: false,
    unknownRelationshipsDeferred: true,
    attachesOpticsUnderSwitches: false,
  };
}

describe("reviewProjectBoqConfigurationExpansionDraftCore - configuration authority trace", () => {
  it("passes the trace from the draft payload to createConfigurationExpansionArtifact when present", async () => {
    const trace = makeAuthorityTrace();
    getArtifactMock.mockResolvedValue(
      makeDraftArtifact({ payload: makeDraftPayload({ configurationAuthority: trace }) })
    );

    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    const arg = createMock.mock.calls[0][0];
    expect(arg.configurationAuthority).toBeDefined();
    expect(arg.configurationAuthority).not.toBe(trace);
    expect(arg.configurationAuthority?.dispositionSummary).not.toBe(
      trace.dispositionSummary
    );
    expect(arg.configurationAuthority?.scope).toBe("honeywell_mvp_demo_only");
    expect(arg.configurationAuthority?.runtimeAi).toBe(false);
  });

  it("includes the trace in the ok payloadSummary when the reviewed payload carries it", async () => {
    const trace = makeAuthorityTrace();
    const reviewedPayload = { ...makeReviewedPayload(), configurationAuthority: trace };
    createMock.mockResolvedValue(makeServiceResult({ payload: reviewedPayload }));

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.configurationAuthority).toBeDefined();
    expect(result.payloadSummary.configurationAuthority?.approvalRecordId).toBe("approval-record-1");
    expect(result.payloadSummary.configurationAuthority?.replacementAuthority).toBe(false);
  });

  it("mutating payloadSummary.configurationAuthority.dispositionSummary cannot mutate the delegate result", async () => {
    const trace = makeAuthorityTrace();
    const reviewedPayload = { ...makeReviewedPayload(), configurationAuthority: trace };
    const serviceResult = makeServiceResult({ payload: reviewedPayload });
    createMock.mockResolvedValue(serviceResult);

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    result.payloadSummary.configurationAuthority!.dispositionSummary.expandByApprovedRulePackCount = 999;
    expect(serviceResult.payload.configurationAuthority?.dispositionSummary.expandByApprovedRulePackCount).toBe(2);
  });

  it("backward-compatible: omits configurationAuthority from payloadSummary when the draft and reviewed payload have none", async () => {
    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect("configurationAuthority" in result.payloadSummary).toBe(false);
  });

  it("does not pass configurationAuthority to the delegate when the draft payload has none", async () => {
    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    const arg = createMock.mock.calls[0][0];
    expect("configurationAuthority" in arg).toBe(false);
  });

  it("returns invalid_configuration_expansion_draft_payload for a malformed present trace and does not delegate", async () => {
    const badTraces: unknown[] = [
      { scope: "wrong_scope" },
      { scope: "honeywell_mvp_demo_only" },
      {
        scope: "honeywell_mvp_demo_only",
        approvalRecordId: "x",
        rulePackId: "y",
        rulePackVersion: "1.0.0",
        rulePackStatus: "approved",
        rulePackSourceScope: "s",
        dispositionSummary: {
          expandByApprovedRulePackCount: 1,
          preserveKnownRulePackChildCount: 1,
          preserveStandaloneCustomerLineCount: 1,
          deferUnknownRelationshipCount: 0,
        },
        runtimeAi: true, // wrong: must be false
        replacementAuthority: false,
        skuSubstitutionAuthority: false,
        unknownRelationshipsDeferred: true,
        attachesOpticsUnderSwitches: false,
      },
      {
        scope: "honeywell_mvp_demo_only",
        approvalRecordId: "x",
        rulePackId: "y",
        rulePackVersion: "1.0.0",
        rulePackStatus: "approved",
        rulePackSourceScope: "s",
        dispositionSummary: { expandByApprovedRulePackCount: "not-a-number" }, // wrong type
        runtimeAi: false,
        replacementAuthority: false,
        skuSubstitutionAuthority: false,
        unknownRelationshipsDeferred: true,
        attachesOpticsUnderSwitches: false,
      },
    ];

    for (const badTrace of badTraces) {
      createMock.mockClear();
      getArtifactMock.mockResolvedValue(
        makeDraftArtifact({ payload: makeDraftPayload({ configurationAuthority: badTrace }) })
      );

      const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

      expect(result).toEqual({ status: "invalid_configuration_expansion_draft_payload" });
      expect(createMock).not.toHaveBeenCalled();
    }
  });
});

describe("reviewProjectBoqConfigurationExpansionDraftCore - immutability and copies", () => {
  it("does not mutate the input object or its decisions", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await reviewProjectBoqConfigurationExpansionDraftCore(inp);

    expect(inp).toEqual(snapshot);
  });

  it("does not mutate the loaded draft artifact", async () => {
    const draft = makeDraftArtifact();
    const snapshot = structuredClone(draft);
    getArtifactMock.mockResolvedValue(draft);

    await reviewProjectBoqConfigurationExpansionDraftCore(input());

    expect(draft).toEqual(snapshot);
  });

  it("copies payload arrays/summary so the response cannot corrupt the delegate result", async () => {
    const serviceResult = makeServiceResult();
    createMock.mockResolvedValue(serviceResult);

    const result = await reviewProjectBoqConfigurationExpansionDraftCore(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary.sourceFileIds).not.toBe(serviceResult.payload.sourceFileIds);
    expect(result.payloadSummary.summary).not.toBe(serviceResult.payload.summary);
    expect(result.artifact.sourceArtifactIds).not.toBe(serviceResult.artifact.sourceArtifactIds);

    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.summary.totalAcceptedLineCount = 999;
    result.artifact.sourceArtifactIds.push("injected");

    expect(serviceResult.payload.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.payload.summary.totalAcceptedLineCount).toBe(2);
    expect(serviceResult.artifact.sourceArtifactIds).toEqual([NORM_ID, SKU_ID, DRAFT_ID]);
  });
});

describe("core module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-boq-config-expansion-review-core.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-boq-config-expansion-review-core.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the stores, the reviewed-expansion service, and the config-expansion/project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/config-expansion-artifact"');
    expect(source).toContain('from "@/lib/projects/config-expansion-review"');
    expect(source).toContain('from "@/lib/projects/config-expansion-types"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the artifact-write helper, the draft service/core, approvals/evidence stores, the runner, pricing, export, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/project-quick-bom-config-expansion-draft"',
      'from "@/lib/projects/project-boq-config-expansion-draft-core"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes only the core review service as a runtime export", () => {
    expect(Object.keys(coreModule)).toEqual([
      "reviewProjectBoqConfigurationExpansionDraftCore",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
