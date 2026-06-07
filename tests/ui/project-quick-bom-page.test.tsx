import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

import ProjectQuickBomPage from "@/app/projects/[id]/quick-bom/page";

// The page reads the id from the route. Only useParams is consumed.
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-1" }),
}));

const PROJECT_ID = "proj-1";
const TENANT = "11111111-1111-1111-1111-111111111111";
// Proves the page ignores artifact payloads: it must never reach the DOM.
const PAYLOAD_CANARY = "PAYLOAD-LEAK-CANARY";

// Fresh copy per call so a mutated fixture in one test cannot leak into another.
function baseWorkspace(): Record<string, unknown> {
  return {
    project: {
      id: PROJECT_ID,
      tenantId: TENANT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      pricingConfig: {
        currency: "SAR",
        mode: "margin",
        ratePercent: 30,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-02T11:30:00.000Z",
    },
    stages: [
      {
        id: "stg-1",
        stageId: "boq_format_validation",
        order: 2,
        status: "approved",
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:05:00.000Z",
      },
      {
        id: "stg-2",
        stageId: "sku_resolution",
        order: 3,
        status: "needs_review",
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:05:00.000Z",
      },
    ],
    artifacts: [],
    spineArtifacts: {
      normalized_boq: {
        id: "art-norm",
        stageId: "boq_format_validation",
        type: "normalized_boq",
        status: "approved",
        version: 1,
        sourceFileIds: [],
        sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:05:00.000Z",
      },
      sku_resolution: {
        id: "art-sku",
        stageId: "sku_resolution",
        type: "sku_resolution",
        status: "needs_review",
        version: 1,
        sourceFileIds: [],
        sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:05:00.000Z",
        // Never exposed by the read model; planted here to prove the page drops it.
        payload: { secret: PAYLOAD_CANARY },
      },
      configuration_expansion: {
        id: "art-cfg",
        stageId: "configuration_expansion_review",
        type: "configuration_expansion",
        status: "generated",
        version: 1,
        sourceFileIds: [],
        sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:05:00.000Z",
      },
      priced_boq: null,
      export_package: null,
    },
    approvals: [
      {
        id: "appr-1",
        stageId: "boq_format_validation",
        artifactId: "art-norm",
        artifactVersion: 1,
        decision: "approved",
        decidedBy: "u-engineer",
        decidedAt: "2026-06-02T09:00:00.000Z",
        note: "baseline ok",
      },
    ],
    readiness: {
      projectId: PROJECT_ID,
      messages: [
        "Next step sku_resolution: SKU resolution is present and awaiting approval.",
      ],
      steps: [
        { stepId: "normalized_boq", status: "approved", message: "Normalized BoQ is approved." },
        {
          stepId: "sku_resolution",
          status: "needs_review",
          message: "SKU resolution is present and awaiting approval.",
        },
        {
          stepId: "configuration_expansion",
          status: "blocked",
          message: "Configuration expansion is blocked until SKU resolution is approved.",
        },
        {
          stepId: "priced_boq",
          status: "blocked",
          message: "Priced BoQ is blocked until Configuration expansion is approved.",
        },
        {
          stepId: "export_package",
          status: "blocked",
          message: "Export package is blocked until Priced BoQ is approved.",
        },
      ],
    },
  };
}

/** Minimal spine artifact summary (read model shape: no payload). */
function artifact(
  id: string,
  type: string,
  status: string,
  stageId: string
): Record<string, unknown> {
  return {
    id,
    stageId,
    type,
    status,
    version: 1,
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:05:00.000Z",
  };
}

function spineOf(ws: Record<string, unknown>): Record<string, Record<string, unknown> | null> {
  return ws.spineArtifacts as Record<string, Record<string, unknown> | null>;
}

function readinessOf(ws: Record<string, unknown>): Record<string, unknown> {
  return ws.readiness as Record<string, unknown>;
}

// Every spine source approved + every readiness create-gate open: all four create
// buttons and the download link render, with stable ids for exact-URL assertions.
function fullWorkspace(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  (sa.sku_resolution as Record<string, unknown>).status = "approved";
  (sa.configuration_expansion as Record<string, unknown>).status = "approved";
  sa.priced_boq = artifact("art-priced", "priced_boq", "approved", "boq_pricing_review");
  sa.export_package = artifact("art-export", "export_package", "approved", "export_approval");
  Object.assign(readinessOf(ws), {
    canCreateSkuResolution: true,
    canCreateConfigurationExpansion: true,
    canCreatePricedBoq: true,
    canCreateExportPackage: true,
  });
  return ws;
}

// priced_boq is reviewable (needs_review); its source chain is approved.
function reviewablePriced(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  (sa.sku_resolution as Record<string, unknown>).status = "approved";
  (sa.configuration_expansion as Record<string, unknown>).status = "approved";
  sa.priced_boq = artifact("art-priced", "priced_boq", "needs_review", "boq_pricing_review");
  return ws;
}

// export_package is reviewable (needs_review); its source chain is approved.
function reviewableExport(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  (sa.sku_resolution as Record<string, unknown>).status = "approved";
  (sa.configuration_expansion as Record<string, unknown>).status = "approved";
  sa.priced_boq = artifact("art-priced", "priced_boq", "approved", "boq_pricing_review");
  sa.export_package = artifact("art-export", "export_package", "needs_review", "export_approval");
  return ws;
}

function okApproval(workspaceResult: unknown): Record<string, unknown> {
  return {
    approval: { id: "appr-2" },
    artifactStatus: "approved",
    stageStatus: "approved",
    workspace: workspaceResult,
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

// Stub fetch with a handler and capture every call for body/url assertions. JSON
// string bodies are parsed; non-string bodies (FormData uploads) are kept as-is.
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

// Default: GET returns the base workspace; POST echoes an ok refreshed workspace.
function stubDefault(): Recorded[] {
  return stubFetch((url, init) => {
    if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
      return jsonResponse(okApproval({ status: "ok", workspace: baseWorkspace() }));
    }
    if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
    return jsonResponse({}, 404);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectQuickBomPage - load and render", () => {
  beforeEach(() => {
    stubDefault();
  });

  it("fetches GET /api/projects/proj-1/quick-bom and renders the project summary", async () => {
    const calls = stubDefault();
    render(<ProjectQuickBomPage />);

    expect(await screen.findByTestId("project-name")).toHaveTextContent("Honeywell Quick BoM");
    expect(screen.getByTestId("customer-name")).toHaveTextContent("Honeywell");
    expect(screen.getByTestId("project-id")).toHaveTextContent(PROJECT_ID);
    expect(screen.getByTestId("project-tenant")).toHaveTextContent(TENANT);
    expect(screen.getByTestId("project-mode")).toHaveTextContent("quick bom");
    expect(screen.getByTestId("pricing-config")).toHaveTextContent("SAR");
    expect(screen.getByTestId("pricing-config")).toHaveTextContent("margin");

    const got = calls.find((c) => c.method === "GET");
    expect(got).toBeTruthy();
    expect(got!.url).toMatch(/\/api\/projects\/proj-1\/quick-bom$/);
  });

  it("renders a loading skeleton while the GET is pending", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => { resolve = r; }))
    );
    const { container } = render(<ProjectQuickBomPage />);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    resolve(jsonResponse({ workspace: baseWorkspace() }));
    await screen.findByTestId("project-name");
  });

  it("renders the readiness headline and all five steps in workflow order", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getByTestId("readiness-messages")).toHaveTextContent(
      "SKU resolution is present and awaiting approval."
    );

    const steps = screen.getAllByTestId("readiness-step");
    expect(steps).toHaveLength(5);
    const order = [
      "normalized boq",
      "sku resolution",
      "configuration expansion",
      "priced boq",
      "export package",
    ];
    steps.forEach((el, i) => expect(el).toHaveTextContent(order[i]));
  });

  it("renders stages, spine artifacts, and approvals with no artifact payload", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getAllByTestId("stage-row").length).toBeGreaterThan(0);
    expect(screen.getByTestId("spine-normalized_boq")).toBeInTheDocument();
    expect(screen.getByTestId("spine-sku_resolution")).toBeInTheDocument();
    expect(screen.getByTestId("spine-priced_boq")).toHaveTextContent("not created");
    expect(screen.getAllByTestId("approval-row").length).toBeGreaterThan(0);

    expect(screen.queryByText(/PAYLOAD-LEAK-CANARY/)).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(PAYLOAD_CANARY);
  });
});

