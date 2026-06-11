import { describe, it, expect, beforeEach, vi } from "vitest";

// --- In-memory fake db ------------------------------------------------------
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
  archivedAt: Date | null;
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
interface StoredArtifact {
  id: string;
  projectId: string;
  tenantId: string;
  type: string;
  status: string;
  version: number;
}

const { store, mockDb, withTenantDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    projects: [] as StoredProject[],
    stages: [] as StoredStage[],
    artifacts: [] as StoredArtifact[],
    projectInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    stage_order: "stageOrder",
    name: "name",
    mode: "mode",
    type: "type",
    version: "version",
    status: "status",
    archived_at: "archivedAt",
    created_at: "createdAt",
    updated_at: "updatedAt",
  };

  type Cond =
    | { op: "eq"; name: string; val: unknown }
    | { op: "isNull"; name: string }
    | { op: "isNotNull"; name: string };
  type Pred =
    | { type: "and"; conds: Pred[] }
    | { type: "eq"; col: { name: string }; val: unknown }
    | { type: "isNull"; col: { name: string } }
    | { type: "isNotNull"; col: { name: string } };

  const flatten = (pred: Pred): Cond[] => {
    if (pred.type === "and") return pred.conds.flatMap(flatten);
    if (pred.type === "isNull") return [{ op: "isNull", name: pred.col.name }];
    if (pred.type === "isNotNull") return [{ op: "isNotNull", name: pred.col.name }];
    return [{ op: "eq", name: pred.col.name, val: pred.val }];
  };

  const rowMatches = (row: Record<string, unknown>, c: Cond): boolean => {
    const field = colMap[c.name];
    const v = row[field];
    if (c.op === "isNull") return v === null || v === undefined;
    if (c.op === "isNotNull") return v !== null && v !== undefined;
    return v === c.val;
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
                archivedAt: (v.archivedAt as Date) ?? null,
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
    // Only project rows are updated by the store (archive/restore). The set values
    // are applied to every project row matching the where predicate.
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(pred: Pred) {
              const conds = flatten(pred);
              return {
                async returning() {
                  const matched = store.projects.filter((row) =>
                    conds.every((c) =>
                      rowMatches(row as unknown as Record<string, unknown>, c)
                    )
                  );
                  for (const row of matched) Object.assign(row, values);
                  return matched.map((row) => ({ id: row.id }));
                },
              };
            },
          };
        },
      };
    },
    select() {
      return {
        from(_table: unknown) {
          return {
            where(pred: Pred) {
              const conds = flatten(pred);
              const pickSource = (orderCol?: string) => {
                // A `type` predicate is unique to the project_artifacts query.
                const isArtifacts = conds.some((c) => c.name === "type");
                const isStages =
                  conds.some((c) => c.name === "project_id") ||
                  orderCol === "stage_order";
                const source = isArtifacts
                  ? store.artifacts
                  : isStages
                  ? store.stages
                  : store.projects;
                return source as unknown as Array<Record<string, unknown>>;
              };
              const filterRows = (source: Array<Record<string, unknown>>) =>
                source.filter((row) => conds.every((c) => rowMatches(row, c)));
              return {
                async limit(n: number) {
                  const filtered = filterRows(pickSource());
                  return filtered.slice(0, n);
                },
                async orderBy(order: { col: { name: string }; direction?: "asc" | "desc" }) {
                  const filtered = filterRows(pickSource(order.col.name));
                  const field = colMap[order.col.name];
                  return [...filtered].sort((a, b) => {
                    const av = a[field];
                    const bv = b[field];
                    const cmp =
                      av instanceof Date && bv instanceof Date
                        ? av.getTime() - bv.getTime()
                        : (av as number) - (bv as number);
                    return order.direction === "desc" ? -cmp : cmp;
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  // Records the tenant id each repository function opens its tenant-scoped
  // transaction with, then runs the callback against the in-memory mockDb (the
  // real helper would set app.tenant_id transaction-locally first).
  const withTenantDb = vi.fn(
    async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)
  );

  return { store, mockDb, withTenantDb };
});

vi.mock("@/lib/db/index", () => ({ db: mockDb, withTenantDb }));
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm"
  );
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ type: "eq", col, val }),
    isNull: (col: { name: string }) => ({ type: "isNull", col }),
    isNotNull: (col: { name: string }) => ({ type: "isNotNull", col }),
    and: (...conds: unknown[]) => ({ type: "and", conds }),
    asc: (col: { name: string }) => ({ type: "asc", direction: "asc", col }),
    desc: (col: { name: string }) => ({ type: "desc", direction: "desc", col }),
  };
});

