import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { PipelineState } from "@/coordinator/types";

const {
  mockResolve,
  mockLoadState,
  mockSaveState,
  mockMinimalState,
  mockParseJson,
  mockRunE5,
  mockLoadE4State,
  mockLoadPipelineByIntake,
  mockSavePipelineState,
  mockResume,
} = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockLoadState: vi.fn(),
  mockSaveState: vi.fn(),
  mockMinimalState: vi.fn(),
  mockParseJson: vi.fn(),
  mockRunE5: vi.fn(),
  mockLoadE4State: vi.fn(),
  mockLoadPipelineByIntake: vi.fn(),
  mockSavePipelineState: vi.fn(),
  mockResume: vi.fn(),
}));

vi.mock("@/app/api/estimates/[id]/_e5-state", () => ({
  resolveIntake: mockResolve,
  loadE5State: mockLoadState,
  saveE5State: mockSaveState,
  minimalPipelineState: mockMinimalState,
  parseJson: mockParseJson,
}));

vi.mock("@/app/api/estimates/[id]/_e4-state", () => ({
  loadE4State: mockLoadE4State,
}));

vi.mock("@/engines/e5/orchestrator", () => ({
  runE5Detailed: mockRunE5,
}));

vi.mock("@/lib/db/pipeline-store", () => ({
  loadPipelineStateByIntake: mockLoadPipelineByIntake,
  savePipelineState: mockSavePipelineState,
}));

vi.mock("@/coordinator/run-and-persist", () => ({
  resumeAndPersistPipeline: mockResume,
}));

import {
  GET as designGET,
  POST as designPOST,
  PATCH as designPATCH,
} from "@/app/api/estimates/[id]/design/route";
import { GET as docsGET } from "@/app/api/estimates/[id]/design/documents/route";
import { NextRequest } from "next/server";

function jsonReq(body: unknown): NextRequest {
  return {
    url: "http://localhost/api/estimates/x/design",
    json: async () => body,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type" ? "application/json" : null,
    },
  } as unknown as NextRequest;
}

function urlReq(url: string): NextRequest {
  return {
    url,
    headers: { get: () => null },
  } as unknown as NextRequest;
}

const resolved = { intakeId: "intake-1", customerName: "Acme", country: "SA" };

const validBody = {
  vendor: "cisco",
  customerName: "Acme",
  projectName: "Refresh",
  projectType: "campus_refresh",
  siteCount: 1,
  buildingCount: 1,
  portCount: 200,
  userCount: 150,
  bandwidthGbps: 10,
};

const phase1 = {
  designApproach: {
    methodology: "ppdioo" as const,
    approach: "hybrid" as const,
    frameworks: ["ppdioo"],
    topologyPattern: "two_tier_collapsed_core" as const,
    vendor: "cisco" as const,
    projectType: "campus_refresh",
  },
  topology: "two_tier_collapsed_core" as const,
  sizing: {
    coreDevices: [{ role: "core", model: "C9500", vendor: "cisco", quantity: 2, reasoning: "ok" }],
    distributionDevices: [],
    accessDevices: [],
    firewalls: [],
    wirelessControllers: [],
    accessPoints: [],
  },
  compatibility: { valid: true, errors: [], warnings: [] },
  hldSections: [],
  hldDocPath: "./out/Acme-Refresh-hld.docx",
  diagramXml: "<diagram/>",
  designApproachRevisions: 0,
  hldRevisions: 0,
};

const phase2 = {
  ipVlanPlan: { vlans: [], subnets: [], vrfs: [] },
  portMaps: [],
  cableSchedule: [],
  qosPolicy: { vendor: "cisco", classes: [], markingPolicy: "", queuingPolicy: "" },
  migrationApproach: { method: "cutover", phases: [], riskLevel: "low", reasoning: "fb" },
  lldSections: [],
  lldDocPath: "./out/Acme-Refresh-lld.docx",
  rackElevations: [],
  finalCompatibility: { valid: true, errors: [], warnings: [] },
  lldRevisions: 0,
};

