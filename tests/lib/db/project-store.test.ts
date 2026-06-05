import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory fake db ─────────────────────────────────────────────────────
// Mirrors only the chained calls project-store uses:
//   db.transaction(cb) -> resolves cb's return value
//   tx.insert(table).values(v).returning()
//   db.select().from(table).where(pred).limit(n) | .orderBy(order)
//
// Table routing is heuristic because the mock never inspects the Drizzle table
// object: an insert of an ARRAY is the bulk project_stages insert, a single
// object is the project insert. A select whose predicate references the
// `project_id` column is a stages query, otherwise a projects query. Both hold
// for the only two queries this module issues; revisit if either grows.

interface StoredProject {
  id: string;
  tenantId: string;
  name: string;
  customerName: string | null;
  mode: string;
  pricingConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
}
interface StoredStage {
  id: string;
  projectId: string;
  tenantId: string;
  stageId: string;
  stageOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const { store, mockDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    projects: [] as StoredProject[],
    stages: [] as StoredStage[],
    projectInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    stage_order: "stageOrder",
  };

  type Cond = { name: string; val: unknown };
  type Pred =
    | { type: "and"; conds: Pred[] }
    | { type: "eq"; col: { name: string }; val: unknown };

  const flatten = (pred: Pred): Cond[] => {
    if (pred.type === "and") return pred.conds.flatMap(flatten);
    return [{ name: pred.col.name, val: pred.val }];
  };

  const insertApi = {
    insert(_table: unknown) {
      return {
        values(v: Record<string, unknown> | Record<string, unknown>[]) {
          return {
            async returning() {
              if (Array.isArray(v)) {
                const inserted: StoredStage[] = v.map((s) => ({
                  ...(s as unknown as StoredStage),
                  id: (s.id as string) ?? genId("stage"),
                }));
                store.stages.push(...inserted);
                return inserted;
              }
              store.projectInserts.push(v);
              const now = new Date();
              const row: StoredProject = {
                id: (v.id as string) ?? genId("project"),
                tenantId: v.tenantId as string,
                name: v.name as string,
                customerName: (v.customerName as string) ?? null,
                mode: v.mode as string,
                pricingConfig: v.pricingConfig ?? null,
                createdAt: (v.createdAt as Date) ?? now,
                updatedAt: (v.updatedAt as Date) ?? now,
              };
              store.projects.push(row);
              return [row];
            },
          };
        },
      };
    },
  };

  const mockDb: any = {
    ...insertApi,
    async transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(mockDb);
    },
    select() {
      return {
        from(_table: unknown) {
          return {
            where(pred: Pred) {
              const conds = flatten(pred);
              const isStages = conds.some((c) => c.name === "project_id");
              const source = (isStages
                ? store.stages
                : store.projects) as unknown as Array<Record<string, unknown>>;
              const filtered = source.filter((row) =>
                conds.every((c) => row[colMap[c.name]] === c.val)
              );
              return {
                async limit(n: number) {
                  return filtered.slice(0, n);
                },
                async orderBy(order: { col: { name: string } }) {
                  const field = colMap[order.col.name];
                  return [...filtered].sort(
                    (a, b) => (a[field] as number) - (b[field] as number)
                  );
                },
              };
            },
          };
        },
      };
    },
  };

  return { store, mockDb };
});

vi.mock("@/lib/db/index", () => ({ db: mockDb }));
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm"
  );
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ type: "eq", col, val }),
    and: (...conds: unknown[]) => ({ type: "and", conds }),
    asc: (col: { name: string }) => ({ type: "asc", col }),
  };
});

import * as store_module from "@/lib/db/project-store";
import { createProject, getProjectById } from "@/lib/db/project-store";
import type { CreateProjectInput } from "@/lib/db/project-store";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";

const QUICK_BOM_ACTIVE = [
  "boq_format_validation",
  "sku_resolution",
  "configuration_expansion_review",
  "boq_pricing_review",
  "export_approval",
];
const RFP_ACTIVE = [
  "intake_package_review",
  "requirements_baseline_review",
  "compliance_matrix_review",
  "hld_design_delta_review",
  "boq_pricing_review",
  "proposal_review",
  "export_approval",
];
const QUICK_BOM_ONLY = [
  "boq_format_validation",
  "sku_resolution",
  "configuration_expansion_review",
];

beforeEach(() => {
  store.projects.length = 0;
  store.stages.length = 0;
  store.projectInserts.length = 0;
});

