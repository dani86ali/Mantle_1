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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";
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
import {
  POST as skuResolutionReviewPOST,
  GET as skuResolutionReviewGET,
} from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route";
import { POST as configExpansionPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/route";
import {
  POST as configExpansionReviewPOST,
  GET as configExpansionReviewGET,
} from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route";
import { POST as pricedBoqPOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/route";
import {
  POST as pricedBoqReviewPOST,
  GET as pricedBoqReviewGET,
} from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route";
import { POST as exportPackagePOST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/route";
import { GET as exportDownloadGET } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/export-package/download/route";

import type { NextRequest } from "next/server";
import type {
  CanonicalBoqLine,
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
import { isDeferredReviewSku } from "@/lib/projects/sku-deferred-review-set";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
} from "@/lib/projects/mantle-layout-locator";

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

// --- Real Honeywell BoQ + CCW benchmark parity (Prompt 154) ------------------
// The actual customer BoQ workbook the user uploaded from the browser, and the
// primary configured/priced CCW reference estimate it must match. The parsing
// helpers and column mappings below are lifted verbatim from
// tests/lib/projects/honeywell-ccw-parity-evidence.test.ts so this app proof is
// self-contained (no cross-test import). Evidence/regression only: no runtime,
// pricing, or configuration authority is created here.
const HONEYWELL_BOQ_PATH =
  "C:\\Pre-Sales\\Benchmarck_Files\\Honeywell_Doc_RFP\\Honeywell_BoQ.xlsx";
const CCW_PATH = "C:\\Pre-Sales\\Benchmarck_Files\\Estimate_NB167337237YA.xlsx";
const CCW_SHEET = "EstimateDetails_NB167337237YA";
// CCW column layout (1-based) confirmed from the reference sheet header row.
const CCW_COL = { lineNumber: 1, itemName: 2, quantity: 9, listPrice: 11, extendedListPrice: 12 };
const EXPECTED_ITEM_ROWS = 60;
// The pre-Prompt-153 leak shipped 52 customer rows (incl. 16 deferred) + 24
// expansion = 76; the export must never regress to that count.
const REGRESSION_ROW_COUNT = 76;
const EXPECTED_TOTAL_EXTENDED_SAR = 2185708.76;
const EXPECTED_TOTAL_INC_VAT_SAR = 2513565.07;
const EXPECTED_PRODUCT_TOTAL_SAR = 1669647.61;
const EXPECTED_SERVICE_TOTAL_SAR = 304972.06;
const EXPECTED_SUBSCRIPTION_TOTAL_SAR = 211089.09;
const MONEY_TOLERANCE = 0.01;

interface ParsedItemRow {
  sku: string;
  quantity: number;
  extended: number;
  listPrice: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Merge) return "";
  const value = cell.value;
  if (value === null || value === undefined) return "";
  return String(cell.text).trim();
}

/** Numeric value of a cell (number, formula cached result, or numeric text); null if blank/non-numeric. */
function numericCell(cell: ExcelJS.Cell): number | null {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value !== null && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (typeof result === "number") return result;
  }
  const text = cellText(cell);
  if (text === "") return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Plain string value of a cell; "" when not a string. */
function stringValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  return typeof value === "string" ? value : "";
}

/** Extended amount of a generated Mantle row: prefer the BOMATIC-cached formula result. */
function generatedExtended(cell: ExcelJS.Cell): number {
  const result = cell.result;
  if (typeof result === "number") return result;
  const value = cell.value;
  if (typeof value === "number") return value;
  return 0;
}

function aggregateBySku(rows: ParsedItemRow[]): {
  qtyBySku: Record<string, number>;
  extBySku: Record<string, number>;
  skus: string[];
} {
  const qtyBySku: Record<string, number> = {};
  const extBySku: Record<string, number> = {};
  for (const row of rows) {
    qtyBySku[row.sku] = (qtyBySku[row.sku] ?? 0) + row.quantity;
    extBySku[row.sku] = round2((extBySku[row.sku] ?? 0) + row.extended);
  }
  return { qtyBySku, extBySku, skus: Object.keys(qtyBySku) };
}

/**
 * Parse the CCW reference item rows. An item row needs a Line Number, an Item
 * Name/SKU, a positive Quantity, and a numeric ListPrice (0 allowed). A blank
 * Extended ListPrice cell (zero-priced included item) is read as 0.
 */
function parseCcwItemRows(worksheet: ExcelJS.Worksheet): ParsedItemRow[] {
  const rows: ParsedItemRow[] = [];
  for (let r = 1; r <= worksheet.rowCount; r += 1) {
    const wsRow = worksheet.getRow(r);
    const lineNumber = cellText(wsRow.getCell(CCW_COL.lineNumber));
    const sku = cellText(wsRow.getCell(CCW_COL.itemName));
    const quantity = numericCell(wsRow.getCell(CCW_COL.quantity));
    const listPrice = numericCell(wsRow.getCell(CCW_COL.listPrice));
    if (lineNumber === "" || sku === "" || quantity === null || quantity <= 0 || listPrice === null) {
      continue;
    }
    const extended = numericCell(wsRow.getCell(CCW_COL.extendedListPrice)) ?? 0;
    rows.push({ sku, quantity, extended, listPrice });
  }
  return rows;
}

/** Parse the written Mantle data rows (non-blank Part Number) above the footer, in order. */
function parseGeneratedItemRows(
  worksheet: ExcelJS.Worksheet,
  layout: Awaited<ReturnType<typeof locateMantlePriceEstimateLayout>>
): ParsedItemRow[] {
  const col = (header: string): number =>
    layout.columns.find((c) => c.header === header)!.columnNumber;
  const partCol = col("Part Number");
  const qtyCol = col("Qty");
  const listCol = col("Unit List Price");
  const extCol = col("Extended Net Price");
  const footerStart = layout.footerRows.reduce(
    (min, f) => Math.min(min, f.rowNumber),
    Number.POSITIVE_INFINITY
  );
  const rows: ParsedItemRow[] = [];
  for (let r = layout.dataStartRowNumber; r < footerStart; r += 1) {
    const wsRow = worksheet.getRow(r);
    const sku = stringValue(wsRow.getCell(partCol));
    if (sku === "") continue;
    rows.push({
      sku,
      quantity: numericCell(wsRow.getCell(qtyCol)) ?? 0,
      extended: generatedExtended(wsRow.getCell(extCol)),
      listPrice: numericCell(wsRow.getCell(listCol)) ?? 0,
    });
  }
  return rows;
}

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
      const skuResolutionReviewMatch = /^artifacts\/([^/]+)\/sku-resolution\/review$/.exec(rest);
      if (skuResolutionReviewMatch && method === "GET") {
        return skuResolutionReviewGET(emptyRequest(), {
          params: { id, artifactId: skuResolutionReviewMatch[1] },
        });
      }
      if (skuResolutionReviewMatch && method === "POST") {
        return skuResolutionReviewPOST(jsonRequest(parsedJsonBody(init)), {
          params: { id, artifactId: skuResolutionReviewMatch[1] },
        });
      }
      const configExpansionReviewMatch = /^artifacts\/([^/]+)\/configuration-expansion\/review$/.exec(rest);
      if (configExpansionReviewMatch && method === "GET") {
        return configExpansionReviewGET(emptyRequest(), {
          params: { id, artifactId: configExpansionReviewMatch[1] },
        });
      }
      if (configExpansionReviewMatch && method === "POST") {
        return configExpansionReviewPOST(jsonRequest(parsedJsonBody(init)), {
          params: { id, artifactId: configExpansionReviewMatch[1] },
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
      if (pricedReviewMatch && method === "GET") {
        return pricedBoqReviewGET(emptyRequest(), {
          params: { id, artifactId: pricedReviewMatch[1] },
        });
      }
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

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "replacement",
  "replacementFor",
  "replacementSku",
  "replacementCandidate",
  "replacementCandidates",
  "substitution",
  "substitutedSku",
  "silentSubstitution",
  "currentSku",
]);

const AUTHORITY_FLAG_KEYS = new Set([
  "replacementAuthority",
  "skuSubstitutionAuthority",
  "silentSkuSubstitution",
]);

function assertNoActiveReplacementSubstitutionFields(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) =>
      assertNoActiveReplacementSubstitutionFields(item, `${path}[${i}]`)
    );
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      expect(value, `forbidden key "${keyPath}" found in payload`).toBeUndefined();
    } else if (AUTHORITY_FLAG_KEYS.has(key)) {
      expect(value, `authority flag "${keyPath}" must be false`).toBe(false);
    } else {
      assertNoActiveReplacementSubstitutionFields(value, keyPath);
    }
  }
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
    await waitFor(
      () => expect(screen.getByTestId("approve-export_package")).toBeInTheDocument(),
      { timeout: 5000 }
    );
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

