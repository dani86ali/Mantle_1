import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

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
  loadRfpHldReadinessSnapshotList,
  loadRfpHldReadinessSnapshotDetail,
} from "@/lib/projects/project-rfp-hld-readiness-snapshot-inspection";
import { RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-readiness-snapshot";

const TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-rfp-snap-1";
const ARTIFACT = "art-snap-1";
const TS1 = new Date("2026-06-10T08:00:00.000Z");
const TS2 = new Date("2026-06-11T09:00:00.000Z");

// Sentinels that must never appear in list output.
const STORAGE_SENTINEL = "/secret/storage/path";
const EXTRA_KEY_SENTINEL = "EXTRA-PAYLOAD-KEY-SENTINEL";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP HLD",
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

function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    payloadKind: RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND,
    createdBy: "engineer-2",
    createdAt: "2026-06-10T08:30:00.000Z",
    readinessStatus: "ready",
    sourceArtifactIds: ["art-ev-1", "art-req-1", "art-cfg-1", "art-intake-1"],
    sourceEvidencePackageArtifactId: "art-ev-1",
    sourceRequirementsBaselineArtifactId: "art-req-1",
    sourceHldIntakeArtifactId: "art-intake-1",
    coveredDomains: ["campus_switching", "wireless"],
    excludedDomains: ["data_center"],
    domainReadiness: {
      claimedDomains: ["campus_switching", "wireless"],
      coveredDomains: ["campus_switching", "wireless"],
      excludedDomains: ["data_center"],
      requiredKnowledgePackDomains: ["campus_switching", "wireless"],
      missingKnowledgePackDomains: [],
    },
    assumptions: [
      {
        fieldId: "f-1",
        label: "Redundancy",
        status: "unknown",
        note: "Not specified in RFP",
        storagePath: STORAGE_SENTINEL,
      },
      {
        fieldId: "f-2",
        label: "Legacy gear",
        status: "not_applicable",
      },
      {
        fieldId: "f-3",
        label: "Answered field",
        status: "answered",
      },
    ],
    missingInputs: ["hld_intake", "other"],
    validationMessages: ["All domains covered.", "No missing packs."],
    arbitraryKey: EXTRA_KEY_SENTINEL,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_readiness_snapshot",
    status: "needs_review",
    version: 1,
    payload: makePayload(),
    sourceFileIds: [],
    sourceArtifactIds: [
      "art-ev-1",
      "art-req-1",
      "art-cfg-1",
      "art-intake-1",
    ],
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

// ---- list gates ------------------------------------------------------------

describe("loadRfpHldReadinessSnapshotList - gates", () => {
  it("throws on blank projectId before any store call", async () => {
    await expect(
      loadRfpHldReadinessSnapshotList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found and never lists when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId) and never lists for non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });
});

// ---- list typed call + summary shape ---------------------------------------

describe("loadRfpHldReadinessSnapshotList - typed list + counts-only summary", () => {
  it("queries via typed listProjectArtifactsByType with hld_readiness_snapshot", async () => {
    await loadRfpHldReadinessSnapshotList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_readiness_snapshot" as ProjectArtifactType
    );
  });

  it("filters to hld_readiness_snapshot stage hld_design_delta_review in artifacts", async () => {
    const wrongStage = makeArtifact({
      id: "art-snap-wrong-stage",
      stageId: "compliance_matrix_review" as ProjectStageId,
    });
    mockListArtifactsByType.mockResolvedValue([makeArtifact(), wrongStage]);

    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    for (const art of result.artifacts) {
      expect(art.stageId).toBe("hld_design_delta_review");
    }
  });

  it("returns counts-only payloadSummary with no sourceArtifactIds or validationMessages", async () => {
    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const summary = result.artifacts[0].payloadSummary;
    expect(summary).toEqual({
      payloadKind: RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND,
      createdBy: "engineer-2",
      createdAt: "2026-06-10T08:30:00.000Z",
      readinessStatus: "ready",
      sourceArtifactCount: 4,
      coveredDomainCount: 2,
      excludedDomainCount: 1,
      assumptionCount: 3,
      missingInputCount: 2,
      validationMessageCount: 2,
    });
    expect("sourceArtifactIds" in summary).toBe(false);
    expect("validationMessages" in summary).toBe(false);
  });

  it("does not include sourceFileIds or sourceArtifactIds in artifact summary", async () => {
    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    const art = result.artifacts[0];
    expect("sourceFileIds" in art).toBe(false);
    expect("sourceArtifactIds" in art).toBe(false);
  });

  it("does not leak extra payload keys or tenantId in list output", async () => {
    const result = await loadRfpHldReadinessSnapshotList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain(EXTRA_KEY_SENTINEL);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain(STORAGE_SENTINEL);
  });
});

// ---- detail gates ----------------------------------------------------------

