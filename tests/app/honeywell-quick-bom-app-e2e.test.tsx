/**
 * @vitest-environment jsdom
 *
 * App-level Honeywell Quick BoM E2E (Prompt 81).
 *
 * Proves the real demo fixture, the real Quick BoM workspace GET route, the real
 * approval POST route/service, and the real Prompt 80 page work together. ONLY
 * framework/store boundaries are mocked: next/navigation useParams (so the page
 * has a route id), requireAuth (so the real route handlers see a tenant-scoped
 * engineer session), and the three Project DB store modules (replaced by one
 * in-memory Project store). The Honeywell rule pack, demo pricing fixture,
 * configuration expansion, pricing, and Mantle export model/writer all run for
 * real - the export workbook is generated on disk.
 *
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (Quick BoM flow: normalized BoQ -> SKU/intent resolution -> configuration
 * expansion draft -> engineer review -> approved configuration_expansion ->
 * deterministic SAR pricing -> approved priced_boq -> Mantle-format export).
 */
import { readFileSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import ProjectQuickBomPage from "@/app/projects/[id]/quick-bom/page";
import { GET } from "@/app/api/projects/[id]/quick-bom/route";
import { POST } from "@/app/api/projects/[id]/quick-bom/approvals/route";
import {
  createHoneywellQuickBomDemoProjectFixture,
  type HoneywellQuickBomDemoProjectFixtureResult,
} from "@/lib/projects/honeywell-demo-project-fixture";

import type { NextRequest } from "next/server";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";
import type { CreateProjectInput } from "@/lib/db/project-store";
import type { CreateProjectArtifactVersionInput } from "@/lib/db/project-artifact-store";
import type {
  CreateProjectApprovalInput,
  CreateProjectApprovalResult,
} from "@/lib/db/project-approval-store";

// In-memory row shapes: the canonical TS shapes plus an internal tenantId for
// scoping (the canonical child shapes do not surface tenantId, so it is projected
// out on the way back through toArtifact/toApproval/assembleProject).
type ProjectRow = {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  pricingConfig?: ProjectPricingConfig;
  createdAt: Date;
  updatedAt: Date;
};
type StageRow = ProjectStage & { tenantId: string };
type ArtifactRow = ProjectArtifact & { tenantId: string };
type ApprovalRow = ProjectApproval & { tenantId: string };

// Hoisted so the (hoisted) vi.mock factories can close over it. Holds the mocked
// session, the runtime-settable route id, and the in-memory Project store.
const hoisted = vi.hoisted(() => {
  const TENANT = "11111111-1111-1111-1111-111111111111";
  const SESSION = {
    userId: "engineer-1",
    tenantId: TENANT,
    email: "engineer@stc.example",
    name: "STC Engineer",
    role: "engineer",
  };
  // Mutable holder: the page's mocked useParams reads the fixture-generated id.
  const route = { projectId: "" };

  const projects: ProjectRow[] = [];
  const stages: StageRow[] = [];
  const artifacts: ArtifactRow[] = [];
  const approvals: ApprovalRow[] = [];
  const seq = { project: 0, stage: 0, artifact: 0, approval: 0 };

  // The active quick_bom stages (stageId + stable global order) - sufficient for
  // the workspace UI and for the approval service to find the stage behind each
  // gated artifact (sku_resolution, configuration_expansion, priced_boq, export).
  const QUICK_BOM_STAGES: ReadonlyArray<readonly [ProjectStageId, number]> = [
    ["boq_format_validation", 20],
    ["sku_resolution", 30],
    ["configuration_expansion_review", 35],
    ["boq_pricing_review", 70],
    ["export_approval", 90],
  ];

  function toArtifact(r: ArtifactRow): ProjectArtifact {
    return {
      id: r.id,
      projectId: r.projectId,
      stageId: r.stageId,
      type: r.type,
      status: r.status,
      version: r.version,
      payload: r.payload,
      filePath: r.filePath,
      sourceFileIds: r.sourceFileIds,
      sourceArtifactIds: r.sourceArtifactIds,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  function toApproval(r: ApprovalRow): ProjectApproval {
    return {
      id: r.id,
      projectId: r.projectId,
      stageId: r.stageId,
      artifactId: r.artifactId,
      artifactVersion: r.artifactVersion,
      decision: r.decision,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt,
      note: r.note,
    };
  }
  function assembleProject(id: string, tenantId: string): Project | null {
    const row = projects.find((p) => p.id === id && p.tenantId === tenantId);
    if (row === undefined) return null;
    const projectStages: ProjectStage[] = stages
      .filter((s) => s.projectId === id && s.tenantId === tenantId)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        projectId: s.projectId,
        stageId: s.stageId,
        order: s.order,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      customerName: row.customerName,
      mode: row.mode,
      pricingConfig: row.pricingConfig,
      files: [],
      evidence: [],
      stages: projectStages,
      artifacts: [],
      approvals: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // createProject: a quick_bom Project with materialized quick_bom stages.
  async function createProject(input: CreateProjectInput): Promise<Project> {
    const id = `proj-${(seq.project += 1)}`;
    const now = new Date();
    projects.push({
      id,
      tenantId: input.tenantId,
      name: input.name,
      customerName: input.customerName,
      mode: input.mode,
      pricingConfig: input.pricingConfig,
      createdAt: now,
      updatedAt: now,
    });
    for (const [stageId, order] of QUICK_BOM_STAGES) {
      stages.push({
        id: `stg-${(seq.stage += 1)}`,
        tenantId: input.tenantId,
        projectId: id,
        stageId,
        order,
        status: "not_started",
        createdAt: now,
        updatedAt: now,
      });
    }
    return assembleProject(id, input.tenantId) as Project;
  }

  async function getProjectById(
    tenantId: string,
    projectId: string
  ): Promise<Project | null> {
    return assembleProject(projectId, tenantId);
  }

  // createProjectArtifactVersion: version per (project, type); persist payload,
  // filePath, source ids, and status. Never updates prior versions.
  async function createProjectArtifactVersion(
    input: CreateProjectArtifactVersionInput
  ): Promise<ProjectArtifact> {
    const version =
      artifacts
        .filter(
          (a) =>
            a.tenantId === input.tenantId &&
            a.projectId === input.projectId &&
            a.type === input.type
        )
        .reduce((max, a) => Math.max(max, a.version), 0) + 1;
    const now = new Date();
    const row: ArtifactRow = {
      id: `art-${(seq.artifact += 1)}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      stageId: input.stageId,
      type: input.type,
      status: input.status ?? "generated",
      version,
      payload: input.payload ?? {},
      filePath: input.filePath,
      sourceFileIds: input.sourceFileIds ? [...input.sourceFileIds] : [],
      sourceArtifactIds: input.sourceArtifactIds ? [...input.sourceArtifactIds] : [],
      createdAt: now,
      updatedAt: now,
    };
    artifacts.push(row);
    return toArtifact(row);
  }

  async function getProjectArtifactById(
    tenantId: string,
    projectId: string,
    artifactId: string
  ): Promise<ProjectArtifact | null> {
    const row = artifacts.find(
      (a) => a.tenantId === tenantId && a.projectId === projectId && a.id === artifactId
    );
    return row === undefined ? null : toArtifact(row);
  }

  async function listProjectArtifacts(
    tenantId: string,
    projectId: string
  ): Promise<ProjectArtifact[]> {
    return artifacts
      .filter((a) => a.tenantId === tenantId && a.projectId === projectId)
      .sort((a, b) =>
        a.type < b.type ? -1 : a.type > b.type ? 1 : a.version - b.version
      )
      .map(toArtifact);
  }

  // createProjectApproval: find the EXACT tenant/project/artifact id; reject a
  // missing artifact (null) or a non-reviewable one (throw) the way the service
  // expects; create one approval; transition that exact artifact and its stage to
  // approved/rejected. It never creates an artifact version.
  async function createProjectApproval(
    input: CreateProjectApprovalInput
  ): Promise<CreateProjectApprovalResult | null> {
    const artifactRow = artifacts.find(
      (a) =>
        a.tenantId === input.tenantId &&
        a.projectId === input.projectId &&
        a.id === input.artifactId
    );
    if (artifactRow === undefined) return null;
    if (artifactRow.status !== "generated" && artifactRow.status !== "needs_review") {
      throw new Error(
        `Artifact ${artifactRow.id} is not reviewable (status: "${artifactRow.status}").`
      );
    }
    const stageRow = stages.find(
      (s) =>
        s.tenantId === input.tenantId &&
        s.projectId === input.projectId &&
        s.stageId === artifactRow.stageId
    );
    if (stageRow === undefined) throw new Error("Project stage not found.");

    const decidedAt = input.decidedAt ?? new Date();
    const artifactStatus: ProjectArtifactStatus =
      input.decision === "approved" ? "approved" : "rejected";
    const stageStatus: ProjectStageStatus =
      input.decision === "approved" ? "approved" : "rejected";
    const approvalRow: ApprovalRow = {
      id: `appr-${(seq.approval += 1)}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      stageId: artifactRow.stageId,
      artifactId: artifactRow.id,
      artifactVersion: artifactRow.version,
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt,
      note: input.note,
    };
    approvals.push(approvalRow);
    artifactRow.status = artifactStatus;
    artifactRow.updatedAt = decidedAt;
    stageRow.status = stageStatus;
    stageRow.updatedAt = decidedAt;
    return { approval: toApproval(approvalRow), artifactStatus, stageStatus };
  }

  async function listProjectApprovals(
    tenantId: string,
    projectId: string
  ): Promise<ProjectApproval[]> {
    return approvals
      .filter((a) => a.tenantId === tenantId && a.projectId === projectId)
      .sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime())
      .map(toApproval);
  }

  return {
    TENANT,
    SESSION,
    route,
    store: {
      createProject,
      getProjectById,
      createProjectArtifactVersion,
      getProjectArtifactById,
      listProjectArtifacts,
      createProjectApproval,
      listProjectApprovals,
    },
  };
});

// Mock ONLY the framework/store boundaries (everything else runs for real).
vi.mock("@/lib/db/project-store", () => ({
  createProject: hoisted.store.createProject,
  getProjectById: hoisted.store.getProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: hoisted.store.createProjectArtifactVersion,
  getProjectArtifactById: hoisted.store.getProjectArtifactById,
  listProjectArtifacts: hoisted.store.listProjectArtifacts,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: hoisted.store.createProjectApproval,
  listProjectApprovals: hoisted.store.listProjectApprovals,
}));
vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: () => hoisted.SESSION,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: hoisted.route.projectId }),
}));