describe("Default Quick BoM catalog app-level E2E (Honeywell SKUs covered by default)", () => {
  it("creates the SKU resolution with no catalog profile and resolves via the default catalog", async () => {
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

    // There is no catalog profile checkbox anymore; the default Quick BoM approved
    // catalog (which now carries Honeywell SKU metadata) is always used.
    expect(screen.queryByTestId("workflow-honeywell-demo-catalog-profile")).toBeNull();
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });

    // The draft still requires explicit line-level review; it is never auto-approved.
    expect(
      await screen.findByTestId("line-review-required-sku_resolution")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("reject-sku_resolution")).toBeNull();

    // The SKU-resolution fetch carried no body / no catalog profile.
    const skuCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCalls).toHaveLength(1);
    expect(skuCalls[0].body).toBeNull();

    // The persisted draft resolved through the default Quick BoM approved catalog.
    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");
    const summary = (skuDraft.payload as { summary: { catalogSource: string } }).summary;
    expect(summary.catalogSource).toBe("default_quick_bom_approved_catalog");

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

describe("Honeywell SKUs via default catalog full app chain E2E (Prompt 114 / Prompt 147)", () => {
  const HW_CSV = [
    "#,Description,Part Number,Qty",
    "1,Switch,C9300X-48HX-A,2",
    "2,AP,CW9178I-CFG,10",
    "3,Phone,CP-7841-K9=,5",
    "4,Optic,SFP-10G-LR-S=,4",
  ].join("\n");

  function assertNoPayloadLeakHoneywell(): void {
    const dom = document.body.textContent ?? "";
    expect(dom).not.toContain("C9300X-48HX-A");
    expect(dom).not.toContain("CW9178I-CFG");
    expect(dom).not.toContain("honeywell-upload.csv");
    // Artifact payload internals and workbook source paths must not surface in the DOM.
    expect(dom).not.toContain("activeSourceWorkbookPath");
    expect(dom).not.toContain("activeSourceSheetName");
    expect(dom).not.toContain("Estimate_NB167337237YA.xlsx");
    expect(dom).not.toContain("unitListPriceSarBySku");
    expect(dom).not.toContain("acceptedLines");
    expect(dom).not.toContain("rejectedLines");
    expect(dom).not.toContain("sourceEvidence");
    expect(dom).not.toContain("originalCells");
    expect(dom).not.toContain("amounts");
  }

  function hwSkuAcceptActions(artifact: ProjectArtifact) {
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

  it("Honeywell subset resolves via default catalog and completes the full app workflow for a non-seeded uploaded subset", async () => {
    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    const file = new File([HW_CSV], "honeywell-upload.csv", { type: "text/csv" });
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
    assertNoPayloadLeakHoneywell();

    // No catalog profile selector: the default Quick BoM approved catalog (which now
    // carries Honeywell SKU metadata) is always used for SKU resolution.
    expect(screen.queryByTestId("workflow-honeywell-demo-catalog-profile")).toBeNull();

    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("reject-sku_resolution")).toBeNull();

    // Assert the recorded SKU-resolution POST carried no body / no catalog profile.
    const skuCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCalls).toHaveLength(1);
    expect(skuCalls[0].body).toBeNull();

    // Assert the SKU draft starts needs_review, not approved.
    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");

    // Review: accept each suggested same-SKU for the 4 input lines.
    const skuReviewRes = await skuResolutionReviewPOST(
      jsonRequest({ actions: hwSkuAcceptActions(skuDraft) }),
      { params: { id: project.id, artifactId: skuDraft.id } }
    );
    expect(skuReviewRes.status).toBe(200);
    const skuReviewBody = await skuReviewRes.json();

    // Assert no silent substitution or replacement fields on SKU decisions.
    const reviewedSkuArtifact = hoisted.store.latestArtifact("sku_resolution");
    const reviewedDecisions = (reviewedSkuArtifact.payload.decisions ?? []) as SkuResolutionDecision[];
    for (const d of reviewedDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }

    await approveArtifact(project.id, skuReviewBody.artifact.id);

    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    const createConfig = await screen.findByTestId("workflow-create-configuration_expansion");
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
    // Config draft starts needs_review, not approved.
    expect(configDraft.status).toBe("needs_review");

    const configLines = (configDraft.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
    const draftExpansionLines = configLines.filter((l) => l.origin === "expansion");

    // Config draft was produced by the approved Honeywell MVP composed Batch 1+2+3 rule pack.
    expect(draftExpansionLines.length).toBeGreaterThan(0);
    for (const line of draftExpansionLines) {
      expect(line.sourceRuleId).toMatch(/^honeywell-mvp-composed-batch1-batch2-batch3::/);
    }

    // Assert expansion summary counts.
    const configSummary = configDraft.payload.summary as {
      customerLineCount: number;
      addedLineCount: number;
      totalLineCount: number;
      requiresReviewCount: number;
      includedItemCount: number;
    };
    expect(configSummary.customerLineCount).toBe(4);
    expect(configSummary.addedLineCount).toBe(27);
    expect(configSummary.totalLineCount).toBe(31);
    expect(configSummary.requiresReviewCount).toBe(27);
    expect(configSummary.includedItemCount).toBe(10);

    // Assert parent/child expansion counts per input line.
    const switchChildren = configLines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-1");
    expect(switchChildren).toHaveLength(22);
    const apChildren = configLines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-2");
    expect(apChildren).toHaveLength(4);
    const phoneChildren = configLines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-3");
    expect(phoneChildren).toHaveLength(1);
    // Optic remains standalone: no expansion children.
    const opticChildren = configLines.filter((l) => l.origin === "expansion" && l.parentLineId === "line-4");
    expect(opticChildren).toHaveLength(0);

    // Assert no silent substitution or replacement fields on expansion lines.
    for (const line of draftExpansionLines) {
      expect(line).not.toHaveProperty("replacementFor");
      expect(line).not.toHaveProperty("substitutedSku");
    }

    // Review and approve the configuration expansion draft.
    const configReviewRes = await configExpansionReviewPOST(
      jsonRequest({ decisions: configAcceptDecisions(configDraft) }),
      { params: { id: project.id, artifactId: configDraft.id } }
    );
    expect(configReviewRes.status).toBe(200);
    const configReviewBody = await configReviewRes.json();
    await approveArtifact(project.id, configReviewBody.artifact.id);

    // Re-render and assert configuration authority provenance visible in UI.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    const cfgBlock = await screen.findByTestId("authority-config-configuration_expansion");
    expect(cfgBlock).toBeInTheDocument();
    // Rule pack id and version.
    expect(cfgBlock.textContent).toContain("honeywell-mvp-composed-batch1-batch2-batch3");
    expect(cfgBlock.textContent).toContain("1.0.0");
    // Status.
    expect(cfgBlock.textContent).toContain("approved");
    // Approval record id.
    expect(cfgBlock.textContent).toContain("prompt-116-user-approved-honeywell-config-authority");
    // Scope.
    expect(cfgBlock.textContent).toContain("honeywell_mvp_demo_only");
    // Runtime flags.
    expect(cfgBlock.textContent).toContain("Runtime AI: off");
    expect(cfgBlock.textContent).toContain("Replacement: off");
    expect(cfgBlock.textContent).toContain("Substitution: off");
    expect(cfgBlock.textContent).toContain("Unknown deferred: yes");
    expect(cfgBlock.textContent).toContain("Optics auto-attached: no");

    // configuration_expansion must NOT render a pricing authority block.
    expect(screen.queryByTestId("authority-pricing-configuration_expansion")).toBeNull();

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

    // Assert both configuration and pricing authority provenance visible for priced_boq.
    const pricedCfgBlock = await screen.findByTestId("authority-config-priced_boq");
    expect(pricedCfgBlock).toBeInTheDocument();
    expect(pricedCfgBlock.textContent).toContain("honeywell-mvp-composed-batch1-batch2-batch3");

    const pricingBlock = await screen.findByTestId("authority-pricing-priced_boq");
    expect(pricingBlock).toBeInTheDocument();
    // Profile id.
    expect(pricingBlock.textContent).toContain("honeywell-mvp-demo-pricing-authority-profile");
    // Active source.
    expect(pricingBlock.textContent).toContain("committed_honeywell_demo_pricing_fixture");
    // Fixture status.
    expect(pricingBlock.textContent).toContain("approved_demo_fixture");
    // Approval record id.
    expect(pricingBlock.textContent).toContain("prompt-119-user-approved-honeywell-demo-pricing-authority");
    // Currency.
    expect(pricingBlock.textContent).toContain("SAR");
    // Boundary flags.
    expect(pricingBlock.textContent).toContain("Deterministic fixture: yes");
    expect(pricingBlock.textContent).toContain("Production authority: no");
    expect(pricingBlock.textContent).toContain("Broad authority: no");
    expect(pricingBlock.textContent).toContain("Runtime AI: off");
    expect(pricingBlock.textContent).toContain("Runtime catalog: off");
    expect(pricingBlock.textContent).toContain("Config authority: no");
    expect(pricingBlock.textContent).toContain("Replacement: no");
    expect(pricingBlock.textContent).toContain("Substitution: no");
    expect(pricingBlock.textContent).toContain("Missing reported: yes");

    const createExport = await screen.findByTestId("workflow-create-export_package");
    await act(async () => {
      fireEvent.click(createExport);
    });
    await waitFor(
      () => expect(screen.getByTestId("approve-export_package")).toBeInTheDocument(),
      { timeout: 5000 }
    );
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
    assertNoPayloadLeakHoneywell();

    // Assert workbook download succeeds with XLSX MIME and nonzero bytes.
    const downloadRes = await exportDownloadGET(emptyRequest(), {
      params: { id: project.id, artifactId: exportArtifact.id },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(XLSX_MIME);
    const bytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);

    // Assert configuration-expansion POST carries no catalogProfile body.
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          /\/configuration-expansion$/.test(c.url) &&
          JSON.stringify(c.body ?? "").includes("catalogProfile")
      )
    ).toBe(false);

    view.unmount();
  });

  it("full seven-line Honeywell BoQ upload proves complete UI panel chain with committed fixture totals", async () => {
    const FULL_HW_CSV = [
      "#,Description,Part Number,Qty",
      "1,Wireless AP,CW9178I-CFG,12",
      "2,Network subscription,CISCO-NETWORK-SUB,1",
      "3,Access switch,C9300X-48HX-A,7",
      "4,Access switch,C9300L-24P-4X-A,6",
      "5,Standalone optic,SFP-10G-LR-S=,12",
      "6,Standalone optic,SFP-10/25G-LR-S=,14",
      "7,Desk phone,CP-7841-K9=,59",
    ].join("\n");
    const FULL_HW_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    // Upload the full 7-line Honeywell BoQ through the UI file input.
    const file = new File([FULL_HW_CSV], "honeywell-full-upload.csv", { type: "text/csv" });
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

    // Assert normalized_boq has exactly 7 lines and no payload/workbook/price-map leakage.
    const normalizedArtifact = hoisted.store.latestArtifact("normalized_boq");
    expect((normalizedArtifact.payload.lines as unknown[]) ?? []).toHaveLength(7);
    {
      const dom = document.body.textContent ?? "";
      expect(dom).not.toContain("honeywell-full-upload.csv");
      expect(dom).not.toContain("activeSourceWorkbookPath");
      expect(dom).not.toContain("unitListPriceSarBySku");
    }

    // No catalog profile selector: the default catalog covers these Honeywell SKUs.
    expect(screen.queryByTestId("workflow-honeywell-demo-catalog-profile")).toBeNull();

    // Create sku_resolution draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();

    // Assert sku-resolution creation carried no body / no catalog profile.
    const skuCreateCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCreateCalls).toHaveLength(1);
    expect(skuCreateCalls[0].body).toBeNull();

    // Load SKU review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    expect(await screen.findByTestId("sku-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sku-review-line")).toHaveLength(7);
    expect(
      calls.filter((c) => c.method === "GET" && /\/sku-resolution\/review$/.test(c.url))
    ).toHaveLength(1);

    // The 7 canonical SKUs resolve as same-SKU exact suggestions, so all are eligible
    // and pre-selected for approval in the single-submit review.
    const skuDraftForBatch = hoisted.store.latestArtifact("sku_resolution");
    const skuDraftDecisions = (skuDraftForBatch.payload.decisions ?? []) as SkuResolutionDecision[];
    const eligibleSameSku = skuDraftDecisions.filter(
      (d) =>
        d.status === "needs_review" &&
        d.suggestions.length === 1 &&
        d.suggestions[0].suggestedSku.trim().toLowerCase() ===
          d.originalSku.trim().toLowerCase()
    );
    expect(eligibleSameSku).toHaveLength(7);

    // All 7 rows are eligible same-SKU, so all 7 checkboxes are enabled and checked.
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(7);
    expect(checkboxes.filter((c) => !c.disabled && c.checked)).toHaveLength(7);

    // One submit accepts every eligible same-SKU line in a single POST.
    const submitBtn = screen.getByTestId("sku-review-submit");
    expect(submitBtn).toHaveTextContent("(7 included / 0 excluded)");
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // After submitting decides all lines, the panel disappears and approve appears.
    expect(await screen.findByTestId("approve-sku_resolution")).toBeInTheDocument();

    // Assert exactly one SKU review POST carrying all 7 sanitized accept actions.
    const skuReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution\/review$/.test(c.url)
    );
    expect(skuReviewPostCalls).toHaveLength(1);
    const batchActions = (skuReviewPostCalls[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(batchActions).toHaveLength(7);
    for (const action of batchActions) {
      expect(action.decision).toBe("accept");
      expect(action).not.toHaveProperty("tenantId");
      expect(action).not.toHaveProperty("projectId");
      expect(action).not.toHaveProperty("artifactId");
      expect(action).not.toHaveProperty("decidedBy");
      expect(action).not.toHaveProperty("decidedAt");
      expect(action).not.toHaveProperty("pricing");
      expect(action).not.toHaveProperty("catalogProfile");
      expect(action).not.toHaveProperty("replacement");
      expect(action).not.toHaveProperty("substitution");
      expect(action).not.toHaveProperty("authority");
    }

    // Assert reviewed sku_resolution has 7 decisions, none with replacement/substitution.
    const reviewedSkuArtifact = hoisted.store.latestArtifact("sku_resolution");
    const reviewedDecisions = (reviewedSkuArtifact.payload.decisions ?? []) as SkuResolutionDecision[];
    expect(reviewedDecisions).toHaveLength(7);
    for (const d of reviewedDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }

    // Approve sku_resolution through the UI generic approve button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved")
    );

    // Remount for configuration expansion.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Create configuration_expansion draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-configuration_expansion"));
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();

    // Assert configuration-expansion POST carries no catalogProfile body.
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          /\/configuration-expansion$/.test(c.url) &&
          JSON.stringify(c.body ?? "").includes("catalogProfile")
      )
    ).toBe(false);

    // Assert optics remain standalone: no expansion children for either optic SKU.
    const configDraft = hoisted.store.latestArtifact("configuration_expansion");
    expect(configDraft.payload.payloadKind).toBe("configuration_expansion_draft");
    const draftLines = (configDraft.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
    for (const optic of FULL_HW_OPTICS) {
      expect(
        draftLines.some((l) => l.origin === "expansion" && l.sku === optic)
      ).toBe(false);
    }

    // Load config review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    expect(await screen.findByTestId("config-review-summary")).toBeInTheDocument();
    const configReviewLines = screen.getAllByTestId("config-review-line");
    expect(configReviewLines.length).toBeGreaterThan(0);
    expect(
      calls.filter((c) => c.method === "GET" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(1);

    // Expansion lines default to selected (accept). No bulk action exists, and merely
    // loading the review must not POST or approve by itself.
    const configExpansionLineCount = screen.getAllByTestId("config-review-checkbox").length;
    expect(screen.queryByTestId("config-review-select-all")).toBeNull();
    expect(
      calls.filter((c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(0);

    // Submit the complete decisions batch via the UI submit button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("config-review-summary")).toBeNull(),
      { timeout: 3000 }
    );

    // Assert exactly one config review POST, only expansion-line decisions, sanitized.
    const configReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url)
    );
    expect(configReviewPostCalls).toHaveLength(1);
    const configBatchBody = configReviewPostCalls[0].body as {
      decisions: Record<string, unknown>[];
    };
    expect(Array.isArray(configBatchBody.decisions)).toBe(true);
    expect(configBatchBody.decisions.length).toBe(configExpansionLineCount);
    for (const d of configBatchBody.decisions) {
      expect(d).not.toHaveProperty("tenantId");
      expect(d).not.toHaveProperty("projectId");
      expect(d).not.toHaveProperty("artifactId");
      expect(d).not.toHaveProperty("decidedBy");
      expect(d).not.toHaveProperty("decidedAt");
      expect(d).not.toHaveProperty("pricing");
      expect(d).not.toHaveProperty("catalogProfile");
      expect(d).not.toHaveProperty("replacement");
      expect(d).not.toHaveProperty("substitution");
      expect(d).not.toHaveProperty("authority");
      expect(d).not.toHaveProperty("evidence");
    }

    // Assert posted decisions target only expansion-origin lines, not customer-origin lines.
    const expansionLineIds = new Set(
      draftLines.filter((l) => l.origin === "expansion").map((l) => l.lineId)
    );
    const customerLineIds = new Set(
      draftLines.filter((l) => l.origin === "customer").map((l) => l.lineId)
    );
    const postedLineIds = configBatchBody.decisions.map(
      (d) => (d as { lineId: string }).lineId
    );
    expect(new Set(postedLineIds)).toEqual(expansionLineIds);
    for (const id of postedLineIds) {
      expect(customerLineIds.has(id)).toBe(false);
    }

    // Assert accepted configuration_expansion line count is 60.
    const acceptedConfig = hoisted.store.latestArtifact("configuration_expansion");
    const acceptedLines = (acceptedConfig.payload.acceptedLines ?? []) as Array<{
      origin: string;
      sku: string;
    }>;
    expect(acceptedLines).toHaveLength(60);
    // Optics remain standalone customer lines; neither appears as expansion child.
    for (const optic of FULL_HW_OPTICS) {
      const optLines = acceptedLines.filter((l) => l.sku === optic);
      expect(optLines.length).toBeGreaterThan(0);
      expect(optLines.every((l) => l.origin === "customer")).toBe(true);
      expect(
        acceptedLines.some((l) => l.origin === "expansion" && l.sku === optic)
      ).toBe(false);
    }

    // Remount and approve configuration_expansion through the UI generic approve button.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(await screen.findByTestId("approve-configuration_expansion")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-configuration_expansion"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved")
    );

    // Create priced_boq through the UI.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-priced_boq"));
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();

    // Load priced review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });
    expect(await screen.findByTestId("priced-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("priced-review-line").length).toBeGreaterThan(0);
    expect(
      calls.filter((c) => c.method === "GET" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(1);
    // Priced review panel must NOT POST.
    expect(
      calls.filter((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(0);

    // Assert priced_boq line count, zero unpriced/missing-price, and committed fixture totals.
    const pricedArtifact = hoisted.store.latestArtifact("priced_boq");
    expect((pricedArtifact.payload.lines as unknown[]) ?? []).toHaveLength(60);
    const pricedSummary = pricedArtifact.payload.summary as {
      unpricedLineCount: number;
      missingPriceCount: number;
      totals: { totalIncVatSar: number };
    };
    expect(pricedSummary.unpricedLineCount).toBe(0);
    expect(pricedSummary.missingPriceCount).toBe(0);
    expect(pricedSummary.totals.totalIncVatSar).toBeCloseTo(2513565.07, 1);

    // Approve priced_boq through the UI approve button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("approved")
    );

    // Create and approve export_package through the UI.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-export_package"));
    });
    await waitFor(
      () => expect(screen.getByTestId("approve-export_package")).toBeInTheDocument(),
      { timeout: 5000 }
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-export_package")).toHaveTextContent("approved")
    );

    // Assert approved export download link and XLSX download with nonzero bytes.
    const link = await screen.findByTestId("download-export_package");
    const exportArtifact = hoisted.store.latestArtifact("export_package");
    expect(link).toHaveAttribute(
      "href",
      `/api/projects/${project.id}/quick-bom/artifacts/${exportArtifact.id}/export-package/download`
    );

    // Assert export_package payload shape: rowCount 60, no warnings, committed fixture totals.
    const exportPayload = exportArtifact.payload as {
      rowCount: number;
      warnings: string[];
      totals: {
        totalIncVatSar: number;
        productTotalSar: number;
        serviceTotalSar: number;
        subscriptionTotalSar: number;
      };
    };
    expect(exportPayload.rowCount).toBe(60);
    expect(exportPayload.warnings).toEqual([]);
    expect(exportPayload.totals.totalIncVatSar).toBeCloseTo(2513565.07, 1);
    expect(exportPayload.totals.productTotalSar).toBeCloseTo(1669647.61, 1);
    expect(exportPayload.totals.serviceTotalSar).toBeCloseTo(304972.06, 1);
    expect(exportPayload.totals.subscriptionTotalSar).toBeCloseTo(211089.09, 1);

    const downloadRes = await exportDownloadGET(emptyRequest(), {
      params: { id: project.id, artifactId: exportArtifact.id },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(XLSX_MIME);
    const bytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);

    // Final DOM leak check.
    {
      const dom = document.body.textContent ?? "";
      expect(dom).not.toContain("honeywell-full-upload.csv");
      expect(dom).not.toContain("activeSourceWorkbookPath");
      expect(dom).not.toContain("unitListPriceSarBySku");
      expect(dom).not.toContain("acceptedLines");
      expect(dom).not.toContain("sourceEvidence");
    }

    // No replacement/substitution fields on final reviewed SKU decisions.
    const finalSkuArtifact = hoisted.store.latestArtifact("sku_resolution");
    const finalDecisions = (finalSkuArtifact.payload.decisions ?? []) as SkuResolutionDecision[];
    for (const d of finalDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }

    // Recursive final-payload assertion: no active replacement/substitution fields in
    // any persisted SKU, config, priced, or export payload.
    for (const artifactType of [
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "export_package",
    ] as const) {
      assertNoActiveReplacementSubstitutionFields(
        hoisted.store.latestArtifact(artifactType).payload
      );
    }

    view.unmount();
  });

  it("UI review panels drive the full Honeywell default-catalog app chain", async () => {
    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    const file = new File([HW_CSV], "honeywell-upload.csv", { type: "text/csv" });
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
    assertNoPayloadLeakHoneywell();

    // No catalog profile selector: the default catalog covers these Honeywell SKUs.
    expect(screen.queryByTestId("workflow-honeywell-demo-catalog-profile")).toBeNull();

    // Create sku_resolution draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();

    // Assert sku-resolution creation carried no body / no catalog profile.
    const skuCreateCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCreateCalls).toHaveLength(1);
    expect(skuCreateCalls[0].body).toBeNull();

    // Load SKU review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    expect(await screen.findByTestId("sku-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sku-review-line")).toHaveLength(4);
    expect(
      calls.filter((c) => c.method === "GET" && /\/sku-resolution\/review$/.test(c.url))
    ).toHaveLength(1);

    // The 4 canonical SKUs resolve as same-SKU exact suggestions, so all are eligible
    // and pre-selected. One submit resolves every line in a single POST - no per-line
    // clicking, no re-Load.
    const skuDraftForBatch = hoisted.store.latestArtifact("sku_resolution");
    const skuDraftDecisions = (skuDraftForBatch.payload.decisions ?? []) as SkuResolutionDecision[];
    const eligibleSameSku = skuDraftDecisions.filter(
      (d) =>
        d.status === "needs_review" &&
        d.suggestions.length === 1 &&
        d.suggestions[0].suggestedSku.trim().toLowerCase() ===
          d.originalSku.trim().toLowerCase()
    );
    expect(eligibleSameSku).toHaveLength(4);

    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes.filter((c) => !c.disabled && c.checked)).toHaveLength(4);
    const submitBtn = screen.getByTestId("sku-review-submit");
    expect(submitBtn).toHaveTextContent("(4 included / 0 excluded)");
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // After submitting decides all lines the panel disappears and approve appears.
    expect(await screen.findByTestId("approve-sku_resolution")).toBeInTheDocument();

    // Assert exactly one SKU review POST carrying all 4 sanitized accept actions.
    const skuReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution\/review$/.test(c.url)
    );
    expect(skuReviewPostCalls).toHaveLength(1);
    const batchActions = (skuReviewPostCalls[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(batchActions).toHaveLength(4);
    for (const action of batchActions) {
      expect(action.decision).toBe("accept");
      expect(action).not.toHaveProperty("tenantId");
      expect(action).not.toHaveProperty("projectId");
      expect(action).not.toHaveProperty("artifactId");
      expect(action).not.toHaveProperty("decidedBy");
      expect(action).not.toHaveProperty("decidedAt");
      expect(action).not.toHaveProperty("replacement");
      expect(action).not.toHaveProperty("substitution");
    }

    // Approve sku_resolution through the UI generic approve button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved")
    );

    // Remount for a clean workspace view before configuration expansion.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Create configuration_expansion draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-configuration_expansion"));
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();

    // Load config review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    expect(await screen.findByTestId("config-review-summary")).toBeInTheDocument();
    const configReviewLines = screen.getAllByTestId("config-review-line");
    expect(configReviewLines.length).toBeGreaterThan(0);
    expect(
      calls.filter((c) => c.method === "GET" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(1);

    // Expansion lines default to selected (accept). No bulk action exists, and merely
    // loading the review must not POST or approve by itself.
    const configExpansionLineCount = screen.getAllByTestId("config-review-checkbox").length;
    expect(screen.queryByTestId("config-review-select-all")).toBeNull();
    expect(
      calls.filter((c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(0);

    // Submit the complete decisions batch via the UI submit button; then remount.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    // Wait for the async submit + workspace reload to complete.
    await waitFor(() =>
      expect(screen.queryByTestId("config-review-summary")).toBeNull(),
      { timeout: 3000 }
    );

    // Assert one complete POST: only expansion lines, no authority fields.
    const configReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url)
    );
    expect(configReviewPostCalls).toHaveLength(1);
    const configBatchBody = configReviewPostCalls[0].body as {
      decisions: Record<string, unknown>[];
    };
    expect(Array.isArray(configBatchBody.decisions)).toBe(true);
    expect(configBatchBody.decisions.length).toBe(configExpansionLineCount);
    for (const d of configBatchBody.decisions) {
      expect(d).not.toHaveProperty("tenantId");
      expect(d).not.toHaveProperty("projectId");
      expect(d).not.toHaveProperty("artifactId");
      expect(d).not.toHaveProperty("decidedBy");
      expect(d).not.toHaveProperty("decidedAt");
      expect(d).not.toHaveProperty("pricing");
      expect(d).not.toHaveProperty("replacement");
      expect(d).not.toHaveProperty("substitution");
    }

    // Remount to get fresh workspace with the reviewed generated artifact.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Approve configuration_expansion through the UI generic approve button.
    expect(await screen.findByTestId("approve-configuration_expansion")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-configuration_expansion"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved")
    );

    // Create priced_boq (status needs_review; both approve button and review panel appear).
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-priced_boq"));
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();

    // Load priced review panel via the UI button; assert the GET review route was called.
    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });
    expect(await screen.findByTestId("priced-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("priced-review-line").length).toBeGreaterThan(0);
    expect(
      calls.filter((c) => c.method === "GET" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(1);

    // Assert the priced review panel did NOT POST (panel is read-only; approval is separate).
    expect(
      calls.filter((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(0);

    // Approve priced_boq through the UI approve button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("approved")
    );

    // Create and approve export_package through the UI.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-export_package"));
    });
    await waitFor(
      () => expect(screen.getByTestId("approve-export_package")).toBeInTheDocument(),
      { timeout: 5000 }
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-export_package")).toHaveTextContent("approved")
    );

    // Assert approved export download link and real download route.
    const link = await screen.findByTestId("download-export_package");
    const exportArtifact = hoisted.store.latestArtifact("export_package");
    expect(link).toHaveAttribute(
      "href",
      `/api/projects/${project.id}/quick-bom/artifacts/${exportArtifact.id}/export-package/download`
    );
    assertNoPayloadLeakHoneywell();

    const downloadRes = await exportDownloadGET(emptyRequest(), {
      params: { id: project.id, artifactId: exportArtifact.id },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(XLSX_MIME);
    const bytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);

    // Assert configuration-expansion POST carries no catalogProfile body.
    expect(
      calls.some(
        (c) =>
          c.method === "POST" &&
          /\/configuration-expansion$/.test(c.url) &&
          JSON.stringify(c.body ?? "").includes("catalogProfile")
      )
    ).toBe(false);

    // Assert optics remain standalone customer lines (no expansion children for SFP-10G-LR-S=).
    const configReviewed = hoisted.store.latestArtifact("configuration_expansion");
    const acceptedLines = (configReviewed.payload.acceptedLines ?? []) as Array<{
      origin: string;
      sku: string;
    }>;
    expect(
      acceptedLines.some((l) => l.origin === "expansion" && l.sku === "SFP-10G-LR-S=")
    ).toBe(false);

    view.unmount();
  });

  it("real Honeywell BoQ workbook upload drives the UI through priced export at CCW parity (Prompt 154)", async () => {
    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    // Upload the ACTUAL Honeywell BoQ workbook (not a synthetic CSV) through the UI
    // file input, exactly as the user did from the browser. The deterministic loader
    // normalizes this workbook to 52 lines from sheet "Honeywell_BoQ". A fresh
    // Uint8Array copy keeps the binary bytes intact through the jsdom File/Blob path.
    const workbookBytes = new Uint8Array(readFileSync(HONEYWELL_BOQ_PATH));
    const file = new File([workbookBytes], "Honeywell_BoQ.xlsx", { type: XLSX_MIME });
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

    // Normalized artifact carries exactly 52 lines, all from the Honeywell_BoQ sheet,
    // with the REAL workbook quantities preserved (not the synthetic quantity=1).
    const normalizedArtifact = hoisted.store.latestArtifact("normalized_boq");
    const normalizedLines = (normalizedArtifact.payload.lines ?? []) as CanonicalBoqLine[];
    expect(normalizedLines).toHaveLength(52);
    expect(normalizedLines.every((l) => l.sourceSheetName === "Honeywell_BoQ")).toBe(true);
    const normalizedQtyForSku = (sku: string): number | undefined =>
      normalizedLines.find((l) => l.sku === sku)?.quantity;
    // First BoQ line is the access switch at quantity 7.
    expect(normalizedLines[0].sku).toBe("C9300X-48HX-A");
    expect(normalizedLines[0].quantity).toBe(7);
    expect(normalizedQtyForSku("C9300X-48HX-A")).toBe(7);
    expect(normalizedQtyForSku("C9300L-24P-4X-A")).toBe(6);
    expect(normalizedQtyForSku("CW9178I-CFG")).toBe(12);
    expect(normalizedQtyForSku("CP-7841-K9=")).toBe(59);
    // The single phone line (CP-7841-K9=) carries quantity 59.
    const phoneLines = normalizedLines.filter((l) => l.sku === "CP-7841-K9=");
    expect(phoneLines).toHaveLength(1);
    expect(phoneLines[0].quantity).toBe(59);

    // No catalog profile selector: the default catalog covers all 52 Honeywell SKUs.
    expect(screen.queryByTestId("workflow-honeywell-demo-catalog-profile")).toBeNull();

    // Create sku_resolution draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();

    // SKU-resolution creation carried no body / no catalog profile.
    const skuCreateCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCreateCalls).toHaveLength(1);
    expect(skuCreateCalls[0].body).toBeNull();

    // The persisted draft resolved through the default Quick BoM approved catalog,
    // with 52 lines, 52 needing review, 0 unresolved.
    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");
    const skuSummary = skuDraft.payload.summary as {
      totalLines: number;
      needsReviewCount: number;
      unresolvedCount: number;
      catalogSource: string;
    };
    expect(skuSummary.totalLines).toBe(52);
    expect(skuSummary.needsReviewCount).toBe(52);
    expect(skuSummary.unresolvedCount).toBe(0);
    expect(skuSummary.catalogSource).toBe("default_quick_bom_approved_catalog");

    // Load SKU review panel via the UI button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    expect(await screen.findByTestId("sku-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sku-review-line")).toHaveLength(52);
    expect(
      calls.filter((c) => c.method === "GET" && /\/sku-resolution\/review$/.test(c.url))
    ).toHaveLength(1);

    // 36 of the 52 lines resolve as same-SKU exact suggestions eligible for approval
    // (pre-selected); the other 16 are deferred/non-priced rows that are unselectable
    // and must be rejected before pricing/export (recognition is not pricing eligibility).
    const skuDraftDecisions = (skuDraft.payload.decisions ?? []) as SkuResolutionDecision[];
    const eligibleSameSku = skuDraftDecisions.filter(
      (d) =>
        d.status === "needs_review" &&
        d.suggestions.length === 1 &&
        d.suggestions[0].suggestedSku.trim().toLowerCase() ===
          d.originalSku.trim().toLowerCase() &&
        !isDeferredReviewSku(d.originalSku)
    );
    expect(eligibleSameSku).toHaveLength(36);
    const deferredDecisions = skuDraftDecisions.filter(
      (d) => d.status === "needs_review" && isDeferredReviewSku(d.originalSku)
    );
    expect(deferredDecisions).toHaveLength(16);

    // Default selection: only the 36 eligible rows render a checkbox, all enabled+checked.
    // The 16 deferred/excluded rows render NO checkbox at all (not even a disabled one).
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(36);
    expect(checkboxes.filter((c) => !c.disabled && c.checked)).toHaveLength(36);

    // The excluded section is present and reports its 16-row count in the rendered copy.
    expect(screen.getByTestId("sku-review-excluded")).toHaveTextContent(
      "Excluded before pricing (16)"
    );

    // One submit records an explicit decision for every reviewed line.
    const submitBtn = screen.getByTestId("sku-review-submit");
    expect(submitBtn).toHaveTextContent("(36 included / 16 excluded)");
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // After deciding all 52 lines in one pass the panel disappears and approve appears.
    expect(await screen.findByTestId("approve-sku_resolution")).toBeInTheDocument();

    // Exactly one SKU review POST carrying all 52 sanitized decisions.
    const skuReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution\/review$/.test(c.url)
    );
    expect(skuReviewPostCalls).toHaveLength(1);

    const allActions = (skuReviewPostCalls[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(allActions).toHaveLength(52);
    const acceptActions = allActions.filter((a) => a.decision === "accept");
    const rejectActions = allActions.filter((a) => a.decision === "reject");
    expect(acceptActions).toHaveLength(36);
    expect(rejectActions).toHaveLength(16);

    for (const action of acceptActions) {
      expect(action).not.toHaveProperty("tenantId");
      expect(action).not.toHaveProperty("projectId");
      expect(action).not.toHaveProperty("artifactId");
      expect(action).not.toHaveProperty("decidedBy");
      expect(action).not.toHaveProperty("decidedAt");
      expect(action).not.toHaveProperty("pricing");
      expect(action).not.toHaveProperty("catalog");
      expect(action).not.toHaveProperty("catalogProfile");
      expect(action).not.toHaveProperty("authority");
      expect(action).not.toHaveProperty("replacement");
      expect(action).not.toHaveProperty("substitution");
    }

    // The 16 deferred decisions are sanitized rejects: no acceptedSku and none of the
    // tenant/project/artifact/decidedBy/decidedAt/pricing/catalog/authority/replacement/
    // substitution fields.
    for (const action of rejectActions) {
      expect(action).not.toHaveProperty("acceptedSku");
      expect(action).not.toHaveProperty("tenantId");
      expect(action).not.toHaveProperty("projectId");
      expect(action).not.toHaveProperty("artifactId");
      expect(action).not.toHaveProperty("decidedBy");
      expect(action).not.toHaveProperty("decidedAt");
      expect(action).not.toHaveProperty("pricing");
      expect(action).not.toHaveProperty("catalog");
      expect(action).not.toHaveProperty("catalogProfile");
      expect(action).not.toHaveProperty("authority");
      expect(action).not.toHaveProperty("replacement");
      expect(action).not.toHaveProperty("substitution");
    }

    // Reviewed sku_resolution has 52 decisions: 36 accepted, 16 rejected, none carrying
    // a replacement/substitution field.
    const reviewedSkuArtifact = hoisted.store.latestArtifact("sku_resolution");
    const reviewedDecisions = (reviewedSkuArtifact.payload.decisions ?? []) as SkuResolutionDecision[];
    expect(reviewedDecisions).toHaveLength(52);
    expect(reviewedDecisions.filter((d) => d.status === "accepted")).toHaveLength(36);
    expect(reviewedDecisions.filter((d) => d.status === "rejected")).toHaveLength(16);
    for (const d of reviewedDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }

    // Approve sku_resolution through the UI generic approve button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved")
    );

    // Remount for a clean workspace before configuration expansion.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Create configuration_expansion draft.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-configuration_expansion"));
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();

    // Draft summary matches current deterministic behavior: only the 36 accepted SKU
    // lines carry forward as customer lines, plus 24 added/expansion lines, for 60
    // total lines and 24 requiring review.
    const configDraft = hoisted.store.latestArtifact("configuration_expansion");
    expect(configDraft.payload.payloadKind).toBe("configuration_expansion_draft");
    const configSummary = configDraft.payload.summary as {
      customerLineCount: number;
      addedLineCount: number;
      totalLineCount: number;
      requiresReviewCount: number;
    };
    expect(configSummary.customerLineCount).toBe(36);
    expect(configSummary.addedLineCount).toBe(24);
    expect(configSummary.totalLineCount).toBe(60);
    expect(configSummary.requiresReviewCount).toBe(24);

    // Load config review panel via the UI button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    expect(await screen.findByTestId("config-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("config-review-line")).toHaveLength(60);
    expect(screen.getAllByTestId("config-review-checkbox")).toHaveLength(24);
    expect(
      calls.filter((c) => c.method === "GET" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(1);

    // Expansion lines default to selected (accept). No bulk action exists, and merely
    // loading the review must not POST yet.
    expect(screen.queryByTestId("config-review-select-all")).toBeNull();
    expect(
      calls.filter((c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url))
    ).toHaveLength(0);

    // Submit the complete decisions batch via the UI submit button.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("config-review-summary")).toBeNull(),
      { timeout: 3000 }
    );

    // Exactly one config review POST with 24 sanitized expansion-only decisions.
    const configReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url)
    );
    expect(configReviewPostCalls).toHaveLength(1);
    const configBatchBody = configReviewPostCalls[0].body as {
      decisions: Record<string, unknown>[];
    };
    expect(Array.isArray(configBatchBody.decisions)).toBe(true);
    expect(configBatchBody.decisions).toHaveLength(24);
    for (const d of configBatchBody.decisions) {
      expect(d).not.toHaveProperty("tenantId");
      expect(d).not.toHaveProperty("projectId");
      expect(d).not.toHaveProperty("artifactId");
      expect(d).not.toHaveProperty("decidedBy");
      expect(d).not.toHaveProperty("decidedAt");
      expect(d).not.toHaveProperty("pricing");
      expect(d).not.toHaveProperty("catalogProfile");
      expect(d).not.toHaveProperty("replacement");
      expect(d).not.toHaveProperty("substitution");
      expect(d).not.toHaveProperty("authority");
      expect(d).not.toHaveProperty("evidence");
    }

    // Posted decisions target only expansion-origin lines, not customer-origin lines.
    const draftLines = (configDraft.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
    const expansionLineIds = new Set(
      draftLines.filter((l) => l.origin === "expansion").map((l) => l.lineId)
    );
    const customerLineIds = new Set(
      draftLines.filter((l) => l.origin === "customer").map((l) => l.lineId)
    );
    const postedLineIds = configBatchBody.decisions.map(
      (d) => (d as { lineId: string }).lineId
    );
    expect(new Set(postedLineIds)).toEqual(expansionLineIds);
    for (const id of postedLineIds) {
      expect(customerLineIds.has(id)).toBe(false);
    }

    // No active replacement/substitution fields in the sanitized POST body.
    assertNoActiveReplacementSubstitutionFields(configBatchBody);

    // Reviewed configuration_expansion artifact is present; approve it through the UI.
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(
      await screen.findByTestId("approve-configuration_expansion")
    ).toBeInTheDocument();
    const reviewedConfig = hoisted.store.latestArtifact("configuration_expansion");
    expect(reviewedConfig.payload.payloadKind).not.toBe("configuration_expansion_draft");
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-configuration_expansion"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved")
    );

    // Create priced_boq through the UI.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-priced_boq"));
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();

    // priced_boq is fully priced: 60 lines, none unpriced/missing. Pass-through pricing
    // (Prompt 152) means list subtotal == sell subtotal == the CCW extended total, and
    // the VAT-inclusive total matches the committed Honeywell demo fixture.
    const pricedArtifact = hoisted.store.latestArtifact("priced_boq");
    expect((pricedArtifact.payload.lines as unknown[]) ?? []).toHaveLength(60);
    const pricedSummary = pricedArtifact.payload.summary as {
      unpricedLineCount: number;
      missingPriceCount: number;
      totals: {
        lineCount: number;
        subtotalListPriceSar: number;
        subtotalSellPriceSar: number;
        totalIncVatSar: number;
      };
    };
    expect(pricedSummary.totals.lineCount).toBe(60);
    expect(pricedSummary.unpricedLineCount).toBe(0);
    expect(pricedSummary.missingPriceCount).toBe(0);
    expect(
      Math.abs(pricedSummary.totals.subtotalListPriceSar - EXPECTED_TOTAL_EXTENDED_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);
    expect(
      Math.abs(pricedSummary.totals.subtotalSellPriceSar - EXPECTED_TOTAL_EXTENDED_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);
    expect(
      Math.abs(pricedSummary.totals.totalIncVatSar - EXPECTED_TOTAL_INC_VAT_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);

    // Load the priced review panel via the UI: 60 priced lines, no unpriced/missing-price
    // warnings, and the panel is read-only (no POST).
    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });
    expect(await screen.findByTestId("priced-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("priced-review-line")).toHaveLength(60);
    const pricedReviewText = screen.getByTestId("priced-review-summary").textContent ?? "";
    expect(pricedReviewText).toContain("60 priced");
    expect(pricedReviewText).toContain("0 unpriced");
    expect(pricedReviewText).toContain("0 missing price");
    expect(
      calls.filter((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(0);

    // Approve priced_boq through the UI.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("approved")
    );

    // Create export_package through the UI.
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-export_package"));
    });
    await waitFor(
      () => expect(screen.getByTestId("approve-export_package")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // export_package payload: 60 rows, no warnings, committed Honeywell category totals.
    const exportArtifact = hoisted.store.latestArtifact("export_package");
    const exportPayload = exportArtifact.payload as {
      rowCount: number;
      warnings: string[];
      totals: {
        productTotalSar: number;
        serviceTotalSar: number;
        subscriptionTotalSar: number;
        totalIncVatSar: number;
      };
    };
    expect(exportPayload.rowCount).toBe(60);
    expect(exportPayload.warnings).toEqual([]);
    expect(
      Math.abs(exportPayload.totals.productTotalSar - EXPECTED_PRODUCT_TOTAL_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);
    expect(
      Math.abs(exportPayload.totals.serviceTotalSar - EXPECTED_SERVICE_TOTAL_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);
    expect(
      Math.abs(exportPayload.totals.subscriptionTotalSar - EXPECTED_SUBSCRIPTION_TOTAL_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);
    expect(
      Math.abs(exportPayload.totals.totalIncVatSar - EXPECTED_TOTAL_INC_VAT_SAR)
    ).toBeLessThan(MONEY_TOLERANCE);

    // Approve export_package and exercise the REAL download route.
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-export_package")).toHaveTextContent("approved")
    );
    const link = await screen.findByTestId("download-export_package");
    expect(link).toHaveAttribute(
      "href",
      `/api/projects/${project.id}/quick-bom/artifacts/${exportArtifact.id}/export-package/download`
    );

    const downloadRes = await exportDownloadGET(emptyRequest(), {
      params: { id: project.id, artifactId: exportArtifact.id },
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe(XLSX_MIME);
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(downloadedBytes.byteLength).toBeGreaterThan(0);

    // Parse the ACTUAL downloaded workbook bytes and the CCW benchmark, then prove
    // parity. The downloaded bytes are written to a temp .xlsx so the existing
    // (path-based) Mantle layout locator parses exactly what the browser downloads.
    const parityTmpDir = mkdtempSync(join(tmpdir(), "bomatic-hw-parity-app-"));
    const generatedPath = join(parityTmpDir, "downloaded-export.xlsx");
    let genRows: ParsedItemRow[];
    let ccwRows: ParsedItemRow[];
    try {
      writeFileSync(generatedPath, downloadedBytes);
      const genLayout = await locateMantlePriceEstimateLayout(generatedPath);
      const genWb = new ExcelJS.Workbook();
      await genWb.xlsx.readFile(generatedPath);
      const genSheet = genWb.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
      if (!genSheet) throw new Error("generated workbook missing the Price Estimate sheet");
      genRows = parseGeneratedItemRows(genSheet, genLayout);

      const ccwWb = new ExcelJS.Workbook();
      await ccwWb.xlsx.readFile(CCW_PATH);
      const ccwSheet = ccwWb.getWorksheet(CCW_SHEET);
      if (!ccwSheet) throw new Error(`CCW benchmark missing sheet ${CCW_SHEET}`);
      ccwRows = parseCcwItemRows(ccwSheet);
    } finally {
      rmSync(parityTmpDir, { recursive: true, force: true });
    }

    // Parity assertions are ordered cheap -> exact so a failure is self-diagnosing:
    // row count, then SKU membership, quantities, amounts, total, and finally the
    // exact ordered SKU sequence.
    // (1) Both sides have 60 item rows; no 76-row export regression.
    expect(genRows).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(ccwRows).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(genRows.length).not.toBe(REGRESSION_ROW_COUNT);

    const genAgg = aggregateBySku(genRows);
    const ccwAgg = aggregateBySku(ccwRows);

    // (2) Identical SKU multiset (no missing/extra), compared as sorted sets.
    expect(genAgg.skus.slice().sort()).toEqual(ccwAgg.skus.slice().sort());

    // (3) Aggregate quantity per SKU matches.
    for (const sku of ccwAgg.skus) {
      expect(genAgg.qtyBySku[sku], `quantity for ${sku}`).toBe(ccwAgg.qtyBySku[sku]);
    }

    // (4) Aggregate extended (net/list) amount per SKU matches within 0.01 SAR.
    for (const sku of ccwAgg.skus) {
      expect(genAgg.extBySku[sku], `extended present for ${sku}`).not.toBeUndefined();
      expect(
        Math.abs(genAgg.extBySku[sku] - ccwAgg.extBySku[sku]),
        `extended for ${sku}`
      ).toBeLessThan(MONEY_TOLERANCE);
    }

    // (4b) Total generated extended == 2,185,708.76 == benchmark total.
    const genTotal = round2(genRows.reduce((sum, r) => sum + r.extended, 0));
    const ccwTotal = round2(ccwRows.reduce((sum, r) => sum + r.extended, 0));
    expect(Math.abs(genTotal - EXPECTED_TOTAL_EXTENDED_SAR)).toBeLessThan(MONEY_TOLERANCE);
    expect(Math.abs(ccwTotal - EXPECTED_TOTAL_EXTENDED_SAR)).toBeLessThan(MONEY_TOLERANCE);
    expect(Math.abs(genTotal - ccwTotal)).toBeLessThan(MONEY_TOLERANCE);

    // (5) Strongest, least-foolable check: the entire ordered SKU sequence is identical
    // to the benchmark across all 60 rows.
    const genSkus = genRows.map((r) => r.sku);
    const ccwSkus = ccwRows.map((r) => r.sku);
    expect(genSkus).toEqual(ccwSkus);

    view.unmount();
  });
});

describe("Cisco collaboration + industrial recognition scope app chain E2E (test-only evidence)", () => {
  // A mixed Cisco collaboration + industrial-switching BoQ, plus
  // non-Cisco manual commercial lines, uploaded as a Format #1 CSV (Line Number /
  // Item Name / Description / Quantity / Service Duration (Months) / Included Item).
  // This proves the newly approved deterministic same-SKU recognition scope flows
  // through the app: upload -> normalize -> SKU review -> SKU approval -> configuration
  // expansion -> configuration approval -> priced_boq draft, WITHOUT introducing any
  // Cisco pricing authority. The active pricing source stays the committed Honeywell
  // MVP demo fixture only, so accepted Cisco rows surface as `missing_price` (recognition
  // is not pricing eligibility). No export_package is created (Cisco pricing authority is
  // not approved) and priced_boq is left at needs_review.
  const MIXED_CISCO_HEADER =
    "Line Number,Item Name,Description,Quantity,Service Duration (Months),Included Item";
  // [lineNumber, sku, description, quantity, serviceDuration, includedItem]
  const CISCO_ROWS: ReadonlyArray<readonly [string, string, string, number, string, string]> = [
    ["1.0", "CS-KIT-EQX-C-K9", "Room Kit EQX Carbon Black", 2, "N/A", "No"],
    ["1.0.1", "CON-SNT-CSKITEK9", "SNTC support Room Kit EQX", 2, "60", "Yes"],
    ["1.1", "CS-MIC-TABLE-J", "Table microphone", 6, "N/A", "No"],
    ["1.1.0.1", "CON-SNT-CS5HEJMI", "SNTC support table microphone", 6, "60", "Yes"],
    ["1.30", "CS-KIT-EQX-FSK-C", "Room Kit EQX floor stand kit", 2, "N/A", "No"],
    ["2.0", "IEM-3500-14T2S=", "IE3500 rugged switch", 3, "N/A", "No"],
    ["2.0.1", "CON-SNT-IEM35B2S", "SNTC support IE3500 switch", 3, "60", "Yes"],
    ["3.0", "PWR-IE480W-PCAC-L=", "Industrial DIN-rail power supply 480W AC", 3, "N/A", "No"],
    ["4.0", "IE-1000-4P2S-LM", "IE1000 switch", 6, "N/A", "No"],
    ["4.0.1", "CON-SNT-I1002SLM", "SNTC support IE1000 switch", 6, "60", "Yes"],
    ["4.1", "IOT-UTILITIES", "Cisco IoT utilities", 6, "N/A", "No"],
    ["4.2", "IOT-UTIL-OTHER", "Cisco IoT utilities other", 6, "N/A", "No"],
    ["5.0", "PWR-IE170W-PC-AC=", "Industrial DIN-rail power supply 170W AC", 6, "N/A", "No"],
    ["6.0", "CAB-TA-UK=", "AC power cord United Kingdom", 9, "N/A", "No"],
    ["7.0", "STK-RACK-DINRAIL=", "DIN-rail rack mount kit", 9, "N/A", "No"],
    ["8.0", "STK-RACK-DINRAIL=", "DIN-rail rack mount kit", 9, "N/A", "No"],
  ];
  // Manual / non-Cisco commercial lines: a Samsung display and three cost lines with no
  // Cisco catalog match. They must be classified `manual` (preserved, non-orderable) and
  // never given an invented SKU.
  const MANUAL_ROWS: ReadonlyArray<readonly [string, string, string, number, string, string]> = [
    ["9.0", "LH75QMCEBGCXUE", "Samsung 75 inch display", 2, "N/A", "No"],
    ["10.0", "ENGINEERING-PM-COST", "Engineering and project management", 1, "N/A", "No"],
    ["11.0", "TRAVEL-COST", "Travel", 1, "N/A", "No"],
    ["12.0", "INSURANCE-POLICY", "Insurance policy", 1, "N/A", "No"],
  ];
  const MIXED_CISCO_CSV = [
    MIXED_CISCO_HEADER,
    ...[...CISCO_ROWS, ...MANUAL_ROWS].map((r) => r.join(",")),
  ].join("\n");

  const SERVICE_DURATION_HEADER = "Service Duration (Months)";
  // Support rows whose Service Duration (Months) = 60 must survive in originalCells.
  const SUPPORT_60_SKUS = [
    "CON-SNT-CSKITEK9",
    "CON-SNT-CS5HEJMI",
    "CON-SNT-IEM35B2S",
    "CON-SNT-I1002SLM",
  ];
  const CISCO_SKUS = CISCO_ROWS.map((r) => r[1]);
  // Aggregate accepted Cisco quantity per SKU (STK-RACK-DINRAIL= appears twice => 18).
  const EXPECTED_CISCO_QTY_BY_SKU: Record<string, number> = (() => {
    const out: Record<string, number> = {};
    for (const [, sku, , qty] of CISCO_ROWS) out[sku] = (out[sku] ?? 0) + qty;
    return out;
  })();

  function decisionsOf(artifact: ProjectArtifact): SkuResolutionDecision[] {
    return (artifact.payload.decisions ?? []) as SkuResolutionDecision[];
  }

  // Sanity-check the SkuResolutionDecision sanitization the panel POSTs (no authority,
  // tenant, project, pricing, catalog, replacement, or substitution leakage).
  function assertSanitizedSkuAction(action: Record<string, unknown>): void {
    for (const key of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "decidedAt",
      "pricing",
      "catalog",
      "catalogProfile",
      "authority",
      "replacement",
      "substitution",
    ]) {
      expect(action, `action must not carry "${key}"`).not.toHaveProperty(key);
    }
  }

  it("recognizes mixed Cisco SKUs as same-SKU, classifies manual rows, and reaches a Cisco-unpriced priced_boq draft", async () => {
    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    // --- 1. Upload + normalize through the UI; assert 20 normalized rows ----------
    const file = new File([MIXED_CISCO_CSV], "mixed-cisco-upload.csv", { type: "text/csv" });
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

    const normalizedArtifact = hoisted.store.latestArtifact("normalized_boq");
    const normalizedLines = (normalizedArtifact.payload.lines ?? []) as CanonicalBoqLine[];
    expect(normalizedLines).toHaveLength(20);

    // The two STK-RACK-DINRAIL= rows stay two distinct source rows of quantity 9 each.
    const stkLines = normalizedLines.filter((l) => l.sku === "STK-RACK-DINRAIL=");
    expect(stkLines).toHaveLength(2);
    expect(stkLines.every((l) => l.quantity === 9)).toBe(true);
    expect(new Set(stkLines.map((l) => l.sourceRowNumber)).size).toBe(2);

    // Service duration 60 survives in originalCells for the support rows.
    for (const sku of SUPPORT_60_SKUS) {
      const line = normalizedLines.find((l) => l.sku === sku);
      expect(line, `normalized line for ${sku}`).toBeDefined();
      expect(line?.originalCells[SERVICE_DURATION_HEADER]).toBe("60");
    }

    // --- 2. Create sku_resolution through the UI; assert recognition + manual split --
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();

    // Creation carried no body / no catalog profile (default approved catalog).
    const skuCreateCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCreateCalls).toHaveLength(1);
    expect(skuCreateCalls[0].body).toBeNull();

    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");
    const skuSummary = skuDraft.payload.summary as {
      totalLines: number;
      needsReviewCount: number;
      unresolvedCount: number;
      catalogSource: string;
    };
    expect(skuSummary.totalLines).toBe(20);
    expect(skuSummary.needsReviewCount).toBe(16);
    expect(skuSummary.unresolvedCount).toBe(4);
    expect(skuSummary.catalogSource).toBe("default_quick_bom_approved_catalog");

    const draftDecisions = decisionsOf(skuDraft);
    expect(draftDecisions).toHaveLength(20);
    // 16 Cisco rows resolve as same-SKU exact needs_review suggestions.
    const ciscoDecisions = draftDecisions.filter(
      (d) =>
        d.status === "needs_review" &&
        d.suggestions.length === 1 &&
        d.suggestions[0].suggestedSku.trim().toLowerCase() ===
          d.originalSku.trim().toLowerCase()
    );
    expect(ciscoDecisions).toHaveLength(16);
    // 4 manual/non-Cisco rows are unresolved (no invented SKU).
    const unresolvedDecisions = draftDecisions.filter((d) => d.status === "unresolved");
    expect(unresolvedDecisions).toHaveLength(4);
    for (const d of unresolvedDecisions) {
      expect(d).not.toHaveProperty("acceptedSku");
    }
    // The two STK rows remain two distinct decisions, not collapsed.
    const stkDecisions = draftDecisions.filter((d) => d.originalSku === "STK-RACK-DINRAIL=");
    expect(stkDecisions).toHaveLength(2);
    expect(new Set(stkDecisions.map((d) => d.sourceRowNumber)).size).toBe(2);

    // --- 3. Load the SKU review panel and submit one batch through the UI ---------
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    expect(await screen.findByTestId("sku-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sku-review-line")).toHaveLength(20);
    // 16 eligible same-SKU Cisco rows render an enabled+checked checkbox; the 4 manual
    // rows render none and sit in the excluded section.
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(16);
    expect(checkboxes.filter((c) => !c.disabled && c.checked)).toHaveLength(16);
    const submitBtn = screen.getByTestId("sku-review-submit");
    expect(submitBtn).toHaveTextContent("(16 included / 4 excluded)");
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(await screen.findByTestId("approve-sku_resolution")).toBeInTheDocument();

    // Exactly one SKU review POST: 16 accept + 4 manual sanitized actions.
    const skuReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution\/review$/.test(c.url)
    );
    expect(skuReviewPostCalls).toHaveLength(1);
    const batchActions = (skuReviewPostCalls[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(batchActions).toHaveLength(20);
    const acceptActions = batchActions.filter((a) => a.decision === "accept");
    const manualActions = batchActions.filter((a) => a.decision === "manual");
    expect(acceptActions).toHaveLength(16);
    expect(manualActions).toHaveLength(4);
    for (const a of manualActions) {
      expect(a).not.toHaveProperty("acceptedSku");
    }
    for (const a of batchActions) assertSanitizedSkuAction(a);

    // Reviewed sku_resolution: 16 accepted, 4 manual, no replacement/substitution.
    const reviewedSku = hoisted.store.latestArtifact("sku_resolution");
    const reviewedDecisions = decisionsOf(reviewedSku);
    expect(reviewedDecisions.filter((d) => d.status === "accepted")).toHaveLength(16);
    expect(reviewedDecisions.filter((d) => d.status === "manual")).toHaveLength(4);
    for (const d of reviewedDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }
    // Aggregate accepted Cisco quantity per SKU matches the fixture facts; STK = 18.
    const acceptedQtyBySku: Record<string, number> = {};
    for (const d of reviewedDecisions) {
      if (d.status !== "accepted" || d.acceptedSku === undefined) continue;
      const qty = normalizedLines.find(
        (l) => l.sourceFileId === d.sourceFileId && l.sourceRowNumber === d.sourceRowNumber
      )?.quantity;
      expect(qty, `quantity for accepted row ${d.acceptedSku}`).toBeDefined();
      acceptedQtyBySku[d.acceptedSku] = (acceptedQtyBySku[d.acceptedSku] ?? 0) + (qty ?? 0);
    }
    expect(acceptedQtyBySku).toEqual(EXPECTED_CISCO_QTY_BY_SKU);
    expect(acceptedQtyBySku["STK-RACK-DINRAIL="]).toBe(18);

    // --- 4. Approve sku_resolution through the UI generic approval path -----------
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved")
    );

    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // --- 5. Create configuration_expansion through the UI; inspect the artifact ----
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-configuration_expansion"));
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();

    const configDraft = hoisted.store.latestArtifact("configuration_expansion");
    expect(configDraft.payload.payloadKind).toBe("configuration_expansion_draft");
    const configLines = (configDraft.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
    // All 20 customer rows are preserved; no Cisco expansion children exist (no approved
    // Cisco configuration rules in this task).
    expect(configLines).toHaveLength(20);
    expect(configLines.every((l) => l.origin === "customer")).toBe(true);
    expect(configLines.some((l) => l.origin === "expansion")).toBe(false);
    const orderableCount = configLines.filter(
      (l) => typeof (l as { acceptedSku?: string }).acceptedSku === "string"
    ).length;
    const manualCount = configLines.filter(
      (l) => (l as { skuResolutionStatus?: string }).skuResolutionStatus === "manual"
    ).length;
    expect(orderableCount).toBe(16);
    expect(manualCount).toBe(4);
    const configSummary = configDraft.payload.summary as {
      customerLineCount: number;
      addedLineCount: number;
      totalLineCount: number;
      requiresReviewCount: number;
      acceptedCustomerLineCount: number;
      nonAcceptedCustomerLineCount: number;
      manualCustomerLineCount: number;
    };
    expect(configSummary.customerLineCount).toBe(20);
    expect(configSummary.addedLineCount).toBe(0);
    expect(configSummary.totalLineCount).toBe(20);
    expect(configSummary.requiresReviewCount).toBe(0);
    expect(configSummary.acceptedCustomerLineCount).toBe(16);
    expect(configSummary.nonAcceptedCustomerLineCount).toBe(4);
    expect(configSummary.manualCustomerLineCount).toBe(4);
    // No replacement/substitution introduced anywhere in the draft.
    assertNoActiveReplacementSubstitutionFields(configDraft.payload);

    // There are no expansion lines requiring review; complete the existing review flow
    // with an empty decision batch (the panel exposes zero checkboxes).
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    expect(await screen.findByTestId("config-review-summary")).toBeInTheDocument();
    expect(screen.queryAllByTestId("config-review-checkbox")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("config-review-summary")).toBeNull(),
      { timeout: 3000 }
    );
    const configReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url)
    );
    expect(configReviewPostCalls).toHaveLength(1);
    expect(
      (configReviewPostCalls[0].body as { decisions: unknown[] }).decisions
    ).toHaveLength(0);

    // Reviewed configuration_expansion preserves all 20 customer rows: 16 orderable, 4
    // manual non-orderable; nothing silently dropped, no expansion added.
    const reviewedConfig = hoisted.store.latestArtifact("configuration_expansion");
    expect(reviewedConfig.payload.payloadKind).not.toBe("configuration_expansion_draft");
    const acceptedConfigLines = (reviewedConfig.payload.acceptedLines ?? []) as Array<
      ConfigurationExpansionDraftLine & { acceptedSku?: string; skuResolutionStatus?: string }
    >;
    expect(acceptedConfigLines).toHaveLength(20);
    expect(acceptedConfigLines.every((l) => l.origin === "customer")).toBe(true);
    expect(
      acceptedConfigLines.filter((l) => typeof l.acceptedSku === "string")
    ).toHaveLength(16);
    expect(
      acceptedConfigLines.filter((l) => l.skuResolutionStatus === "manual")
    ).toHaveLength(4);
    assertNoActiveReplacementSubstitutionFields(reviewedConfig.payload);

    // --- 6. Approve configuration_expansion through the UI generic approval path ---
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(
      await screen.findByTestId("approve-configuration_expansion")
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-configuration_expansion"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved")
    );

    // --- 7. Create priced_boq through the UI; load priced review -------------------
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-priced_boq"));
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();

    const pricedArtifact = hoisted.store.latestArtifact("priced_boq");
    const pricedLines = (pricedArtifact.payload.lines ?? []) as Array<{ status: string }>;
    expect(pricedLines).toHaveLength(20);
    expect(pricedLines.filter((l) => l.status === "priced")).toHaveLength(0);
    expect(pricedLines.filter((l) => l.status === "missing_price")).toHaveLength(16);
    expect(pricedLines.filter((l) => l.status === "not_accepted")).toHaveLength(4);
    const pricedSummary = pricedArtifact.payload.summary as {
      inputLineCount: number;
      pricedLineCount: number;
      missingPriceCount: number;
      notAcceptedCount: number;
    };
    expect(pricedSummary.inputLineCount).toBe(20);
    expect(pricedSummary.pricedLineCount).toBe(0);
    expect(pricedSummary.missingPriceCount).toBe(16);
    expect(pricedSummary.notAcceptedCount).toBe(4);

    // Pricing source remains the committed Honeywell MVP demo scope; no Cisco pricing
    // authority is introduced.
    const pricingAuthority = pricedArtifact.payload.pricingAuthority as {
      scope?: string;
      profileId?: string;
      activeSource?: string;
      boundary?: Record<string, boolean>;
    };
    expect(pricingAuthority.scope).toBe("honeywell_mvp_demo_only");
    expect(pricingAuthority.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(pricingAuthority.activeSource).toBe("committed_honeywell_demo_pricing_fixture");
    expect(pricingAuthority.boundary?.productionCiscoPricingAuthority).toBe(false);
    expect(pricingAuthority.boundary?.broadCiscoGeneralPricingAuthority).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });
    expect(await screen.findByTestId("priced-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("priced-review-line")).toHaveLength(20);
    const pricedReviewText = screen.getByTestId("priced-review-summary").textContent ?? "";
    expect(pricedReviewText).toContain("20 lines");
    expect(pricedReviewText).toContain("0 priced");
    expect(pricedReviewText).toContain("16 missing price");
    // The priced review panel is read-only: it never POSTs.
    expect(
      calls.filter((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(0);

    // priced_boq stays at needs_review: it is NOT approved and NO export_package is
    // created in this Cisco-recognition-only evidence test.
    expect(hoisted.store.latestArtifact("priced_boq").status).toBe("needs_review");
    expect(calls.some((c) => /\/export-package$/.test(c.url))).toBe(false);

    // --- 8. No leakage of broad pricing, benchmark paths, runtime catalog/AI, or
    // replacement/substitution anywhere in the DOM ---------------------------------
    const dom = document.body.textContent ?? "";
    expect(dom).not.toContain("mixed-cisco-upload.csv");
    expect(dom).not.toContain("Estimate_NB167337237YA.xlsx");
    expect(dom).not.toContain("activeSourceWorkbookPath");
    expect(dom).not.toContain("unitListPriceSarBySku");
    expect(dom).not.toContain("broadCiscoGeneralPricingAuthority");
    expect(dom).not.toContain("runtimeCatalogLookup");
    expect(dom).not.toContain("replacement");
    expect(dom).not.toContain("substitution");
    expect(dom).not.toContain("acceptedLines");
    expect(dom).not.toContain("originalCells");

    // Recursive final-payload assertion across every persisted Cisco-recognition artifact.
    for (const artifactType of [
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
    ] as const) {
      assertNoActiveReplacementSubstitutionFields(
        hoisted.store.latestArtifact(artifactType).payload
      );
    }

    view.unmount();
  });
});

describe("scoped Cisco comparison workbook app chain E2E (test-only evidence)", () => {
  // Evidence/regression proof that the deterministic same-SKU recognition scope flows
  // through the app for the ACTUAL scoped comparison workbook (a mixed Cisco
  // collaboration + industrial-switching estimate). The workbook item rows are parsed
  // and emitted as an accepted Quick BoM Format #1 CSV, then four non-Cisco manual
  // commercial lines are appended. The app runs upload -> normalize -> SKU review ->
  // SKU approval -> configuration expansion -> configuration approval -> priced_boq
  // draft, WITHOUT introducing any Cisco pricing authority, catalog lookup,
  // replacement, or substitution. The active pricing source stays the committed demo
  // fixture only, so recognized Cisco rows surface as `missing_price` (recognition is
  // not pricing eligibility). priced_boq is left at needs_review and no export_package
  // is created.
  const COMPARISON_WORKBOOK_PATH =
    "C:\\Pre-Sales\\Benchmarck_Files\\MARAFIQObsolete_Network_Hardware_Replacement.xlsx";
  const COMPARISON_SHEET_NAME = "EstimateDetails_JL164850184VT";
  // Comparison workbook column layout (1-based), confirmed from the sheet header row.
  const WB_COL = {
    lineNumber: 1,
    itemName: 2,
    description: 4,
    serviceDuration: 6,
    includedItem: 8,
    quantity: 9,
    listPrice: 11,
    extendedListPrice: 12,
    serviceType: 15,
  };
  const EXPECTED_CISCO_ITEM_ROWS = 44;
  const EXPECTED_INCLUDED_ITEM_ROWS = 25;

  const CSV_HEADERS = [
    "Line Number",
    "Item Name",
    "Description",
    "Quantity",
    "Service Duration (Months)",
    "Included Item",
  ];
  const SERVICE_DURATION_HEADER = "Service Duration (Months)";
  const INCLUDED_ITEM_HEADER = "Included Item";

  interface ComparisonItemRow {
    lineNumber: string;
    sku: string;
    description: string;
    quantity: number;
    serviceDuration: string;
    includedItem: string;
    listPrice: number;
    extended: number;
    serviceType: string;
  }

  // Manual / non-Cisco commercial lines appended after the workbook rows: a display and
  // three cost lines with no Cisco catalog match. They must be classified `manual`
  // (preserved, non-orderable) and never given an invented SKU.
  // [lineNumber, sku, description, quantity, serviceDuration, includedItem]
  const MANUAL_ROWS: ReadonlyArray<readonly [string, string, string, number, string, string]> = [
    ["9001.0", "LH75QMCEBGCXUE", "Large format display", 2, "N/A", "No"],
    ["9002.0", "ENGINEERING-PM-COST", "Engineering and project management", 1, "N/A", "No"],
    ["9003.0", "TRAVEL-COST", "Travel", 1, "N/A", "No"],
    ["9004.0", "INSURANCE-POLICY", "Insurance policy", 1, "N/A", "No"],
  ];

  /**
   * Parse the comparison workbook item rows. An item row needs a Line Number, an Item
   * Name/SKU, a positive Quantity, and a numeric ListPrice (0 allowed). A blank Extended
   * ListPrice cell is read as 0.
   */
  function parseComparisonItemRows(worksheet: ExcelJS.Worksheet): ComparisonItemRow[] {
    const rows: ComparisonItemRow[] = [];
    for (let r = 1; r <= worksheet.rowCount; r += 1) {
      const wsRow = worksheet.getRow(r);
      const lineNumber = cellText(wsRow.getCell(WB_COL.lineNumber));
      const sku = cellText(wsRow.getCell(WB_COL.itemName));
      const quantity = numericCell(wsRow.getCell(WB_COL.quantity));
      const listPrice = numericCell(wsRow.getCell(WB_COL.listPrice));
      if (
        lineNumber === "" ||
        sku === "" ||
        quantity === null ||
        quantity <= 0 ||
        listPrice === null
      ) {
        continue;
      }
      rows.push({
        lineNumber,
        sku,
        description: cellText(wsRow.getCell(WB_COL.description)),
        quantity,
        serviceDuration: cellText(wsRow.getCell(WB_COL.serviceDuration)),
        includedItem: cellText(wsRow.getCell(WB_COL.includedItem)),
        listPrice,
        extended: numericCell(wsRow.getCell(WB_COL.extendedListPrice)) ?? 0,
        serviceType: cellText(wsRow.getCell(WB_COL.serviceType)),
      });
    }
    return rows;
  }

  /** RFC-4180 CSV escaping; descriptions contain commas and quotes. */
  function csvEscape(value: string | number): string {
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildAcceptedCsv(ciscoRows: ComparisonItemRow[]): string {
    const lines: string[] = [CSV_HEADERS.join(",")];
    for (const row of ciscoRows) {
      lines.push(
        [
          row.lineNumber,
          row.sku,
          row.description,
          row.quantity,
          row.serviceDuration,
          row.includedItem,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    for (const [lineNumber, sku, description, quantity, serviceDuration, includedItem] of MANUAL_ROWS) {
      lines.push(
        [lineNumber, sku, description, quantity, serviceDuration, includedItem]
          .map(csvEscape)
          .join(",")
      );
    }
    return lines.join("\n");
  }

  function decisionsOf(artifact: ProjectArtifact): SkuResolutionDecision[] {
    return (artifact.payload.decisions ?? []) as SkuResolutionDecision[];
  }

  // The SkuResolutionDecision sanitization the panel POSTs must not leak authority,
  // tenant, project, artifact, decision-author, pricing, catalog, replacement, or
  // substitution context.
  function assertSanitizedSkuAction(action: Record<string, unknown>): void {
    for (const key of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "decidedAt",
      "pricing",
      "catalog",
      "catalogProfile",
      "authority",
      "replacement",
      "substitution",
    ]) {
      expect(action, `action must not carry "${key}"`).not.toHaveProperty(key);
    }
  }

  it("recognizes the scoped Cisco comparison workbook SKUs, classifies manual rows, and reaches a Cisco-unpriced priced_boq draft", async () => {
    // --- 0. Parse the comparison workbook and generate an accepted Quick BoM CSV -----
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(COMPARISON_WORKBOOK_PATH);
    const worksheet = workbook.getWorksheet(COMPARISON_SHEET_NAME);
    expect(worksheet, `sheet ${COMPARISON_SHEET_NAME}`).toBeDefined();
    const ciscoRows = parseComparisonItemRows(worksheet as ExcelJS.Worksheet);
    expect(ciscoRows).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);

    const ciscoSkuSequence = ciscoRows.map((r) => r.sku);
    const expectedCiscoQtyBySku: Record<string, number> = {};
    for (const row of ciscoRows) {
      expectedCiscoQtyBySku[row.sku] = (expectedCiscoQtyBySku[row.sku] ?? 0) + row.quantity;
    }
    expect(expectedCiscoQtyBySku["STK-RACK-DINRAIL="]).toBe(18);
    // The two DIN-rail rack rows stay two source rows of quantity 9 each.
    const stkSourceRows = ciscoRows.filter((r) => r.sku === "STK-RACK-DINRAIL=");
    expect(stkSourceRows).toHaveLength(2);
    expect(stkSourceRows.every((r) => r.quantity === 9)).toBe(true);
    // Support rows carry Service Duration (Months) = 60.
    const support60Skus = ciscoRows
      .filter((r) => r.serviceDuration === "60")
      .map((r) => r.sku);
    expect(support60Skus).toHaveLength(4);

    const generatedCsv = buildAcceptedCsv(ciscoRows);
    const manualSkus = MANUAL_ROWS.map((r) => r[1]);
    const totalLineCount = EXPECTED_CISCO_ITEM_ROWS + MANUAL_ROWS.length;

    const project = await createArbitraryProject();
    const calls = dispatchQuickBomFetch();
    let view = render(<ProjectQuickBomPage />);

    await screen.findByTestId("project-name");

    // --- 1. Upload + normalize the generated CSV through the UI ----------------------
    const file = new File([generatedCsv], "scoped-comparison-upload.csv", {
      type: "text/csv",
    });
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

    const normalizedArtifact = hoisted.store.latestArtifact("normalized_boq");
    const normalizedLines = (normalizedArtifact.payload.lines ?? []) as CanonicalBoqLine[];
    expect(normalizedLines).toHaveLength(totalLineCount);
    const workbookSkuSet = new Set(ciscoSkuSequence);
    const manualSkuSet = new Set(manualSkus);
    expect(
      normalizedLines.filter((l) => workbookSkuSet.has(l.sku))
    ).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);
    expect(
      normalizedLines.filter((l) => manualSkuSet.has(l.sku))
    ).toHaveLength(MANUAL_ROWS.length);

    // The two DIN-rail rows survive as two distinct source rows of quantity 9 each.
    const stkLines = normalizedLines.filter((l) => l.sku === "STK-RACK-DINRAIL=");
    expect(stkLines).toHaveLength(2);
    expect(stkLines.every((l) => l.quantity === 9)).toBe(true);
    expect(new Set(stkLines.map((l) => l.sourceRowNumber)).size).toBe(2);

    // Service duration 60 survives in originalCells for the support rows, tied to source.
    for (const sku of support60Skus) {
      const line = normalizedLines.find((l) => l.sku === sku);
      expect(line, `normalized line for ${sku}`).toBeDefined();
      expect(line?.originalCells[SERVICE_DURATION_HEADER]).toBe("60");
      expect(typeof line?.sourceRowNumber).toBe("number");
    }

    // Included-item rows are preserved as customer rows with Included Item = Yes.
    const includedItemLines = normalizedLines.filter(
      (l) => l.originalCells[INCLUDED_ITEM_HEADER] === "Yes"
    );
    expect(includedItemLines).toHaveLength(EXPECTED_INCLUDED_ITEM_ROWS);

    // --- 2. Create sku_resolution; assert recognition + manual split -----------------
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-sku_resolution"));
    });
    expect(await screen.findByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();

    const skuCreateCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution$/.test(c.url)
    );
    expect(skuCreateCalls).toHaveLength(1);
    expect(skuCreateCalls[0].body).toBeNull();

    const skuDraft = hoisted.store.latestArtifact("sku_resolution");
    expect(skuDraft.status).toBe("needs_review");
    const skuSummary = skuDraft.payload.summary as {
      totalLines: number;
      needsReviewCount: number;
      unresolvedCount: number;
      catalogSource: string;
    };
    expect(skuSummary.totalLines).toBe(totalLineCount);
    expect(skuSummary.needsReviewCount).toBe(EXPECTED_CISCO_ITEM_ROWS);
    expect(skuSummary.unresolvedCount).toBe(MANUAL_ROWS.length);
    expect(skuSummary.catalogSource).toBe("default_quick_bom_approved_catalog");

    const draftDecisions = decisionsOf(skuDraft);
    expect(draftDecisions).toHaveLength(totalLineCount);
    const ciscoDecisions = draftDecisions.filter(
      (d) =>
        d.status === "needs_review" &&
        d.suggestions.length === 1 &&
        d.suggestions[0].suggestedSku.trim().toLowerCase() ===
          d.originalSku.trim().toLowerCase()
    );
    expect(ciscoDecisions).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);
    const unresolvedDecisions = draftDecisions.filter((d) => d.status === "unresolved");
    expect(unresolvedDecisions).toHaveLength(MANUAL_ROWS.length);
    for (const d of unresolvedDecisions) {
      expect(d).not.toHaveProperty("acceptedSku");
    }

    // --- 3. Load the SKU review panel and submit one batch through the UI ------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    expect(await screen.findByTestId("sku-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sku-review-line")).toHaveLength(totalLineCount);
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);
    expect(checkboxes.filter((c) => !c.disabled && c.checked)).toHaveLength(
      EXPECTED_CISCO_ITEM_ROWS
    );
    const submitBtn = screen.getByTestId("sku-review-submit");
    expect(submitBtn).toHaveTextContent(
      `(${EXPECTED_CISCO_ITEM_ROWS} included / ${MANUAL_ROWS.length} excluded)`
    );
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(await screen.findByTestId("approve-sku_resolution")).toBeInTheDocument();

    // Exactly one SKU review POST: 44 accept + 4 manual sanitized actions.
    const skuReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/sku-resolution\/review$/.test(c.url)
    );
    expect(skuReviewPostCalls).toHaveLength(1);
    const batchActions = (skuReviewPostCalls[0].body as {
      actions: Record<string, unknown>[];
    }).actions;
    expect(batchActions).toHaveLength(totalLineCount);
    const acceptActions = batchActions.filter((a) => a.decision === "accept");
    const manualActions = batchActions.filter((a) => a.decision === "manual");
    expect(acceptActions).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);
    expect(manualActions).toHaveLength(MANUAL_ROWS.length);
    for (const a of manualActions) {
      expect(a).not.toHaveProperty("acceptedSku");
    }
    for (const a of batchActions) assertSanitizedSkuAction(a);

    // Reviewed sku_resolution: 44 accepted, 4 manual, no replacement/substitution.
    const reviewedSku = hoisted.store.latestArtifact("sku_resolution");
    const reviewedDecisions = decisionsOf(reviewedSku);
    expect(reviewedDecisions.filter((d) => d.status === "accepted")).toHaveLength(
      EXPECTED_CISCO_ITEM_ROWS
    );
    expect(reviewedDecisions.filter((d) => d.status === "manual")).toHaveLength(
      MANUAL_ROWS.length
    );
    for (const d of reviewedDecisions) {
      expect(d).not.toHaveProperty("replacementFor");
      expect(d).not.toHaveProperty("substitutedSku");
    }

    // Accepted Cisco SKU sequence (ordered by source row) exactly matches the parsed
    // workbook SKU rows in order, preserving the duplicate DIN-rail row.
    const acceptedInOrder = reviewedDecisions
      .filter((d) => d.status === "accepted")
      .sort((a, b) => a.sourceRowNumber - b.sourceRowNumber)
      .map((d) => d.acceptedSku);
    expect(acceptedInOrder).toEqual(ciscoSkuSequence);

    // Aggregate accepted Cisco quantity per SKU exactly matches the workbook aggregate.
    const acceptedQtyBySku: Record<string, number> = {};
    for (const d of reviewedDecisions) {
      if (d.status !== "accepted" || d.acceptedSku === undefined) continue;
      const qty = normalizedLines.find(
        (l) => l.sourceFileId === d.sourceFileId && l.sourceRowNumber === d.sourceRowNumber
      )?.quantity;
      expect(qty, `quantity for accepted row ${d.acceptedSku}`).toBeDefined();
      acceptedQtyBySku[d.acceptedSku] = (acceptedQtyBySku[d.acceptedSku] ?? 0) + (qty ?? 0);
    }
    expect(acceptedQtyBySku).toEqual(expectedCiscoQtyBySku);
    expect(acceptedQtyBySku["STK-RACK-DINRAIL="]).toBe(18);

    // --- 4. Approve sku_resolution through the UI generic approval path --------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-sku_resolution")).toHaveTextContent("approved")
    );

    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // --- 5. Create configuration_expansion; inspect the artifact ---------------------
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-configuration_expansion"));
    });
    expect(
      await screen.findByTestId("line-review-required-configuration_expansion")
    ).toBeInTheDocument();

    const configDraft = hoisted.store.latestArtifact("configuration_expansion");
    expect(configDraft.payload.payloadKind).toBe("configuration_expansion_draft");
    const configLines = (configDraft.payload.lines ?? []) as ConfigurationExpansionDraftLine[];
    expect(configLines).toHaveLength(totalLineCount);
    expect(configLines.every((l) => l.origin === "customer")).toBe(true);
    expect(configLines.some((l) => l.origin === "expansion")).toBe(false);
    const orderableCount = configLines.filter(
      (l) => typeof (l as { acceptedSku?: string }).acceptedSku === "string"
    ).length;
    const configManualCount = configLines.filter(
      (l) => (l as { skuResolutionStatus?: string }).skuResolutionStatus === "manual"
    ).length;
    expect(orderableCount).toBe(EXPECTED_CISCO_ITEM_ROWS);
    expect(configManualCount).toBe(MANUAL_ROWS.length);
    const configSummary = configDraft.payload.summary as {
      customerLineCount: number;
      addedLineCount: number;
      totalLineCount: number;
      requiresReviewCount: number;
      acceptedCustomerLineCount: number;
      nonAcceptedCustomerLineCount: number;
      manualCustomerLineCount: number;
    };
    expect(configSummary.customerLineCount).toBe(totalLineCount);
    expect(configSummary.addedLineCount).toBe(0);
    expect(configSummary.totalLineCount).toBe(totalLineCount);
    expect(configSummary.requiresReviewCount).toBe(0);
    expect(configSummary.acceptedCustomerLineCount).toBe(EXPECTED_CISCO_ITEM_ROWS);
    expect(configSummary.nonAcceptedCustomerLineCount).toBe(MANUAL_ROWS.length);
    expect(configSummary.manualCustomerLineCount).toBe(MANUAL_ROWS.length);
    assertNoActiveReplacementSubstitutionFields(configDraft.payload);

    // No expansion lines require review; complete with an empty decision batch.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    expect(await screen.findByTestId("config-review-summary")).toBeInTheDocument();
    expect(screen.queryAllByTestId("config-review-checkbox")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    await waitFor(
      () => expect(screen.queryByTestId("config-review-summary")).toBeNull(),
      { timeout: 3000 }
    );
    const configReviewPostCalls = calls.filter(
      (c) => c.method === "POST" && /\/configuration-expansion\/review$/.test(c.url)
    );
    expect(configReviewPostCalls).toHaveLength(1);
    expect(
      (configReviewPostCalls[0].body as { decisions: unknown[] }).decisions
    ).toHaveLength(0);

    // Reviewed configuration_expansion preserves all 48 customer rows: 44 orderable,
    // 4 manual non-orderable; nothing dropped, no expansion added.
    const reviewedConfig = hoisted.store.latestArtifact("configuration_expansion");
    expect(reviewedConfig.payload.payloadKind).not.toBe("configuration_expansion_draft");
    const acceptedConfigLines = (reviewedConfig.payload.acceptedLines ?? []) as Array<
      ConfigurationExpansionDraftLine & { acceptedSku?: string; skuResolutionStatus?: string }
    >;
    expect(acceptedConfigLines).toHaveLength(totalLineCount);
    expect(acceptedConfigLines.every((l) => l.origin === "customer")).toBe(true);
    expect(
      acceptedConfigLines.filter((l) => typeof l.acceptedSku === "string")
    ).toHaveLength(EXPECTED_CISCO_ITEM_ROWS);
    expect(
      acceptedConfigLines.filter((l) => l.skuResolutionStatus === "manual")
    ).toHaveLength(MANUAL_ROWS.length);
    assertNoActiveReplacementSubstitutionFields(reviewedConfig.payload);

    // --- 6. Approve configuration_expansion through the UI generic approval path -----
    view.unmount();
    view = render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(
      await screen.findByTestId("approve-configuration_expansion")
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-configuration_expansion"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved")
    );

    // --- 7. Create priced_boq; load priced review (read-only) ------------------------
    await act(async () => {
      fireEvent.click(await screen.findByTestId("workflow-create-priced_boq"));
    });
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();

    const pricedArtifact = hoisted.store.latestArtifact("priced_boq");
    const pricedLines = (pricedArtifact.payload.lines ?? []) as Array<{ status: string }>;
    expect(pricedLines).toHaveLength(totalLineCount);
    expect(pricedLines.filter((l) => l.status === "priced")).toHaveLength(0);
    expect(pricedLines.filter((l) => l.status === "missing_price")).toHaveLength(
      EXPECTED_CISCO_ITEM_ROWS
    );
    expect(pricedLines.filter((l) => l.status === "not_accepted")).toHaveLength(
      MANUAL_ROWS.length
    );
    const pricedSummary = pricedArtifact.payload.summary as {
      inputLineCount: number;
      pricedLineCount: number;
      missingPriceCount: number;
      notAcceptedCount: number;
    };
    expect(pricedSummary.inputLineCount).toBe(totalLineCount);
    expect(pricedSummary.pricedLineCount).toBe(0);
    expect(pricedSummary.missingPriceCount).toBe(EXPECTED_CISCO_ITEM_ROWS);
    expect(pricedSummary.notAcceptedCount).toBe(MANUAL_ROWS.length);

    // Pricing source remains the committed demo scope; no Cisco pricing authority.
    const pricingAuthority = pricedArtifact.payload.pricingAuthority as {
      scope?: string;
      profileId?: string;
      activeSource?: string;
      boundary?: Record<string, boolean>;
    };
    expect(pricingAuthority.scope).toBe("honeywell_mvp_demo_only");
    expect(pricingAuthority.profileId).toBe("honeywell-mvp-demo-pricing-authority-profile");
    expect(pricingAuthority.activeSource).toBe("committed_honeywell_demo_pricing_fixture");
    expect(pricingAuthority.boundary?.productionCiscoPricingAuthority).toBe(false);
    expect(pricingAuthority.boundary?.broadCiscoGeneralPricingAuthority).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });
    expect(await screen.findByTestId("priced-review-summary")).toBeInTheDocument();
    expect(screen.getAllByTestId("priced-review-line")).toHaveLength(totalLineCount);
    const pricedReviewText = screen.getByTestId("priced-review-summary").textContent ?? "";
    expect(pricedReviewText).toContain(`${totalLineCount} lines`);
    expect(pricedReviewText).toContain("0 priced");
    expect(pricedReviewText).toContain(`${EXPECTED_CISCO_ITEM_ROWS} missing price`);
    // The priced review panel is read-only: it never POSTs.
    expect(
      calls.filter((c) => c.method === "POST" && /\/priced-boq\/review$/.test(c.url))
    ).toHaveLength(0);

    // priced_boq stays at needs_review: NOT approved, and NO export_package created.
    expect(hoisted.store.latestArtifact("priced_boq").status).toBe("needs_review");
    expect(calls.some((c) => /\/export-package$/.test(c.url))).toBe(false);

    // --- 8. No leakage of the workbook path, price map, payload internals, runtime
    // catalog/AI, replacement, or substitution anywhere in the DOM ------------------
    const dom = document.body.textContent ?? "";
    expect(dom).not.toContain("scoped-comparison-upload.csv");
    expect(dom).not.toContain(COMPARISON_WORKBOOK_PATH);
    expect(dom).not.toContain("MARAFIQObsolete_Network_Hardware_Replacement.xlsx");
    expect(dom).not.toContain("activeSourceWorkbookPath");
    expect(dom).not.toContain("unitListPriceSarBySku");
    expect(dom).not.toContain("broadCiscoGeneralPricingAuthority");
    expect(dom).not.toContain("runtimeCatalogLookup");
    expect(dom).not.toContain("replacement");
    expect(dom).not.toContain("substitution");
    expect(dom).not.toContain("acceptedLines");
    expect(dom).not.toContain("originalCells");

    // Recursive final-payload assertion across every persisted artifact.
    for (const artifactType of [
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
    ] as const) {
      assertNoActiveReplacementSubstitutionFields(
        hoisted.store.latestArtifact(artifactType).payload
      );
    }

    view.unmount();
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
