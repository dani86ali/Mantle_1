/**
 * Rerun-route fallback coverage — when intake yields no devices, rerunE2 must
 * fall back to state.artifacts.e5.componentList. This is the Fix #5 regression
 * guard: before the fix, the operator would see "Intake has no devices to
 * re-price" after an RFP flow because BoQ-tagged files don't contribute
 * intake-shape devices.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineState } from "@/coordinator/types";
import type { E2Input, E2Output } from "@/engines/e2/orchestrator";

const {
  mockLoadArtifacts,
  mockSavePipelineState,
  mockSaveE2Artifacts,
  mockRunE2,
  mockDevicesFromIntake,
  mockParseBomFromUploadedFiles,
  mockLoadListPrices,
  mockDb,
} = vi.hoisted(() => ({
  mockLoadArtifacts: vi.fn(),
  mockSavePipelineState: vi.fn(),
  mockSaveE2Artifacts: vi.fn(),
  mockRunE2: vi.fn(),
  mockDevicesFromIntake: vi.fn(),
  mockParseBomFromUploadedFiles: vi.fn(),
  mockLoadListPrices: vi.fn(),
  mockDb: { select: vi.fn() },
}));

vi.mock("@/lib/db/pipeline-store", () => ({
  loadArtifacts: mockLoadArtifacts,
  loadPipelineStateForTenant: vi.fn(),
  savePipelineState: mockSavePipelineState,
  saveE2Artifacts: mockSaveE2Artifacts,
}));

vi.mock("@/engines/e2/orchestrator", () => ({
  runE2: mockRunE2,
}));

vi.mock("@/coordinator/intake-to-e2", () => ({
  devicesFromIntake: mockDevicesFromIntake,
  parseBomFromUploadedFiles: mockParseBomFromUploadedFiles,
}));

vi.mock("@/coordinator/pipeline-e2-pricing", () => ({
  collectCiscoSkus: (devices: { model: string }[]) => devices.map((d) => d.model),
  loadListPrices: mockLoadListPrices,
}));

vi.mock("@/lib/db/index", () => ({
  db: mockDb,
}));

import { rerunE2 } from "@/app/api/pipeline/[id]/rerun/_rerun-e2";

const PRICING = {
  fxRate: 3.75,
  partnerDiscountPct: 0.1,
  dealRegDiscountPct: 0.05,
  profitMode: "margin" as const,
  profitPct: 0.2,
  vatRate: 0.15,
  country: "SA",
};

function makeState(opts: { componentList?: string }): PipelineState {
  const now = new Date();
  return {
    id: "pipe-1",
    opportunityId: "intake:intake-1",
    intakeId: "intake-1",
    mode: "rfp",
    currentEngine: "e2",
    artifacts: {
      e1: {},
      e2: {},
      e3: {},
      e4: {},
      e5: opts.componentList ? { componentList: opts.componentList } : {},
    },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

const e2OutputStub: E2Output = {
  bom: [],
  totals: {
    listTotalUsd: 0, netTotalUsd: 0, costTotalSar: 0,
    profitTotalSar: 0, grandTotalExVat: 0, vat: 0, grandTotalIncVat: 0,
  },
  validationStatus: "passed",
  validationWarnings: [],
} as unknown as E2Output;

beforeEach(() => {
  mockLoadArtifacts.mockReset().mockResolvedValue({});
  mockSavePipelineState.mockReset().mockResolvedValue(undefined);
  mockSaveE2Artifacts.mockReset().mockResolvedValue(undefined);
  mockRunE2.mockReset().mockResolvedValue(e2OutputStub);
  mockDevicesFromIntake.mockReset().mockReturnValue([]);
  mockParseBomFromUploadedFiles.mockReset().mockResolvedValue([]);
  mockLoadListPrices.mockReset().mockResolvedValue({ listPrices: {}, warnings: [] });
  // The intake-row lookup at the bottom of the route — return an empty req
  // so devicesFromIntake (mocked above) is the deciding source.
  mockDb.select = vi.fn().mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ requirementsJson: {} }],
      }),
    }),
  });
});

describe("rerunE2 — fallback to state.artifacts.e5.componentList (Fix #5)", () => {
  it("uses E5 componentList when intake yields no devices", async () => {
    const cl = JSON.stringify([
      { model: "C9300-48P-A", vendor: "cisco", quantity: 2, role: "access", fromDesignStep: "sizing-calculator" },
    ]);
    const state = makeState({ componentList: cl });

    await rerunE2(state, "tenant-1", PRICING);

    expect(mockRunE2).toHaveBeenCalledTimes(1);
    const e2Input = mockRunE2.mock.calls[0][0] as E2Input;
    expect(e2Input.devices).toHaveLength(1);
    expect(e2Input.devices[0].model).toBe("C9300-48P-A");
    expect(e2Input.devices[0].qty).toBe(2);
  });

  it("does NOT invoke runE2 when neither intake nor componentList yields devices", async () => {
    const state = makeState({}); // no e5 componentList

    await rerunE2(state, "tenant-1", PRICING);

    // rerunE2 swallows the error via console.error — assert via side-effect.
    expect(mockRunE2).not.toHaveBeenCalled();
  });
});
