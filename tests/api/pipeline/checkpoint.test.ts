import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineState } from "@/coordinator/types";

const { mockLoad, mockSave, mockResume } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSave: vi.fn(),
  mockResume: vi.fn(),
}));

vi.mock("@/lib/db/pipeline-store", () => ({
  loadPipelineStateForTenant: mockLoad,
  savePipelineState: mockSave,
}));

vi.mock("@/coordinator/run-and-persist", () => ({
  resumeAndPersistPipeline: mockResume,
}));

import { POST } from "@/app/api/pipeline/[id]/checkpoint/route";
import { NextRequest } from "next/server";

function req(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function makeState(): PipelineState {
  const now = new Date();
  return {
    id: "pipe-1",
    opportunityId: "opp-1",
    mode: "rfp",
    currentEngine: "e1",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [
      {
        id: "e1-requirements", engine: "e1", label: "Requirements baseline review",
        status: "pending", revisionsUsed: 0,
      },
      {
        id: "e1-compliance", engine: "e1", label: "Compliance matrix review",
        status: "pending", revisionsUsed: 0,
      },
      {
        id: "e2-sku-confirmation", engine: "e2", label: "SKU confirmation",
        status: "pending", revisionsUsed: 0,
      },
    ],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

beforeEach(() => {
  mockLoad.mockReset();
  mockSave.mockReset();
  mockResume.mockReset();
  mockSave.mockResolvedValue(undefined);
  mockResume.mockResolvedValue(undefined);
});

describe("POST /api/pipeline/[id]/checkpoint", () => {
  it("updates only the specified checkpoint when checkpointId is provided", async () => {
    const state = makeState();
    mockLoad.mockResolvedValue(state);

    const res = await POST(
      req({ checkpointId: "e1-compliance", status: "approved", notes: "looks good" }),
      { params: { id: "pipe-1" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkpoint.id).toBe("e1-compliance");
    expect(body.checkpoint.status).toBe("approved");
    expect(body.checkpoint.revisionNotes).toBe("looks good");

    // The other two checkpoints remain untouched.
    expect(state.checkpoints.find((c) => c.id === "e1-requirements")!.status).toBe("pending");
    expect(state.checkpoints.find((c) => c.id === "e2-sku-confirmation")!.status).toBe("pending");
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("falls back to the latest checkpoint when checkpointId is omitted (backward compat)", async () => {
    const state = makeState();
    mockLoad.mockResolvedValue(state);

    const res = await POST(
      req({ status: "revision_requested", notes: "pricing wrong" }),
      { params: { id: "pipe-1" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // Latest = last array element = e2-sku-confirmation.
    expect(body.checkpoint.id).toBe("e2-sku-confirmation");
    expect(body.checkpoint.status).toBe("revision_requested");
    expect(state.checkpoints.find((c) => c.id === "e1-requirements")!.status).toBe("pending");
    expect(state.checkpoints.find((c) => c.id === "e1-compliance")!.status).toBe("pending");
  });

  it("returns 400 when checkpointId does not match any checkpoint", async () => {
    const state = makeState();
    // Remove e1-compliance so the (otherwise-valid) id is not on this pipeline.
    state.checkpoints = state.checkpoints.filter((c) => c.id !== "e1-compliance");
    mockLoad.mockResolvedValue(state);

    const res = await POST(
      req({ checkpointId: "e1-compliance", status: "approved" }),
      { params: { id: "pipe-1" } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns 400 when checkpointId is not one of the allowed values", async () => {
    mockLoad.mockResolvedValue(makeState());

    const res = await POST(
      req({ checkpointId: "bogus", status: "approved" }),
      { params: { id: "pipe-1" } }
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when the pipeline does not exist", async () => {
    mockLoad.mockResolvedValue(null);

    const res = await POST(
      req({ status: "approved" }),
      { params: { id: "missing" } }
    );

    expect(res.status).toBe(404);
  });
});

// ─── allowlist coverage for engines beyond E1/E2/E3 ──────────────────────
// P4 added E5 to the RFP sequence and exposed a latent gap: the route's
// VALID_CHECKPOINT_IDS allowlist hard-coded only e1/e2/e3 ids, so approving
// any e5-* or e4-* checkpoint failed Zod validation and returned 400 —
// leaving the operator with no way to advance past those engines.

function makeStateWithCheckpoint(id: string, engine: PipelineState["currentEngine"]): PipelineState {
  const now = new Date();
  return {
    id: "pipe-x",
    opportunityId: "opp-x",
    mode: "rfp",
    currentEngine: engine,
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [
      { id, engine, label: id, status: "pending", revisionsUsed: 0 },
    ],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

describe("POST /api/pipeline/[id]/checkpoint — full allowlist coverage", () => {
  it.each([
    ["e4-questionnaire", "e4"],
    ["e4-baseline", "e4"],
    ["e5-design-approach", "e5"],
    ["e5-hld", "e5"],
  ] as const)("accepts approval for %s without 400", async (id, engine) => {
    mockLoad.mockResolvedValue(makeStateWithCheckpoint(id, engine));

    const res = await POST(
      req({ checkpointId: id, status: "approved" }),
      { params: { id: "pipe-x" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkpoint.id).toBe(id);
    expect(body.checkpoint.status).toBe("approved");
  });
});

describe("POST /api/pipeline/[id]/checkpoint — auto-resume advancement signal", () => {
  it("returns advancing:true and fires resume when all engine checkpoints approve", async () => {
    const now = new Date();
    const state: PipelineState = {
      id: "pipe-adv",
      opportunityId: "intake:abc",
      intakeId: "abc",
      mode: "rfp",
      currentEngine: "e1",
      status: "paused_at_checkpoint",
      artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
      checkpoints: [
        {
          id: "e1-requirements", engine: "e1", label: "Requirements baseline review",
          status: "approved", revisionsUsed: 0, decidedAt: now,
        },
        {
          id: "e1-compliance", engine: "e1", label: "Compliance matrix review",
          status: "pending", revisionsUsed: 0,
        },
      ],
      engineCalls: [],
      timestamps: { createdAt: now, updatedAt: now },
    };
    mockLoad.mockResolvedValue(state);

    const res = await POST(
      req({ checkpointId: "e1-compliance", status: "approved" }),
      { params: { id: "pipe-adv" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.advancing).toBe(true);
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockResume).toHaveBeenCalledWith(
      expect.any(String), // tenantId
      "abc",
    );
  });

  it("returns advancing:false when only some engine checkpoints are approved", async () => {
    const now = new Date();
    const state: PipelineState = {
      id: "pipe-partial",
      opportunityId: "intake:def",
      intakeId: "def",
      mode: "rfp",
      currentEngine: "e1",
      status: "paused_at_checkpoint",
      artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
      checkpoints: [
        {
          id: "e1-requirements", engine: "e1", label: "Requirements baseline review",
          status: "pending", revisionsUsed: 0,
        },
        {
          id: "e1-compliance", engine: "e1", label: "Compliance matrix review",
          status: "pending", revisionsUsed: 0,
        },
      ],
      engineCalls: [],
      timestamps: { createdAt: now, updatedAt: now },
    };
    mockLoad.mockResolvedValue(state);

    const res = await POST(
      req({ checkpointId: "e1-requirements", status: "approved" }),
      { params: { id: "pipe-partial" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.advancing).toBe(false);
    expect(mockResume).not.toHaveBeenCalled();
  });
});
