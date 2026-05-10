import { describe, it, expect } from "vitest";
import type {
  PipelineState,
  EngineInput,
  EngineOutput,
  Checkpoint,
  EngineCall,
  ArtifactRegistry,
  IntakeMode,
  EngineId,
  CheckpointStatus,
} from "@/coordinator/types";

function makeArtifacts(): ArtifactRegistry {
  return { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} };
}

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    id: "pipe-001",
    opportunityId: "opp-abc",
    mode: "rfp",
    currentEngine: "e1",
    artifacts: makeArtifacts(),
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: new Date("2026-05-09"), updatedAt: new Date("2026-05-09") },
    ...overrides,
  };
}

describe("PipelineState construction", () => {
  it("constructs with all required fields", () => {
    const state = makePipelineState();
    expect(state.id).toBe("pipe-001");
    expect(state.opportunityId).toBe("opp-abc");
    expect(state.mode).toBe("rfp");
    expect(state.currentEngine).toBe("e1");
    expect(state.artifacts).toBeDefined();
    expect(state.checkpoints).toEqual([]);
    expect(state.engineCalls).toEqual([]);
    expect(state.timestamps.createdAt).toBeInstanceOf(Date);
  });

  it("accepts rfp mode", () => {
    const state = makePipelineState({ mode: "rfp" });
    expect(state.mode).toBe("rfp");
  });

  it("accepts rfi mode", () => {
    const state = makePipelineState({ mode: "rfi" });
    expect(state.mode).toBe("rfi");
  });

  it("accepts all valid engine IDs as currentEngine", () => {
    const engines: EngineId[] = ["e1", "e2", "e3", "e4", "e5"];
    for (const engine of engines) {
      const state = makePipelineState({ currentEngine: engine });
      expect(state.currentEngine).toBe(engine);
    }
  });

  it("holds artifact registry with slots for all 5 engines", () => {
    const state = makePipelineState();
    expect(state.artifacts).toHaveProperty("e1");
    expect(state.artifacts).toHaveProperty("e2");
    expect(state.artifacts).toHaveProperty("e3");
    expect(state.artifacts).toHaveProperty("e4");
    expect(state.artifacts).toHaveProperty("e5");
  });

  it("stores e1 artifacts correctly", () => {
    const state = makePipelineState({
      artifacts: {
        ...makeArtifacts(),
        e1: {
          complianceMatrix: "s3://bucket/compliance.xlsx",
          requirementsBaseline: "s3://bucket/requirements.json",
          riskFlags: ["RF-001"],
          vendorList: ["Cisco", "Fortinet"],
          sector: "government",
        },
      },
    });
    expect(state.artifacts.e1.sector).toBe("government");
    expect(state.artifacts.e1.vendorList).toContain("Cisco");
  });

  it("stores e5 artifacts correctly", () => {
    const state = makePipelineState({
      artifacts: {
        ...makeArtifacts(),
        e5: {
          hldDocument: "s3://bucket/hld.docx",
          lldDocument: "s3://bucket/lld.docx",
          diagrams: ["s3://bucket/diagram1.xml"],
          ipVlanPlan: "s3://bucket/ip-plan.xlsx",
          componentList: "s3://bucket/components.json",
        },
      },
    });
    expect(state.artifacts.e5.hldDocument).toBeDefined();
    expect(state.artifacts.e5.diagrams).toHaveLength(1);
  });

  it("stores checkpoints with all fields", () => {
    const checkpoint: Checkpoint = {
      id: "cp-001",
      engine: "e1",
      label: "Confirm requirements",
      status: "approved",
      revisionsUsed: 1,
      revisionNotes: "Added missing section",
      decidedAt: new Date("2026-05-09"),
    };
    const state = makePipelineState({ checkpoints: [checkpoint] });
    expect(state.checkpoints[0].status).toBe("approved");
    expect(state.checkpoints[0].revisionsUsed).toBe(1);
  });

  it("accepts all valid CheckpointStatus values", () => {
    const statuses: CheckpointStatus[] = [
      "pending",
      "approved",
      "revision_requested",
      "rejected",
    ];
    for (const status of statuses) {
      const cp: Checkpoint = {
        id: "cp-x",
        engine: "e2",
        label: "Review BoM",
        status,
        revisionsUsed: 0,
      };
      expect(cp.status).toBe(status);
    }
  });

  it("stores engine calls with all fields", () => {
    const call: EngineCall = {
      id: "call-001",
      engine: "e1",
      step: "compliance_status_assignment",
      model: "claude-sonnet-4-6",
      startedAt: new Date("2026-05-09"),
      completedAt: new Date("2026-05-09"),
      retryCount: 0,
      outcome: "pass",
    };
    const state = makePipelineState({ engineCalls: [call] });
    expect(state.engineCalls[0].outcome).toBe("pass");
    expect(state.engineCalls[0].retryCount).toBe(0);
  });

  it("holds optional completedAt on timestamps", () => {
    const state = makePipelineState({
      timestamps: {
        createdAt: new Date("2026-05-09"),
        updatedAt: new Date("2026-05-09"),
        completedAt: new Date("2026-05-09"),
      },
    });
    expect(state.timestamps.completedAt).toBeInstanceOf(Date);
  });
});

describe("EngineInput construction", () => {
  it("constructs with all required fields", () => {
    const input: EngineInput = {
      engine: "e1",
      pipelineState: makePipelineState(),
      inputData: { files: ["rfp.pdf"] },
    };
    expect(input.engine).toBe("e1");
    expect(input.revisionNotes).toBeUndefined();
  });

  it("accepts optional revisionNotes", () => {
    const input: EngineInput = {
      engine: "e2",
      pipelineState: makePipelineState({ currentEngine: "e2" }),
      inputData: {},
      revisionNotes: "Fix SKU selections per engineer feedback",
    };
    expect(input.revisionNotes).toBeDefined();
  });
});

describe("EngineOutput construction", () => {
  it("constructs typed e1 output", () => {
    const output: EngineOutput<"e1"> = {
      engine: "e1",
      artifacts: { complianceMatrix: "s3://bucket/matrix.xlsx", sector: "telecom" },
      warnings: [],
    };
    expect(output.engine).toBe("e1");
    expect(output.artifacts.sector).toBe("telecom");
    expect(output.error).toBeUndefined();
  });

  it("carries warnings and error on failure", () => {
    const output: EngineOutput<"e3"> = {
      engine: "e3",
      artifacts: {},
      warnings: ["Client name not found in RFP"],
      error: "Executive summary generation failed after retry",
    };
    expect(output.warnings).toHaveLength(1);
    expect(output.error).toMatch(/retry/);
  });
});
