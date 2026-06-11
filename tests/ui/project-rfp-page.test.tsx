import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProjectRfpEvidencePage from "@/app/projects/[id]/rfp/page";

// The page reads the project id from the route. Only useParams is consumed.
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-rfp-1" }),
}));

const PROJECT_ID = "proj-rfp-1";
const LIST_URL = `/api/projects/${PROJECT_ID}/rfp/evidence`;
const BASELINE_LIST_URL = `/api/projects/${PROJECT_ID}/rfp/requirements-baseline`;
const BASELINE_ARTIFACT_ID = "art-rb-1";
const BASELINE_DETAIL_URL = `/api/projects/${PROJECT_ID}/rfp/artifacts/${BASELINE_ARTIFACT_ID}/requirements-baseline`;

// Persisted-content canaries. Both are smuggled into the lean list response
// (which the read model would never carry) AND returned by the detail stubs.
// They may reach the DOM only after an explicit Inspect click.
const TEXT_BODY_CANARY = "TEXT-BODY-CANARY";
const TABLE_CELL_CANARY = "TABLE-CELL-CANARY";

// Baseline canaries. Smuggled into the baseline list/detail stubs where the
// real read models would never carry them; none may ever reach the DOM.
const LIST_REQUIREMENT_TEXT_CANARY = "LIST-REQUIREMENT-TEXT-CANARY";
const RAW_EVIDENCE_TEXT_CANARY = "RAW-EVIDENCE-TEXT-CANARY";
const RAW_TABLE_ROW_CANARY = "RAW-TABLE-ROW-CANARY";
const STORAGE_PATH_CANARY = "STORAGE-PATH-CANARY";
const TENANT_ID_CANARY = "TENANT-ID-CANARY";
const SMUGGLED_KEY_CANARY = "SMUGGLED-KEY-CANARY";

function projectContext(): Record<string, unknown> {
  return {
    id: PROJECT_ID,
    name: "STC Riyadh DC RFP",
    customerName: "STC",
    mode: "rfp",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  };
}

// Fresh copy per call so a mutated fixture in one test cannot leak into another.
function textListItem(): Record<string, unknown> {
  return {
    id: "ev-text-1",
    projectId: PROJECT_ID,
    sourceFileId: "file-rfp-1",
    kind: "rfp_document_text_chunk",
    extractedAt: "2026-06-03T08:00:00.000Z",
    retainUntil: "2026-12-03T08:00:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_text_chunk",
      inputPackageArtifactId: "art-ip-1",
      sourceFileName: "rfp-main.pdf",
      sourceFileRole: "rfp_main_document",
      chunkIndex: 0,
      chunkCount: 4,
      charCount: 1810,
      documentMetrics: {
        textCharCount: 7200,
        nonWhitespaceTextCharCount: 6804,
        tableCount: 2,
        tableRowCount: 18,
      },
      // Never present in the real lean read model; planted to prove the list
      // view renders only whitelisted summary fields.
      text: TEXT_BODY_CANARY,
    },
  };
}

function tableListItem(): Record<string, unknown> {
  return {
    id: "ev-table-1",
    projectId: PROJECT_ID,
    sourceFileId: "file-rfp-2",
    kind: "rfp_document_table",
    extractedAt: "2026-06-03T08:05:00.000Z",
    retainUntil: "2026-12-03T08:05:00.000Z",
    contentSummary: {
      evidenceKind: "rfp_document_table",
      inputPackageArtifactId: "art-ip-1",
      sourceFileName: "rfp-scope.xlsx",
      sourceFileRole: "rfp_attachment",
      tableId: "tbl-1",
      sheetName: "Scope",
      rowCount: 12,
      columnCount: 5,
      // Same smuggling trick for table content.
      rows: [[TABLE_CELL_CANARY]],
    },
  };
}

function listResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    filters: {},
    evidenceCount: 2,
    textChunkCount: 1,
    tableEvidenceCount: 1,
    evidence: [textListItem(), tableListItem()],
  };
}

function textDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    evidence: {
      id: "ev-text-1",
      projectId: PROJECT_ID,
      sourceFileId: "file-rfp-1",
      kind: "rfp_document_text_chunk",
      extractedAt: "2026-06-03T08:00:00.000Z",
      retainUntil: "2026-12-03T08:00:00.000Z",
      content: {
        evidenceKind: "rfp_document_text_chunk",
        inputPackageArtifactId: "art-ip-1",
        sourceFileId: "file-rfp-1",
        sourceFileName: "rfp-main.pdf",
        sourceFileRole: "rfp_main_document",
        chunkIndex: 0,
        chunkCount: 4,
        text: `${TEXT_BODY_CANARY} The supplier shall provide a network design.`,
        charCount: 1810,
      },
    },
  };
}

function tableDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    evidence: {
      id: "ev-table-1",
      projectId: PROJECT_ID,
      sourceFileId: "file-rfp-2",
      kind: "rfp_document_table",
      extractedAt: "2026-06-03T08:05:00.000Z",
      retainUntil: "2026-12-03T08:05:00.000Z",
      content: {
        evidenceKind: "rfp_document_table",
        inputPackageArtifactId: "art-ip-1",
        sourceFileId: "file-rfp-2",
        sourceFileName: "rfp-scope.xlsx",
        sourceFileRole: "rfp_attachment",
        tableId: "tbl-1",
        sheetName: "Scope",
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["Item", "Qty"],
          [TABLE_CELL_CANARY, "4"],
        ],
      },
    },
  };
}

/** Serializable artifact summary shared by the baseline list/detail stubs. */
function baselineArtifactSummary(): Record<string, unknown> {
  return {
    id: BASELINE_ARTIFACT_ID,
    projectId: PROJECT_ID,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "draft",
    version: 1,
    sourceFileIds: ["file-rfp-1", "file-rfp-2"],
    sourceArtifactIds: ["art-ip-1"],
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-06-04T09:05:00.000Z",
  };
}

function baselineListItem(): Record<string, unknown> {
  return {
    ...baselineArtifactSummary(),
    payloadSummary: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 3,
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
      // Never present in the real lean read model; planted to prove the
      // list renders identifier/count fields only - never requirement text.
      requirementTexts: [LIST_REQUIREMENT_TEXT_CANARY],
    },
    // Smuggled keys the page must ignore entirely.
    payload: {
      requirements: [{ id: "RFP-REQ-001", text: LIST_REQUIREMENT_TEXT_CANARY }],
    },
    tenantId: TENANT_ID_CANARY,
    storagePath: STORAGE_PATH_CANARY,
  };
}

function baselineListResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifactCount: 1,
    artifacts: [baselineListItem()],
  };
}

function baselineDetailResponse(): Record<string, unknown> {
  return {
    project: projectContext(),
    artifact: baselineArtifactSummary(),
    baseline: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: "user-1",
      createdAt: "2026-06-04T09:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 3,
      // Smuggled keys the page must ignore entirely.
      tenantId: TENANT_ID_CANARY,
      storagePath: STORAGE_PATH_CANARY,
      requirements: [
        {
          id: "RFP-REQ-001",
          text: "The supplier shall provide redundant core switching.",
          category: "technical",
          priority: "mandatory",
          title: "Core redundancy",
          notes: "From section 3.1.",
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: "art-ip-1",
              chunkIndex: 0,
              chunkCount: 4,
              charCount: 1810,
              // Raw persisted content a locator reference never carries.
              text: RAW_EVIDENCE_TEXT_CANARY,
              tenantId: TENANT_ID_CANARY,
            },
            {
              evidenceId: "ev-table-1",
              evidenceKind: "rfp_document_table",
              sourceFileId: "file-rfp-2",
              inputPackageArtifactId: "art-ip-1",
              tableId: "tbl-1",
              sheetName: "Scope",
              rowCount: 12,
              columnCount: 5,
              rows: [[RAW_TABLE_ROW_CANARY]],
              storagePath: STORAGE_PATH_CANARY,
            },
          ],
        },
        {
          id: "RFP-REQ-002",
          text: "The solution shall include redundant uplinks per access switch.",
          category: "technical",
          priority: "optional",
          smuggledKey: SMUGGLED_KEY_CANARY,
          evidenceReferences: [
            {
              evidenceId: "ev-text-1",
              evidenceKind: "rfp_document_text_chunk",
              sourceFileId: "file-rfp-1",
              inputPackageArtifactId: "art-ip-1",
              chunkIndex: 2,
              chunkCount: 4,
              charCount: 950,
            },
          ],
        },
      ],
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Recorded {
  url: string;
  method: string;
  body: unknown;
}

