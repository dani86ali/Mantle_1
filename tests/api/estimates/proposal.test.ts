import { describe, it, expect, vi, beforeEach } from "vitest";
import type { E3Output } from "@/engines/e3/orchestrator";

const { mockLoadArtifacts, mockSelect } = vi.hoisted(() => ({
  mockLoadArtifacts: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/db/pipeline-store", () => ({
  loadArtifacts: mockLoadArtifacts,
}));

vi.mock("@/lib/db/index", () => ({
  db: {
    select(projection: Record<string, unknown>) {
      mockSelect(projection);
      return {
        from(_t: unknown) {
          return {
            innerJoin(..._a: unknown[]) {
              return {
                where(..._w: unknown[]) {
                  return { async limit(_n: number) { return []; } };
                },
              };
            },
            where(..._w: unknown[]) {
              return { async limit(_n: number) { return mockSelect.mock.results[mockSelect.mock.results.length - 1].value ?? []; } };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bomDrafts: { intakeId: { name: "intake_id" }, id: { name: "id" } },
  intakes: { id: { name: "id" } },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, eq: (col: unknown, val: unknown) => ({ col, val }) };
});

import { GET } from "@/app/api/estimates/[id]/proposal/route";
import { NextRequest } from "next/server";

function makeE3(): E3Output {
  return {
    sections: [
      { id: 0, title: "Cover", slug: "cover_page", content: "x", generationMethod: "deterministic", status: "generated" },
    ],
    tiers: { tiers: [{ name: "good" }, { name: "better" }, { name: "best" }], comparison: [] } as unknown as E3Output["tiers"],
    margin: {
      totalCost: 100, totalSell: 200, grossMargin: 100, grossMarginPct: 0.5,
      hardwareMarginPct: 0.5, servicesMarginPct: 0.5, servicesAttachRate: 0.5,
      approvalLevel: "presales_lead", requiresStrategicJustification: false, flags: [],
    },
    proposalPath: "/tmp/p.docx",
    financialPath: "/tmp/p.xlsx",
    warnings: [],
  };
}

function req(): NextRequest {
  return { url: "http://localhost/x" } as unknown as NextRequest;
}

beforeEach(() => {
  mockLoadArtifacts.mockReset();
  mockSelect.mockReset();
  // Default: id resolves as an intake (no draft, then intake by id).
  mockSelect.mockReturnValueOnce([]).mockReturnValueOnce([{ id: "intake-1" }]);
});

describe("GET /api/estimates/[id]/proposal", () => {
  it("returns sections, tiers, margin, and download paths", async () => {
    mockLoadArtifacts.mockResolvedValue({ e3: makeE3() });

    const res = await GET(req(), { params: { id: "intake-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toHaveLength(1);
    expect(body.tiers.tiers).toHaveLength(3);
    expect(body.margin.totalCost).toBe(100);
    expect(body.downloads.proposalDocx).toBe("/tmp/p.docx");
    expect(body.downloads.financialXlsx).toBe("/tmp/p.xlsx");
  });

  it("returns 400 when proposal has not been generated", async () => {
    mockLoadArtifacts.mockResolvedValue({});

    const res = await GET(req(), { params: { id: "intake-1" } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Proposal not generated/);
  });

  it("returns 404 when the estimate id does not resolve", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce([]).mockReturnValueOnce([]);

    const res = await GET(req(), { params: { id: "unknown" } });
    expect(res.status).toBe(404);
  });
});
