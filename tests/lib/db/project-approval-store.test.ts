import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── In-memory fake db ─────────────────────────────────────────────────────
// Mirrors the chained calls project-approval-store uses across THREE tables
// (project_approvals, project_artifacts, project_stages):
//   db.transaction(cb) -> resolves cb's return value (tx === mockDb)
//   tx.select().from(table).where(pred).limit(n)
//   db.select().from(table).where(pred).orderBy(...orders)
//   tx.insert(table).values(v).returning()
//   tx.update(table).set(s).where(pred)            (awaited directly)
//
// Table routing is exact: the Drizzle table object carries its name on the
// well-known `drizzle:Name` symbol, so from()/insert()/update() pick the right
// store array. Predicates are flattened from the mocked eq/and; columns expose
// a DB `name` (e.g. "tenant_id") mapped back to the stored JS property. orderBy
// sorts by number then Date then string across the given asc() descriptors.

const TABLE_NAME = Symbol.for("drizzle:Name");

interface StoredApproval {
  id: string;
  projectId: string;
  tenantId: string;
  stageId: string;
  artifactId: string;
  artifactVersion: number;
  decision: string;
  decidedBy: string;
  decidedAt: Date;
  note: string | null;
}
interface StoredArtifact {
  id: string;
  projectId: string;
  tenantId: string;
  stageId: string;
  type: string;
  status: string;
  version: number;
  updatedAt: Date;
}
interface StoredStage {
  id: string;
  projectId: string;
  tenantId: string;
  stageId: string;
  stageOrder: number;
  status: string;
  updatedAt: Date;
}

