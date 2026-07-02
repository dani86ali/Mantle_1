import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries and the Stage 6I-A output contract validator so the
// read-only list/detail projections and payload sanitization are tested independent of
// the DB and the contract internals.
const { mockGetProjectById, mockGetArtifactById, mockListByType, mockValidate } = vi.hoisted(
  () => ({
    mockGetProjectById: vi.fn(),
    mockGetArtifactById: vi.fn(),
    mockListByType: vi.fn(),
    mockValidate: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListByType,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output", () => ({
  validateRfpHldDiagramOutputPayload: mockValidate,
}));

import {
  loadRfpHldDiagramOutputList,
  loadRfpHldDiagramOutputDetail,
} from "@/lib/projects/project-rfp-hld-diagram-output-inspection";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-output-1";
const DIAGRAM_ID = "hld-diagram-1";
const OUTPUT_ID = "hld-output-1";
const TS = new Date("2026-06-20T08:00:00.000Z");

function outputPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_diagram_output",
    createdAt: "2026-06-24T00:00:00.000Z",
    createdBy: "engineer@example.com",
    sourceArtifactIds: [DIAGRAM_ID],
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceDiagramVersion: 1,
    outputFormat: "drawio_compatible_v1",
    diagramType: "topology",
    title: "HLD Topology Diagram Output",
    canvas: { width: 840, height: 220, gridSize: 10 },
    zones: [
      { id: "z-1", label: "Campus Zone", geometry: { x: 40, y: 40, width: 200, height: 60 }, sourceRefIds: [DIAGRAM_ID] },
    ],
    nodes: [
      { id: "n-1", label: "Core Switch", zoneId: "z-1", geometry: { x: 320, y: 40, width: 160, height: 60 }, sourceRefIds: [DIAGRAM_ID] },
      { id: "n-2", label: "Access Switch", geometry: { x: 560, y: 40, width: 160, height: 60 }, sourceRefIds: [DIAGRAM_ID] },
    ],
    links: [
      { id: "l-1", sourceNodeId: "n-1", targetNodeId: "n-2", label: "Core to Access", sourceRefIds: [DIAGRAM_ID] },
    ],
    validationFindings: [],
    ...overrides,
  };
}

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
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function outputArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: OUTPUT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram_output",
    status: "needs_review",
    version: 1,
    payload: outputPayload(),
    sourceFileIds: [],
    sourceArtifactIds: [DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(outputArtifact());
  mockListByType.mockReset().mockResolvedValue([outputArtifact()]);
  mockValidate.mockReset().mockReturnValue({ ok: true, value: outputPayload() });
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

describe("loadRfpHldDiagramOutputList", () => {
  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    expect(await loadRfpHldDiagramOutputList({ tenantId: TENANT, projectId: PROJECT })).toEqual({
      status: "not_found",
    });
  });

  it("returns wrong_mode for a non-rfp project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDiagramOutputList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("returns lean counts-only summaries with no payload body", async () => {
    const result = await loadRfpHldDiagramOutputList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const item = result.artifacts[0];
    expect("nodes" in item).toBe(false);
    expect("payload" in item).toBe(false);
    expect(item.payloadSummary).toEqual({
      payloadKind: "rfp_hld_diagram_output",
      outputFormat: "drawio_compatible_v1",
      diagramType: "topology",
      title: "HLD Topology Diagram Output",
      nodeCount: 2,
      linkCount: 1,
      zoneCount: 1,
      validationFindingCount: 0,
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceDiagramVersion: 1,
      canvasWidth: 840,
      canvasHeight: 220,
    });
  });

  it("filters out rows on a different stage", async () => {
    mockListByType.mockResolvedValue([outputArtifact({ stageId: "boq_pricing_review" })]);
    const result = await loadRfpHldDiagramOutputList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

describe("loadRfpHldDiagramOutputDetail", () => {
  it("returns artifact_not_found for a mismatched/absent artifact", async () => {
    mockGetArtifactById.mockResolvedValue(null);
    expect(
      await loadRfpHldDiagramOutputDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: OUTPUT_ID })
    ).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_diagram_output for the wrong type", async () => {
    mockGetArtifactById.mockResolvedValue(outputArtifact({ type: "hld_diagram" }));
    const result = await loadRfpHldDiagramOutputDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: OUTPUT_ID });
    expect(result.status).toBe("artifact_not_hld_diagram_output");
  });

  it("returns invalid_payload when the contract validator rejects the payload", async () => {
    mockValidate.mockReturnValue({ ok: false, errors: ["payload: blank title"] });
    const result = await loadRfpHldDiagramOutputDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: OUTPUT_ID });
    expect(result.status).toBe("invalid_payload");
  });

  it("returns a sanitized whitelist and drops leaked keys", async () => {
    mockGetArtifactById.mockResolvedValue(
      outputArtifact({
        payload: outputPayload({
          tenantId: TENANT,
          filePath: "/secret/path.pdf",
          drawioXml: "<mxfile>secret</mxfile>",
        }),
      })
    );

    const result = await loadRfpHldDiagramOutputDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: OUTPUT_ID });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const detail = result.diagramOutput;
    expect(detail.sourceHldDiagramArtifactId).toBe(DIAGRAM_ID);
    expect(detail.nodes.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(detail.links[0].sourceNodeId).toBe("n-1");
    expect(detail.zones[0].id).toBe("z-1");
    const json = JSON.stringify(detail);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("/secret/path.pdf");
    expect(json).not.toContain("drawioXml");
    expect(json).not.toContain("mxfile");
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-diagram-output-inspection - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-diagram-output-inspection.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, output contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-diagram-output",
      "@/types/project",
    ]);
  });

  it("invokes no write/approval behavior", () => {
    expect(source).not.toContain("createProjectApproval");
    expect(source).not.toContain("createProjectArtifactVersion");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
