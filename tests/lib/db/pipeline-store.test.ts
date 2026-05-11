import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuid } from "uuid";

// ─── In-memory fake db (matches the chained calls used in pipeline-store) ──

interface Row {
  id: string;
  opportunityId: string;
  intakeId: string | null;
  state: unknown;
  e1Artifacts: unknown;
  e2Artifacts: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const { rows, mockDb } = vi.hoisted(() => {
  const rows = new Map<string, Row>();

  const emptyRow = (): Row => ({
    id: "", opportunityId: "", intakeId: null,
    state: null, e1Artifacts: null, e2Artifacts: null,
    status: "pending", createdAt: new Date(), updatedAt: new Date(),
  });

  const findByIntake = (intakeId: string): Row | undefined =>
    Array.from(rows.values()).find((r) => r.intakeId === intakeId);

  const mockDb = {
    insert(_table: unknown) {
      return {
        values(v: Partial<Row>) {
          return {
            async onConflictDoUpdate(opts: {
              target: { name: string };
              set: Partial<Row>;
            }) {
              const target = opts.target.name;
              // Simulate jsonb roundtrip — stored values lose their class identity.
              const serialize = (o: Record<string, unknown>): Record<string, unknown> =>
                JSON.parse(JSON.stringify(o));
              if (target === "id") {
                const existing = rows.get(v.id!);
                if (existing) Object.assign(existing, serialize(opts.set as Record<string, unknown>));
                else rows.set(v.id!, { ...emptyRow(), ...serialize(v as Record<string, unknown>) } as Row);
              } else if (target === "intake_id") {
                const existing = findByIntake(v.intakeId!);
                if (existing) Object.assign(existing, serialize(opts.set as Record<string, unknown>));
                else rows.set(v.id!, { ...emptyRow(), ...serialize(v as Record<string, unknown>) } as Row);
              }
            },
          };
        },
      };
    },
    select(projection?: Record<string, { name: string }>) {
      return {
        from(_table: unknown) {
          return {
            where(predicate: { __eq: true; col: { name: string }; val: unknown }) {
              return {
                async limit(_n: number) {
                  const colMap: Record<string, keyof Row> = {
                    id: "id",
                    intake_id: "intakeId",
                    opportunity_id: "opportunityId",
                    state: "state",
                    e1_artifacts: "e1Artifacts",
                    e2_artifacts: "e2Artifacts",
                    status: "status",
                    created_at: "createdAt",
                    updated_at: "updatedAt",
                  };
                  const field = colMap[predicate.col.name];
                  const matches = Array.from(rows.values())
                    .filter((r) => r[field] === predicate.val)
                    .slice(0, _n);
                  if (!projection) return matches;
                  return matches.map((r) => {
                    const out: Record<string, unknown> = {};
                    for (const [alias, col] of Object.entries(projection)) {
                      const fld = colMap[col.name] ?? (col.name as keyof Row);
                      out[alias] = r[fld as keyof Row];
                    }
                    return out;
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { rows, mockDb };
});

vi.mock("@/lib/db/index", () => ({ db: mockDb }));
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ __eq: true, col, val }),
  };
});

import {
  savePipelineState,
  loadPipelineState,
  saveE1Artifacts,
  saveE2Artifacts,
  loadArtifacts,
} from "@/lib/db/pipeline-store";
import type { PipelineState } from "@/coordinator/types";
import type { E1Output } from "@/engines/e1/orchestrator";
import type { E2Output } from "@/engines/e2/orchestrator";

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  const now = new Date("2026-05-10T10:00:00Z");
  return {
    id: uuid(),
    opportunityId: "opp-test-1",
    mode: "rfp",
    currentEngine: "e1",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
    ...overrides,
  };
}

function makeE1Output(): E1Output {
  return {
    fileClassifications: [],
    missingDocuments: [],
    requirements: [],
    riskFlags: [
      { category: "disqualification", pattern: "p", matchedText: "m", severity: "critical", source: "s" },
    ],
    deadlines: [],
    evalCriteria: { methodology: "unknown", envelopes: [], iktvaRequired: false, source: "test" },
    vendorPreferences: [],
    sectorDetection: { sector: "oil_and_gas", confidence: 0.9, method: "client_lookup", evidence: "e" },
    frameworks: [],
    complianceMatrix: {
      rows: [],
      gaps: { coverageGaps: [], orphanRequirements: [] },
      stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 },
    },
    clarifications: { questions: [], stats: { total: 0, critical: 0, important: 0, niceToHave: 0 } },
    stats: { totalFiles: 0, totalRequirements: 0, mandatoryCount: 0, criticalRisks: 1 },
  };
}

function makeE2Output(): E2Output {
  return {
    bom: [],
    validationResults: [],
    anomalies: { anomalies: [], riskLevel: "low", summary: "ok" },
    totals: {
      hardwareTotal: 100, softwareTotal: 50, serviceTotal: 25, subscriptionTotal: 25,
      grandTotalExVat: 200, vatAmount: 30, grandTotalIncVat: 230,
    },
  };
}

beforeEach(() => {
  rows.clear();
});

describe("pipeline-store", () => {
  describe("savePipelineState / loadPipelineState", () => {
    it("round-trips a freshly created pipeline state", async () => {
      const state = makeState();
      await savePipelineState(state);
      const loaded = await loadPipelineState(state.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(state.id);
      expect(loaded!.opportunityId).toBe(state.opportunityId);
      expect(loaded!.mode).toBe("rfp");
      expect(loaded!.timestamps.createdAt).toBeInstanceOf(Date);
      expect(loaded!.timestamps.createdAt.toISOString()).toBe(
        state.timestamps.createdAt.toISOString(),
      );
    });

    it("upserts: a second save with same id overwrites", async () => {
      const state = makeState();
      await savePipelineState(state);

      state.currentEngine = "e2";
      state.engineCalls.push({
        id: "call-1", engine: "e1", step: "run", model: "n/a",
        startedAt: new Date("2026-05-10T10:01:00Z"),
        completedAt: new Date("2026-05-10T10:02:00Z"),
        retryCount: 0, outcome: "pass",
      });
      await savePipelineState(state);

      const loaded = await loadPipelineState(state.id);
      expect(loaded!.currentEngine).toBe("e2");
      expect(loaded!.engineCalls).toHaveLength(1);
      expect(loaded!.engineCalls[0].startedAt).toBeInstanceOf(Date);
      expect(loaded!.engineCalls[0].completedAt).toBeInstanceOf(Date);
    });

    it("returns null for unknown pipeline id", async () => {
      const loaded = await loadPipelineState(uuid());
      expect(loaded).toBeNull();
    });

    it("marks status as completed when timestamps.completedAt is set", async () => {
      const state = makeState({
        timestamps: {
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await savePipelineState(state);
      // status is internal — verify via the in-memory row
      const stored = rows.get(state.id)!;
      expect(stored.status).toBe("completed");
    });
  });

  describe("saveE1Artifacts / saveE2Artifacts / loadArtifacts", () => {
    it("round-trips E1 output by intakeId", async () => {
      const intakeId = uuid();
      const e1 = makeE1Output();
      await saveE1Artifacts(intakeId, e1);

      const loaded = await loadArtifacts(intakeId);
      expect(loaded.e1).toBeDefined();
      expect(loaded.e1!.sectorDetection.sector).toBe("oil_and_gas");
      expect(loaded.e1!.stats.criticalRisks).toBe(1);
      expect(loaded.e2).toBeUndefined();
    });

    it("round-trips E2 output by intakeId", async () => {
      const intakeId = uuid();
      const e2 = makeE2Output();
      await saveE2Artifacts(intakeId, e2);

      const loaded = await loadArtifacts(intakeId);
      expect(loaded.e2).toBeDefined();
      expect(loaded.e2!.totals.grandTotalIncVat).toBe(230);
      expect(loaded.e1).toBeUndefined();
    });

    it("E1 then E2 saves merge into one row keyed by intakeId", async () => {
      const intakeId = uuid();
      await saveE1Artifacts(intakeId, makeE1Output());
      await saveE2Artifacts(intakeId, makeE2Output());

      const loaded = await loadArtifacts(intakeId);
      expect(loaded.e1).toBeDefined();
      expect(loaded.e2).toBeDefined();
      expect(loaded.e1!.sectorDetection.sector).toBe("oil_and_gas");
      expect(loaded.e2!.totals.grandTotalIncVat).toBe(230);
    });

    it("returns empty object for unknown intakeId", async () => {
      const loaded = await loadArtifacts(uuid());
      expect(loaded).toEqual({});
    });

    it("re-saving E1 for same intakeId overwrites prior artifact", async () => {
      const intakeId = uuid();
      await saveE1Artifacts(intakeId, makeE1Output());

      const updated = makeE1Output();
      updated.stats.criticalRisks = 99;
      await saveE1Artifacts(intakeId, updated);

      const loaded = await loadArtifacts(intakeId);
      expect(loaded.e1!.stats.criticalRisks).toBe(99);
    });
  });
});