// Stub fetch with a handler and capture every call for method/url assertions.
function stubFetch(
  handler: (url: string, init?: RequestInit) => Response
): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const rawBody = init?.body;
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof rawBody === "string" ? JSON.parse(rawBody) : (rawBody ?? null),
      });
      return Promise.resolve(handler(url, init));
    })
  );
  return calls;
}

// Default: evidence list (with or without query), both evidence detail
// endpoints, and the baseline list/detail endpoints all succeed.
function stubDefault(): Recorded[] {
  return stubFetch((url) => {
    if (url === `${LIST_URL}/ev-text-1`) return jsonResponse(textDetailResponse());
    if (url === `${LIST_URL}/ev-table-1`) return jsonResponse(tableDetailResponse());
    if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
    if (url === BASELINE_DETAIL_URL) return jsonResponse(baselineDetailResponse());
    if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
    return jsonResponse({}, 404);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectRfpEvidencePage - list load", () => {
  it("GETs the evidence list and the baseline list on mount and renders context, counts, and lean rows", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    expect(await screen.findByTestId("project-name")).toHaveTextContent("STC Riyadh DC RFP");
    expect(screen.getByTestId("customer-name")).toHaveTextContent("STC");
    expect(screen.getByTestId("project-mode")).toHaveTextContent("rfp");
    expect(screen.getByTestId("project-mode")).toHaveTextContent(PROJECT_ID);

    const counts = screen.getByTestId("evidence-counts");
    expect(counts).toHaveTextContent("2 total");
    expect(counts).toHaveTextContent("text chunks: 1");
    expect(counts).toHaveTextContent("tables: 1");

    const rows = screen.getAllByTestId("evidence-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("ev-text-1");
    expect(rows[0]).toHaveTextContent("text");
    expect(rows[0]).toHaveTextContent("rfp-main.pdf");
    expect(rows[0]).toHaveTextContent("rfp_main_document");
    expect(rows[0]).toHaveTextContent("file-rfp-1");
    expect(rows[0]).toHaveTextContent("chunk 1/4");
    expect(rows[0]).toHaveTextContent("1810 chars");
    expect(rows[0]).toHaveTextContent("art-ip-1");
    expect(rows[0]).toHaveTextContent("2026-06-03T08:00:00.000Z");
    expect(rows[1]).toHaveTextContent("ev-table-1");
    expect(rows[1]).toHaveTextContent("table tbl-1");
    expect(rows[1]).toHaveTextContent("sheet Scope");
    expect(rows[1]).toHaveTextContent("12 rows x 5 cols");

    const gets = calls.filter((c) => c.method === "GET");
    expect(gets).toHaveLength(2);
    const urls = gets.map((c) => c.url);
    expect(urls).toContain(LIST_URL);
    expect(urls).toContain(BASELINE_LIST_URL);
  });

  it("shows a list loading state while the list GET is pending", async () => {
    let resolveList: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        return new Promise<Response>((r) => { resolveList = r; });
      })
    );
    render(<ProjectRfpEvidencePage />);
    expect(screen.getByTestId("list-loading")).toBeInTheDocument();

    await act(async () => {
      resolveList(jsonResponse(listResponse()));
    });
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.queryByTestId("list-loading")).toBeNull();
  });

  it("never renders persisted text bodies or table cells in the list view (before Inspect)", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");
    await screen.findByTestId("baseline-row");

    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(TEXT_BODY_CANARY);
    expect(body).not.toContain(TABLE_CELL_CANARY);
    expect(body).not.toContain(LIST_REQUIREMENT_TEXT_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
  });

  it('renders exactly "Unable to load RFP evidence." when the list GET returns non-ok', async () => {
    stubFetch(() => jsonResponse({ code: "rfp_evidence_inspection_failed" }, 500));
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("list-error");
    expect(err.textContent).toBe("Unable to load RFP evidence.");
    expect(screen.queryByTestId("evidence-row")).toBeNull();
    expect(screen.queryByTestId("project-name")).toBeNull();
  });

  it("renders the exact list error when the list GET throws, without leaking the failure detail", async () => {
    const secret = "list-boom-stack-detail";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error(secret))));
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("list-error");
    expect(err.textContent).toBe("Unable to load RFP evidence.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });
});