describe("ProjectQuickBomPage - review gating", () => {
  beforeEach(() => {
    stubDefault();
  });

  it("never shows approve or reject buttons for normalized_boq", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.queryByTestId("approve-normalized_boq")).toBeNull();
    expect(screen.queryByTestId("reject-normalized_boq")).toBeNull();
  });

  it("shows a line-level review notice and no generic buttons for sku_resolution", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.getByTestId("line-review-required-sku_resolution")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("reject-sku_resolution")).toBeNull();
  });

  it("shows a line-level review notice and no generic buttons for configuration_expansion", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.getByTestId("line-review-required-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("reject-configuration_expansion")).toBeNull();
  });
});

describe("ProjectQuickBomPage - priced_boq review (specific priced-boq route)", () => {
  it("approve posts decision approved to the priced-boq review route (id in URL, not body)", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/artifacts/art-priced/priced-boq/review") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: reviewablePriced() }));
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-priced_boq");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post!.url).toMatch(
      /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-priced\/priced-boq\/review$/
    );
    expect(post!.body).toEqual({ decision: "approved" });
  });

  it("reject prompts for a note and posts decision rejected with the note (no artifactId in body)", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Bad totals");
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/priced-boq/review") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: reviewablePriced() }));
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("reject-priced_boq");

    await act(async () => {
      fireEvent.click(screen.getByTestId("reject-priced_boq"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    expect(window.prompt).toHaveBeenCalledTimes(1);
    const post = calls.find((c) => c.method === "POST");
    expect(post!.body).toEqual({ decision: "rejected", note: "Bad totals" });
  });

  it("refreshes the workspace from the ok response after a priced_boq approval", async () => {
    const refreshed = reviewablePriced();
    (spineOf(refreshed).priced_boq as Record<string, unknown>).status = "approved";
    (refreshed.project as Record<string, unknown>).name = "PRICED REFRESHED";

    stubFetch((url, init) => {
      if (url.endsWith("/priced-boq/review") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: refreshed }));
      }
      return jsonResponse({ workspace: reviewablePriced() });
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-priced_boq");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-priced_boq"));
    });

    expect(await screen.findByText("PRICED REFRESHED")).toBeInTheDocument();
    // priced_boq is now approved, so its reviewable buttons are gone.
    expect(screen.queryByTestId("approve-priced_boq")).toBeNull();
  });
});

