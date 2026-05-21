import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory fake db ─────────────────────────────────────────────────────
// Mirrors only the chained calls project-file-store uses against ONE table
// (project_files), so routing is trivial - every query targets store.files:
//   db.insert(table).values(v).returning()
//   db.select().from(table).where(pred).limit(n) | .orderBy(...orders)
//   db.update(table).set(s).where(pred).returning()
//
// Predicates are flattened from the mocked eq/and; columns expose a DB `name`
// (e.g. "tenant_id") mapped back to the stored JS property. orderBy takes the
// mocked asc() descriptors and sorts by Date (getTime) then string.

interface StoredFile {
  id: string;
  projectId: string;
  tenantId: string;
  fileRole: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: Date;
  retainUntil: Date;
  roleCorrectedBy: string | null;
  createdAt: Date;
}

const { store, mockDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    files: [] as StoredFile[],
    fileInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    uploaded_at: "uploadedAt",
    file_name: "fileName",
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
              store.fileInserts.push(v);
              const now = new Date();
              const row: StoredFile = {
                id: (v.id as string) ?? genId("file"),
                projectId: v.projectId as string,
                tenantId: v.tenantId as string,
                fileRole: v.fileRole as string,
                fileName: v.fileName as string,
                storagePath: v.storagePath as string,
                mimeType: (v.mimeType as string) ?? null,
                sizeBytes: (v.sizeBytes as number) ?? null,
                uploadedAt: (v.uploadedAt as Date) ?? now,
                retainUntil: v.retainUntil as Date,
                roleCorrectedBy: (v.roleCorrectedBy as string) ?? null,
                createdAt: (v.createdAt as Date) ?? now,
              };
              store.files.push(row);
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
              const filtered = store.files.filter((row) =>
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
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(pred: Pred) {
              return {
                async returning() {
                  const conds = flatten(pred);
                  const updated: StoredFile[] = [];
                  for (const row of store.files) {
                    if (matches(row as unknown as Record<string, unknown>, conds)) {
                      Object.assign(row, values);
                      updated.push(row);
                    }
                  }
                  return updated;
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
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (col: { name: string }, val: unknown) => ({ type: "eq", col, val }),
    and: (...conds: unknown[]) => ({ type: "and", conds }),
    asc: (col: { name: string }) => ({ type: "asc", col }),
  };
});

import * as fileStore from "@/lib/db/project-file-store";
import {
  createProjectFileRecord,
  listProjectFiles,
  getProjectFileById,
  correctProjectFileRole,
} from "@/lib/db/project-file-store";
import type {
  CreateProjectFileRecordInput,
  CorrectProjectFileRoleInput,
} from "@/lib/db/project-file-store";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";

function seedFile(overrides: Partial<StoredFile> = {}): StoredFile {
  const now = new Date("2026-05-21T08:00:00.000Z");
  const row: StoredFile = {
    id: "file-seed",
    projectId: PROJECT,
    tenantId: TENANT,
    fileRole: "boq",
    fileName: "seed.xlsx",
    storagePath: "s3://bucket/seed.xlsx",
    mimeType: null,
    sizeBytes: null,
    uploadedAt: now,
    retainUntil: new Date("2027-05-21T08:00:00.000Z"),
    roleCorrectedBy: null,
    createdAt: now,
    ...overrides,
  };
  store.files.push(row);
  return row;
}

beforeEach(() => {
  store.files.length = 0;
  store.fileInserts.length = 0;
});

describe("createProjectFileRecord", () => {
  const input: CreateProjectFileRecordInput = {
    projectId: PROJECT,
    tenantId: TENANT,
    fileRole: "boq",
    fileName: "EnergyTech_BoQ.xlsx",
    storagePath: "s3://bucket/proj-1/EnergyTech_BoQ.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 20480,
    uploadedAt: new Date("2026-05-21T08:00:00.000Z"),
  };

  it("inserts one project_files row with the expected columns", async () => {
    await createProjectFileRecord(input);

    expect(store.fileInserts).toHaveLength(1);
    expect(store.files).toHaveLength(1);
    expect(store.fileInserts[0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      fileRole: "boq",
      fileName: "EnergyTech_BoQ.xlsx",
      storagePath: "s3://bucket/proj-1/EnergyTech_BoQ.xlsx",
      mimeType: input.mimeType,
      sizeBytes: 20480,
      uploadedAt: input.uploadedAt,
      retainUntil: new Date("2027-05-21T08:00:00.000Z"),
    });
  });

  it("returns a ProjectFile without tenantId", async () => {
    const file = await createProjectFileRecord(input);
    expect(file.projectId).toBe(PROJECT);
    expect(file.fileName).toBe("EnergyTech_BoQ.xlsx");
    expect("tenantId" in file).toBe(false);
  });

  it("computes retainUntil as uploadedAt + 1 year", async () => {
    const file = await createProjectFileRecord(input);
    expect(file.uploadedAt.toISOString()).toBe("2026-05-21T08:00:00.000Z");
    expect(file.retainUntil.toISOString()).toBe("2027-05-21T08:00:00.000Z");
  });
});

describe("listProjectFiles", () => {
  it("filters by tenantId and projectId", async () => {
    seedFile({ id: "f-mine", projectId: PROJECT, tenantId: TENANT });
    seedFile({ id: "f-other-tenant", projectId: PROJECT, tenantId: OTHER_TENANT });
    seedFile({ id: "f-other-project", projectId: OTHER_PROJECT, tenantId: TENANT });

    const files = await listProjectFiles(TENANT, PROJECT);
    expect(files.map((f) => f.id)).toEqual(["f-mine"]);
  });

  it("returns files sorted by uploadedAt", async () => {
    seedFile({
      id: "f-late",
      uploadedAt: new Date("2026-05-21T12:00:00.000Z"),
      fileName: "b.xlsx",
    });
    seedFile({
      id: "f-early",
      uploadedAt: new Date("2026-05-21T08:00:00.000Z"),
      fileName: "z.xlsx",
    });
    seedFile({
      id: "f-mid",
      uploadedAt: new Date("2026-05-21T10:00:00.000Z"),
      fileName: "a.xlsx",
    });

    const files = await listProjectFiles(TENANT, PROJECT);
    expect(files.map((f) => f.id)).toEqual(["f-early", "f-mid", "f-late"]);
  });
});

describe("getProjectFileById", () => {
  it("filters by tenantId, projectId, and file id", async () => {
    seedFile({ id: "file-a" });
    const file = await getProjectFileById(TENANT, PROJECT, "file-a");
    expect(file).not.toBeNull();
    expect(file!.id).toBe("file-a");
    expect("tenantId" in file!).toBe(false);
  });

  it("returns null for wrong tenant, wrong project, or missing file", async () => {
    seedFile({ id: "file-a" });
    expect(await getProjectFileById(OTHER_TENANT, PROJECT, "file-a")).toBeNull();
    expect(await getProjectFileById(TENANT, OTHER_PROJECT, "file-a")).toBeNull();
    expect(await getProjectFileById(TENANT, PROJECT, "missing")).toBeNull();
  });
});

describe("correctProjectFileRole", () => {
  it("updates fileRole and roleCorrectedBy", async () => {
    seedFile({ id: "file-a", fileRole: "other", roleCorrectedBy: null });

    const file = await correctProjectFileRole({
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: "file-a",
      fileRole: "boq",
      roleCorrectedBy: "user-1",
    });

    expect(file).not.toBeNull();
    expect(file!.fileRole).toBe("boq");
    expect(file!.roleCorrectedBy).toBe("user-1");
    // Persisted to the store row, not just the returned object.
    expect(store.files[0].fileRole).toBe("boq");
    expect(store.files[0].roleCorrectedBy).toBe("user-1");
  });

  it("is tenant/project/file scoped and returns null when not found", async () => {
    seedFile({ id: "file-a", fileRole: "other" });

    expect(
      await correctProjectFileRole({
        tenantId: OTHER_TENANT,
        projectId: PROJECT,
        fileId: "file-a",
        fileRole: "boq",
        roleCorrectedBy: "user-1",
      })
    ).toBeNull();
    expect(
      await correctProjectFileRole({
        tenantId: TENANT,
        projectId: OTHER_PROJECT,
        fileId: "file-a",
        fileRole: "boq",
        roleCorrectedBy: "user-1",
      })
    ).toBeNull();
    expect(
      await correctProjectFileRole({
        tenantId: TENANT,
        projectId: PROJECT,
        fileId: "missing",
        fileRole: "boq",
        roleCorrectedBy: "user-1",
      })
    ).toBeNull();
    // The untouched row keeps its original role.
    expect(store.files[0].fileRole).toBe("other");
  });
});

describe("null mapping & immutability", () => {
  it("maps DB null optional fields to undefined", async () => {
    seedFile({
      id: "file-a",
      mimeType: null,
      sizeBytes: null,
      roleCorrectedBy: null,
    });

    const file = await getProjectFileById(TENANT, PROJECT, "file-a");
    expect(file!.mimeType).toBeUndefined();
    expect(file!.sizeBytes).toBeUndefined();
    expect(file!.roleCorrectedBy).toBeUndefined();
  });

  it("does not mutate its input objects", async () => {
    const createInput: CreateProjectFileRecordInput = {
      projectId: PROJECT,
      tenantId: TENANT,
      fileRole: "boq",
      fileName: "x.xlsx",
      storagePath: "s3://bucket/x.xlsx",
      uploadedAt: new Date("2026-05-21T08:00:00.000Z"),
    };
    const createSnapshot = structuredClone(createInput);
    await createProjectFileRecord(createInput);
    expect(createInput).toEqual(createSnapshot);

    seedFile({ id: "file-a" });
    const correctInput: CorrectProjectFileRoleInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      fileId: "file-a",
      fileRole: "boq",
      roleCorrectedBy: "user-1",
    };
    const correctSnapshot = structuredClone(correctInput);
    await correctProjectFileRole(correctInput);
    expect(correctInput).toEqual(correctSnapshot);
  });
});

describe("module surface", () => {
  it("does not expose parser or format-validation functions", () => {
    expect(Object.keys(fileStore).sort()).toEqual(
      [
        "correctProjectFileRole",
        "createProjectFileRecord",
        "getProjectFileById",
        "listProjectFiles",
      ].sort()
    );
  });
});
