import { describe, it, expect } from "vitest";
import type { Checkpoint, PipelineState } from "@/coordinator/types";
import {
  applyCheckpointDecision,
  isCheckpointDecisionError,
} from "@/coordinator/checkpoint-decision";

function makeCheckpoint(
  id: string,
  engine: Checkpoint["engine"],
  status: Checkpoint["status"] = "pending",
): Checkpoint {
  return { id, engine, label: id, status, revisionsUsed: 0 };
}

function makeState(opts?: {
  checkpoints?: Checkpoint[];
  status?: PipelineState["status"];
  intakeId?: string;
}): PipelineState {
  const now = new Date();
  return {
    id: "pipe-test",
    opportunityId: "intake:ABC",
    intakeId: opts?.intakeId ?? "ABC",
    mode: "rfp",
    currentEngine: "e1",
    status: opts?.status ?? "paused_at_checkpoint",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: opts?.checkpoints ?? [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

describe("applyCheckpointDecision", () => {
  it("approves a checkpoint and flips status to 'running' when all engine checkpoints are now approved", () => {
    const state = makeState({
      checkpoints: [
        makeCheckpoint("e1-requirements", "e1", "approved"),
        makeCheckpoint("e1-compliance", "e1", "pending"),
      ],
    });

    const result = applyCheckpointDecision(state, "e1-compliance", "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return; // type narrow
    expect(result.willResume).toBe(true);
    expect(result.target.id).toBe("e1-compliance");
    expect(result.target.status).toBe("approved");
    expect(result.target.decidedAt).toBeInstanceOf(Date);
    expect(state.status).toBe("running");
  });

  it("approves but does not resume when other engine checkpoints remain pending", () => {
    const state = makeState({
      checkpoints: [
        makeCheckpoint("e1-requirements", "e1", "pending"),
        makeCheckpoint("e1-compliance", "e1", "pending"),
      ],
    });

    const result = applyCheckpointDecision(state, "e1-requirements", "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return;
    expect(result.willResume).toBe(false);
    expect(state.status).toBe("paused_at_checkpoint");
    expect(state.checkpoints.find((c) => c.id === "e1-compliance")!.status).toBe("pending");
  });

  it("does not resume on revision_requested even when the checkpoint exists", () => {
    const state = makeState({
      checkpoints: [makeCheckpoint("e5-lld", "e5", "pending")],
    });

    const result = applyCheckpointDecision(state, "e5-lld", "revision_requested", "fix subnets");

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return;
    expect(result.willResume).toBe(false);
    expect(result.target.status).toBe("revision_requested");
    expect(result.target.revisionNotes).toBe("fix subnets");
    expect(state.status).toBe("paused_at_checkpoint");
  });

  it("returns an error when the checkpointId is not on the pipeline", () => {
    const state = makeState({
      checkpoints: [makeCheckpoint("e1-requirements", "e1", "pending")],
    });

    const result = applyCheckpointDecision(state, "e5-lld", "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(true);
    if (!isCheckpointDecisionError(result)) return;
    expect(result.error).toMatch(/e5-lld.*not found/);
  });

  it("falls back to the last checkpoint when checkpointId is undefined", () => {
    const state = makeState({
      checkpoints: [
        makeCheckpoint("e1-requirements", "e1", "approved"),
        makeCheckpoint("e1-compliance", "e1", "pending"),
        makeCheckpoint("e2-sku-confirmation", "e2", "pending"),
      ],
    });

    const result = applyCheckpointDecision(state, undefined, "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return;
    expect(result.target.id).toBe("e2-sku-confirmation");
    // Only e2-sku-confirmation in engine 'e2' so it's the lone member — should resume.
    expect(result.willResume).toBe(true);
  });

  it("does not resume when pipeline is not paused", () => {
    const state = makeState({
      status: "running",
      checkpoints: [makeCheckpoint("e5-lld", "e5", "pending")],
    });

    const result = applyCheckpointDecision(state, "e5-lld", "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return;
    expect(result.willResume).toBe(false);
  });

  it("does not resume when pipeline has no intakeId", () => {
    const state = makeState({
      checkpoints: [makeCheckpoint("e5-lld", "e5", "pending")],
    });
    state.intakeId = undefined;

    const result = applyCheckpointDecision(state, "e5-lld", "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(false);
    if (isCheckpointDecisionError(result)) return;
    expect(result.willResume).toBe(false);
  });

  it("returns an error when called with undefined id on a checkpoint-less pipeline", () => {
    const state = makeState({ checkpoints: [] });

    const result = applyCheckpointDecision(state, undefined, "approved", undefined);

    expect(isCheckpointDecisionError(result)).toBe(true);
    if (!isCheckpointDecisionError(result)) return;
    expect(result.error).toMatch(/no checkpoints/i);
  });
});