describe("ProjectQuickBomPage - export_package review (generic approvals route)", () => {
  it("approve posts artifactId and decision to the generic approvals route", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: reviewableExport() }));
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewableExport() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-export_package");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post!.url).toMatch(/\/api\/projects\/proj-1\/quick-bom\/approvals$/);
    expect(post!.body).toEqual({ artifactId: "art-export", decision: "approved" });
  });

  it("reject omits the note when the prompt is blank but still posts artifactId and decision", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("   ");
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: reviewableExport() }));
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewableExport() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("reject-export_package");

    await act(async () => {
      fireEvent.click(screen.getByTestId("reject-export_package"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post!.body).toEqual({ artifactId: "art-export", decision: "rejected" });
  });

  it("reloads the GET workspace when the approval response has no ok workspace", async () => {
    const reloaded = reviewableExport();
    (reloaded.project as Record<string, unknown>).name = "EXPORT RELOADED";
    let getCount = 0;

    stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "wrong_mode" }));
      }
      getCount += 1;
      return jsonResponse({ workspace: getCount === 1 ? reviewableExport() : reloaded });
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-export_package");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });

    expect(await screen.findByText("EXPORT RELOADED")).toBeInTheDocument();
  });
});

describe("ProjectQuickBomPage - upload and normalize", () => {
  it("uploads the selected file, normalizes the returned file id, then reloads", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/files") && init?.method === "POST") {
        return jsonResponse({ file: { id: "file-9" } }, 201);
      }
      if (url.endsWith("/files/file-9/normalize") && init?.method === "POST") {
        return jsonResponse({ artifact: { id: "art-x" } }, 201);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("workflow-upload-file");

    const file = new File(["sku,qty\nABC,1"], "boq.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("workflow-upload-file"), {
        target: { files: [file] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-upload-normalize"));
    });

    await waitFor(() =>
      expect(
        calls.some((c) => /\/files\/file-9\/normalize$/.test(c.url) && c.method === "POST")
      ).toBe(true)
    );

    const uploadIdx = calls.findIndex(
      (c) => /\/quick-bom\/files$/.test(c.url) && c.method === "POST"
    );
    const normIdx = calls.findIndex(
      (c) => /\/files\/file-9\/normalize$/.test(c.url) && c.method === "POST"
    );
    expect(uploadIdx).toBeGreaterThanOrEqual(0);
    expect(normIdx).toBeGreaterThan(uploadIdx);

    // The upload POST sends exactly one "file" FormData field; normalize sends none.
    expect(calls[uploadIdx].body).toBeInstanceOf(FormData);
    expect((calls[uploadIdx].body as FormData).getAll("file")).toHaveLength(1);
    expect(calls[normIdx].body).toBeNull();

    // Reloaded the workspace after a successful normalization.
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2)
    );
  });

  it("shows a workflow error and makes no POST when normalize is clicked with no file", async () => {
    const calls = stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("workflow-upload-normalize");

    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-upload-normalize"));
    });

    expect(await screen.findByTestId("workflow-error")).toHaveTextContent(
      "Select a BoQ file to upload first."
    );
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("ProjectQuickBomPage - create actions", () => {
  const cases = [
    { testid: "workflow-create-sku_resolution", sourceId: "art-norm", segment: "sku-resolution" },
    {
      testid: "workflow-create-configuration_expansion",
      sourceId: "art-sku",
      segment: "configuration-expansion",
    },
    { testid: "workflow-create-priced_boq", sourceId: "art-cfg", segment: "priced-boq" },
    { testid: "workflow-create-export_package", sourceId: "art-priced", segment: "export-package" },
  ];

  for (const c of cases) {
    it(`${c.testid} posts no body to the ${c.segment} route and reloads`, async () => {
      const path = `/artifacts/${c.sourceId}/${c.segment}`;
      const calls = stubFetch((url, init) => {
        if (url.endsWith(path) && init?.method === "POST") {
          return jsonResponse({ artifact: { id: "new-art" } }, 201);
        }
        if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: fullWorkspace() });
        return jsonResponse({}, 404);
      });

      render(<ProjectQuickBomPage />);
      await screen.findByTestId(c.testid);

      await act(async () => {
        fireEvent.click(screen.getByTestId(c.testid));
      });
      await waitFor(() => expect(calls.some((x) => x.method === "POST")).toBe(true));

      const post = calls.find((x) => x.method === "POST");
      expect(post!.method).toBe("POST");
      expect(post!.url.endsWith(`/api/projects/proj-1/quick-bom${path}`)).toBe(true);
      expect(post!.body).toBeNull();

      await waitFor(() =>
        expect(calls.filter((x) => x.method === "GET").length).toBeGreaterThanOrEqual(2)
      );
    });
  }

  it("shows the controlled workflow error from a non-ok create response", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/artifacts/art-norm/sku-resolution") && init?.method === "POST") {
        return jsonResponse(
          {
            code: "normalized_boq_artifact_not_ready",
            error: "Normalized BoQ artifact is not ready for SKU resolution.",
          },
          409
        );
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: fullWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("workflow-create-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-create-sku_resolution"));
    });

    const err = await screen.findByTestId("workflow-error");
    expect(err).toHaveTextContent("Normalized BoQ artifact is not ready for SKU resolution.");
  });

  it("shows a generic workflow error and no stack when a create action throws", async () => {
    const secret = "create-boom-stack-detail";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/artifacts/art-norm/sku-resolution") && init?.method === "POST") {
          return Promise.reject(new Error(secret));
        }
        return Promise.resolve(jsonResponse({ workspace: fullWorkspace() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("workflow-create-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("workflow-create-sku_resolution"));
    });

    const err = await screen.findByTestId("workflow-error");
    expect(err).toHaveTextContent("Unable to complete this workflow action.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });
});

describe("ProjectQuickBomPage - export package download", () => {
  it("renders the download link only for an approved export_package, with the exact href", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: fullWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    const link = await screen.findByTestId("download-export_package");
    expect(link).toHaveAttribute(
      "href",
      "/api/projects/proj-1/quick-bom/artifacts/art-export/export-package/download"
    );
  });

  it("does not render the download link when export_package is not approved", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewableExport() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.queryByTestId("download-export_package")).toBeNull();
  });
});