describe("ProjectRfpEvidencePage - filters", () => {
  it("Apply reloads the list with sourceFileId, inputPackageArtifactId, and kind query params", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-1" },
    });
    fireEvent.change(screen.getByTestId("filter-artifact-id"), {
      target: { value: "art-ip-1" },
    });
    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "rfp_document_table" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });

    const evidenceGets = calls.filter(
      (c) => c.method === "GET" && c.url.startsWith(LIST_URL)
    );
    expect(evidenceGets).toHaveLength(2);
    const applied = new URL(evidenceGets[1].url, "http://localhost");
    expect(applied.pathname).toBe(LIST_URL);
    expect(applied.searchParams.get("sourceFileId")).toBe("file-rfp-1");
    expect(applied.searchParams.get("inputPackageArtifactId")).toBe("art-ip-1");
    expect(applied.searchParams.get("kind")).toBe("rfp_document_table");
  });

  it("Reset clears the filter inputs and reloads the unfiltered list endpoint", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-2" },
    });
    fireEvent.change(screen.getByTestId("filter-artifact-id"), {
      target: { value: "art-ip-9" },
    });
    fireEvent.change(screen.getByTestId("filter-kind"), {
      target: { value: "rfp_document_text_chunk" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-reset"));
    });

    expect(screen.getByTestId("filter-source-file-id")).toHaveValue("");
    expect(screen.getByTestId("filter-artifact-id")).toHaveValue("");
    expect(screen.getByTestId("filter-kind")).toHaveValue("all");

    const evidenceGets = calls.filter(
      (c) => c.method === "GET" && c.url.startsWith(LIST_URL)
    );
    expect(evidenceGets).toHaveLength(3);
    expect(evidenceGets[1].url).toContain("?");
    expect(evidenceGets[2].url).toBe(LIST_URL);
  });
});

