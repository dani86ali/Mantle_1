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

// Persisted-content canaries. Both are smuggled into the lean list response
// (which the read model would never carry) AND returned by the detail stubs.
// They may reach the DOM only after an explicit Inspect click.
const TEXT_BODY_CANARY = "TEXT-BODY-CANARY";
const TABLE_CELL_CANARY = "TABLE-CELL-CANARY";

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

// Default: list (with or without query) and both detail endpoints succeed.
function stubDefault(): Recorded[] {
  return stubFetch((url) => {
    if (url === `${LIST_URL}/ev-text-1`) return jsonResponse(textDetailResponse());
    if (url === `${LIST_URL}/ev-table-1`) return jsonResponse(tableDetailResponse());
    if (url.startsWith(LIST_URL)) return jsonResponse(listResponse());
    return jsonResponse({}, 404);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectRfpEvidencePage - list load", () => {
  it("GETs /api/projects/proj-rfp-1/rfp/evidence on mount and renders context, counts, and lean rows", async () => {
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
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toBe(LIST_URL);
  });

  it("shows a list loading state while the list GET is pending", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => { resolve = r; }))
    );
    render(<ProjectRfpEvidencePage />);
    expect(screen.getByTestId("list-loading")).toBeInTheDocument();

    await act(async () => {
      resolve(jsonResponse(listResponse()));
    });
    expect(await screen.findByTestId("project-name")).toBeInTheDocument();
    expect(screen.queryByTestId("list-loading")).toBeNull();
  });

  it("never renders persisted text bodies or table cells in the list view (before Inspect)", async () => {
    stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

    expect(screen.getAllByTestId("evidence-row")).toHaveLength(2);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(TEXT_BODY_CANARY);
    expect(body).not.toContain(TABLE_CELL_CANARY);
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

    const gets = calls.filter((c) => c.method === "GET");
    expect(gets).toHaveLength(2);
    const applied = new URL(gets[1].url, "http://localhost");
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

    const gets = calls.filter((c) => c.method === "GET");
    expect(gets).toHaveLength(3);
    expect(gets[1].url).toContain("?");
    expect(gets[2].url).toBe(LIST_URL);
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

describe("ProjectRfpEvidencePage - read-only fetch boundary", () => {
  it("issues only default-GET fetches and never calls write, artifact, or other RFP endpoints", async () => {
    const calls = stubDefault();
    render(<ProjectRfpEvidencePage />);
    await screen.findByTestId("project-name");

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

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(4));
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(call.body).toBeNull();
      expect(call.url).not.toMatch(/input-package/);
      expect(call.url).not.toMatch(/\/approvals/);
      expect(call.url).not.toMatch(/upload/);
      expect(call.url).not.toMatch(/\/artifacts\//);
      expect(call.url).not.toMatch(/\/files/);
      expect(call.url).not.toMatch(/\/extract/);
    }
    // Every call targets the inspection list/detail surface and nothing else.
    for (const call of calls) {
      expect(call.url.startsWith(LIST_URL)).toBe(true);
    }
  });
});

describe("ProjectRfpEvidencePage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/rfp/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("is a client component that reads the id from next/navigation and calls the evidence APIs", () => {
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("useParams");
    expect(source).toContain("/rfp/evidence");
  });

  it("imports only react, next/navigation, and the type-only inspection read model", () => {
    const statements = source.match(/^import[^;]+;/gm) ?? [];
    expect(statements.length).toBeGreaterThanOrEqual(3);
    const allowed = new Set([
      "react",
      "next/navigation",
      "@/lib/projects/project-rfp-evidence-inspection",
    ]);
    for (const statement of statements) {
      const m = statement.match(/from\s+"([^"]+)"/);
      expect(m, `import without a module source: ${statement}`).not.toBeNull();
      const spec = m![1];
      expect(allowed.has(spec), `unexpected import source: ${spec}`).toBe(true);
      if (spec === "@/lib/projects/project-rfp-evidence-inspection") {
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
      "/artifacts/",
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