import * as store_module from "@/lib/db/project-store";
import {
  createProject,
  getProjectById,
  listProjectSummaries,
  quickBomProjectNameExists,
  archiveProject,
  restoreProject,
} from "@/lib/db/project-store";
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
  store.artifacts.length = 0;
  store.projectInserts.length = 0;
  withTenantDb.mockClear();
});

describe("createProject", () => {
  it("opens a tenant-scoped transaction for the input tenant", async () => {
    await createProject({ tenantId: TENANT, name: "P", mode: "quick_bom" });
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

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
      archivedAt: null,
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

  it("opens a tenant-scoped transaction for the requested tenant", async () => {
    seedProject();
    seedStage("intake_package_review", 10);

    await getProjectById(TENANT, "proj-1");
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

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

describe("listProjectSummaries", () => {
  function seedProject(overrides: Partial<StoredProject>): StoredProject {
    const now = new Date("2026-05-21T08:00:00Z");
    const row: StoredProject = {
      id: "proj-list-1",
      tenantId: TENANT,
      name: "Quick BoM Project",
      customerName: "STC",
      mode: "quick_bom",
      pricingConfig: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    store.projects.push(row);
    return row;
  }

  function seedStage(input: {
    projectId: string;
    stageId: string;
    stageOrder: number;
    status: string;
    tenantId?: string;
  }): void {
    const now = new Date("2026-05-21T08:00:00Z");
    store.stages.push({
      id: `stage-${input.projectId}-${input.stageId}`,
      projectId: input.projectId,
      tenantId: input.tenantId ?? TENANT,
      stageId: input.stageId,
      stageOrder: input.stageOrder,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });
  }

  function seedArtifact(input: {
    projectId: string;
    type: string;
    status: string;
    version?: number;
    tenantId?: string;
  }): void {
    store.artifacts.push({
      id: `art-${input.projectId}-${input.type}-${input.version ?? 1}`,
      projectId: input.projectId,
      tenantId: input.tenantId ?? TENANT,
      type: input.type,
      status: input.status,
      version: input.version ?? 1,
    });
  }

  it("opens a tenant-scoped read and returns newest Projects first", async () => {
    seedProject({
      id: "old",
      name: "Old Project",
      updatedAt: new Date("2026-05-01T08:00:00Z"),
    });
    seedProject({
      id: "new",
      name: "New Project",
      updatedAt: new Date("2026-05-03T08:00:00Z"),
    });

    const rows = await listProjectSummaries(TENANT);

    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("filters by tenant and derives status from canonical project stages", async () => {
    seedProject({ id: "quick", name: "Quick", mode: "quick_bom" });
    seedProject({ id: "other-tenant", tenantId: OTHER_TENANT, name: "Other" });
    seedStage({
      projectId: "quick",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "approved",
    });
    seedStage({
      projectId: "quick",
      stageId: "sku_resolution",
      stageOrder: 30,
      status: "needs_review",
    });
    seedStage({
      projectId: "quick",
      stageId: "proposal_review",
      stageOrder: 80,
      status: "not_applicable",
    });
    seedStage({
      projectId: "other-tenant",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "approved",
      tenantId: OTHER_TENANT,
    });

    const rows = await listProjectSummaries(TENANT);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "quick",
      tenantId: TENANT,
      name: "Quick",
      customerName: "STC",
      mode: "quick_bom",
      status: "needs_review",
      activeStageId: "sku_resolution",
      activeStageStatus: "needs_review",
      stageCounts: {
        total: 2,
        approved: 1,
        needsReview: 1,
        inProgress: 0,
        blocked: 0,
        rejected: 0,
      },
    });
  });

  it("marks a Project approved only when every applicable stage is approved", async () => {
    seedProject({ id: "done", name: "Done" });
    seedStage({
      projectId: "done",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "approved",
    });
    seedStage({
      projectId: "done",
      stageId: "export_approval",
      stageOrder: 90,
      status: "approved",
    });

    const rows = await listProjectSummaries(TENANT);

    expect(rows[0].status).toBe("approved");
    expect(rows[0].activeStageId).toBe("export_approval");
  });

  it("counts boq_format_validation complete via a present non-stale normalized_boq (QBM-LOG-002A)", async () => {
    // Real-DB shape: the four downstream Quick BoM stages are approved, but the
    // raw boq_format_validation stage row is still not_started while a
    // normalized_boq artifact exists with status `generated`.
    seedProject({ id: "qbm-done", name: "Completed Quick BoM", mode: "quick_bom" });
    seedStage({
      projectId: "qbm-done",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "not_started",
    });
    seedStage({
      projectId: "qbm-done",
      stageId: "sku_resolution",
      stageOrder: 30,
      status: "approved",
    });
    seedStage({
      projectId: "qbm-done",
      stageId: "configuration_expansion_review",
      stageOrder: 35,
      status: "approved",
    });
    seedStage({
      projectId: "qbm-done",
      stageId: "boq_pricing_review",
      stageOrder: 70,
      status: "approved",
    });
    seedStage({
      projectId: "qbm-done",
      stageId: "export_approval",
      stageOrder: 90,
      status: "approved",
    });
    seedArtifact({ projectId: "qbm-done", type: "normalized_boq", status: "generated" });

    const rows = await listProjectSummaries(TENANT);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "qbm-done",
      status: "approved",
      activeStageId: "export_approval",
      activeStageStatus: "approved",
      stageCounts: {
        total: 5,
        approved: 5,
        needsReview: 0,
        inProgress: 0,
        blocked: 0,
        rejected: 0,
      },
    });
  });

  it("folds the normalized_boq gate but still surfaces a downstream needs_review", async () => {
    // Gate met (artifact generated) must not mask an explicit downstream signal.
    seedProject({ id: "qbm-review", name: "Mid Review Quick BoM", mode: "quick_bom" });
    seedStage({
      projectId: "qbm-review",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "not_started",
    });
    seedStage({
      projectId: "qbm-review",
      stageId: "sku_resolution",
      stageOrder: 30,
      status: "needs_review",
    });
    seedArtifact({ projectId: "qbm-review", type: "normalized_boq", status: "generated" });

    const rows = await listProjectSummaries(TENANT);

    expect(rows[0].status).toBe("needs_review");
    expect(rows[0].activeStageId).toBe("sku_resolution");
    // boq_format_validation still counts as approved via the folded gate.
    expect(rows[0].stageCounts.approved).toBe(1);
    expect(rows[0].stageCounts.needsReview).toBe(1);
  });

  it("does not fold the normalized_boq gate when the artifact is stale", async () => {
    seedProject({ id: "qbm-stale", name: "Stale Quick BoM", mode: "quick_bom" });
    seedStage({
      projectId: "qbm-stale",
      stageId: "boq_format_validation",
      stageOrder: 20,
      status: "not_started",
    });
    seedStage({
      projectId: "qbm-stale",
      stageId: "export_approval",
      stageOrder: 90,
      status: "approved",
    });
    // Latest version is stale; an older generated version must not rescue it.
    seedArtifact({ projectId: "qbm-stale", type: "normalized_boq", status: "generated", version: 1 });
    seedArtifact({ projectId: "qbm-stale", type: "normalized_boq", status: "stale", version: 2 });

    const rows = await listProjectSummaries(TENANT);

    expect(rows[0].status).toBe("in_progress");
    expect(rows[0].stageCounts.approved).toBe(1);
    expect(rows[0].activeStageId).toBe("boq_format_validation");
  });

  it("leaves RFP projects unaffected by normalized_boq folding", async () => {
    seedProject({ id: "rfp-1", name: "RFP", mode: "rfp" });
    seedStage({
      projectId: "rfp-1",
      stageId: "intake_package_review",
      stageOrder: 10,
      status: "not_started",
    });
    seedStage({
      projectId: "rfp-1",
      stageId: "export_approval",
      stageOrder: 90,
      status: "approved",
    });
    seedArtifact({ projectId: "rfp-1", type: "normalized_boq", status: "generated" });

    const rows = await listProjectSummaries(TENANT);

    expect(rows[0].status).toBe("in_progress");
    expect(rows[0].activeStageId).toBe("intake_package_review");
  });
});

describe("quickBomProjectNameExists (QBM-LOG-001)", () => {
  function seedProject(overrides: Partial<StoredProject>): void {
    const now = new Date("2026-05-21T08:00:00Z");
    store.projects.push({
      id: `proj-${store.projects.length + 1}`,
      tenantId: TENANT,
      name: "Quick BoM Project",
      customerName: null,
      mode: "quick_bom",
      pricingConfig: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  }

  it("opens a tenant-scoped read for the requested tenant", async () => {
    await quickBomProjectNameExists(TENANT, "Anything");
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it("returns true for an exact name match", async () => {
    seedProject({ name: "Honeywell Refresh" });
    expect(await quickBomProjectNameExists(TENANT, "Honeywell Refresh")).toBe(
      true
    );
  });

  it("normalizes trim, internal whitespace, and case when comparing", async () => {
    seedProject({ name: "Honeywell Refresh" });
    expect(
      await quickBomProjectNameExists(TENANT, "  honeywell   refresh ")
    ).toBe(true);
  });

  it("returns false when no Quick BoM project has that name", async () => {
    seedProject({ name: "Honeywell Refresh" });
    expect(await quickBomProjectNameExists(TENANT, "STC Core")).toBe(false);
  });

  it("is scoped to the tenant - a same-name project in another tenant does not match", async () => {
    seedProject({ name: "Shared Name", tenantId: OTHER_TENANT });
    expect(await quickBomProjectNameExists(TENANT, "Shared Name")).toBe(false);
  });

  it("is scoped to mode quick_bom - an RFP project with the same name does not match", async () => {
    seedProject({ name: "Shared Name", mode: "rfp" });
    expect(await quickBomProjectNameExists(TENANT, "Shared Name")).toBe(false);
  });

  it("treats a blank/whitespace name as not existing and does not open a read", async () => {
    seedProject({ name: "Honeywell Refresh" });
    expect(await quickBomProjectNameExists(TENANT, "   ")).toBe(false);
    expect(withTenantDb).not.toHaveBeenCalled();
  });
});

describe("archive filtering and archive/restore (QBM-LOG-006)", () => {
  const ARCHIVED_AT = new Date("2026-05-25T12:00:00Z");

  function seed(overrides: Partial<StoredProject>): StoredProject {
    const now = new Date("2026-05-21T08:00:00Z");
    const row: StoredProject = {
      id: `proj-${store.projects.length + 1}`,
      tenantId: TENANT,
      name: "Quick BoM Project",
      customerName: null,
      mode: "quick_bom",
      pricingConfig: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    store.projects.push(row);
    return row;
  }

  describe("listProjectSummaries archive filter", () => {
    it("defaults to active-only and excludes archived projects", async () => {
      seed({ id: "active-1", name: "Active" });
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      const rows = await listProjectSummaries(TENANT);

      expect(rows.map((r) => r.id)).toEqual(["active-1"]);
      expect(rows[0].archivedAt).toBeUndefined();
    });

    it("returns only archived projects with their archivedAt for archive=archived", async () => {
      seed({ id: "active-1", name: "Active" });
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      const rows = await listProjectSummaries(TENANT, { archive: "archived" });

      expect(rows.map((r) => r.id)).toEqual(["archived-1"]);
      expect(rows[0].archivedAt).toBe(ARCHIVED_AT.toISOString());
    });

    it("returns both active and archived projects for archive=all", async () => {
      seed({ id: "active-1", name: "Active" });
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      const rows = await listProjectSummaries(TENANT, { archive: "all" });

      expect(rows.map((r) => r.id).sort()).toEqual(["active-1", "archived-1"]);
    });
  });

  describe("getProjectById includeArchived", () => {
    it("excludes archived projects by default (returns null)", async () => {
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      expect(await getProjectById(TENANT, "archived-1")).toBeNull();
    });

    it("returns an archived project with includeArchived true and surfaces archivedAt", async () => {
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      const project = await getProjectById(TENANT, "archived-1", {
        includeArchived: true,
      });

      expect(project).not.toBeNull();
      expect(project!.id).toBe("archived-1");
      expect(project!.archivedAt).toEqual(ARCHIVED_AT);
    });

    it("still returns active projects with includeArchived true and no archivedAt", async () => {
      seed({ id: "active-1", name: "Active" });

      const project = await getProjectById(TENANT, "active-1", {
        includeArchived: true,
      });

      expect(project!.archivedAt).toBeUndefined();
    });
  });

  describe("archiveProject", () => {
    it("archives an active project and returns true, stamping archived_at", async () => {
      const row = seed({ id: "active-1", name: "Active" });

      expect(await archiveProject(TENANT, "active-1")).toBe(true);
      expect(row.archivedAt).toBeInstanceOf(Date);
    });

    it("is idempotent: returns true for an already-archived project", async () => {
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      expect(await archiveProject(TENANT, "archived-1")).toBe(true);
    });

    it("returns false for a wrong tenant", async () => {
      seed({ id: "active-1", name: "Active" });

      expect(await archiveProject(OTHER_TENANT, "active-1")).toBe(false);
    });

    it("returns false for a missing project", async () => {
      expect(await archiveProject(TENANT, "nope")).toBe(false);
    });

    it("opens a tenant-scoped transaction", async () => {
      seed({ id: "active-1", name: "Active" });
      await archiveProject(TENANT, "active-1");
      expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
    });
  });

  describe("restoreProject", () => {
    it("restores an archived project and returns true, clearing archived_at", async () => {
      const row = seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      expect(await restoreProject(TENANT, "archived-1")).toBe(true);
      expect(row.archivedAt).toBeNull();
    });

    it("is idempotent: returns true for an already-active project", async () => {
      seed({ id: "active-1", name: "Active" });

      expect(await restoreProject(TENANT, "active-1")).toBe(true);
    });

    it("returns false for a wrong tenant", async () => {
      seed({ id: "archived-1", name: "Archived", archivedAt: ARCHIVED_AT });

      expect(await restoreProject(OTHER_TENANT, "archived-1")).toBe(false);
    });

    it("returns false for a missing project", async () => {
      expect(await restoreProject(TENANT, "nope")).toBe(false);
    });
  });

  describe("quickBomProjectNameExists ignores archived", () => {
    it("does not match an archived Quick BoM project with the same name", async () => {
      seed({ id: "archived-1", name: "Honeywell Refresh", archivedAt: ARCHIVED_AT });

      expect(await quickBomProjectNameExists(TENANT, "Honeywell Refresh")).toBe(false);
    });

    it("matches only the active Quick BoM project when an archived twin exists", async () => {
      seed({ id: "archived-1", name: "Shared Name", archivedAt: ARCHIVED_AT });
      seed({ id: "active-1", name: "Shared Name" });

      expect(await quickBomProjectNameExists(TENANT, "Shared Name")).toBe(true);
    });
  });
});

describe("module surface", () => {
  it("does not expose updateProjectMode (mode is immutable)", () => {
    expect(
      (store_module as Record<string, unknown>).updateProjectMode
    ).toBeUndefined();
  });
});