const DECIDED_BY = "demo-seeder@stc.example";
const DECIDED_AT = new Date("2026-06-06T09:00:00.000Z");
const PROJECT_NAME = "Honeywell Quick BoM Demo";
const CUSTOMER_NAME = "Honeywell";
const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";
// Payload-only tokens: present only inside artifact payloads (never in the read
// model), so they must never reach the DOM.
const PAYLOAD_ONLY_SKU = "CW9178I-CFG";
const PAYLOAD_ONLY_SOURCE_FILE = "Honeywell_BoQ.xlsx";

const FORBIDDEN_IMPORT_PREFIXES = [
  "@/lib/adapters",
  "@/lib/agent",
  "@/lib/catalog",
  "@/coordinator",
  "@/engines",
  "@anthropic-ai",
];

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

// Stub global fetch so the page's GET/POST drive the REAL route handlers; any URL
// other than the two Quick BoM routes fails the test. Records every call.
function stubQuickBomFetch(): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });

      const match = /\/api\/projects\/([^/]+)\/quick-bom(\/approvals)?$/.exec(url);
      if (match === null) throw new Error(`Unexpected fetch URL in app E2E: ${url}`);
      const id = match[1];

      if (match[2] === "/approvals") {
        if (method !== "POST") throw new Error(`Unexpected ${method} on approvals route`);
        const request = {
          headers: { get: () => null },
          json: () => Promise.resolve(body),
        } as unknown as NextRequest;
        return POST(request, { params: { id } });
      }
      const request = { headers: { get: () => null } } as unknown as NextRequest;
      return GET(request, { params: { id } });
    })
  );
  return calls;
}

