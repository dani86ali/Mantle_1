import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory fake db ─────────────────────────────────────────────────────
// Mirrors only the chained calls project-artifact-store uses against ONE table
// (project_artifacts), so routing is trivial - every query targets
// store.artifacts:
//   db.insert(table).values(v).returning()
//   db.select().from(table).where(pred)                       (awaited directly)
//   db.select().from(table).where(pred).limit(n) | .orderBy(...orders)
//
// where() returns a thenable so it can be awaited directly (the create path)
// OR have .limit()/.orderBy() chained onto it (the read paths). Predicates are
// flattened from the mocked eq/and; columns expose a DB `name` (e.g.
// "tenant_id") mapped back to the stored JS property. orderBy sorts by string
// then number then Date.

interface StoredArtifact {
  id: string;
  projectId: string;
  tenantId: string;
  stageId: string;
  type: string;
  status: string;
  version: number;
  payload: unknown;
  filePath: string | null;
  sourceFileIds: unknown;
  sourceArtifactIds: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const { store, mockDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    artifacts: [] as StoredArtifact[],
    artifactInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    type: "type",
    version: "version",
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
    if (typeof a === "number" && typeof b === "number") return a - b;
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
              store.artifactInserts.push(v);
              const now = new Date();
              const row: StoredArtifact = {
                id: (v.id as string) ?? genId("artifact"),
                projectId: v.projectId as string,
                tenantId: v.tenantId as string,
                stageId: v.stageId as string,
                type: v.type as string,
                status: v.status as string,
                version: v.version as number,
                payload: v.payload ?? {},
                filePath: (v.filePath as string) ?? null,
                sourceFileIds: v.sourceFileIds ?? [],
                sourceArtifactIds: v.sourceArtifactIds ?? [],
                createdAt: (v.createdAt as Date) ?? now,
                updatedAt: (v.updatedAt as Date) ?? now,
              };
              store.artifacts.push(row);
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
              const filtered = store.artifacts.filter((row) =>
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
                // Awaitable directly (the create path): resolves to all matches.
                then(
                  resolve: (rows: StoredArtifact[]) => unknown,
                  reject?: (err: unknown) => unknown
                ) {
                  return Promise.resolve(filtered).then(resolve, reject);
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

import * as artifactStore from "@/lib/db/project-artifact-store";
import {
  createProjectArtifactVersion,
  listProjectArtifacts,
  listProjectArtifactsByType,
  getLatestProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import type { CreateProjectArtifactVersionInput } from "@/lib/db/project-artifact-store";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";

function seedArtifact(overrides: Partial<StoredArtifact> = {}): StoredArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  const row: StoredArtifact = {
    id: "art-seed",
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "generated",
    version: 1,
    payload: {},
    filePath: null,
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  store.artifacts.push(row);
  return row;
}

beforeEach(() => {
  store.artifacts.length = 0;
  store.artifactInserts.length = 0;
});

describe("createProjectArtifactVersion", () => {
  const input: CreateProjectArtifactVersionInput = {
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    payload: { lineCount: 12 },
    sourceFileIds: ["file-a"],
    sourceArtifactIds: ["art-up"],
  };

  it("inserts one project_artifacts row with the expected columns", async () => {
    await createProjectArtifactVersion(input);

    expect(store.artifactInserts).toHaveLength(1);
    expect(store.artifacts).toHaveLength(1);
    expect(store.artifactInserts[0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      status: "generated",
      version: 1,
      payload: { lineCount: 12 },
      sourceFileIds: ["file-a"],
      sourceArtifactIds: ["art-up"],
    });
  });

  it("starts the first artifact version at 1", async () => {
    const artifact = await createProjectArtifactVersion(input);
    expect(artifact.version).toBe(1);
  });

  it("gives the second artifact of the same project/type version 2", async () => {
    await createProjectArtifactVersion(input);
    const second = await createProjectArtifactVersion(input);
    expect(second.version).toBe(2);
  });

  it("ignores other projects and other types when numbering versions", async () => {
    seedArtifact({ id: "a-other-project", projectId: OTHER_PROJECT, version: 9 });
    seedArtifact({ id: "a-other-type", type: "normalized_boq", version: 7 });
    seedArtifact({ id: "a-other-tenant", tenantId: OTHER_TENANT, version: 5 });

    const artifact = await createProjectArtifactVersion(input);
    expect(artifact.version).toBe(1);
  });

  it("counts approved/rejected/stale prior versions toward the next version", async () => {
    seedArtifact({ id: "a-v1", version: 1, status: "approved" });
    seedArtifact({ id: "a-v2", version: 2, status: "rejected" });
    seedArtifact({ id: "a-v3", version: 3, status: "stale" });

    const artifact = await createProjectArtifactVersion(input);
    expect(artifact.version).toBe(4);
  });

  it("throws through the materializer for disallowed stage/type pairs", async () => {
    await expect(
      createProjectArtifactVersion({
        ...input,
        stageId: "intake_package_review",
        type: "priced_boq",
      })
    ).rejects.toThrow(/not allowed for stage/);
    expect(store.artifacts).toHaveLength(0);
  });

  it("throws through the materializer for non-creatable statuses", async () => {
    for (const status of [
      "approved",
      "rejected",
      "stale",
      "missing",
      "not_applicable",
    ] as const) {
      await expect(
        createProjectArtifactVersion({ ...input, status })
      ).rejects.toThrow(/Cannot create an artifact version with status/);
    }
    expect(store.artifacts).toHaveLength(0);
  });

  it("returns a ProjectArtifact without tenantId", async () => {
    const artifact = await createProjectArtifactVersion(input);
    expect(artifact.projectId).toBe(PROJECT);
    expect(artifact.type).toBe("priced_boq");
    expect("tenantId" in artifact).toBe(false);
  });

  it("does not mutate its input object or source arrays", async () => {
    const sourceFileIds = ["file-a"];
    const sourceArtifactIds = ["art-up"];
    const createInput: CreateProjectArtifactVersionInput = {
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "boq_pricing_review",
      type: "priced_boq",
      payload: { lineCount: 12 },
      sourceFileIds,
      sourceArtifactIds,
    };
    const snapshot = structuredClone(createInput);
    await createProjectArtifactVersion(createInput);
    expect(createInput).toEqual(snapshot);
    expect(sourceFileIds).toEqual(["file-a"]);
    expect(sourceArtifactIds).toEqual(["art-up"]);
  });
});

describe("mapper", () => {
  it("maps a null filePath to undefined", async () => {
    seedArtifact({ id: "a-1", filePath: null });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact!.filePath).toBeUndefined();
  });

  it("preserves a present filePath", async () => {
    seedArtifact({ id: "a-1", filePath: "s3://bucket/proposal.docx" });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact!.filePath).toBe("s3://bucket/proposal.docx");
  });

  it("maps sourceFileIds/sourceArtifactIds from JSON arrays", async () => {
    seedArtifact({
      id: "a-1",
      sourceFileIds: ["file-a", "file-b"],
      sourceArtifactIds: ["art-x"],
    });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact!.sourceFileIds).toEqual(["file-a", "file-b"]);
    expect(artifact!.sourceArtifactIds).toEqual(["art-x"]);
  });

  it("maps non-array source ids to []", async () => {
    seedArtifact({
      id: "a-1",
      sourceFileIds: { not: "an array" },
      sourceArtifactIds: null,
    });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact!.sourceFileIds).toEqual([]);
    expect(artifact!.sourceArtifactIds).toEqual([]);
  });

  it("maps a non-object payload to {}", async () => {
    seedArtifact({ id: "a-1", payload: ["not", "an", "object"] });
    const arr = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(arr!.payload).toEqual({});

    store.artifacts.length = 0;
    seedArtifact({ id: "a-2", payload: null });
    const nul = await getProjectArtifactById(TENANT, PROJECT, "a-2");
    expect(nul!.payload).toEqual({});
  });

  it("preserves Date instances and casts union columns", async () => {
    const createdAt = new Date("2026-05-21T08:00:00.000Z");
    seedArtifact({ id: "a-1", createdAt, updatedAt: createdAt, payload: { ok: true } });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact!.createdAt).toBeInstanceOf(Date);
    expect(artifact!.createdAt.toISOString()).toBe("2026-05-21T08:00:00.000Z");
    expect(artifact!.type).toBe("priced_boq");
    expect(artifact!.status).toBe("generated");
    expect(artifact!.payload).toEqual({ ok: true });
  });
});