beforeEach(() => {
  mockResolve.mockReset();
  mockLoadState.mockReset();
  mockSaveState.mockReset().mockResolvedValue(undefined);
  mockMinimalState.mockReset().mockReturnValue({});
  mockParseJson.mockReset().mockImplementation((s: string | undefined) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  });
  mockRunE5.mockReset();
  mockLoadE4State.mockReset().mockResolvedValue({});
  // Default: no pipeline state → unified-checkpoint sync is a no-op, so
  // existing PATCH tests keep their previous (local-only) expectations.
  mockLoadPipelineByIntake.mockReset().mockResolvedValue(null);
  mockSavePipelineState.mockReset().mockResolvedValue(undefined);
  mockResume.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/estimates/[id]/design", () => {
  it("triggers HLD generation and returns sizing", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockRunE5.mockResolvedValue({
      output: { engine: "e5", artifacts: {}, warnings: [] },
      phase: "hld",
      logs: [],
      phase1,
    });

    const res = await designPOST(jsonReq(validBody), { params: { id: "intake-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("hld_in_progress");
    expect(body.designApproach.topologyPattern).toBe("two_tier_collapsed_core");
    expect(body.sizingResult.coreDevices).toHaveLength(1);

    expect(mockSaveState).toHaveBeenCalledTimes(1);
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.phase).toBe("hld_in_progress");
    expect(saved.hldDocxPath).toBe("./out/Acme-Refresh-hld.docx");
    expect(saved.inputData.vendor).toBe("cisco");

    const orchestratorInput = mockRunE5.mock.calls[0][0];
    expect(orchestratorInput.inputData.phase).toBe("hld");
    expect(orchestratorInput.inputData.vendor).toBe("cisco");
  });

  it("returns 400 on invalid body", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await designPOST(
      jsonReq({ ...validBody, vendor: "juniper" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });

  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await designPOST(jsonReq(validBody), { params: { id: "missing" } });
    expect(res.status).toBe(404);
  });

  it("returns 500 when orchestrator errors", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockRunE5.mockResolvedValue({
      output: { engine: "e5", artifacts: {}, warnings: [], error: "boom" },
      phase: "hld",
      logs: [],
    });
    const res = await designPOST(jsonReq(validBody), { params: { id: "intake-1" } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});

describe("GET /api/estimates/[id]/design", () => {
  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await designGET(jsonReq(null), { params: { id: "missing" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when no design state stored", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue(null);
    const res = await designGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Design not generated/);
  });

  it("returns current design state with parsed artifacts", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      phase: "hld_in_progress",
      inputData: validBody,
      designApproach: JSON.stringify(phase1.designApproach),
      topology: phase1.topology,
      sizingResult: JSON.stringify(phase1.sizing),
      compatibilityResult: JSON.stringify(phase1.compatibility),
      hldSections: JSON.stringify([]),
      hldDocxPath: phase1.hldDocPath,
      diagramXml: phase1.diagramXml,
      updatedAt: "now",
    });

    const res = await designGET(jsonReq(null), { params: { id: "intake-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("hld_in_progress");
    expect(body.topology).toBe("two_tier_collapsed_core");
    expect(body.sizingResult.coreDevices).toHaveLength(1);
    expect(body.hldDocxPath).toBe(phase1.hldDocPath);
    expect(body.diagramXml).toBe(phase1.diagramXml);
    expect(body.lldDocxPath).toBeNull();
    expect(body.componentList).toBeNull();
  });
});

describe("PATCH /api/estimates/[id]/design", () => {
  const hldState = {
    phase: "hld_in_progress" as const,
    inputData: validBody,
    designApproach: JSON.stringify(phase1.designApproach),
    topology: phase1.topology,
    sizingResult: JSON.stringify(phase1.sizing),
    compatibilityResult: JSON.stringify(phase1.compatibility),
    hldSections: JSON.stringify([]),
    hldDocxPath: phase1.hldDocPath,
    diagramXml: phase1.diagramXml,
    updatedAt: "t0",
  };

  it("approve_design advances phase from hld_in_progress to hld_complete", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue(hldState);

    const res = await designPATCH(
      jsonReq({ action: "approve_design" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("hld_complete");

    expect(mockSaveState).toHaveBeenCalledTimes(1);
    const saved = mockSaveState.mock.calls[0][1];
    expect(saved.phase).toBe("hld_complete");
    expect(mockRunE5).not.toHaveBeenCalled();
  });

  it("revise_hld re-runs HLD with revisionNotes", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({ ...hldState, phase: "hld_complete" });
    mockRunE5.mockResolvedValue({
      output: { engine: "e5", artifacts: {}, warnings: [] },
      phase: "hld",
      logs: [],
      phase1,
    });

    const res = await designPATCH(
      jsonReq({ action: "revise_hld", revisionNotes: "use 9300X instead" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("hld_in_progress");
    expect(body.hldDocxPath).toBe(phase1.hldDocPath);

    expect(mockRunE5).toHaveBeenCalledTimes(1);
    const call = mockRunE5.mock.calls[0][0];
    expect(call.revisionNotes).toBe("use 9300X instead");
    expect(call.inputData.phase).toBe("hld");
  });

  it("revise_hld without revisionNotes returns 400", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await designPATCH(
      jsonReq({ action: "revise_hld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });

  it("revise_hld with blank revisionNotes returns 400", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await designPATCH(
      jsonReq({ action: "revise_hld", revisionNotes: "   " }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("approve_hld runs LLD and advances phase to lld_complete", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({ ...hldState, phase: "hld_complete" });
    mockRunE5.mockResolvedValue({
      output: { engine: "e5", artifacts: {}, warnings: [] },
      phase: "lld",
      logs: [],
      phase2,
      componentList: [
        { model: "C9500", vendor: "cisco", quantity: 2, role: "core", fromDesignStep: "3" },
      ],
    });

    const res = await designPATCH(
      jsonReq({ action: "approve_hld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("lld_complete");
    expect(body.lldDocxPath).toBe(phase2.lldDocPath);
    expect(body.componentList).toHaveLength(1);

    const call = mockRunE5.mock.calls[0][0];
    expect(call.inputData.phase).toBe("lld");
    expect(call.inputData.hldHandoff.topology).toBe("two_tier_collapsed_core");
  });

  it("approve_hld in wrong phase returns 400", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue(hldState);
    const res = await designPATCH(
      jsonReq({ action: "approve_hld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no design state stored", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue(null);
    const res = await designPATCH(
      jsonReq({ action: "approve_design" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid action", async () => {
    mockResolve.mockResolvedValue(resolved);
    const res = await designPATCH(
      jsonReq({ action: "bogus" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
  });
});

// ─── unified checkpoint sync — design approvals POST checkpoints into the
// pipeline-state record so the standard resume mechanism drives E2/E3. ─────

function pipelineWithE5Checkpoints(opts: {
  approved: string[];
  pending: string[];
}): PipelineState {
  const now = new Date();
  return {
    id: "pipe-e5",
    opportunityId: "intake:intake-1",
    intakeId: "intake-1",
    mode: "rfp",
    currentEngine: "e5",
    status: "paused_at_checkpoint",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [
      ...opts.approved.map((id) => ({
        id, engine: "e5" as const, label: id,
        status: "approved" as const, revisionsUsed: 0, decidedAt: now,
      })),
      ...opts.pending.map((id) => ({
        id, engine: "e5" as const, label: id,
        status: "pending" as const, revisionsUsed: 0,
      })),
    ],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

describe("PATCH design approve_* → unified checkpoint sync", () => {
  const hldStateAtHld = {
    phase: "hld_in_progress" as const,
    inputData: validBody,
    designApproach: JSON.stringify(phase1.designApproach),
    topology: phase1.topology,
    sizingResult: JSON.stringify(phase1.sizing),
    compatibilityResult: JSON.stringify(phase1.compatibility),
    hldSections: JSON.stringify([]),
    hldDocxPath: phase1.hldDocPath,
    diagramXml: phase1.diagramXml,
    updatedAt: "t0",
  };

  it("approve_design approves e5-design-approach + syncs hldDocument; does not resume (e5-hld/lld still pending)", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue(hldStateAtHld);
    const pipeline = pipelineWithE5Checkpoints({
      approved: [],
      pending: ["e5-design-approach", "e5-hld", "e5-lld"],
    });
    mockLoadPipelineByIntake.mockResolvedValue(pipeline);

    const res = await designPATCH(
      jsonReq({ action: "approve_design" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    expect(mockSavePipelineState).toHaveBeenCalledTimes(1);
    const saved = mockSavePipelineState.mock.calls[0][0] as PipelineState;
    expect(saved.checkpoints.find((c) => c.id === "e5-design-approach")!.status).toBe("approved");
    expect(saved.checkpoints.find((c) => c.id === "e5-hld")!.status).toBe("pending");
    expect(saved.artifacts.e5.hldDocument).toBe(phase1.hldDocPath);
    expect(saved.status).toBe("paused_at_checkpoint");
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("approve_lld when other two e5-* are approved → all approved, resume fires, componentList synced", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      ...hldStateAtHld,
      phase: "lld_complete",
      lldDocxPath: phase2.lldDocPath,
      ipVlanPlan: JSON.stringify(phase2.ipVlanPlan),
      componentList: JSON.stringify([
        { model: "C9500", vendor: "cisco", quantity: 2, role: "core" },
      ]),
    });
    const pipeline = pipelineWithE5Checkpoints({
      approved: ["e5-design-approach", "e5-hld"],
      pending: ["e5-lld"],
    });
    mockLoadPipelineByIntake.mockResolvedValue(pipeline);

    const res = await designPATCH(
      jsonReq({ action: "approve_lld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    const saved = mockSavePipelineState.mock.calls[0][0] as PipelineState;
    expect(saved.checkpoints.every((c) => c.status === "approved")).toBe(true);
    expect(saved.status).toBe("running");
    expect(saved.artifacts.e5.componentList).toContain("C9500");
    expect(saved.artifacts.e5.lldDocument).toBe(phase2.lldDocPath);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledWith(expect.any(String), "intake-1");
  });

  it("approve_lld with no pipeline state for intake → succeeds, no unified-side-effects", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      ...hldStateAtHld,
      phase: "lld_complete",
      lldDocxPath: phase2.lldDocPath,
      ipVlanPlan: JSON.stringify(phase2.ipVlanPlan),
      componentList: JSON.stringify([]),
    });
    mockLoadPipelineByIntake.mockResolvedValue(null);

    const res = await designPATCH(
      jsonReq({ action: "approve_lld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("complete");

    expect(mockSaveState).toHaveBeenCalledTimes(1); // local only
    expect(mockSavePipelineState).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("approve_lld when pipeline state exists but has no e5-lld checkpoint → no resume, no error", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      ...hldStateAtHld,
      phase: "lld_complete",
      lldDocxPath: phase2.lldDocPath,
      ipVlanPlan: JSON.stringify(phase2.ipVlanPlan),
      componentList: JSON.stringify([]),
    });
    // Old pipeline pre-A2: only e1-* checkpoints, no e5-* yet.
    const now = new Date();
    const pipeline: PipelineState = {
      id: "pipe-old",
      opportunityId: "intake:intake-1",
      intakeId: "intake-1",
      mode: "rfp",
      currentEngine: "e1",
      status: "paused_at_checkpoint",
      artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
      checkpoints: [
        { id: "e1-requirements", engine: "e1", label: "x", status: "pending", revisionsUsed: 0 },
      ],
      engineCalls: [],
      timestamps: { createdAt: now, updatedAt: now },
    };
    mockLoadPipelineByIntake.mockResolvedValue(pipeline);

    const res = await designPATCH(
      jsonReq({ action: "approve_lld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    expect(mockSavePipelineState).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("approve_design → approve_hld → approve_lld in sequence drives all three checkpoints + fires resume once", async () => {
    mockResolve.mockResolvedValue(resolved);

    // Shared pipeline mutated across the three calls.
    const pipeline = pipelineWithE5Checkpoints({
      approved: [],
      pending: ["e5-design-approach", "e5-hld", "e5-lld"],
    });
    mockLoadPipelineByIntake.mockResolvedValue(pipeline);

    // Step 1: approve_design (phase hld_in_progress → hld_complete).
    mockLoadState.mockResolvedValueOnce(hldStateAtHld);
    let res = await designPATCH(
      jsonReq({ action: "approve_design" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    // Step 2: approve_hld (phase hld_complete → lld_complete; runs LLD).
    mockLoadState.mockResolvedValueOnce({ ...hldStateAtHld, phase: "hld_complete" });
    mockRunE5.mockResolvedValueOnce({
      output: { engine: "e5", artifacts: {}, warnings: [] },
      phase: "lld",
      logs: [],
      phase2,
      componentList: [
        { model: "C9500", vendor: "cisco", quantity: 2, role: "core", fromDesignStep: "3" },
      ],
    });
    res = await designPATCH(
      jsonReq({ action: "approve_hld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    // Step 3: approve_lld (phase lld_complete → complete; triggers resume).
    mockLoadState.mockResolvedValueOnce({
      ...hldStateAtHld,
      phase: "lld_complete",
      lldDocxPath: phase2.lldDocPath,
      ipVlanPlan: JSON.stringify(phase2.ipVlanPlan),
      componentList: JSON.stringify([{ model: "C9500", vendor: "cisco", quantity: 2 }]),
    });
    res = await designPATCH(
      jsonReq({ action: "approve_lld" }),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(200);

    // All three e5-* approved on the shared pipeline.
    expect(pipeline.checkpoints.filter((c) => c.engine === "e5").every((c) => c.status === "approved")).toBe(true);
    expect(pipeline.status).toBe("running");
    expect(pipeline.artifacts.e5.componentList).toBeTruthy();
    expect(pipeline.artifacts.e5.hldDocument).toBe(phase1.hldDocPath);
    expect(pipeline.artifacts.e5.lldDocument).toBe(phase2.lldDocPath);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockSavePipelineState).toHaveBeenCalledTimes(3);
  });
});

describe("GET /api/estimates/[id]/design/documents", () => {
  it("returns 400 when type is missing or invalid", async () => {
    const res = await docsGET(
      urlReq("http://localhost/api/estimates/x/design/documents"),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when estimate does not exist", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await docsGET(
      urlReq("http://localhost/api/estimates/x/design/documents?type=hld"),
      { params: { id: "missing" } },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when document not yet generated", async () => {
    mockResolve.mockResolvedValue(resolved);
    mockLoadState.mockResolvedValue({
      phase: "hld_in_progress",
      hldDocxPath: undefined,
      updatedAt: "t0",
    });
    const res = await docsGET(
      urlReq("http://localhost/api/estimates/x/design/documents?type=lld"),
      { params: { id: "intake-1" } },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not generated/);
  });

  describe("streaming", () => {
    let docxTmp: string;
    let docxPath: string;

    beforeEach(async () => {
      docxTmp = await mkdtemp(join(tmpdir(), "bomatic-docs-"));
      docxPath = join(docxTmp, "Acme-Refresh-hld.docx");
      // Minimal valid PK-zip header (DOCX is a zip).
      const PK_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]);
      await writeFile(docxPath, PK_BYTES);
    });

    afterAll(async () => {
      if (docxTmp) await rm(docxTmp, { recursive: true, force: true });
    });

    it("streams DOCX bytes for HLD with the correct content-type and disposition", async () => {
      mockResolve.mockResolvedValue(resolved);
      mockLoadState.mockResolvedValue({
        phase: "hld_complete",
        hldDocxPath: docxPath,
        updatedAt: "t0",
      });
      const res = await docsGET(
        urlReq("http://localhost/api/estimates/x/design/documents?type=hld"),
        { params: { id: "intake-1" } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
      expect(res.headers.get("Content-Disposition")).toMatch(/\.docx/);
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf[0]).toBe(0x50); // 'P'
      expect(buf[1]).toBe(0x4b); // 'K'
    });

    it("returns XML for diagram type with application/xml content-type", async () => {
      mockResolve.mockResolvedValue(resolved);
      mockLoadState.mockResolvedValue({
        phase: "hld_complete",
        diagramXml: "<mxfile><diagram/></mxfile>",
        updatedAt: "t0",
      });
      const res = await docsGET(
        urlReq("http://localhost/api/estimates/x/design/documents?type=diagram"),
        { params: { id: "intake-1" } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/xml");
      expect(res.headers.get("Content-Disposition")).toMatch(/diagram\.drawio\.xml/);
      const text = await res.text();
      expect(text).toBe("<mxfile><diagram/></mxfile>");
    });

    it("returns 404 when the docx file is missing from disk", async () => {
      mockResolve.mockResolvedValue(resolved);
      mockLoadState.mockResolvedValue({
        phase: "hld_complete",
        hldDocxPath: join(docxTmp, "does-not-exist.docx"),
        updatedAt: "t0",
      });
      const res = await docsGET(
        urlReq("http://localhost/api/estimates/x/design/documents?type=hld"),
        { params: { id: "intake-1" } },
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found on disk/);
    });
  });
});