describe("loadRfpHldReadinessSnapshotDetail - gates", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldReadinessSnapshotDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: " ",
      })
    ).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("throws on blank projectId before any store call", async () => {
    await expect(
      loadRfpHldReadinessSnapshotDetail({
        tenantId: TENANT,
        projectId: "  ",
        artifactId: ARTIFACT,
      })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found when project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns wrong_mode for non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("returns artifact_not_found when artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_readiness_snapshot for a wrong type", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ type: "compliance_matrix" as ProjectArtifactType })
    );

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_readiness_snapshot");
    if (result.status !== "artifact_not_hld_readiness_snapshot")
      throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns artifact_not_hld_readiness_snapshot for right type in wrong stage", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({
        stageId: "compliance_matrix_review" as ProjectStageId,
      })
    );

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_readiness_snapshot");
  });

  it("returns invalid_payload for wrong payloadKind", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ payload: makePayload({ payloadKind: "wrong_kind" }) })
    );

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("invalid_payload");
  });

  it("returns invalid_payload when required containers are missing or malformed", async () => {
    const cases = [
      makePayload({ sourceArtifactIds: "not-array" }),
      makePayload({ coveredDomains: null }),
      makePayload({ excludedDomains: 42 }),
      makePayload({ domainReadiness: [] }),
      makePayload({ assumptions: "nope" }),
      makePayload({ missingInputs: undefined }),
      makePayload({ validationMessages: {} }),
    ];

    for (const payload of cases) {
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await loadRfpHldReadinessSnapshotDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });

      expect(result.status).toBe("invalid_payload");
    }
  });
});

// ---- detail sanitized output -----------------------------------------------

describe("loadRfpHldReadinessSnapshotDetail - sanitized detail", () => {
  it("returns sanitized snapshot with whitelisted fields only", async () => {
    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const snap = result.snapshot;
    expect(snap.payloadKind).toBe(RFP_HLD_READINESS_SNAPSHOT_PAYLOAD_KIND);
    expect(snap.createdBy).toBe("engineer-2");
    expect(snap.readinessStatus).toBe("ready");
    expect(snap.sourceArtifactIds).toEqual([
      "art-ev-1",
      "art-req-1",
      "art-cfg-1",
      "art-intake-1",
    ]);
    expect(snap.sourceEvidencePackageArtifactId).toBe("art-ev-1");
    expect(snap.sourceRequirementsBaselineArtifactId).toBe("art-req-1");
    expect(snap.sourceHldIntakeArtifactId).toBe("art-intake-1");
    expect("sourceComplianceMatrixArtifactId" in snap).toBe(false);
    expect("sourceConfigurationArtifactId" in snap).toBe(false);
    expect(snap.coveredDomains).toEqual(["campus_switching", "wireless"]);
    expect(snap.excludedDomains).toEqual(["data_center"]);
    expect(snap.missingInputs).toEqual(["hld_intake", "other"]);
    expect(snap.validationMessages).toEqual([
      "All domains covered.",
      "No missing packs.",
    ]);
    expect("arbitraryKey" in snap).toBe(false);
  });

  it("filters unknown domains out of domain arrays in snapshot and domainReadiness", async () => {
    const payload = makePayload({
      coveredDomains: ["campus_switching", "unknown_domain_xyz", "wireless"],
      excludedDomains: ["data_center", "not_a_real_domain"],
      domainReadiness: {
        claimedDomains: ["campus_switching", "bad_domain"],
        coveredDomains: ["campus_switching"],
        excludedDomains: [],
        requiredKnowledgePackDomains: ["campus_switching"],
        missingKnowledgePackDomains: ["invalid_domain"],
      },
    });
    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.snapshot.coveredDomains).toEqual([
      "campus_switching",
      "wireless",
    ]);
    expect(result.snapshot.excludedDomains).toEqual(["data_center"]);
    expect(result.snapshot.domainReadiness.claimedDomains).toEqual([
      "campus_switching",
    ]);
    expect(result.snapshot.domainReadiness.missingKnowledgePackDomains).toEqual(
      []
    );
  });

  it("filters assumptions: keeps only unknown/not_applicable, drops storagePath and extra keys", async () => {
    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const assumptions = result.snapshot.assumptions;
    // "answered" status entry is filtered out.
    expect(assumptions).toHaveLength(2);
    expect(assumptions[0]).toEqual({
      fieldId: "f-1",
      label: "Redundancy",
      status: "unknown",
      note: "Not specified in RFP",
    });
    expect("storagePath" in assumptions[0]).toBe(false);
    expect(assumptions[1]).toEqual({
      fieldId: "f-2",
      label: "Legacy gear",
      status: "not_applicable",
    });
  });

  it("keeps only strings in string arrays (missingInputs, validationMessages, sourceArtifactIds)", async () => {
    const payload = makePayload({
      sourceArtifactIds: ["art-1", 42, null, "art-2"],
      missingInputs: ["hld_intake", 99, "other"],
      validationMessages: ["msg-1", {}, "msg-2"],
    });
    mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.snapshot.sourceArtifactIds).toEqual(["art-1", "art-2"]);
    expect(result.snapshot.missingInputs).toEqual(["hld_intake", "other"]);
    expect(result.snapshot.validationMessages).toEqual(["msg-1", "msg-2"]);
  });

  it("does not leak tenantId, extra payload keys, or storage sentinels in detail output", async () => {
    const result = await loadRfpHldReadinessSnapshotDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain(EXTRA_KEY_SENTINEL);
    expect(json).not.toContain(STORAGE_SENTINEL);
  });
});

// ---- module purity (static source check) -----------------------------------

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-readiness-snapshot-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-readiness-snapshot-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly project-store, artifact-store, canonical types, snapshot payload kind, and HLD domain definitions/types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-hld-readiness-snapshot",
      "@/lib/projects/project-rfp-hld-domain-readiness",
    ]);
  });

  it("contains no node:fs or node:path imports in source", () => {
    expect(source).not.toContain('from "node:fs"');
    expect(source).not.toContain('from "node:path"');
    expect(source).not.toContain("require(");
  });

  it("performs no mutations and imports no forbidden stores, providers, routes, or components", () => {
    expect(/\b(?:create|update|delete)[A-Z]\w*/.test(source)).toBe(false);
    for (const forbidden of [
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

  it("keeps source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