describe("createProject", () => {
  it("inserts one project row with tenantId, name, mode, customerName, pricingConfig", async () => {
    await createProject({
      tenantId: TENANT,
      name: "STC Core Refresh",
      mode: "quick_bom",
      customerName: "STC",
      pricingConfig: {
        currency: "SAR",
        mode: "margin",
        ratePercent: 20,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    });

    expect(store.projectInserts).toHaveLength(1);
    expect(store.projects).toHaveLength(1);
    expect(store.projectInserts[0]).toMatchObject({
      tenantId: TENANT,
      name: "STC Core Refresh",
      mode: "quick_bom",
      customerName: "STC",
      pricingConfig: { currency: "SAR", mode: "margin", ratePercent: 20 },
    });
  });

  it("materializes stages using the inserted project id and tenant id", async () => {
    const project = await createProject({
      tenantId: TENANT,
      name: "P",
      mode: "rfp",
    });

    expect(store.stages.length).toBeGreaterThan(0);
    for (const stage of store.stages) {
      expect(stage.projectId).toBe(project.id);
      expect(stage.tenantId).toBe(TENANT);
    }
  });

  it("quick_bom defaults to only active stages in canonical order", async () => {
    const project = await createProject({
      tenantId: TENANT,
      name: "Quick",
      mode: "quick_bom",
    });

    expect(project.stages.map((s) => s.stageId)).toEqual(QUICK_BOM_ACTIVE);
    expect(project.stages.every((s) => s.status === "not_started")).toBe(true);
  });

  it("with includeNotApplicableStages true inserts all canonical stages and marks inactive ones not_applicable", async () => {
    const project = await createProject({
      tenantId: TENANT,
      name: "Quick Full",
      mode: "quick_bom",
      includeNotApplicableStages: true,
    });

    expect(project.stages).toHaveLength(10);
    const active = project.stages.filter((s) => s.status !== "not_applicable");
    const inactive = project.stages.filter(
      (s) => s.status === "not_applicable"
    );
    expect(active.map((s) => s.stageId)).toEqual(QUICK_BOM_ACTIVE);
    expect(active.every((s) => s.status === "not_started")).toBe(true);
    // Every RFP-only stage is present and marked not_applicable.
    expect(inactive.map((s) => s.stageId).sort()).toEqual(
      [
        "compliance_matrix_review",
        "hld_design_delta_review",
        "intake_package_review",
        "proposal_review",
        "requirements_baseline_review",
      ].sort()
    );
  });

  it("rfp inserts the canonical RFP active sequence and excludes quick_bom-only stages by default", async () => {
    const project = await createProject({
      tenantId: TENANT,
      name: "RFP",
      mode: "rfp",
    });

    expect(project.stages.map((s) => s.stageId)).toEqual(RFP_ACTIVE);
    for (const onlyStage of QUICK_BOM_ONLY) {
      expect(project.stages.find((s) => s.stageId === onlyStage)).toBeUndefined();
    }
  });

  it("returns a Project aggregate with empty files/evidence/artifacts/approvals", async () => {
    const project = await createProject({
      tenantId: TENANT,
      name: "P",
      mode: "quick_bom",
    });

    expect(project.files).toEqual([]);
    expect(project.evidence).toEqual([]);
    expect(project.artifacts).toEqual([]);
    expect(project.approvals).toEqual([]);
    expect(project.customerName).toBeUndefined();
    expect(project.pricingConfig).toBeUndefined();
  });

  it("does not mutate its input object", async () => {
    const input: CreateProjectInput = {
      tenantId: TENANT,
      name: "P",
      mode: "rfp",
      customerName: "STC",
      pricingConfig: {
        currency: "SAR",
        mode: "markup",
        ratePercent: 12,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    };
    const snapshot = structuredClone(input);
    await createProject(input);
    expect(input).toEqual(snapshot);
  });
});

describe("getProjectById", () => {
  function seedProject(overrides: Partial<StoredProject> = {}): StoredProject {
    const now = new Date("2026-05-21T08:00:00Z");
    const row: StoredProject = {
      id: "proj-1",
      tenantId: TENANT,
      name: "Seeded",
      customerName: null,
      mode: "rfp",
      pricingConfig: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    store.projects.push(row);
    return row;
  }

  function seedStage(
    stageId: string,
    stageOrder: number,
    projectId = "proj-1",
    tenantId = TENANT
  ): void {
    const now = new Date("2026-05-21T08:00:00Z");
    store.stages.push({
      id: `stage-${stageId}`,
      projectId,
      tenantId,
      stageId,
      stageOrder,
      status: "not_started",
      createdAt: now,
      updatedAt: now,
    });
  }

  it("filters by tenantId and projectId", async () => {
    seedProject();
    seedStage("intake_package_review", 10);

    const project = await getProjectById(TENANT, "proj-1");
    expect(project).not.toBeNull();
    expect(project!.id).toBe("proj-1");
    expect(project!.tenantId).toBe(TENANT);
    expect(project!.stages).toHaveLength(1);
  });

  it("returns null for the wrong tenant", async () => {
    seedProject();
    seedStage("intake_package_review", 10);

    expect(await getProjectById(OTHER_TENANT, "proj-1")).toBeNull();
  });

  it("returns null for a missing project", async () => {
    expect(await getProjectById(TENANT, "does-not-exist")).toBeNull();
  });

  it("maps stageOrder to ProjectStage.order", async () => {
    seedProject();
    seedStage("boq_pricing_review", 70);

    const project = await getProjectById(TENANT, "proj-1");
    expect(project!.stages[0].order).toBe(70);
    expect(project!.stages[0].stageId).toBe("boq_pricing_review");
    // tenantId is not surfaced on child stage objects.
    expect("tenantId" in project!.stages[0]).toBe(false);
  });

  it("returns stages sorted by stage order", async () => {
    seedProject();
    seedStage("export_approval", 90);
    seedStage("intake_package_review", 10);
    seedStage("boq_pricing_review", 70);

    const project = await getProjectById(TENANT, "proj-1");
    expect(project!.stages.map((s) => s.order)).toEqual([10, 70, 90]);
  });

  it("scopes stages to the same tenant/project", async () => {
    seedProject();
    seedStage("intake_package_review", 10);
    // A stage belonging to another project/tenant must not leak in.
    seedStage("export_approval", 90, "proj-2", OTHER_TENANT);

    const project = await getProjectById(TENANT, "proj-1");
    expect(project!.stages).toHaveLength(1);
    expect(project!.stages[0].stageId).toBe("intake_package_review");
  });
});

describe("module surface", () => {
  it("does not expose updateProjectMode (mode is immutable)", () => {
    expect(
      (store_module as Record<string, unknown>).updateProjectMode
    ).toBeUndefined();
  });
});