const { store, mockDb } = vi.hoisted(() => {
  let counter = 0;
  const genId = (prefix: string) => `${prefix}-${++counter}`;

  const store = {
    approvals: [] as StoredApproval[],
    artifacts: [] as StoredArtifact[],
    stages: [] as StoredStage[],
    approvalInserts: [] as Record<string, unknown>[],
  };

  const colMap: Record<string, string> = {
    id: "id",
    tenant_id: "tenantId",
    project_id: "projectId",
    stage_id: "stageId",
    artifact_id: "artifactId",
    artifact_version: "artifactVersion",
    decided_at: "decidedAt",
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
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "string" && typeof b === "string") {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return 0;
  };

  const arrayFor = (table: { [TABLE_NAME]: string }): Record<string, unknown>[] => {
    const name = table[TABLE_NAME];
    if (name === "project_artifacts")
      return store.artifacts as unknown as Record<string, unknown>[];
    if (name === "project_stages")
      return store.stages as unknown as Record<string, unknown>[];
    return store.approvals as unknown as Record<string, unknown>[];
  };

  const mockDb: any = {
    async transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
      return cb(mockDb);
    },
    select() {
      return {
        from(table: { [TABLE_NAME]: string }) {
          const source = arrayFor(table);
          return {
            where(pred: Pred) {
              const conds = flatten(pred);
              const filtered = source.filter((row) => matches(row, conds));
              return {
                async limit(n: number) {
                  return filtered.slice(0, n);
                },
                async orderBy(...orders: Order[]) {
                  return [...filtered].sort((a, b) => {
                    for (const order of orders) {
                      const field = colMap[order.col.name];
                      const cmp = compare(a[field], b[field]);
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
    insert(table: { [TABLE_NAME]: string }) {
      const target = arrayFor(table);
      return {
        values(v: Record<string, unknown>) {
          return {
            async returning() {
              store.approvalInserts.push(v);
              const now = new Date();
              const row: StoredApproval = {
                id: (v.id as string) ?? genId("approval"),
                projectId: v.projectId as string,
                tenantId: v.tenantId as string,
                stageId: v.stageId as string,
                artifactId: v.artifactId as string,
                artifactVersion: v.artifactVersion as number,
                decision: v.decision as string,
                decidedBy: v.decidedBy as string,
                decidedAt: (v.decidedAt as Date) ?? now,
                note: (v.note as string) ?? null,
              };
              target.push(row as unknown as Record<string, unknown>);
              return [row];
            },
          };
        },
      };
    },
    update(table: { [TABLE_NAME]: string }) {
      const target = arrayFor(table);
      return {
        set(values: Record<string, unknown>) {
          return {
            where(pred: Pred) {
              const conds = flatten(pred);
              const updated: Record<string, unknown>[] = [];
              for (const row of target) {
                if (matches(row, conds)) {
                  Object.assign(row, values);
                  updated.push(row);
                }
              }
              return {
                then(
                  resolve: (rows: unknown[]) => unknown,
                  reject?: (err: unknown) => unknown
                ) {
                  return Promise.resolve(updated).then(resolve, reject);
                },
                async returning() {
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

import * as approvalStore from "@/lib/db/project-approval-store";
import {
  createProjectApproval,
  listProjectApprovals,
  listProjectApprovalsForArtifact,
  getProjectApprovalById,
} from "@/lib/db/project-approval-store";
import type { CreateProjectApprovalInput } from "@/lib/db/project-approval-store";
import type { ProjectArtifactStatus } from "@/types/project";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";
const DECIDER = "user-9";
const DECIDED_AT = new Date("2026-05-21T10:00:00.000Z");

function seedArtifact(overrides: Partial<StoredArtifact> = {}): StoredArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  const row: StoredArtifact = {
    id: "art-1",
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "generated",
    version: 2,
    updatedAt: now,
    ...overrides,
  };
  store.artifacts.push(row);
  return row;
}

function seedStage(overrides: Partial<StoredStage> = {}): StoredStage {
  const now = new Date("2026-05-21T08:00:00.000Z");
  const row: StoredStage = {
    id: "stage-1",
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review",
    stageOrder: 70,
    status: "needs_review",
    updatedAt: now,
    ...overrides,
  };
  store.stages.push(row);
  return row;
}

function seedApproval(overrides: Partial<StoredApproval> = {}): StoredApproval {
  const row: StoredApproval = {
    id: "appr-seed",
    projectId: PROJECT,
    tenantId: TENANT,
    stageId: "boq_pricing_review",
    artifactId: "art-1",
    artifactVersion: 1,
    decision: "approved",
    decidedBy: DECIDER,
    decidedAt: new Date("2026-05-21T09:00:00.000Z"),
    note: null,
    ...overrides,
  };
  store.approvals.push(row);
  return row;
}

const baseInput: CreateProjectApprovalInput = {
  tenantId: TENANT,
  projectId: PROJECT,
  artifactId: "art-1",
  decision: "approved",
  decidedBy: DECIDER,
  decidedAt: DECIDED_AT,
};

beforeEach(() => {
  store.approvals.length = 0;
  store.artifacts.length = 0;
  store.stages.length = 0;
  store.approvalInserts.length = 0;
});

describe("createProjectApproval - missing rows", () => {
  it("returns null and inserts/updates nothing when the artifact is missing", async () => {
    seedStage();
    const result = await createProjectApproval({
      ...baseInput,
      artifactId: "missing",
    });
    expect(result).toBeNull();
    expect(store.approvals).toHaveLength(0);
    expect(store.approvalInserts).toHaveLength(0);
    // The stage was never touched.
    expect(store.stages[0].status).toBe("needs_review");
  });

  it('throws exactly "Project stage not found." when the stage row is missing', async () => {
    seedArtifact();
    await expect(createProjectApproval(baseInput)).rejects.toThrow(
      new Error("Project stage not found.")
    );
    expect(store.approvals).toHaveLength(0);
    expect(store.approvalInserts).toHaveLength(0);
    expect(store.artifacts[0].status).toBe("generated");
  });
});

describe("createProjectApproval - insert", () => {
  it("inserts one approval row pointing to the exact artifact id and version", async () => {
    seedArtifact({ id: "art-1", version: 2 });
    seedStage();

    const result = await createProjectApproval(baseInput);

    expect(store.approvals).toHaveLength(1);
    expect(store.approvalInserts).toHaveLength(1);
    expect(result!.approval.artifactId).toBe("art-1");
    expect(result!.approval.artifactVersion).toBe(2);
    expect(store.approvals[0].artifactId).toBe("art-1");
    expect(store.approvals[0].artifactVersion).toBe(2);
  });

  it("uses tenantId/projectId from input and stageId/projectId/version from the artifact", async () => {
    seedArtifact({
      id: "art-1",
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      version: 5,
    });
    seedStage({ stageId: "compliance_matrix_review" });

    await createProjectApproval(baseInput);

    expect(store.approvalInserts[0]).toMatchObject({
      tenantId: TENANT,
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      artifactId: "art-1",
      artifactVersion: 5,
      decision: "approved",
      decidedBy: DECIDER,
    });
  });

  it("returns an approval mapped without tenantId", async () => {
    seedArtifact();
    seedStage();
    const result = await createProjectApproval(baseInput);
    expect("tenantId" in result!.approval).toBe(false);
  });
});

describe("createProjectApproval - transitions", () => {
  it("marks the artifact and stage approved for an approved decision", async () => {
    seedArtifact();
    seedStage();
    const result = await createProjectApproval({
      ...baseInput,
      decision: "approved",
    });

    expect(result!.artifactStatus).toBe("approved");
    expect(result!.stageStatus).toBe("approved");
    expect(store.artifacts[0].status).toBe("approved");
    expect(store.stages[0].status).toBe("approved");
  });

  it("marks the artifact and stage rejected for a rejected decision", async () => {
    seedArtifact();
    seedStage();
    const result = await createProjectApproval({
      ...baseInput,
      decision: "rejected",
    });

    expect(result!.artifactStatus).toBe("rejected");
    expect(result!.stageStatus).toBe("rejected");
    expect(store.artifacts[0].status).toBe("rejected");
    expect(store.stages[0].status).toBe("rejected");
  });

  it("scopes the artifact update to the exact loaded version", async () => {
    seedArtifact({ id: "art-v1", version: 1, status: "approved" });
    seedArtifact({ id: "art-1", version: 2, status: "generated" });
    seedStage();

    await createProjectApproval(baseInput);

    // Only the loaded version (v2) transitions; the prior version is frozen.
    expect(store.artifacts.find((a) => a.id === "art-v1")!.status).toBe("approved");
    expect(store.artifacts.find((a) => a.id === "art-1")!.status).toBe("approved");
    expect(store.artifacts.find((a) => a.id === "art-v1")!.version).toBe(1);
  });

  it("uses decidedAt as the artifact, stage, and approval timestamp", async () => {
    seedArtifact();
    seedStage();
    await createProjectApproval(baseInput);

    expect(store.artifacts[0].updatedAt).toBe(DECIDED_AT);
    expect(store.stages[0].updatedAt).toBe(DECIDED_AT);
    expect(store.approvals[0].decidedAt).toBe(DECIDED_AT);
  });
});

describe("createProjectApproval - reviewability", () => {
  it("treats generated and needs_review artifacts as reviewable", async () => {
    for (const status of ["generated", "needs_review"] as const) {
      store.artifacts.length = 0;
      store.stages.length = 0;
      store.approvals.length = 0;
      seedArtifact({ status });
      seedStage();
      const result = await createProjectApproval(baseInput);
      expect(result).not.toBeNull();
      expect(store.approvals).toHaveLength(1);
    }
  });

  it("bubbles the non-reviewable error and inserts/updates nothing", async () => {
    const nonReviewable: readonly ProjectArtifactStatus[] = [
      "approved",
      "rejected",
      "stale",
      "failed",
      "missing",
      "not_applicable",
    ];
    for (const status of nonReviewable) {
      store.artifacts.length = 0;
      store.stages.length = 0;
      store.approvals.length = 0;
      store.approvalInserts.length = 0;
      seedArtifact({ status });
      seedStage({ status: "needs_review" });

      await expect(createProjectApproval(baseInput)).rejects.toThrow(
        /is not reviewable/
      );
      expect(store.approvals).toHaveLength(0);
      expect(store.approvalInserts).toHaveLength(0);
      // No transition leaked before the throw.
      expect(store.artifacts[0].status).toBe(status);
      expect(store.stages[0].status).toBe("needs_review");
    }
  });
});

describe("createProjectApproval - note & immutability", () => {
  it("preserves a provided note", async () => {
    seedArtifact();
    seedStage();
    const result = await createProjectApproval({
      ...baseInput,
      note: "looks good",
    });
    expect(result!.approval.note).toBe("looks good");
    expect(store.approvals[0].note).toBe("looks good");
  });

  it("maps an omitted note to undefined", async () => {
    seedArtifact();
    seedStage();
    const result = await createProjectApproval(baseInput);
    expect(result!.approval.note).toBeUndefined();
    expect(store.approvals[0].note).toBeNull();
  });

  it("does not mutate its input object", async () => {
    seedArtifact();
    seedStage();
    const input: CreateProjectApprovalInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: "art-1",
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "n",
    };
    const snapshot = structuredClone(input);
    await createProjectApproval(input);
    expect(input).toEqual(snapshot);
  });
});

describe("listProjectApprovals", () => {
  it("is tenant/project scoped and ordered by decidedAt ascending", async () => {
    seedApproval({
      id: "a-late",
      decidedAt: new Date("2026-05-21T12:00:00.000Z"),
    });
    seedApproval({
      id: "a-early",
      decidedAt: new Date("2026-05-21T08:00:00.000Z"),
    });
    seedApproval({
      id: "a-mid",
      decidedAt: new Date("2026-05-21T10:00:00.000Z"),
    });
    seedApproval({ id: "a-other-tenant", tenantId: OTHER_TENANT });
    seedApproval({ id: "a-other-project", projectId: OTHER_PROJECT });

    const approvals = await listProjectApprovals(TENANT, PROJECT);
    expect(approvals.map((a) => a.id)).toEqual(["a-early", "a-mid", "a-late"]);
  });
});

describe("listProjectApprovalsForArtifact", () => {
  it("is tenant/project/artifact scoped, ordered by artifactVersion then decidedAt", async () => {
    seedApproval({
      id: "v2-late",
      artifactVersion: 2,
      decidedAt: new Date("2026-05-21T12:00:00.000Z"),
    });
    seedApproval({
      id: "v1",
      artifactVersion: 1,
      decidedAt: new Date("2026-05-21T11:00:00.000Z"),
    });
    seedApproval({
      id: "v2-early",
      artifactVersion: 2,
      decidedAt: new Date("2026-05-21T09:00:00.000Z"),
    });
    seedApproval({ id: "other-artifact", artifactId: "art-99" });
    seedApproval({ id: "other-tenant", tenantId: OTHER_TENANT });

    const approvals = await listProjectApprovalsForArtifact(
      TENANT,
      PROJECT,
      "art-1"
    );
    expect(approvals.map((a) => a.id)).toEqual(["v1", "v2-early", "v2-late"]);
  });
});

describe("getProjectApprovalById", () => {
  it("is tenant/project/id scoped", async () => {
    seedApproval({ id: "appr-1" });
    const approval = await getProjectApprovalById(TENANT, PROJECT, "appr-1");
    expect(approval).not.toBeNull();
    expect(approval!.id).toBe("appr-1");
    expect("tenantId" in approval!).toBe(false);
  });

  it("returns null for the wrong tenant, wrong project, or missing id", async () => {
    seedApproval({ id: "appr-1" });
    expect(await getProjectApprovalById(OTHER_TENANT, PROJECT, "appr-1")).toBeNull();
    expect(await getProjectApprovalById(TENANT, OTHER_PROJECT, "appr-1")).toBeNull();
    expect(await getProjectApprovalById(TENANT, PROJECT, "missing")).toBeNull();
  });
});

describe("module surface", () => {
  it("exposes only the intended repository functions", () => {
    expect(Object.keys(approvalStore).sort()).toEqual(
      [
        "createProjectApproval",
        "getProjectApprovalById",
        "listProjectApprovals",
        "listProjectApprovalsForArtifact",
      ].sort()
    );
  });
});
