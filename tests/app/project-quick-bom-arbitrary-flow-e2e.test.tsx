/**
 * @vitest-environment jsdom
 *
 * App-level arbitrary Project Quick BoM E2E (Prompt 97).
 *
 * Proves a non-seeded quick_bom Project can move through the current app wiring:
 * upload -> normalize -> SKU draft -> explicit SKU review -> SKU approval ->
 * configuration draft -> explicit configuration review -> configuration approval ->
 * pricing -> priced approval -> export -> export approval -> download.
 *
 * Only framework/store boundaries are mocked. The page, route handlers, upload
 * service, CSV loader, normalizer, SKU/config review services, pricing service,
 * Mantle export writer, and download service run for real.
 */
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import ProjectQuickBomPage from "@/app/projects/[id]/quick-bom/page";
import { GET as workspaceGET } from "@/app/api/projects/[id]/quick-bom/route";
import { POST as approvalPOST } from "@/app/api/projects/[id]/quick-bom/approvals/route";
import { POST as uploadPOST } from "@/app/api/projects/[id]/quick-bom/files/route";
import { POST as normalizePOST } from "@/app/api/projects/[id]/quick-bom/files/[fileId]/normalize/route";
import { POST as skuResolutionPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route";
import { POST as skuResolutionReviewPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route";
import { POST as configExpansionPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/route";
import { POST as configExpansionReviewPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route";
import { POST as pricedBoqPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/route";
import { POST as pricedBoqReviewPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route";
import { POST as exportPackagePOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/route";
import { GET as exportDownloadGET } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download/route";

import type { NextRequest } from "next/server";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
  SkuResolutionDecision,
} from "@/types/project";
import type { CreateProjectInput } from "@/lib/db/project-store";
import type { CreateProjectArtifactVersionInput } from "@/lib/db/project-artifact-store";
import type {
  CreateProjectApprovalInput,
  CreateProjectApprovalResult,
} from "@/lib/db/project-approval-store";
import type { CreateProjectFileRecordInput } from "@/lib/db/project-file-store";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";

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
type FileRow = ProjectFile & { tenantId: string };
type ArtifactRow = ProjectArtifact & { tenantId: string };
type ApprovalRow = ProjectApproval & { tenantId: string };

const hoisted = vi.hoisted(() => {
  const TENANT = "11111111-1111-1111-1111-111111111111";
  const SESSION = {
    userId: "engineer-1",
    tenantId: TENANT,
    email: "engineer@stc.example",
    name: "STC Engineer",
    role: "engineer",
  };
  const route = { projectId: "" };

  const projects: ProjectRow[] = [];
  const stages: StageRow[] = [];
  const files: FileRow[] = [];
  const artifacts: ArtifactRow[] = [];
  const approvals: ApprovalRow[] = [];
  const seq = { project: 0, stage: 0, file: 0, artifact: 0, approval: 0 };

  const QUICK_BOM_STAGES: ReadonlyArray<readonly [ProjectStageId, number]> = [
    ["boq_format_validation", 20],
    ["sku_resolution", 30],
    ["configuration_expansion_review", 35],
    ["boq_pricing_review", 70],
    ["export_approval", 90],
  ];

  function copyDate(d: Date): Date {
    return new Date(d.getTime());
  }

  function toFile(row: FileRow): ProjectFile {
    return {
      id: row.id,
      projectId: row.projectId,
      fileRole: row.fileRole,
      fileName: row.fileName,
      storagePath: row.storagePath,
      ...(row.mimeType !== undefined ? { mimeType: row.mimeType } : {}),
      ...(row.sizeBytes !== undefined ? { sizeBytes: row.sizeBytes } : {}),
      uploadedAt: copyDate(row.uploadedAt),
      retainUntil: copyDate(row.retainUntil),
      ...(row.roleCorrectedBy !== undefined
        ? { roleCorrectedBy: row.roleCorrectedBy }
        : {}),
    };
  }

  function toArtifact(row: ArtifactRow): ProjectArtifact {
    return {
      id: row.id,
      projectId: row.projectId,
      stageId: row.stageId,
      type: row.type,
      status: row.status,
      version: row.version,
      payload: row.payload,
      ...(row.filePath !== undefined ? { filePath: row.filePath } : {}),
      sourceFileIds: [...row.sourceFileIds],
      sourceArtifactIds: [...row.sourceArtifactIds],
      createdAt: copyDate(row.createdAt),
      updatedAt: copyDate(row.updatedAt),
    };
  }

  function toApproval(row: ApprovalRow): ProjectApproval {
    return {
      id: row.id,
      projectId: row.projectId,
      stageId: row.stageId,
      artifactId: row.artifactId,
      artifactVersion: row.artifactVersion,
      decision: row.decision,
      decidedBy: row.decidedBy,
      decidedAt: copyDate(row.decidedAt),
      ...(row.note !== undefined ? { note: row.note } : {}),
    };
  }

  function assembleProject(projectId: string, tenantId: string): Project | null {
    const row = projects.find((p) => p.id === projectId && p.tenantId === tenantId);
    if (row === undefined) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      ...(row.customerName !== undefined ? { customerName: row.customerName } : {}),
      mode: row.mode,
      ...(row.pricingConfig !== undefined ? { pricingConfig: { ...row.pricingConfig } } : {}),
      files: files
        .filter((f) => f.tenantId === tenantId && f.projectId === projectId)
        .map(toFile),
      evidence: [],
      stages: stages
        .filter((s) => s.tenantId === tenantId && s.projectId === projectId)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          id: s.id,
          projectId: s.projectId,
          stageId: s.stageId,
          order: s.order,
          status: s.status,
          createdAt: copyDate(s.createdAt),
          updatedAt: copyDate(s.updatedAt),
        })),
      artifacts: [],
      approvals: [],
      createdAt: copyDate(row.createdAt),
      updatedAt: copyDate(row.updatedAt),
    };
  }

  async function createProject(input: CreateProjectInput): Promise<Project> {
    const now = new Date("2026-06-07T10:00:00.000Z");
    const id = `proj-${(seq.project += 1)}`;
    projects.push({
      id,
      tenantId: input.tenantId,
      name: input.name,
      ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
      mode: input.mode,
      ...(input.pricingConfig !== undefined ? { pricingConfig: { ...input.pricingConfig } } : {}),
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

  async function getProjectById(tenantId: string, projectId: string): Promise<Project | null> {
    return assembleProject(projectId, tenantId);
  }

  async function createProjectFileRecord(
    input: CreateProjectFileRecordInput
  ): Promise<ProjectFile> {
    const uploadedAt = input.uploadedAt ?? new Date("2026-06-07T10:01:00.000Z");
    const retainUntil = new Date(uploadedAt.getTime());
    retainUntil.setFullYear(retainUntil.getFullYear() + 1);
    const row: FileRow = {
      id: `file-${(seq.file += 1)}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      fileRole: input.fileRole,
      fileName: input.fileName,
      storagePath: input.storagePath,
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      uploadedAt,
      retainUntil,
    };
    files.push(row);
    return toFile(row);
  }

  async function getProjectFileById(
    tenantId: string,
    projectId: string,
    fileId: string
  ): Promise<ProjectFile | null> {
    const row = files.find(
      (f) => f.tenantId === tenantId && f.projectId === projectId && f.id === fileId
    );
    return row === undefined ? null : toFile(row);
  }

  async function listProjectFiles(
    tenantId: string,
    projectId: string
  ): Promise<ProjectFile[]> {
    return files
      .filter((f) => f.tenantId === tenantId && f.projectId === projectId)
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
      .map(toFile);
  }

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
    const now = new Date("2026-06-07T10:02:00.000Z");
    const row: ArtifactRow = {
      id: `art-${(seq.artifact += 1)}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      stageId: input.stageId,
      type: input.type,
      status: input.status ?? "generated",
      version,
      payload: input.payload ?? {},
      ...(input.filePath !== undefined ? { filePath: input.filePath } : {}),
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

  async function createProjectApproval(
    input: CreateProjectApprovalInput
  ): Promise<CreateProjectApprovalResult | null> {
    const artifact = artifacts.find(
      (a) =>
        a.tenantId === input.tenantId &&
        a.projectId === input.projectId &&
        a.id === input.artifactId
    );
    if (artifact === undefined) return null;
    if (artifact.status !== "generated" && artifact.status !== "needs_review") {
      throw new Error(`Artifact ${artifact.id} is not reviewable.`);
    }
    const stage = stages.find(
      (s) =>
        s.tenantId === input.tenantId &&
        s.projectId === input.projectId &&
        s.stageId === artifact.stageId
    );
    if (stage === undefined) throw new Error("Project stage not found.");

    const decidedAt = input.decidedAt ?? new Date("2026-06-07T10:03:00.000Z");
    const artifactStatus: ProjectArtifactStatus =
      input.decision === "approved" ? "approved" : "rejected";
    const stageStatus: ProjectStageStatus =
      input.decision === "approved" ? "approved" : "rejected";
    const approval: ApprovalRow = {
      id: `appr-${(seq.approval += 1)}`,
      tenantId: input.tenantId,
      projectId: input.projectId,
      stageId: artifact.stageId,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt,
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    approvals.push(approval);
    artifact.status = artifactStatus;
    artifact.updatedAt = decidedAt;
    stage.status = stageStatus;
    stage.updatedAt = decidedAt;
    return { approval: toApproval(approval), artifactStatus, stageStatus };
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

  function latestArtifact(type: ProjectArtifactType): ProjectArtifact {
    const row = artifacts
      .filter((a) => a.tenantId === TENANT && a.projectId === route.projectId && a.type === type)
      .sort((a, b) => b.version - a.version)[0];
    if (row === undefined) throw new Error(`Missing artifact ${type}.`);
    return toArtifact(row);
  }

  function allFilePaths(): string[] {
    const paths = files.map((f) => f.storagePath);
    for (const artifact of artifacts) {
      if (artifact.filePath !== undefined) paths.push(artifact.filePath);
    }
    return paths;
  }

  function reset(): void {
    projects.length = 0;
    stages.length = 0;
    files.length = 0;
    artifacts.length = 0;
    approvals.length = 0;
    route.projectId = "";
    seq.project = 0;
    seq.stage = 0;
    seq.file = 0;
    seq.artifact = 0;
    seq.approval = 0;
  }

  return {
    TENANT,
    SESSION,
    route,
    store: {
      createProject,
      getProjectById,
      createProjectFileRecord,
      getProjectFileById,
      listProjectFiles,
      createProjectArtifactVersion,
      getProjectArtifactById,
      listProjectArtifacts,
      createProjectApproval,
      listProjectApprovals,
      latestArtifact,
      allFilePaths,
      reset,
    },
  };
});

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: () => hoisted.SESSION,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: hoisted.route.projectId }),
}));
vi.mock("@/lib/db/project-store", () => ({
  createProject: hoisted.store.createProject,
  getProjectById: hoisted.store.getProjectById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  createProjectFileRecord: hoisted.store.createProjectFileRecord,
  getProjectFileById: hoisted.store.getProjectFileById,
  listProjectFiles: hoisted.store.listProjectFiles,
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

const PRICING_CONFIG: ProjectPricingConfig = {
  currency: "SAR",
  mode: "markup",
  ratePercent: 0,
  vatRatePercent: 15,
  roundingDecimals: 2,
};
const CSV = [
  "#,Description,Part Number,Qty",
  "1,Network subscription,CISCO-NETWORK-SUB,1",
  "2,Standalone optic,SFP-10G-LR-S=,1",
  "3,Standalone optic,SFP-10/25G-LR-S=,1",
  "4,Desk phone,CP-7841-K9=,1",
].join("\n");
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

interface RecordedFetch {
  url: string;
  method: string;
  body: unknown;
}

function emptyRequest(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

function jsonRequest(body: unknown): NextRequest {
  return {
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

// Like jsonRequest, but also reports an application/json content-type header so a
// route that gates body parsing on content-type (sku-resolution) reads the body.
function jsonContentTypeRequest(body: unknown): NextRequest {
  return {
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

function formRequest(form: FormData): NextRequest {
  return {
    headers: { get: () => null },
    formData: () => Promise.resolve(form),
  } as unknown as NextRequest;
}

function parsedJsonBody(init?: RequestInit): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : null;
}

function dispatchQuickBomFetch(): RecordedFetch[] {
  const calls: RecordedFetch[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawUrl = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? parsedJsonBody(init) : init?.body ?? null;
      calls.push({ url: rawUrl, method, body });

      const path = new URL(rawUrl, "http://bomatic.test").pathname;
      const match = /^\/api\/projects\/([^/]+)\/quick-bom(?:\/(.*))?$/.exec(path);
      if (match === null) throw new Error(`Unexpected fetch URL: ${rawUrl}`);
      const id = match[1];
      const rest = match[2] ?? "";

      if (rest === "" && method === "GET") {
        return workspaceGET(emptyRequest(), { params: { id } });
      }
      if (rest === "files" && method === "POST") {
        return uploadPOST(formRequest(init?.body as FormData), { params: { id } });
      }
      const normalizeMatch = /^files\/([^/]+)\/normalize$/.exec(rest);
      if (normalizeMatch && method === "POST") {
        return normalizePOST(emptyRequest(), {
          params: { id, fileId: normalizeMatch[1] },
        });
      }
      const skuMatch = /^artifacts\/([^/]+)\/sku-resolution$/.exec(rest);
      if (skuMatch && method === "POST") {
        // Faithful to the route contract: the body is honored only when the page
        // sends an application/json content-type, so derive the request from the
        // recorded header (not from body presence). A header-less POST stays the
        // default no-body path.
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const hasJson = (headers["Content-Type"] ?? headers["content-type"] ?? "")
          .toLowerCase()
          .includes("application/json");
        return skuResolutionPOST(
          hasJson ? jsonContentTypeRequest(parsedJsonBody(init)) : emptyRequest(),
          { params: { id, artifactId: skuMatch[1] } }
        );
      }
      const configMatch = /^artifacts\/([^/]+)\/configuration-expansion$/.exec(rest);
      if (configMatch && method === "POST") {
        return configExpansionPOST(emptyRequest(), {
          params: { id, artifactId: configMatch[1] },
        });
      }
      const pricedMatch = /^artifacts\/([^/]+)\/priced-boq$/.exec(rest);
      if (pricedMatch && method === "POST") {
        return pricedBoqPOST(emptyRequest(), {
          params: { id, artifactId: pricedMatch[1] },
        });
      }
      const pricedReviewMatch = /^artifacts\/([^/]+)\/priced-boq\/review$/.exec(rest);
      if (pricedReviewMatch && method === "POST") {
        return pricedBoqReviewPOST(jsonRequest(parsedJsonBody(init)), {
          params: { id, artifactId: pricedReviewMatch[1] },
        });
      }
      const exportMatch = /^artifacts\/([^/]+)\/export-package$/.exec(rest);
      if (exportMatch && method === "POST") {
        return exportPackagePOST(emptyRequest(), {
          params: { id, artifactId: exportMatch[1] },
        });
      }
      if (rest === "approvals" && method === "POST") {
        return approvalPOST(jsonRequest(parsedJsonBody(init)), { params: { id } });
      }
      throw new Error(`Unexpected fetch route: ${method} ${path}`);
    })
  );
  return calls;
}

async function approveArtifact(projectId: string, artifactId: string): Promise<void> {
  const res = await approvalPOST(
    jsonRequest({ artifactId, decision: "approved" }),
    { params: { id: projectId } }
  );
  expect(res.status).toBe(200);
}

async function createArbitraryProject(): Promise<Project> {
  const project = await hoisted.store.createProject({
    tenantId: hoisted.TENANT,
    name: "Arbitrary Customer Quick BoM",
    customerName: "Arbitrary Customer",
    mode: "quick_bom",
    pricingConfig: PRICING_CONFIG,
  });
  hoisted.route.projectId = project.id;
  return project;
}

function skuAcceptActions(artifact: ProjectArtifact) {
  const decisions = (artifact.payload.decisions ?? []) as SkuResolutionDecision[];
  expect(decisions).toHaveLength(4);
  return decisions.map((decision) => {
    expect(decision.status).toBe("needs_review");
    expect(decision.suggestions.length).toBeGreaterThan(0);
    return {
      decision: "accept" as const,
      sourceFileId: decision.sourceFileId,
      sourceRowNumber: decision.sourceRowNumber,
      acceptedSku: decision.suggestions[0].suggestedSku,
    };
  });
}

function configAcceptDecisions(artifact: ProjectArtifact) {
  const lines = (artifact.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
  const expansionLines = lines.filter((line) => line.origin === "expansion");
  expect(expansionLines.length).toBeGreaterThan(0);
  return expansionLines.map((line) => ({
    lineId: line.lineId,
    action: "accept" as const,
  }));
}

function assertNoPayloadLeak(): void {
  const dom = document.body.textContent ?? "";
  expect(dom).not.toContain("CISCO-NETWORK-SUB");
  expect(dom).not.toContain("CP-7841-K9=");
  expect(dom).not.toContain("customer-upload.csv");
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const path of hoisted.store.allFilePaths()) {
    rmSync(path, { force: true });
    const dir = dirname(path);
    if (dir.includes("bomatic-project-uploads")) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  hoisted.store.reset();
});

describe("arbitrary Project Quick BoM app-level E2E (Prompt 97)", () => {
  it("runs upload through approved export download without using the seeded fixture", async () => {
    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    expect(await screen.findByTestId("project-name")).toHaveTextContent(
      "Arbitrary Customer Quick BoM"
    );
    expect(screen.getByTestId("customer-name")).toHaveTextContent("Arbitrary Customer");

    const file = new File([CSV], "customer-upload.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("workflow-upload-file"), {
        target: { files: [file] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-upload-normalize"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-normalized_boq")).toHaveTextContent("generated")
    );
    assertNoPayloadLeak();

    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("reject-sku_resolution")).toBeNull();

    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    const skuReviewRes = await skuResolutionReviewPOST(
      jsonRequest({ actions: skuAcceptActions(skuDraft) }),
      { params: { id: project.id, artifactId: skuDraft.id } }
    );
    expect(skuReviewRes.status).toBe(200);
    const skuReviewBody = await skuReviewRes.json();
    await approveArtifact(project.id, skuReviewBody.artifact.id);

    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    const createConfig = await screen.findByTestId(
      "workflow-create-configuration_expansion"
    );
    await act(async () => {
      fireEvent.click(createConfig);
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("reject-configuration_expansion")).toBeNull();

    const configDraft = hoisted.store.latestArtifact("configuration_expansion");
    expect(configDraft.payload.payloadKind).toBe("configuration_expansion_draft");
    const configReviewRes = await configExpansionReviewPOST(
      jsonRequest({ decisions: configAcceptDecisions(configDraft) }),
      { params: { id: project.id, artifactId: configDraft.id } }
    );
    expect(configReviewRes.status).toBe(200);
    const configReviewBody = await configReviewRes.json();
    const acceptedConfig = hoisted.store.latestArtifact("configuration_expansion");
    const acceptedLines = (acceptedConfig.payload.acceptedLines ?? []) as ConfigurationExpansionDraftLine[];
    for (const optic of OPTICS) {
      const matches = acceptedLines.filter((line) => line.sku === optic);
      expect(matches).toHaveLength(1);
      expect(matches[0].origin).toBe("customer");
    }
    expect(
      acceptedLines.some((line) => line.origin === "expansion" && OPTICS.includes(line.sku))
    ).toBe(false);
    await approveArtifact(project.id, configReviewBody.artifact.id);

    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    const createPriced = await screen.findByTestId("workflow-create-priced_boq");
    await act(async () => {
      fireEvent.click(createPriced);
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("approved")
    );

    const createExport = await screen.findByTestId("workflow-create-export_package");
    await act(async () => {
      fireEvent.click(createExport);
    });
    expect(await screen.findByTestId("approve-export_package")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-export_package")).toHaveTextContent("approved")
    );
    const link = await screen.findByTestId("download-export_package");
    const exportArtifact = hoisted.store.latestArtifact("export_package");
    expect(link).toHaveAttribute(
      "href",
      `/api/projects/${project.id}/quick-bom/artifacts/${exportArtifact.id}/export-package/download`
    );
    assertNoPayloadLeak();

    const downloadRes = await exportDownloadGET(emptyRequest(), {
      params: { id: project.id, artifactId: exportArtifact.id },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(XLSX_MIME);
    expect(downloadRes.headers.get("content-disposition") ?? "").toMatch(
      /^attachment; filename="/
    );
    const bytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);

    expect(calls.some((c) => c.method === "POST" && /\/quick-bom\/files$/.test(c.url))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && /\/normalize$/.test(c.url))).toBe(true);
    const defaultSkuCall = calls.find(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(defaultSkuCall).toBeDefined();
    // Default flow (checkbox never clicked): no JSON body and no catalogProfile.
    expect(defaultSkuCall?.body).toBeNull();
    expect(JSON.stringify(defaultSkuCall)).not.toContain("catalogProfile");
    expect(calls.some((c) => c.method === "POST" && /\/configuration-expansion$/.test(c.url))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && /\/priced-boq$/.test(c.url))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && /\/export-package$/.test(c.url))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && /\/quick-bom\/approvals$/.test(c.url))).toBe(true);
  });
});

describe("Honeywell demo catalog opt-in app-level E2E (Prompt 113)", () => {
  it("opting in posts the catalogProfile body and persists the Honeywell overlay source", async () => {
    await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    const file = new File([CSV], "customer-upload.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("workflow-upload-file"), {
        target: { files: [file] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-upload-normalize"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-normalized_boq")).toHaveTextContent("generated")
    );

    // Explicit engineer opt-in: tick the Honeywell demo catalog checkbox before
    // creating the SKU resolution draft. This checkbox is the only thing that
    // selects the demo overlay - nothing is inferred from project/customer/file.
    const checkbox = screen.getByTestId("workflow-honeywell-demo-catalog-profile");
    expect(checkbox).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(checkbox);
    });
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });

    // The draft still requires explicit line-level review; it is never auto-approved.
    expect(
      await screen.findByTestId("line-review-required-sku_resolution")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("reject-sku_resolution")).toBeNull();

    // The SKU-resolution fetch carried exactly the explicit Honeywell profile body.
    const skuCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCalls).toHaveLength(1);
    expect(skuCalls[0].body).toEqual({ catalogProfile: "honeywell_mvp_demo" });

    // The persisted draft resolved through the explicit Honeywell overlay source.
    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");
    const summary = (skuDraft.payload as { summary: { catalogSource: string } }).summary;
    expect(summary.catalogSource).toBe("honeywell_mvp_demo_catalog_supplement");

    // The opt-in exercises no downstream authority: no SKU approval, configuration
    // expansion, pricing, export, approval record, or download.
    expect(calls.some((c) => /\/configuration-expansion$/.test(c.url))).toBe(false);
    expect(calls.some((c) => /\/priced-boq$/.test(c.url))).toBe(false);
    expect(calls.some((c) => /\/export-package$/.test(c.url))).toBe(false);
    expect(calls.some((c) => /\/quick-bom\/approvals$/.test(c.url))).toBe(false);
    expect(screen.queryByTestId("download-export_package")).toBeNull();
    assertNoPayloadLeak();
  });
});

describe("arbitrary Project Quick BoM app E2E static purity", () => {
  const TEST_PATH = join(
    process.cwd(),
    "tests/app/project-quick-bom-arbitrary-flow-e2e.test.tsx"
  );
  const PRODUCT_FILES = [
    "src/app/projects/[id]/quick-bom/page.tsx",
    "src/app/api/projects/[id]/quick-bom/route.ts",
    "src/app/api/projects/[id]/quick-bom/approvals/route.ts",
    "src/app/api/projects/[id]/quick-bom/files/route.ts",
    "src/app/api/projects/[id]/quick-bom/files/[fileId]/normalize/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/route.ts",
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download/route.ts",
  ];
  const FORBIDDEN_IMPORT_PREFIXES = [
    "@/lib/adapters",
    "@/lib/agent",
    "@/lib/catalog",
    "@/coordinator",
    "@/engines",
    "@anthropic-ai",
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

  it("keeps this test ASCII-only and free of forbidden imports", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    assertNoForbiddenImports("test", source);
  });

  it("keeps directly wired page and route imports pure", () => {
    for (const rel of PRODUCT_FILES) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(/[^\x00-\x7F]/.test(source), `${rel} is ASCII`).toBe(false);
      assertNoForbiddenImports(rel, source);
    }
  });
});