describe("listProjectArtifacts", () => {
  it("filters by tenantId and projectId", async () => {
    seedArtifact({ id: "a-mine", projectId: PROJECT, tenantId: TENANT });
    seedArtifact({ id: "a-other-tenant", projectId: PROJECT, tenantId: OTHER_TENANT });
    seedArtifact({ id: "a-other-project", projectId: OTHER_PROJECT, tenantId: TENANT });

    const artifacts = await listProjectArtifacts(TENANT, PROJECT);
    expect(artifacts.map((a) => a.id)).toEqual(["a-mine"]);
  });

  it("orders by type ascending then version ascending", async () => {
    seedArtifact({ id: "pb-v2", type: "priced_boq", version: 2 });
    seedArtifact({ id: "pb-v1", type: "priced_boq", version: 1 });
    seedArtifact({ id: "nb-v2", type: "normalized_boq", version: 2 });
    seedArtifact({ id: "nb-v1", type: "normalized_boq", version: 1 });

    const artifacts = await listProjectArtifacts(TENANT, PROJECT);
    expect(artifacts.map((a) => a.id)).toEqual([
      "nb-v1",
      "nb-v2",
      "pb-v1",
      "pb-v2",
    ]);
  });
});

describe("listProjectArtifactsByType", () => {
  it("filters by tenantId, projectId, and type, ordered by version", async () => {
    seedArtifact({ id: "pb-v2", type: "priced_boq", version: 2 });
    seedArtifact({ id: "pb-v1", type: "priced_boq", version: 1 });
    seedArtifact({ id: "nb-v1", type: "normalized_boq", version: 1 });
    seedArtifact({ id: "pb-other-tenant", type: "priced_boq", version: 5, tenantId: OTHER_TENANT });

    const artifacts = await listProjectArtifactsByType(TENANT, PROJECT, "priced_boq");
    expect(artifacts.map((a) => a.id)).toEqual(["pb-v1", "pb-v2"]);
  });
});