describe("ProjectQuickBomPage - load failures (distinct, no stack)", () => {
  const cases = [
    {
      name: "not_found",
      status: 404,
      body: { code: "project_not_found", error: "Project not found." },
      expected: "Project not found.",
    },
    {
      name: "wrong_mode",
      status: 409,
      body: {
        code: "wrong_project_mode",
        error: "Project is not a Quick BoM project.",
        project: { id: PROJECT_ID, mode: "rfp" },
      },
      expected: "Project is not a Quick BoM project.",
    },
    {
      name: "non-ok without a body message",
      status: 500,
      body: {},
      expected: "Unable to load this Quick BoM workspace.",
    },
  ];

  for (const c of cases) {
    it(`shows a load error for ${c.name} and does not render the workspace`, async () => {
      stubFetch(() => jsonResponse(c.body, c.status));
      render(<ProjectQuickBomPage />);

      const err = await screen.findByTestId("load-error");
      expect(err).toHaveTextContent(c.expected);
      expect(screen.queryByTestId("project-name")).toBeNull();
    });
  }

  it("shows a generic load error and no stack when the GET throws", async () => {
    const secret = "boom-internal-stack-detail";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error(secret))));
    render(<ProjectQuickBomPage />);

    const err = await screen.findByTestId("load-error");
    expect(err).toHaveTextContent("Unable to load this Quick BoM workspace.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });
});