describe("ProjectRfpEvidencePage - detail inspection", () => {
  it("Inspect on a text row GETs the detail endpoint and renders the persisted text body and metadata", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });

    const bodyEl = await screen.findByTestId("detail-text-body");
    expect(bodyEl).toHaveTextContent(TEXT_BODY_CANARY);
    expect(bodyEl).toHaveTextContent("The supplier shall provide a network design.");
    expect(screen.getByTestId("detail-meta")).toHaveTextContent("ev-text-1");
    expect(screen.getByTestId("detail-meta")).toHaveTextContent("file-rfp-1");
    const meta = screen.getByTestId("detail-text");
    expect(meta).toHaveTextContent("rfp-main.pdf");
    expect(meta).toHaveTextContent("rfp_main_document");
    expect(meta).toHaveTextContent("chunk 1/4");
    expect(meta).toHaveTextContent("art-ip-1");

    const detailCall = calls.find((c) => c.url === `${LIST_URL}/ev-text-1`);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
  });

  it("Inspect on a table row GETs the detail endpoint and renders the table rows and cells", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-table-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-table-1"));
    });

    await screen.findByTestId("detail-table");
    const rows = screen.getAllByTestId("detail-table-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Item");
    expect(rows[0]).toHaveTextContent("Qty");
    expect(rows[1]).toHaveTextContent(TABLE_CELL_CANARY);
    expect(rows[1]).toHaveTextContent("4");
    expect(screen.getByTestId("detail-table")).toHaveTextContent("tbl-1");
    expect(screen.getByTestId("detail-table")).toHaveTextContent("2 rows x 2 cols");

    const detailCall = calls.find((c) => c.url === `${LIST_URL}/ev-table-1`);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
  });

  it("shows a detail loading state while the detail GET is pending", async () => {
    let resolveDetail: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === `${LIST_URL}/ev-text-1`) {
          return new Promise<Response>((r) => { resolveDetail = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");
    fireEvent.click(screen.getByTestId("inspect-ev-text-1"));

    expect(await screen.findByTestId("detail-loading")).toBeInTheDocument();
    await act(async () => {
      resolveDetail(jsonResponse(textDetailResponse()));
    });
    expect(await screen.findByTestId("detail-text-body")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-loading")).toBeNull();
  });

  it('renders exactly "Unable to load evidence detail." when the detail GET fails, keeping the list', async () => {
    stubFetch((url) => {
      if (url === `${LIST_URL}/ev-text-1`) {
        return jsonResponse({ code: "rfp_evidence_not_found" }, 404);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("inspect-ev-text-1");

    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });

    const err = await screen.findByTestId("detail-error");
    expect(err.textContent).toBe("Unable to load evidence detail.");
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    expect(screen.getByTestId("project-name")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(TEXT_BODY_CANARY);
  });
});

describe("ProjectRfpEvidencePage - requirements baseline list", () => {
  it("GETs the baseline list on mount and renders the count and a lean artifact row", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);

    const row = await screen.findByTestId("baseline-row");
    expect(screen.getByTestId("baseline-count")).toHaveTextContent("Baseline artifacts: 1");
    expect(row).toHaveTextContent(BASELINE_ARTIFACT_ID);
    expect(row).toHaveTextContent("version 1");
    expect(row).toHaveTextContent("draft");
    expect(row).toHaveTextContent("created 2026-06-04T09:00:00.000Z");
    expect(row).toHaveTextContent("updated 2026-06-04T09:05:00.000Z");
    expect(row).toHaveTextContent("requirements: 2");
    expect(row).toHaveTextContent("evidence refs: 3");
    expect(row).toHaveTextContent("RFP-REQ-001, RFP-REQ-002");
    expect(row).toHaveTextContent("source artifacts: art-ip-1");
    expect(row).toHaveTextContent("source files: file-rfp-1, file-rfp-2");

    const baselineGets = calls.filter((c) => c.url === BASELINE_LIST_URL);
    expect(baselineGets).toHaveLength(1);
    expect(baselineGets[0].method).toBe("GET");
    expect(baselineGets[0].body).toBeNull();

    // The list never renders requirement text, even when smuggled in.
    expect(document.body.textContent ?? "").not.toContain(LIST_REQUIREMENT_TEXT_CANARY);
  });

  it('renders exactly "No requirements baseline artifacts yet." when the baseline list is empty', async () => {
    stubFetch((url) => {
      if (url === BASELINE_LIST_URL) {
        return jsonResponse({ project: projectContext(), artifactCount: 0, artifacts: [] });
      }
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const empty = await screen.findByTestId("baseline-empty");
    expect(empty.textContent).toBe("No requirements baseline artifacts yet.");
    expect(screen.getByTestId("baseline-count")).toHaveTextContent("Baseline artifacts: 0");
    expect(screen.queryByTestId("baseline-row")).toBeNull();
    expect(screen.queryByTestId("baseline-error")).toBeNull();
  });

  it('renders exactly "Unable to load requirements baseline." when the baseline list GET fails, keeping evidence', async () => {
    stubFetch((url) => {
      if (url === BASELINE_LIST_URL) {
        return jsonResponse({ code: "rfp_requirements_baseline_inspection_failed" }, 500);
      }
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });
    render(<ProjectRfpEvidencePage />);

    const err = await screen.findByTestId("baseline-error");
    expect(err.textContent).toBe("Unable to load requirements baseline.");
    expect(screen.queryByTestId("baseline-row")).toBeNull();
    expect(screen.queryByTestId("baseline-count")).toBeNull();
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
  });
});

describe("ProjectRfpEvidencePage - requirements baseline detail", () => {
  it("Inspect GETs the exact artifact detail endpoint and renders requirement text plus locator-only references", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });

    await screen.findByTestId("baseline-detail-panel");
    const meta = screen.getByTestId("baseline-detail-meta");
    expect(meta).toHaveTextContent(BASELINE_ARTIFACT_ID);
    expect(meta).toHaveTextContent("version 1");
    expect(meta).toHaveTextContent("draft");
    expect(meta).toHaveTextContent("created by user-1");
    expect(meta).toHaveTextContent("requirements: 2");
    expect(meta).toHaveTextContent("evidence refs: 3");

    const reqs = screen.getAllByTestId("baseline-detail-requirement");
    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toHaveTextContent("RFP-REQ-001");
    expect(reqs[0]).toHaveTextContent("technical");
    expect(reqs[0]).toHaveTextContent("mandatory");
    expect(reqs[0]).toHaveTextContent("Core redundancy");
    expect(reqs[0]).toHaveTextContent("Notes: From section 3.1.");
    expect(reqs[1]).toHaveTextContent("RFP-REQ-002");
    expect(reqs[1]).toHaveTextContent("optional");

    const texts = screen.getAllByTestId("baseline-detail-requirement-text");
    expect(texts).toHaveLength(2);
    expect(texts[0]).toHaveTextContent(
      "The supplier shall provide redundant core switching."
    );
    expect(texts[1]).toHaveTextContent(
      "The solution shall include redundant uplinks per access switch."
    );

    const refs = screen.getAllByTestId("baseline-detail-reference");
    expect(refs).toHaveLength(3);
    expect(refs[0]).toHaveTextContent("ev-text-1");
    expect(refs[0]).toHaveTextContent("text");
    expect(refs[0]).toHaveTextContent("chunk 1/4");
    expect(refs[0]).toHaveTextContent("1810 chars");
    expect(refs[0]).toHaveTextContent("file file-rfp-1");
    expect(refs[0]).toHaveTextContent("package art-ip-1");
    expect(refs[1]).toHaveTextContent("ev-table-1");
    expect(refs[1]).toHaveTextContent("table tbl-1");
    expect(refs[1]).toHaveTextContent("sheet Scope");
    expect(refs[1]).toHaveTextContent("12 rows x 5 cols");
    expect(refs[2]).toHaveTextContent("chunk 3/4");
    expect(refs[2]).toHaveTextContent("950 chars");

    // Locator-only: raw evidence content, storage/tenant fields, and
    // arbitrary smuggled keys never reach the DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(RAW_EVIDENCE_TEXT_CANARY);
    expect(body).not.toContain(RAW_TABLE_ROW_CANARY);
    expect(body).not.toContain(STORAGE_PATH_CANARY);
    expect(body).not.toContain(TENANT_ID_CANARY);
    expect(body).not.toContain(SMUGGLED_KEY_CANARY);
    expect(body).not.toContain(LIST_REQUIREMENT_TEXT_CANARY);

    const detailCall = calls.find((c) => c.url === BASELINE_DETAIL_URL);
    expect(detailCall).toBeTruthy();
    expect(detailCall!.method).toBe("GET");
    expect(detailCall!.body).toBeNull();
  });

  it("shows a baseline detail loading state while the detail GET is pending", async () => {
    let resolveDetail: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === BASELINE_DETAIL_URL) {
          return new Promise<Response>((r) => { resolveDetail = r; });
        }
        if (url === BASELINE_LIST_URL) {
          return Promise.resolve(jsonResponse(baselineListResponse()));
        }
        return Promise.resolve(jsonResponse(listResponse()));
      })
    );

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);
    fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));

    expect(await screen.findByTestId("baseline-detail-loading")).toBeInTheDocument();
    await act(async () => {
      resolveDetail(jsonResponse(baselineDetailResponse()));
    });
    expect(await screen.findByTestId("baseline-detail-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-detail-loading")).toBeNull();
  });

  it('renders exactly "Unable to load requirements baseline detail." when the detail GET fails, keeping list and evidence', async () => {
    stubFetch((url) => {
      if (url === BASELINE_DETAIL_URL) {
        return jsonResponse({ code: "requirements_baseline_artifact_not_found" }, 404);
      }
      if (url === BASELINE_LIST_URL) return jsonResponse(baselineListResponse());
      if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
      return jsonResponse({}, 404);
    });

    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`);

    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });

    const err = await screen.findByTestId("baseline-detail-error");
    expect(err.textContent).toBe("Unable to load requirements baseline detail.");
    expect(screen.queryByTestId("baseline-detail-panel")).toBeNull();
    expect(screen.getAllByTestId("baseline-row")).toHaveLength(1);
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    expect(screen.getByTestId("project-name")).toBeInTheDocument();
  });
});

describe("ProjectRfpEvidencePage - read-only fetch boundary", () => {
  it("issues only default-GET fetches to the four inspection endpoints and never calls write or other RFP endpoints", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");
    await screen.findByTestId("baseline-row");

    fireEvent.change(screen.getByTestId("filter-source-file-id"), {
      target: { value: "file-rfp-1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("filter-apply"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-text-1"));
    });
    await screen.findByTestId("detail-text-body");
    await act(async () => {
      fireEvent.click(screen.getByTestId("inspect-ev-table-1"));
    });
    await screen.findByTestId("detail-table");
    await act(async () => {
      fireEvent.click(screen.getByTestId(`baseline-inspect-${BASELINE_ARTIFACT_ID}`));
    });
    await screen.findByTestId("baseline-detail-panel");

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(6));
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.body).toBeNull();
      expect(call.url).not.toMatch(/\/review/);
      expect(call.url).not.toMatch(/upload/);
      expect(call.url).not.toMatch(/input-package/);
      expect(call.url).not.toMatch(/\/approvals/);
      expect(call.url).not.toMatch(/\/extract/);
      expect(call.url).not.toMatch(/\/files/);
    }
    // Every call targets the evidence or baseline inspection surface only.
    const allowedExact = new Set([
      LIST_URL,
      `${LIST_URL}/ev-text-1`,
      `${LIST_URL}/ev-table-1`,
      BASELINE_LIST_URL,
      BASELINE_DETAIL_URL,
    ]);
    for (const call of calls) {
      const ok = allowedExact.has(call.url) || call.url.startsWith(`${LIST_URL}?`);
      expect(ok, `unexpected fetch url: ${call.url}`).toBe(true);
    }
  });
});

describe("ProjectRfpEvidencePage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is a client component that reads the id from next/navigation and calls the inspection APIs", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("useParams");
    expect(source).toContain("/rfp/evidence");
    expect(source).toContain("/rfp/requirements-baseline");
    expect(source).toContain("/rfp/artifacts/");
  });

  it("imports only react, next/navigation, and the two type-only inspection read models", () => {
    const statements = source.match(/^import[^;]+;/gm) ?? [];
    expect(statements.length).toBeGreaterThanOrEqual(4);
    const allowed = new Set([
      "react",
      "next/navigation",
      "@/lib/projects/project-rfp-evidence-inspection",
      "@/lib/projects/project-rfp-requirements-baseline-inspection",
    ]);
    for (const statement of statements) {
      const m = statement.match(/from\s+"([^"]+)"/);
      expect(m, `import without a module source: ${statement}`).not.toBeNull();
      const spec = m![1];
      expect(allowed.has(spec), `unexpected import source: ${spec}`).toBe(true);
      if (spec.startsWith("@/lib/projects/")) {
        expect(statement.startsWith("import type")).toBe(true);
      }
    }
    expect(source).not.toContain("import(");
    expect(source).not.toContain("require(");
  });

  it("contains no db/store/route/write/persistence/run/AI/authority tokens and no mutation methods", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/app/api',
      'from "@/lib/middleware',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      '"use server"',
      "project-rfp-evidence-persistence",
      "project-rfp-evidence-run",
      "project-rfp-input-package",
      "input-package",
      "/approvals",
      "/review",
      "/files",
      "/upload",
      "/download",
      "method:",
      '"POST"',
      '"PUT"',
      '"PATCH"',
      '"DELETE"',
      "FormData",
      "storagePath",
      "node:fs",
      "drizzle",
      "pricing",
      "priced",
      "catalog",
      "configuration-expansion",
      "config-expansion",
      "sku-resolution",
      "export-package",
      "@anthropic-ai",
      "anthropic",
      "openai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the page and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