// Extract module specifiers from `... from "x"` import statements only (so doc
// comments mentioning a module name are not matched - call-shape, not mentions).
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Honeywell Quick BoM app-level E2E (Prompt 81)", () => {
  let fixtureResult: HoneywellQuickBomDemoProjectFixtureResult;
  let tmpDir: string;
  let outputPath: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "bomatic-hw-app-e2e-"));
    outputPath = join(tmpDir, "honeywell-quick-bom-demo.xlsx");
    fixtureResult = await createHoneywellQuickBomDemoProjectFixture({
      tenantId: hoisted.SESSION.tenantId,
      decidedBy: DECIDED_BY,
      outputPath,
      decidedAt: DECIDED_AT,
      projectName: PROJECT_NAME,
      customerName: CUSTOMER_NAME,
      projectIdLabel: "HW-DEMO",
      dealId: "DEAL-1",
      priceList: "STC SAR Price List",
    });
    // The page reads this id from the (mocked) route params.
    hoisted.route.projectId = fixtureResult.project.id;
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("seeds the real demo, renders the workspace, then gates and approves the export to ready", async () => {
    // --- The seeded fixture itself -----------------------------------------
    expect(fixtureResult.workspace.status).toBe("ok");
    expect(fixtureResult.exportPackageArtifact.type).toBe("export_package");
    expect(fixtureResult.exportPackageArtifact.status).toBe("needs_review");

    // The Mantle-format workbook was generated on disk and is non-empty.
    expect(statSync(outputPath).size).toBeGreaterThan(0);

    // Standalone optics stay customer-origin in the accepted expanded BoM (the
    // export evidence) - never auto-attached or reinterpreted as expansion children.
    const cePayload = fixtureResult.configurationExpansionArtifact.payload as {
      acceptedLines: Array<{ sku: string; origin: string }>;
    };
    const optics = cePayload.acceptedLines.filter(
      (l) => l.sku === OPTIC_A || l.sku === OPTIC_B
    );
    expect(optics).toHaveLength(2);
    expect(optics.every((l) => l.origin === "customer")).toBe(true);
    expect(
      cePayload.acceptedLines.some(
        (l) => l.origin === "expansion" && (l.sku === OPTIC_A || l.sku === OPTIC_B)
      )
    ).toBe(false);

    // --- Render the page over the REAL GET route ---------------------------
    const calls = stubQuickBomFetch();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Project summary: name, customer, tenant, SAR pricing config summary.
    expect(screen.getByTestId("project-name")).toHaveTextContent(PROJECT_NAME);
    expect(screen.getByTestId("customer-name")).toHaveTextContent(CUSTOMER_NAME);
    expect(screen.getByTestId("project-id")).toHaveTextContent(fixtureResult.project.id);
    expect(screen.getByTestId("project-tenant")).toHaveTextContent(hoisted.TENANT);
    const pricing = screen.getByTestId("pricing-config");
    expect(pricing).toHaveTextContent("SAR");
    expect(pricing).toHaveTextContent("markup");
    expect(pricing).toHaveTextContent("VAT 15");

    // Readiness state and the export_package spine artifact are displayed.
    expect(screen.getByTestId("readiness-messages")).toHaveTextContent(
      "Export package is present and awaiting approval."
    );
    expect(screen.getByTestId("spine-export_package")).toBeInTheDocument();

    // Before export approval: sku_resolution, configuration_expansion, and
    // priced_boq are approved; export_package is needs_review and is the only
    // spine artifact offering Approve/Reject. normalized_boq is never gated.
    expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved");
    expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved");
    expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("approved");
    expect(screen.getByTestId("spine-export_package")).toHaveTextContent("needs review");
    expect(screen.getByTestId("approve-export_package")).toBeInTheDocument();
    expect(screen.getByTestId("reject-export_package")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-normalized_boq")).toBeNull();
    expect(screen.queryByTestId("reject-normalized_boq")).toBeNull();

    // The read model never carries artifact payloads, so payload-only values (a
    // customer SKU, the demo source filename, an optic SKU) never reach the DOM.
    const domBefore = document.body.textContent ?? "";
    expect(domBefore).not.toContain(PAYLOAD_ONLY_SKU);
    expect(domBefore).not.toContain(PAYLOAD_ONLY_SOURCE_FILE);
    expect(domBefore).not.toContain(OPTIC_A);

    // --- Approve the export package over the REAL POST route ---------------
    const exportArtifactId = fixtureResult.exportPackageArtifact.id;
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post).toBeTruthy();
    expect(post!.url).toMatch(/\/api\/projects\/[^/]+\/quick-bom\/approvals$/);
    expect(post!.body).toEqual({ artifactId: exportArtifactId, decision: "approved" });

    // After the POST: the page refreshes from the returned workspace, the export
    // package is approved, the deliverable-ready readiness message shows, and all
    // four approvals are listed (3 seeded + this export approval).
    await waitFor(() =>
      expect(screen.getByTestId("spine-export_package")).toHaveTextContent("approved")
    );
    expect(screen.getByTestId("readiness-messages")).toHaveTextContent(
      "Quick BoM customer deliverable is ready"
    );
    expect(screen.getAllByTestId("approval-row")).toHaveLength(4);
    expect(screen.queryByTestId("approve-export_package")).toBeNull();
    // Refreshed from the POST response, not via a second GET reload.
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);

    // Payload-only values still absent after the refresh.
    const domAfter = document.body.textContent ?? "";
    expect(domAfter).not.toContain(PAYLOAD_ONLY_SKU);
    expect(domAfter).not.toContain(OPTIC_B);
  });
});