describe("ProjectQuickBomPage - review failures (distinct, no stack)", () => {
  it("shows the approval error from a non-ok approval response and keeps the workspace", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(
          { code: "artifact_not_reviewable", error: "Artifact is not reviewable." },
          409
        );
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewableExport() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-export_package");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });

    const err = await screen.findByTestId("approval-error");
    expect(err).toHaveTextContent("Artifact is not reviewable.");
    expect(screen.getByTestId("project-name")).toBeInTheDocument();
  });

  it("shows a generic approval error and no stack when the approval POST throws", async () => {
    const secret = "post-boom-stack-detail";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
          return Promise.reject(new Error(secret));
        }
        return Promise.resolve(jsonResponse({ workspace: reviewableExport() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-export_package");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-export_package"));
    });

    const err = await screen.findByTestId("approval-error");
    expect(err).toHaveTextContent("Unable to record this approval decision.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });
});

describe("ProjectQuickBomPage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/[id]/quick-bom/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-quick-bom-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not import DB, mutations, pricing, export, Mantle, config-expansion, runner, AI, catalog, engine, coordinator, or adapter modules, or declare a server action", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      '"use server"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("issues only POST writes (no PATCH/PUT/DELETE) to the Quick BoM workflow routes", () => {
    expect(source).toContain('method: "POST"');
    expect(source).not.toContain('method: "PATCH"');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain('method: "DELETE"');
    // The only Quick BoM routes the page may call (by URL or path segment).
    expect(source).toContain("/quick-bom/approvals");
    expect(source).toContain("/quick-bom/files");
    expect(source).toContain("/normalize");
    expect(source).toContain("/priced-boq/review");
    expect(source).toContain("/export-package/download");
    for (const segment of [
      "sku-resolution",
      "configuration-expansion",
      "priced-boq",
      "export-package",
    ]) {
      expect(source).toContain(`"${segment}"`);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