describe("getLatestProjectArtifactVersion", () => {
  it("returns the highest version for the type", async () => {
    seedArtifact({ id: "pb-v1", type: "priced_boq", version: 1 });
    seedArtifact({ id: "pb-v3", type: "priced_boq", version: 3 });
    seedArtifact({ id: "pb-v2", type: "priced_boq", version: 2 });

    const latest = await getLatestProjectArtifactVersion(TENANT, PROJECT, "priced_boq");
    expect(latest!.id).toBe("pb-v3");
    expect(latest!.version).toBe(3);
  });

  it("returns null when no artifact of that type exists", async () => {
    seedArtifact({ id: "nb-v1", type: "normalized_boq", version: 1 });
    expect(
      await getLatestProjectArtifactVersion(TENANT, PROJECT, "priced_boq")
    ).toBeNull();
    expect(
      await getLatestProjectArtifactVersion(OTHER_TENANT, PROJECT, "normalized_boq")
    ).toBeNull();
  });
});

describe("getProjectArtifactById", () => {
  it("is tenant/project/id scoped", async () => {
    seedArtifact({ id: "a-1" });
    const artifact = await getProjectArtifactById(TENANT, PROJECT, "a-1");
    expect(artifact).not.toBeNull();
    expect(artifact!.id).toBe("a-1");
    expect("tenantId" in artifact!).toBe(false);
  });

  it("returns null for wrong tenant, wrong project, or missing id", async () => {
    seedArtifact({ id: "a-1" });
    expect(await getProjectArtifactById(OTHER_TENANT, PROJECT, "a-1")).toBeNull();
    expect(await getProjectArtifactById(TENANT, OTHER_PROJECT, "a-1")).toBeNull();
    expect(await getProjectArtifactById(TENANT, PROJECT, "missing")).toBeNull();
  });
});

describe("module surface", () => {
  it("exposes only the five repository functions", () => {
    expect(Object.keys(artifactStore).sort()).toEqual(
      [
        "createProjectArtifactVersion",
        "getLatestProjectArtifactVersion",
        "getProjectArtifactById",
        "listProjectArtifacts",
        "listProjectArtifactsByType",
      ].sort()
    );
  });
});