describe("app E2E static source purity", () => {
  const TEST_PATH = join(
    process.cwd(),
    "tests/app/honeywell-quick-bom-app-e2e.test.tsx"
  );
  // The product files this app-level E2E wires together; none may import an
  // AI/catalog/coordinator/engine/adapter module, proving this prompt added no
  // forbidden runtime coupling to them (and did not change their import purity).
  const PRODUCT_FILES = [
    "src/app/projects/[id]/quick-bom/page.tsx",
    "src/app/api/projects/[id]/quick-bom/route.ts",
    "src/app/api/projects/[id]/quick-bom/approvals/route.ts",
    "src/lib/projects/honeywell-demo-project-fixture.ts",
    "src/lib/db/project-store.ts",
    "src/lib/db/project-artifact-store.ts",
    "src/lib/db/project-approval-store.ts",
  ];

  function assertNoForbiddenImports(label: string, source: string): void {
    for (const spec of importSpecifiers(source)) {
      for (const prefix of FORBIDDEN_IMPORT_PREFIXES) {
        expect(
          spec === prefix || spec.startsWith(`${prefix}/`),
          `${label} imports forbidden module "${spec}"`
        ).toBe(false);
      }
    }
  }

  it("keeps the test ASCII-only and imports no AI/catalog/coordinator/engine/adapter module", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    assertNoForbiddenImports("test", source);
  });

  it("proves the wired product source files are unchanged in import purity (ASCII, no forbidden deps)", () => {
    for (const rel of PRODUCT_FILES) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(source), `${rel} is ASCII`).toBe(false);
      assertNoForbiddenImports(rel, source);
    }
  });
});
