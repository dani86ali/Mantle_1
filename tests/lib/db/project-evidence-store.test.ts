import { describe, it, expect, beforeEach, vi } from "vitest";

// --- In-memory fake db ------------------------------------------------------
// Mirrors only the chained calls project-evidence-store uses against ONE table
// (project_evidence_items), so routing is trivial - every query targets
// store.evidence:
//   db.insert(table).values(v).returning()
//   db.select().from(table).where(pred).limit(n) | .orderBy(...orders)
//
// Predicates are flattened from the mocked eq/and; columns expose a DB `name`
// (e.g. "tenant_id") mapped back to the stored JS property. orderBy takes the
// mocked asc() descriptors and sorts by Date (getTime).

interface StoredEvidence {
  id: string;
  projectId: string;
  tenantId: string;
  sourceFileId: string;
  kind: string;
  content: Record<string, unknown>;
  extractedAt: Date;
  retainUntil: Date;
}

const { store, mockDb, withTenantDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    evidence: [] as StoredEvidence[],
    evidenceInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    source_file_id: "sourceFileId",
    extracted_at: "extractedAt",
  };

  type Cond = { name: string; val: unknown };
  type Pred =
    | { type: "and"; conds: Pred[] }
    | { type: "eq"; col: { name: string }; val: unknown };
  type Order = { type: "asc"; col: { name: string } };

  const flatten = (pred: Pred): Cond[] => {
    if (pred.type === "and") return pred.conds.flatMap(flatten);
    return [{ name: pred.col.name, val: pred.val }];
  };

  const matches = (row: Record<string, unknown>, conds: Cond[]): boolean =>
    conds.every((c) => row[colMap[c.name]] === c.val);

  const compare = (a: unknown, b: unknown): number => {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "string" && typeof b === "string") {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return 0;
  };

  const mockDb: any = {
    insert(_table: unknown) {
      return {
        values(v: Record<string, unknown>) {
          return {
            async returning() {
              store.evidenceInserts.push(v);
              const row: StoredEvidence = {
                id: (v.id as string) ?? genId("evidence"),
                projectId: v.projectId as string,
                tenantId: v.tenantId as string,
                sourceFileId: v.sourceFileId as string,
                kind: v.kind as string,
                content: (v.content as Record<string, unknown>) ?? {},
                extractedAt: v.extractedAt as Date,
                retainUntil: v.retainUntil as Date,
              };
              store.evidence.push(row);
              return [row];
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
              const filtered = store.evidence.filter((row) =>
                matches(row as unknown as Record<string, unknown>, conds)
              );
              return {
                async limit(n: number) {
                  return filtered.slice(0, n);
                },
                async orderBy(...orders: Order[]) {
                  return [...filtered].sort((a, b) => {
                    for (const order of orders) {
                      const field = colMap[order.col.name];
                      const cmp = compare(
                        (a as unknown as Record<string, unknown>)[field],
                        (b as unknown as Record<string, unknown>)[field]
                      );
                      if (cmp !== 0) return cmp;
                    }
                    return 0;
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
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ type: "eq", col, val }),
    and: (...conds: unknown[]) => ({ type: "and", conds }),
    asc: (col: { name: string }) => ({ type: "asc", col }),
  };
});

import * as evidenceStore from "@/lib/db/project-evidence-store";
import {
  createProjectEvidenceItem,
  listProjectEvidenceItems,
  listProjectEvidenceForFile,
  getProjectEvidenceItemById,
} from "@/lib/db/project-evidence-store";
import type { CreateProjectEvidenceItemInput } from "@/lib/db/project-evidence-store";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";
const FILE_A = "file-a";
const FILE_B = "file-b";

function seedEvidence(overrides: Partial<StoredEvidence> = {}): StoredEvidence {
  const extractedAt = new Date("2026-05-21T08:00:00.000Z");
  const row: StoredEvidence = {
    id: "ev-seed",
    projectId: PROJECT,
    tenantId: TENANT,
    sourceFileId: FILE_A,
    kind: "boq_summary",
    content: {},
    extractedAt,
    retainUntil: new Date("2027-05-21T08:00:00.000Z"),
    ...overrides,
  };
  store.evidence.push(row);
  return row;
}

beforeEach(() => {
  store.evidence.length = 0;
  store.evidenceInserts.length = 0;
  withTenantDb.mockClear();
});

describe("createProjectEvidenceItem", () => {
  const input: CreateProjectEvidenceItemInput = {
    projectId: PROJECT,
    tenantId: TENANT,
    sourceFileId: FILE_A,
    kind: "boq_summary",
    content: { lineCount: 42 },
    extractedAt: new Date("2026-05-21T08:00:00.000Z"),
  };

  it("inserts one project_evidence_items row with the expected columns", async () => {
    await createProjectEvidenceItem(input);

    expect(store.evidenceInserts).toHaveLength(1);
    expect(store.evidence).toHaveLength(1);
    expect(store.evidenceInserts[0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      sourceFileId: FILE_A,
      kind: "boq_summary",
      content: { lineCount: 42 },
      extractedAt: input.extractedAt,
      retainUntil: new Date("2027-05-21T08:00:00.000Z"),
    });
  });

  it("returns a ProjectEvidenceItem without tenantId", async () => {
    const item = await createProjectEvidenceItem(input);
    expect(item.projectId).toBe(PROJECT);
    expect(item.kind).toBe("boq_summary");
    expect("tenantId" in item).toBe(false);
  });

  it("computes retainUntil as extractedAt + 1 year and preserves Date instances", async () => {
    const item = await createProjectEvidenceItem(input);
    expect(item.extractedAt).toBeInstanceOf(Date);
    expect(item.retainUntil).toBeInstanceOf(Date);
    expect(item.extractedAt.toISOString()).toBe("2026-05-21T08:00:00.000Z");
    expect(item.retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });

  it("copies content so later input mutation does not alter the stored row", async () => {
    const content: Record<string, unknown> = { lineCount: 42 };
    await createProjectEvidenceItem({ ...input, content });
    content.lineCount = 999;
    expect(store.evidence[0].content).toEqual({ lineCount: 42 });
  });
});

describe("listProjectEvidenceItems", () => {
  it("filters by tenantId and projectId", async () => {
    seedEvidence({ id: "e-mine", projectId: PROJECT, tenantId: TENANT });
    seedEvidence({ id: "e-other-tenant", projectId: PROJECT, tenantId: OTHER_TENANT });
    seedEvidence({ id: "e-other-project", projectId: OTHER_PROJECT, tenantId: TENANT });

    const items = await listProjectEvidenceItems(TENANT, PROJECT);
    expect(items.map((i) => i.id)).toEqual(["e-mine"]);
  });

  it("returns items sorted by extractedAt ascending", async () => {
    seedEvidence({ id: "e-late", extractedAt: new Date("2026-05-21T12:00:00.000Z") });
    seedEvidence({ id: "e-early", extractedAt: new Date("2026-05-21T08:00:00.000Z") });
    seedEvidence({ id: "e-mid", extractedAt: new Date("2026-05-21T10:00:00.000Z") });

    const items = await listProjectEvidenceItems(TENANT, PROJECT);
    expect(items.map((i) => i.id)).toEqual(["e-early", "e-mid", "e-late"]);
  });
});

describe("listProjectEvidenceForFile", () => {
  it("filters by tenantId, projectId, and sourceFileId", async () => {
    seedEvidence({ id: "e-file-a", sourceFileId: FILE_A });
    seedEvidence({ id: "e-file-b", sourceFileId: FILE_B });
    seedEvidence({ id: "e-other-tenant", sourceFileId: FILE_A, tenantId: OTHER_TENANT });

    const items = await listProjectEvidenceForFile(TENANT, PROJECT, FILE_A);
    expect(items.map((i) => i.id)).toEqual(["e-file-a"]);
  });

  it("returns items sorted by extractedAt ascending", async () => {
    seedEvidence({
      id: "e-late",
      sourceFileId: FILE_A,
      extractedAt: new Date("2026-05-21T12:00:00.000Z"),
    });
    seedEvidence({
      id: "e-early",
      sourceFileId: FILE_A,
      extractedAt: new Date("2026-05-21T08:00:00.000Z"),
    });

    const items = await listProjectEvidenceForFile(TENANT, PROJECT, FILE_A);
    expect(items.map((i) => i.id)).toEqual(["e-early", "e-late"]);
  });
});

describe("getProjectEvidenceItemById", () => {
  it("filters by tenantId, projectId, and evidence id", async () => {
    seedEvidence({ id: "ev-1" });
    const item = await getProjectEvidenceItemById(TENANT, PROJECT, "ev-1");
    expect(item).not.toBeNull();
    expect(item!.id).toBe("ev-1");
    expect("tenantId" in item!).toBe(false);
  });

  it("returns null for wrong tenant, wrong project, or missing item", async () => {
    seedEvidence({ id: "ev-1" });
    expect(await getProjectEvidenceItemById(OTHER_TENANT, PROJECT, "ev-1")).toBeNull();
    expect(await getProjectEvidenceItemById(TENANT, OTHER_PROJECT, "ev-1")).toBeNull();
    expect(await getProjectEvidenceItemById(TENANT, PROJECT, "missing")).toBeNull();
  });
});

describe("immutability", () => {
  it("does not mutate its create input object", async () => {
    const createInput: CreateProjectEvidenceItemInput = {
      projectId: PROJECT,
      tenantId: TENANT,
      sourceFileId: FILE_A,
      kind: "boq_summary",
      content: { lineCount: 42 },
      extractedAt: new Date("2026-05-21T08:00:00.000Z"),
    };
    const snapshot = structuredClone(createInput);
    await createProjectEvidenceItem(createInput);
    expect(createInput).toEqual(snapshot);
  });
});

describe("tenant-scoped execution", () => {
  it("createProjectEvidenceItem opens a tenant-scoped transaction for the input tenant", async () => {
    await createProjectEvidenceItem({
      projectId: PROJECT,
      tenantId: TENANT,
      sourceFileId: FILE_A,
      kind: "boq_summary",
      content: { lineCount: 1 },
    });
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it("listProjectEvidenceItems opens a tenant-scoped transaction for the requested tenant", async () => {
    await listProjectEvidenceItems(TENANT, PROJECT);
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });

  it("getProjectEvidenceItemById opens a tenant-scoped transaction for the requested tenant", async () => {
    await getProjectEvidenceItemById(TENANT, PROJECT, "ev-x");
    expect(withTenantDb).toHaveBeenCalledWith(TENANT, expect.any(Function));
  });
});

describe("module surface", () => {
  it("does not expose parser/BoQ/artifact functions", () => {
    expect(Object.keys(evidenceStore).sort()).toEqual(
      [
        "createProjectEvidenceItem",
        "getProjectEvidenceItemById",
        "listProjectEvidenceForFile",
        "listProjectEvidenceItems",
      ].sort()
    );
  });
});
