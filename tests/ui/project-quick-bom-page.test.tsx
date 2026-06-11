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
  within,
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

  it("shows a derived (non-stale) stage status when the raw boq_format_validation row lags the normalized_boq artifact (QBM-LOG-002)", async () => {
    // Raw stage row is stale at not_started, but the normalized_boq artifact is
    // present (generated, non-stale) and the readiness step reports `available`.
    const ws = baseWorkspace();
    (ws.stages as Record<string, unknown>[])[0].status = "not_started";
    (spineOf(ws).normalized_boq as Record<string, unknown>).status = "generated";
    const steps = readinessOf(ws).steps as Record<string, unknown>[];
    steps[0].status = "available";

    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    const stageRow = screen
      .getAllByTestId("stage-row")
      .find((el) => /boq format validation/.test(el.textContent ?? ""));
    expect(stageRow).toBeTruthy();
    expect(stageRow!).toHaveTextContent("available");
    expect(stageRow!).not.toHaveTextContent("not started");

    // The artifact panel still reflects the actual artifact status.
    expect(screen.getByTestId("spine-normalized_boq")).toHaveTextContent("generated");
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

  it("shows generic approve/reject for a generated configuration_expansion (not a line-review notice)", async () => {
    // baseWorkspace has configuration_expansion.status = "generated": approved/rejected via generic route
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.getByTestId("approve-configuration_expansion")).toBeInTheDocument();
    expect(screen.getByTestId("reject-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("line-review-required-configuration_expansion")).toBeNull();
  });

  it("shows a line-level review notice and no generic buttons for a needs_review configuration_expansion draft", async () => {
    stubFetch((url) => {
      const ws = baseWorkspace();
      (spineOf(ws).configuration_expansion as Record<string, unknown>).status = "needs_review";
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.getByTestId("line-review-required-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("reject-configuration_expansion")).toBeNull();
  });

  it("shows generic approve/reject for a reviewed needs_review configuration_expansion", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithReviewedCfgNeedsApproval() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getByTestId("approve-configuration_expansion")).toBeInTheDocument();
    expect(screen.getByTestId("reject-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("line-review-required-configuration_expansion")).toBeNull();
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

// -- authority provenance fixtures --
const CONFIG_PROVENANCE = {
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "appr-cfg-1",
  rulePackId: "honeywell-scope-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  rulePackSourceScope: "honeywell_mvp_demo_only",
  dispositionSummary: {
    expandByApprovedRulePackCount: 12,
    preserveKnownRulePackChildCount: 4,
    preserveStandaloneCustomerLineCount: 2,
    deferUnknownRelationshipCount: 1,
  },
  runtimeAi: false,
  replacementAuthority: false,
  skuSubstitutionAuthority: false,
  unknownRelationshipsDeferred: true,
  attachesOpticsUnderSwitches: false,
};

const PRICING_PROVENANCE = {
  profileId: "honeywell-mvp-demo-pricing-authority-profile",
  scope: "honeywell_mvp_demo_only",
  approvalRecordId: "appr-pricing-1",
  activeSource: "committed_honeywell_demo_pricing_fixture",
  activeSourceFixtureId: "honeywell-mvp-demo-pricing-fixture",
  activeSourceStatus: "approved_demo_fixture",
  currency: "SAR",
  pricedSkuCount: 339,
  missingPriceSkuCount: 2,
  boundary: {
    deterministicPricingAuthority: true,
    demoFixtureAuthority: true,
    activeRuntimeSourceReadsExternalGplCsv: false,
    productionCiscoPricingAuthority: false,
    broadCiscoGeneralPricingAuthority: false,
    runtimeAiPricing: false,
    runtimeCatalogLookup: false,
    configurationAuthority: false,
    replacementAuthority: false,
    skuSubstitutionAuthority: false,
    silentSkuSubstitution: false,
    missingPricesReported: true,
  },
};

function workspaceWithConfigProvenance(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  (sa.configuration_expansion as Record<string, unknown>).authorityProvenance = {
    configurationAuthority: CONFIG_PROVENANCE,
  };
  return ws;
}

function workspaceWithPricedProvenance(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  (sa.sku_resolution as Record<string, unknown>).status = "approved";
  (sa.configuration_expansion as Record<string, unknown>).status = "approved";
  (sa.configuration_expansion as Record<string, unknown>).authorityProvenance = {
    configurationAuthority: CONFIG_PROVENANCE,
  };
  sa.priced_boq = {
    ...artifact("art-priced", "priced_boq", "needs_review", "boq_pricing_review"),
    authorityProvenance: {
      configurationAuthority: CONFIG_PROVENANCE,
      pricingAuthority: PRICING_PROVENANCE,
    },
  };
  return ws;
}

describe("ProjectQuickBomPage - authority provenance rendering", () => {
  it("renders configuration authority provenance for configuration_expansion when present", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom"))
        return jsonResponse({ workspace: workspaceWithConfigProvenance() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getByTestId("authority-provenance-configuration_expansion")).toBeInTheDocument();
    expect(screen.getByTestId("authority-config-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("authority-pricing-configuration_expansion")).toBeNull();

    const block = screen.getByTestId("authority-config-configuration_expansion");
    expect(block).toHaveTextContent("honeywell-scope-rules");
    expect(block).toHaveTextContent("1.0.0");
    expect(block).toHaveTextContent("approved");
    expect(block).toHaveTextContent("appr-cfg-1");
    expect(block).toHaveTextContent("12");
    expect(block).toHaveTextContent("deferred (unknown)");
    // boundary facts
    expect(block.textContent).toMatch(/Runtime AI:\s*off/);
    expect(block.textContent).toMatch(/Replacement:\s*off/);
    expect(block.textContent).toMatch(/Substitution:\s*off/);
    expect(block.textContent).toMatch(/Unknown deferred:\s*yes/);
    expect(block.textContent).toMatch(/Optics auto-attached:\s*no/);
  });

  it("renders both config and pricing authority provenance for priced_boq", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom"))
        return jsonResponse({ workspace: workspaceWithPricedProvenance() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getByTestId("authority-provenance-priced_boq")).toBeInTheDocument();
    expect(screen.getByTestId("authority-config-priced_boq")).toBeInTheDocument();
    expect(screen.getByTestId("authority-pricing-priced_boq")).toBeInTheDocument();

    const pricingBlock = screen.getByTestId("authority-pricing-priced_boq");
    expect(pricingBlock).toHaveTextContent("honeywell-mvp-demo-pricing-authority-profile");
    expect(pricingBlock).toHaveTextContent("honeywell-mvp-demo-pricing-fixture");
    expect(pricingBlock).toHaveTextContent("appr-pricing-1");
    expect(pricingBlock).toHaveTextContent("SAR");
    expect(pricingBlock).toHaveTextContent("339");
    expect(pricingBlock).toHaveTextContent("2");
    // boundary facts
    expect(pricingBlock.textContent).toMatch(/Deterministic fixture:\s*yes/);
    expect(pricingBlock.textContent).toMatch(/External GPL read:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Production authority:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Broad authority:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Runtime AI:\s*off/);
    expect(pricingBlock.textContent).toMatch(/Runtime catalog:\s*off/);
    expect(pricingBlock.textContent).toMatch(/Config authority:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Replacement:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Substitution:\s*no/);
    expect(pricingBlock.textContent).toMatch(/Missing reported:\s*yes/);
  });

  it("does not render a provenance block for artifacts without authorityProvenance", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.queryByTestId("authority-provenance-normalized_boq")).toBeNull();
    expect(screen.queryByTestId("authority-provenance-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("authority-provenance-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("authority-provenance-priced_boq")).toBeNull();
    expect(screen.queryByTestId("authority-provenance-export_package")).toBeNull();
  });

  it("does not render forbidden payload fields in the document", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom"))
        return jsonResponse({ workspace: workspaceWithPricedProvenance() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    const body = document.body.textContent ?? "";
    for (const forbidden of [
      "activeSourceWorkbookPath",
      "activeSourceSheetName",
      "Estimate_NB167337237YA.xlsx",
      "acceptedLines",
      "rejectedLines",
      "evidence",
      "originalCells",
      "amounts",
      "unitListPriceSarBySku",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

});

// -- SKU line-review fixtures --
const SKU_REVIEW_CANARY = "SKU-REVIEW-PAYLOAD-CANARY";
const SKU_ARTIFACT_ID = "art-sku"; // matches baseWorkspace spineArtifacts.sku_resolution.id
const SKU_REVIEW_ROUTE_RE =
  /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-sku\/sku-resolution\/review$/;

function skuReviewOkResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review: {
      project: {
        id: PROJECT_ID, tenantId: TENANT, name: "Honeywell Quick BoM", mode: "quick_bom",
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
      },
      artifact: {
        id: SKU_ARTIFACT_ID, projectId: PROJECT_ID, stageId: "sku_resolution",
        type: "sku_resolution", status: "needs_review", version: 2,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      payloadSummary: {
        sourceNormalizedBoqArtifactId: "art-nb-1", sourceNormalizedBoqArtifactVersion: 1,
        sourceFileIds: [], lineCount: 2, summary: {},
      },
      reviewSummary: { totalLineCount: 2, needsReviewCount: 1, acceptedCount: 1, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "WS-C3650-48FD-E", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300-48P-A", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "OLD-SKU", status: "accepted", acceptedSku: "C9300-24P-A",
          decidedBy: SKU_REVIEW_CANARY,
          suggestions: [],
        },
      ],
      ...overrides,
    },
  };
}

// All lines resolved: the minted artifact is `generated`, so the panel clears and
// the normal artifact approval controls take over (no auto-refresh GET).
function skuReviewPostOkResponse(): Record<string, unknown> {
  return {
    artifact: { id: "art-sku-v3", status: "generated" },
    payloadSummary: { lineCount: 2, summary: {} },
    reviewSummary: { totalLineCount: 2, needsReviewCount: 0, acceptedCount: 2, rejectedCount: 0, unresolvedCount: 0 },
  };
}

// One line resolved but others still need review: the minted artifact stays
// `needs_review` and carries a new id, so the panel auto-refreshes against it.
const SKU_ARTIFACT_V3_ID = "art-sku-v3";
const SKU_REVIEW_V3_ROUTE_RE =
  /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-sku-v3\/sku-resolution\/review$/;
function skuReviewPostStillNeedsReviewResponse(): Record<string, unknown> {
  return {
    artifact: { id: SKU_ARTIFACT_V3_ID, status: "needs_review" },
    payloadSummary: { lineCount: 2, summary: {} },
    reviewSummary: { totalLineCount: 2, needsReviewCount: 1, acceptedCount: 1, rejectedCount: 0, unresolvedCount: 0 },
  };
}

describe("ProjectQuickBomPage - SKU line review panel", () => {
  it("renders the sku-review-load button when sku_resolution is needs_review", async () => {
    stubDefault();
    render(<ProjectQuickBomPage />);
    expect(await screen.findByTestId("sku-review-load")).toBeInTheDocument();
  });

  it("renders a read-only decision view (no checkboxes, no submit) when sku_resolution is approved", async () => {
    const approvedReview = skuReviewOkResponse({
      artifact: {
        id: SKU_ARTIFACT_ID, projectId: PROJECT_ID, stageId: "sku_resolution",
        type: "sku_resolution", status: "approved", version: 3,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      reviewSummary: { totalLineCount: 2, needsReviewCount: 0, acceptedCount: 1, rejectedCount: 1, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "C9300X-48HX-A", status: "accepted", acceptedSku: "C9300X-48HX-A",
          suggestions: [{ suggestedSku: "C9300X-48HX-A", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "SC9300UK9-1712", status: "rejected", note: "deferred",
          suggestions: [{ suggestedSku: "SC9300UK9-1712", source: "exact" }],
        },
      ],
    });
    stubFetch((url, init) => {
      const ws = baseWorkspace();
      (spineOf(ws).sku_resolution as Record<string, unknown>).status = "approved";
      if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(approvedReview);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    // The panel (and its Load button) still render so approved decisions stay readable.
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-readonly");
    // Read-only: the recorded accepted SKU is visible, but no review controls appear.
    expect(screen.getByTestId("sku-review-readonly-accepted")).toHaveTextContent("C9300X-48HX-A");
    expect(screen.queryByTestId("sku-review-submit")).toBeNull();
    expect(screen.queryByTestId("sku-review-checkbox")).toBeNull();
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
  });

  it("GETs the exact review route on load button click and renders summary + line rows", async () => {
    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(skuReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });

    const summary = await screen.findByTestId("sku-review-summary");
    expect(summary).toHaveTextContent("2 lines");
    expect(summary).toHaveTextContent("1 included downstream");
    expect(summary).toHaveTextContent("1 excluded before pricing");

    const lines = screen.getAllByTestId("sku-review-line");
    expect(lines).toHaveLength(2);

    const getCall = calls.find((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "GET");
    expect(getCall).toBeTruthy();
  });

  // A mixed review: one eligible same-SKU row (accept by default), one deferred row
  // (reject + note), and one different-SKU row (reject, no accepted SKU).
  function mixedSkuReview(): Record<string, unknown> {
    return skuReviewOkResponse({
      reviewSummary: { totalLineCount: 3, needsReviewCount: 3, acceptedCount: 0, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "C9300X-48HX-A", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300X-48HX-A", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "SC9300UK9-1712", status: "needs_review",
          suggestions: [{ suggestedSku: "SC9300UK9-1712", source: "exact" }],
          reviewGuidance: {
            action: "reject",
            reasonCode: "authority_pack_non_priced_defer",
            note: GUIDANCE_NOTE,
          },
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 4, originalLineNumber: "L-004",
          originalSku: "WS-C3650-48FD-E", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300-48P-A", source: "normalized" }],
        },
      ],
    });
  }

  it("one Submit POSTs explicit decisions for every review row: accept the eligible same-SKU row, reject the rest", async () => {
    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(mixedSkuReview());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    await waitFor(() =>
      expect(calls.some((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const posts = calls.filter((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    expect(posts).toHaveLength(1);
    const actions = (posts[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(actions).toHaveLength(3);

    const byRow = (n: number) => actions.find((a) => a.sourceRowNumber === n)!;
    // Eligible same-SKU row: accepted as its own SKU (never a substitution).
    expect(byRow(2).decision).toBe("accept");
    expect(byRow(2).acceptedSku).toBe("C9300X-48HX-A");
    // Deferred row: rejected, carrying the advisory note, never an acceptedSku.
    expect(byRow(3).decision).toBe("reject");
    expect(byRow(3).note).toBe(GUIDANCE_NOTE);
    expect("acceptedSku" in byRow(3)).toBe(false);
    // Different-SKU row: rejected (no silent substitution to the suggested SKU).
    expect(byRow(4).decision).toBe("reject");
    expect("acceptedSku" in byRow(4)).toBe(false);

    // Every action is sanitized: no authority/pricing/catalog/replacement fields.
    for (const action of actions) {
      for (const forbidden of [
        "tenantId", "projectId", "artifactId", "skuResolutionArtifactId", "decidedBy",
        "decidedAt", "pricing", "catalog", "catalogProfile", "replacement", "substitution",
        "authority", "configuration", "approval",
      ]) {
        expect(forbidden in action, forbidden).toBe(false);
      }
    }
  });

  it("unchecking an eligible row moves it from accept to reject in the submitted decisions", async () => {
    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(mixedSkuReview());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    // The only enabled checkbox is the eligible same-SKU row; uncheck it.
    const checkboxes = screen.getAllByTestId("sku-review-checkbox");
    const enabled = checkboxes.filter((c) => !(c as HTMLInputElement).disabled);
    expect(enabled).toHaveLength(1);
    expect((enabled[0] as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.click(enabled[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    await waitFor(() =>
      expect(calls.some((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );
    const post = calls.find((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    const actions = (post!.body as { actions: Record<string, unknown>[] }).actions;
    // Now every row is rejected; nothing is accepted.
    expect(actions.every((a) => a.decision === "reject")).toBe(true);
  });

  it("auto-refreshes the panel against the returned new artifact id while still needs_review (no re-Load click)", async () => {
    const v3Calls: string[] = [];
    stubFetch((url, init) => {
      // First version still needs review on load.
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(skuReviewOkResponse());
      }
      // POST mints a new version (art-sku-v3) that still needs review.
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostStillNeedsReviewResponse());
      }
      // Auto-refresh GET targets the returned new artifact id.
      if (SKU_REVIEW_V3_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        v3Calls.push(url);
        return jsonResponse(
          skuReviewOkResponse({
            artifact: {
              id: SKU_ARTIFACT_V3_ID, projectId: PROJECT_ID, stageId: "sku_resolution",
              type: "sku_resolution", status: "needs_review", version: 3,
              sourceFileIds: [], sourceArtifactIds: [],
              createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
            },
            reviewSummary: { totalLineCount: 3, needsReviewCount: 1, acceptedCount: 2, rejectedCount: 0, unresolvedCount: 0 },
          })
        );
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    // The panel stays open and shows the refreshed projection from the new artifact id;
    // no second "Load SKU review lines" click was needed.
    await waitFor(() =>
      expect(screen.getByTestId("sku-review-summary")).toHaveTextContent("3 lines")
    );
    expect(v3Calls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("sku-review-summary")).toBeInTheDocument();
  });

  it("clears the SKU review panel after a POST whose minted artifact is no longer needs_review", async () => {
    const refreshed = baseWorkspace();
    (refreshed.project as Record<string, unknown>).name = "SKU REVIEW REFRESHED";
    let reviewLoaded = false;

    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        reviewLoaded = true;
        return jsonResponse(skuReviewOkResponse());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: reviewLoaded ? refreshed : baseWorkspace() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    expect(await screen.findByText("SKU REVIEW REFRESHED")).toBeInTheDocument();
    // Minted artifact is `generated`, so the panel clears.
    await waitFor(() => expect(screen.queryByTestId("sku-review-summary")).toBeNull());
  });

  it("pre-selects only eligible same-SKU rows; ineligible and accepted rows have no enabled checkbox", async () => {
    // Two eligible same-SKU single-suggestion rows (rows 2 and 6; row 2 exercises the
    // case-insensitive match). Two ineligible needs_review rows must be unselectable: a
    // different suggested SKU (row 3) and an ambiguous multi-suggestion row (row 4). An
    // already accepted row (row 5) gets no checkbox at all.
    const multiSkuReview = skuReviewOkResponse({
      reviewSummary: { totalLineCount: 5, needsReviewCount: 4, acceptedCount: 1, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "c9300-48p-a", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300-48P-A", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "WS-C3650-48FD-E", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300-24P-A", source: "normalized" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 4, originalLineNumber: "L-004",
          originalSku: "AMBIG", status: "needs_review",
          suggestions: [
            { suggestedSku: "AMBIG", source: "normalized" },
            { suggestedSku: "AMBIG-2", source: "normalized" },
          ],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 5, originalLineNumber: "L-005",
          originalSku: "OLD", status: "accepted", acceptedSku: "OLD",
          suggestions: [{ suggestedSku: "OLD", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 6, originalLineNumber: "L-006",
          originalSku: "ABC-123", status: "needs_review",
          suggestions: [{ suggestedSku: "ABC-123", source: "exact" }],
        },
      ],
    });

    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(multiSkuReview);
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    // Only eligible same-SKU rows render a checkbox; ineligible needs_review rows (3, 4)
    // and the accepted row (5) render none.
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    const byRow = (n: number) => checkboxes.find((c) => c.dataset.row === String(n))!;
    // Eligible same-SKU rows: enabled and checked by default, in the included section.
    for (const n of [2, 6]) {
      expect(byRow(n).disabled).toBe(false);
      expect(byRow(n).checked).toBe(true);
    }
    // Ineligible needs_review rows have no checkbox at all (no disabled box either).
    for (const n of [3, 4]) {
      expect(checkboxes.find((c) => c.dataset.row === String(n))).toBeUndefined();
    }

    // The single submit reflects 2 included / 2 excluded.
    expect(screen.getByTestId("sku-review-submit")).toHaveTextContent("(2 included / 2 excluded)");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });
    await waitFor(() =>
      expect(calls.some((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const posts = calls.filter((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    expect(posts).toHaveLength(1);
    const actions = (posts[0].body as { actions: Record<string, unknown>[] }).actions;
    // One explicit decision per needs_review row (rows 2,3,4,6); the accepted row 5 is
    // never re-decided.
    expect(actions.map((a) => a.sourceRowNumber).sort()).toEqual([2, 3, 4, 6]);
    const action = (n: number) => actions.find((a) => a.sourceRowNumber === n)!;
    expect(action(2).decision).toBe("accept");
    expect(action(2).acceptedSku).toBe("C9300-48P-A");
    expect(action(6).decision).toBe("accept");
    expect(action(6).acceptedSku).toBe("ABC-123");
    expect(action(3).decision).toBe("reject");
    expect(action(4).decision).toBe("reject");
    for (const a of actions) {
      expect(a.sourceFileId).toBe("file-1");
      for (const forbidden of [
        "tenantId", "projectId", "artifactId", "skuResolutionArtifactId", "decidedBy",
        "decidedAt", "pricing", "catalog", "catalogProfile", "replacement", "substitution",
        "configuration", "approval",
      ]) {
        expect(forbidden in a).toBe(false);
      }
    }
  });

  it("disables Submit when no line still needs review", async () => {
    const noneNeedReview = skuReviewOkResponse({
      reviewSummary: { totalLineCount: 1, needsReviewCount: 0, acceptedCount: 1, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "C9300-48P-A", status: "accepted", acceptedSku: "C9300-48P-A",
          suggestions: [{ suggestedSku: "C9300-48P-A", source: "exact" }],
        },
      ],
    });

    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(noneNeedReview);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    expect(screen.getByTestId("sku-review-submit")).toBeDisabled();
  });

  it("does not approve the artifact client-side after a successful review submit", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(skuReviewOkResponse());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    // No approve-sku_resolution button should ever appear inside the review panel.
    await waitFor(() => screen.queryByTestId("project-name"));
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
  });

  // -- Deferred/non-priced reject-defer guidance --
  const GUIDANCE_NOTE =
    "Defer: not a priced authority-pack product row; reject before pricing/export.";

  function guided(sourceRowNumber: number, originalSku: string): Record<string, unknown> {
    return {
      sourceFileId: "file-1",
      sourceRowNumber,
      originalLineNumber: `L-00${sourceRowNumber}`,
      originalSku,
      status: "needs_review",
      suggestions: [{ suggestedSku: originalSku, source: "exact" }],
      reviewGuidance: {
        action: "reject",
        reasonCode: "authority_pack_non_priced_defer",
        note: GUIDANCE_NOTE,
      },
    };
  }

  function eligible(sourceRowNumber: number, originalSku: string): Record<string, unknown> {
    return {
      sourceFileId: "file-1",
      sourceRowNumber,
      originalLineNumber: `L-00${sourceRowNumber}`,
      originalSku,
      status: "needs_review",
      suggestions: [{ suggestedSku: originalSku, source: "exact" }],
    };
  }

  // Two eligible same-SKU lines (rows 2, 5) and two guided deferred lines (rows 3, 4).
  function guidedSkuReview(): Record<string, unknown> {
    return skuReviewOkResponse({
      reviewSummary: { totalLineCount: 4, needsReviewCount: 4, acceptedCount: 0, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        eligible(2, "C9300X-48HX-A"),
        guided(3, "SC9300UK9-1712"),
        guided(4, "SPACES-EXT-S"),
        eligible(5, "CW9178I-CFG"),
      ],
    });
  }

  it("renders deferred non-priced rows in the excluded section with no checkbox and no internal note", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(guidedSkuReview());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    const byRow = (n: number) => checkboxes.find((c) => c.dataset.row === String(n))!;
    // Eligible rows (2, 5) are pre-selected in the included section.
    for (const n of [2, 5]) {
      expect(byRow(n).disabled).toBe(false);
      expect(byRow(n).checked).toBe(true);
    }
    // Deferred rows (3, 4) have no checkbox at all (not even a disabled one).
    for (const n of [3, 4]) {
      expect(checkboxes.find((c) => c.dataset.row === String(n))).toBeUndefined();
    }
    expect(screen.getByTestId("sku-review-submit")).toHaveTextContent("(2 included / 2 excluded)");

    // No internal defer guidance is ever shown; the excluded section carries
    // user-facing pricing-catalog wording instead.
    expect(screen.queryByTestId("sku-review-guidance")).toBeNull();
    const excluded = screen.getByTestId("sku-review-excluded");
    expect(excluded).toHaveTextContent(
      "SC9300UK9-1712 is not available in the active pricing catalog."
    );
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(GUIDANCE_NOTE);
    expect(body).not.toContain("authority-pack");
    expect(body).not.toContain("Defer:");
  });

  it("deferred rows render no checkbox in the excluded section", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(guidedSkuReview());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    // The excluded section has no selectable controls: deferred rows cannot be approved.
    const excluded = screen.getByTestId("sku-review-excluded");
    expect(within(excluded).queryByTestId("sku-review-checkbox")).toBeNull();
  });

  it("submitting rejects deferred rows (with their note) and accepts only eligible rows", async () => {
    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(guidedSkuReview());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });
    await waitFor(() =>
      expect(calls.some((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const posts = calls.filter((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    expect(posts).toHaveLength(1);
    const actions = (posts[0].body as { actions: Record<string, unknown>[] }).actions;
    expect(actions).toHaveLength(4);
    const action = (n: number) => actions.find((a) => a.sourceRowNumber === n)!;

    // Eligible rows accepted as their own SKU; deferred rows rejected with the note.
    expect(action(2).decision).toBe("accept");
    expect(action(5).decision).toBe("accept");
    for (const n of [3, 4]) {
      expect(action(n).decision).toBe("reject");
      expect(action(n).note).toBe(GUIDANCE_NOTE);
      expect("acceptedSku" in action(n)).toBe(false);
    }
    for (const a of actions) {
      expect(a.sourceFileId).toBe("file-1");
      for (const forbidden of [
        "tenantId", "projectId", "artifactId", "skuResolutionArtifactId", "decidedBy",
        "decidedAt", "pricing", "catalog", "catalogProfile", "replacement", "substitution",
        "authority", "configuration", "approval",
      ]) {
        expect(forbidden in a, forbidden).toBe(false);
      }
    }
  });

  it("renders no defer note when no line carries reject/defer guidance", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(skuReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    expect(screen.queryByTestId("sku-review-guidance")).toBeNull();
  });

  it("shows a controlled error and no stack when the GET review request fails", async () => {
    const secret = "sku-review-get-boom-internal";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
          return Promise.reject(new Error(secret));
        }
        return Promise.resolve(jsonResponse({ workspace: baseWorkspace() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });

    const err = await screen.findByTestId("sku-review-error");
    expect(err).toHaveTextContent("Unable to load or update the SKU line review.");
    expect(document.body.textContent ?? "").not.toContain(secret);
    expect(screen.queryByTestId("sku-review-summary")).toBeNull();
  });

  it("shows a controlled error and no stack when the review GET returns a non-ok status", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse({ code: "invalid_sku_resolution_payload", error: "Payload is invalid." }, 409);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });

    const err = await screen.findByTestId("sku-review-error");
    expect(err).toHaveTextContent("Payload is invalid.");
  });

  it("shows a controlled error when a review POST fails without exposing the stack", async () => {
    const secret = "sku-review-post-boom-internal";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
          return Promise.reject(new Error(secret));
        }
        if (SKU_REVIEW_ROUTE_RE.test(url)) {
          return Promise.resolve(jsonResponse(skuReviewOkResponse()));
        }
        return Promise.resolve(jsonResponse({ workspace: baseWorkspace() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });

    const err = await screen.findByTestId("sku-review-error");
    expect(err).toHaveTextContent("Unable to load or update the SKU line review.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });

  it("does not render review payload canary fields in the DOM", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(skuReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    const body = document.body.textContent ?? "";
    // SKU_REVIEW_CANARY is planted as decidedBy on the accepted line - not rendered
    expect(body).not.toContain(SKU_REVIEW_CANARY);
    // PAYLOAD_CANARY from the base workspace payload should also not appear
    expect(body).not.toContain(PAYLOAD_CANARY);
  });
});

describe("ProjectQuickBomPage - SKU review related configured item clarity (QBM-LOG-003)", () => {
  const RELATED_NOTE =
    "Defer: not a priced authority-pack product row; reject before pricing/export.";

  // A deferred historical row (with a known related configured item) plus an eligible
  // same-SKU parent row. The deferred row stays unselectable; the related configured
  // item is read-only guidance, never another checkbox.
  function relatedSkuReview(): Record<string, unknown> {
    return skuReviewOkResponse({
      reviewSummary: { totalLineCount: 2, needsReviewCount: 2, acceptedCount: 0, rejectedCount: 0, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 2, originalLineNumber: "L-002",
          originalSku: "C9300X-48HX-A", status: "needs_review",
          suggestions: [{ suggestedSku: "C9300X-48HX-A", source: "exact" }],
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "CON-L1NBX-C9300XY4", status: "needs_review",
          suggestions: [{ suggestedSku: "CON-L1NBX-C9300XY4", source: "exact" }],
          reviewGuidance: {
            action: "reject",
            reasonCode: "authority_pack_non_priced_defer",
            note: RELATED_NOTE,
          },
          relatedConfiguredItems: [
            { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "CON-L1NCD-C9300XY4" },
          ],
        },
      ],
    });
  }

  it("shows the deferred row clarity text, related configured SKU, and parent SKU without an extra checkbox", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(relatedSkuReview());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    // Only the eligible parent row (2) renders a checkbox; the deferred row (3) has none.
    const checkboxes = screen.getAllByTestId("sku-review-checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(1);
    const byRow = (n: number) => checkboxes.find((c) => c.dataset.row === String(n))!;
    expect(byRow(2).disabled).toBe(false);
    expect(byRow(2).checked).toBe(true);
    expect(checkboxes.find((c) => c.dataset.row === "3")).toBeUndefined();

    // The related configured item is read-only guidance: NOT another checkbox.
    const related = screen.getByTestId("sku-review-related-configured");
    expect(related).toHaveTextContent("Excluded before pricing.");
    expect(related).not.toHaveTextContent("No silent substitution.");
    expect(related).toHaveTextContent(
      "Related configured item may appear under parent C9300X-48HX-A: CON-L1NCD-C9300XY4"
    );
    expect(within(related).queryByTestId("sku-review-checkbox")).toBeNull();

    // No "replaced by" / "replacement" wording anywhere in the visible UI.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("replaced by");
    expect(body.toLowerCase()).not.toContain("replacement");
  });

  it("submits the deferred row as reject with its defer note, never the related configured SKU", async () => {
    const calls = stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(relatedSkuReview());
      }
      if (SKU_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(skuReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-submit"));
    });
    await waitFor(() =>
      expect(calls.some((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const post = calls.find((c) => SKU_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")!;
    const actions = (post.body as { actions: Record<string, unknown>[] }).actions;
    const deferred = actions.find((a) => a.sourceRowNumber === 3)!;
    expect(deferred.decision).toBe("reject");
    expect(deferred.note).toBe(RELATED_NOTE);
    expect("acceptedSku" in deferred).toBe(false);
    // The related configured SKU and parent never enter any action payload field.
    const serialized = JSON.stringify(post.body);
    expect(serialized).not.toContain("CON-L1NCD-C9300XY4");
    for (const a of actions) {
      for (const forbidden of ["relatedConfiguredSku", "relatedConfiguredItems", "parentSku"]) {
        expect(forbidden in a, forbidden).toBe(false);
      }
    }
  });

  it("keeps the related configured guidance readable in the read-only view after approval", async () => {
    const approvedReview = skuReviewOkResponse({
      artifact: {
        id: SKU_ARTIFACT_ID, projectId: PROJECT_ID, stageId: "sku_resolution",
        type: "sku_resolution", status: "approved", version: 3,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      reviewSummary: { totalLineCount: 1, needsReviewCount: 0, acceptedCount: 0, rejectedCount: 1, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "CON-L1NBX-C9300XY4", status: "rejected", note: "deferred",
          suggestions: [{ suggestedSku: "CON-L1NBX-C9300XY4", source: "exact" }],
          relatedConfiguredItems: [
            { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "CON-L1NCD-C9300XY4" },
          ],
        },
      ],
    });
    stubFetch((url, init) => {
      const ws = baseWorkspace();
      (spineOf(ws).sku_resolution as Record<string, unknown>).status = "approved";
      if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(approvedReview);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-readonly");

    // Read-only: no review controls, but the relationship guidance still renders.
    expect(screen.queryByTestId("sku-review-submit")).toBeNull();
    expect(screen.queryByTestId("sku-review-checkbox")).toBeNull();
    const related = screen.getByTestId("sku-review-related-configured");
    expect(related).toHaveTextContent("Excluded before pricing.");
    expect(related).not.toHaveTextContent("No silent substitution.");
    expect(related).toHaveTextContent(
      "Related configured item may appear under parent C9300X-48HX-A: CON-L1NCD-C9300XY4"
    );
  });

  it("splits editable review into included/excluded sections with clear, non-internal wording", async () => {
    stubFetch((url, init) => {
      if (SKU_REVIEW_ROUTE_RE.test(url) && (init?.method === "GET" || !init?.method)) {
        return jsonResponse(relatedSkuReview());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: baseWorkspace() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-summary");

    // Two distinct sections, with counts.
    const included = screen.getByTestId("sku-review-included");
    const excluded = screen.getByTestId("sku-review-excluded");
    expect(included).toHaveTextContent("Included downstream (1)");
    expect(excluded).toHaveTextContent("Excluded before pricing (1)");

    // Included row: eligible same-SKU row keeps a checked checkbox and clear wording.
    const includedCheckbox = within(included).getByTestId(
      "sku-review-checkbox"
    ) as HTMLInputElement;
    expect(includedCheckbox.checked).toBe(true);
    expect(included).toHaveTextContent("Catalog match: C9300X-48HX-A");

    // Excluded row: no checkbox, no needs-review badge, no "Suggestions:", clear text.
    expect(within(excluded).queryByTestId("sku-review-checkbox")).toBeNull();
    expect(excluded).not.toHaveTextContent("needs review");
    expect(excluded).not.toHaveTextContent("Suggestions:");
    expect(excluded).toHaveTextContent(
      "CON-L1NBX-C9300XY4 is not available in the active pricing catalog."
    );
    expect(excluded).toHaveTextContent(
      "Related configured item may appear under parent C9300X-48HX-A: CON-L1NCD-C9300XY4"
    );

    // The visible body never exposes internal or substitution wording.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain("authority-pack");
    expect(body).not.toContain("Defer:");
    expect(body).not.toContain("replaced by");
    expect(body.toLowerCase()).not.toContain("replacement");
  });

  it("read-only view hides the internal defer note for rejected rows, showing exclusion wording instead", async () => {
    const internalNote =
      "Defer: not a priced authority-pack product row; reject before pricing/export.";
    const approvedReview = skuReviewOkResponse({
      artifact: {
        id: SKU_ARTIFACT_ID, projectId: PROJECT_ID, stageId: "sku_resolution",
        type: "sku_resolution", status: "approved", version: 3,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      reviewSummary: { totalLineCount: 1, needsReviewCount: 0, acceptedCount: 0, rejectedCount: 1, unresolvedCount: 0 },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          // The persisted reject note IS the internal defer string; it must not leak.
          originalSku: "CON-L1NBX-C9300XY4", status: "rejected", note: internalNote,
          suggestions: [{ suggestedSku: "CON-L1NBX-C9300XY4", source: "exact" }],
          relatedConfiguredItems: [
            { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "CON-L1NCD-C9300XY4" },
          ],
        },
      ],
    });
    stubFetch((url, init) => {
      const ws = baseWorkspace();
      (spineOf(ws).sku_resolution as Record<string, unknown>).status = "approved";
      if (SKU_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(approvedReview);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("sku-review-load");
    await act(async () => {
      fireEvent.click(screen.getByTestId("sku-review-load"));
    });
    await screen.findByTestId("sku-review-readonly");

    // Readable exclusion wording + related guidance render.
    expect(screen.getByTestId("sku-review-readonly-excluded")).toHaveTextContent(
      "CON-L1NBX-C9300XY4 is not available in the active pricing catalog."
    );
    expect(screen.getByTestId("sku-review-related-configured")).toHaveTextContent(
      "Related configured item may appear under parent C9300X-48HX-A: CON-L1NCD-C9300XY4"
    );
    // The internal defer/authority-pack note never reaches the DOM.
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(internalNote);
    expect(body).not.toContain("authority-pack");
    expect(body).not.toContain("Defer:");
  });
});

// -- Configuration expansion line-review fixtures --
const CFG_ARTIFACT_ID = "art-cfg-draft";
const CFG_REVIEW_ROUTE_RE =
  /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-cfg-draft\/configuration-expansion\/review$/;
const CFG_REVIEW_CANARY = "CFG-REVIEW-EVIDENCE-PATH-CANARY";

function workspaceWithCfgNeedsReview(): Record<string, unknown> {
  const ws = baseWorkspace();
  const sa = spineOf(ws);
  sa.configuration_expansion = {
    id: CFG_ARTIFACT_ID,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: 2,
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:05:00.000Z",
  };
  return ws;
}

function workspaceWithReviewedCfgNeedsApproval(): Record<string, unknown> {
  const ws = workspaceWithCfgNeedsReview();
  const cfg = spineOf(ws).configuration_expansion as Record<string, unknown>;
  cfg.id = "art-cfg-reviewed";
  cfg.version = 3;
  cfg.sourceArtifactIds = ["art-norm", "art-sku", CFG_ARTIFACT_ID];
  return ws;
}

// The reviewed artifact after generic approval: status flips to "approved" in place
// (createProjectApproval updates the row, never re-versions), so sourceArtifactIds[2]
// is retained and the read-only decisions viewer must keep mounting.
function workspaceWithApprovedCfg(): Record<string, unknown> {
  const ws = workspaceWithReviewedCfgNeedsApproval();
  const cfg = spineOf(ws).configuration_expansion as Record<string, unknown>;
  cfg.status = "approved";
  return ws;
}

function cfgReviewOkResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review: {
      project: {
        id: PROJECT_ID, tenantId: TENANT, name: "Honeywell Quick BoM", mode: "quick_bom",
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
      },
      artifact: {
        id: CFG_ARTIFACT_ID, projectId: PROJECT_ID,
        stageId: "configuration_expansion_review",
        type: "configuration_expansion", status: "needs_review", version: 2,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      payloadSummary: {
        sourceNormalizedBoqArtifactId: "art-nb-1",
        sourceNormalizedBoqArtifactVersion: 1,
        sourceSkuResolutionArtifactId: "art-sku-2",
        sourceSkuResolutionArtifactVersion: 2,
        sourceFileIds: [],
        rulePackId: "honeywell-scope-rules",
        rulePackVersion: "1.0.0",
        rulePackStatus: "approved",
        rulePackSourceScope: "honeywell_mvp_demo_only",
        lineCount: 3,
        summary: { customerLineCount: 1, addedLineCount: 2 },
      },
      reviewSummary: {
        totalLineCount: 3,
        customerLineCount: 1,
        expansionLineCount: 2,
        requiresDecisionCount: 2,
        includedItemCount: 1,
      },
      lines: [
        {
          lineId: "line-cust-1",
          origin: "customer",
          sku: "C9300-48P-A",
          description: "Customer switch",
          quantity: 2,
          evidenceCount: 0,
          evidenceSourceTypes: [],
        },
        {
          lineId: "line-exp-1",
          origin: "expansion",
          sku: "C9300-NM-4G",
          description: "Network module",
          quantity: 2,
          relationshipType: "default_selected",
          sourceRuleId: "rule-nm-4g",
          evidenceCount: 1,
          evidenceSourceTypes: ["ccw_estimate"],
          // planted canary: should never reach DOM
          sourcePath: CFG_REVIEW_CANARY,
        },
        {
          lineId: "line-exp-2",
          origin: "expansion",
          sku: "PWR-C1-715WAC",
          description: "Power supply",
          quantity: 2,
          evidenceCount: 0,
          evidenceSourceTypes: [],
          includedItem: true,
        },
      ],
      ...overrides,
    },
  };
}

function cfgReviewPostOkResponse(): Record<string, unknown> {
  return {
    artifact: { id: "art-cfg-reviewed", status: "generated" },
    payloadSummary: { lineCount: 3, summary: {} },
    reviewSummary: {
      customerLineCount: 1,
      acceptedExpansionLineCount: 1,
      rejectedExpansionLineCount: 1,
      totalAcceptedLineCount: 2,
      reviewedExpansionLineCount: 2,
    },
  };
}

describe("ProjectQuickBomPage - configuration expansion line review panel", () => {
  it("renders the config-review-load button when configuration_expansion is a needs_review draft", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    expect(await screen.findByTestId("config-review-load")).toBeInTheDocument();
  });

  it("does not render the config-review-load button when configuration_expansion is generated", async () => {
    stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    // baseWorkspace has configuration_expansion.status = "generated"
    expect(screen.queryByTestId("config-review-load")).toBeNull();
  });

  it("does not render the config-review-load button for a reviewed needs_review artifact", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithReviewedCfgNeedsApproval() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.queryByTestId("config-review-load")).toBeNull();
    expect(screen.queryByTestId("line-review-required-configuration_expansion")).toBeNull();
    expect(screen.getByTestId("approve-configuration_expansion")).toBeInTheDocument();
  });

  it("shows explicit generic approval after a successful config review reloads a reviewed artifact", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    let workspaceLoads = 0;
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        workspaceLoads += 1;
        return jsonResponse({
          workspace:
            workspaceLoads === 1
              ? workspaceWithCfgNeedsReview()
              : workspaceWithReviewedCfgNeedsApproval(),
        });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    // Expansion rows default to selected (accept); one Submit records the batch.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });

    expect(await screen.findByTestId("approve-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("line-review-required-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("config-review-load")).toBeNull();
    expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("needs review");
  });

  it("GETs the exact review route and renders summary + line rows", async () => {
    const calls = stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });

    const summary = await screen.findByTestId("config-review-summary");
    expect(summary).toHaveTextContent("2 selected for downstream, 0 excluded");
    expect(summary).toHaveTextContent("2 expansion lines");
    expect(summary).toHaveTextContent("1 customer lines read-only");

    const lines = screen.getAllByTestId("config-review-line");
    expect(lines).toHaveLength(3);

    const getCall = calls.find((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "GET");
    expect(getCall).toBeTruthy();
  });

  it("customer lines have no checkbox; expansion lines render a checkbox selected by default", async () => {
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    await screen.findByTestId("config-review-summary");

    // 2 expansion lines -> 2 checkboxes, both checked by default; customer line has none
    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("Submit is enabled immediately because expansion rows default to selected (accept)", async () => {
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    await screen.findByTestId("config-review-summary");

    // No per-line decision is required up front: defaults are explicit-on-submit.
    expect(screen.getByTestId("config-review-submit")).not.toBeDisabled();

    // Deselecting a line (reject) keeps Submit enabled.
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => {
      fireEvent.click(boxes[1]);
    });
    expect(boxes[1].checked).toBe(false);
    expect(screen.getByTestId("config-review-submit")).not.toBeDisabled();
  });

  it("POSTs a sanitized decisions array with only lineId/action/note, no authority fields", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const calls = stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    // Leave exp-1 selected (accept) and deselect exp-2 (reject).
    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(boxes[1]); });

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });

    await waitFor(() =>
      expect(calls.some((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const post = calls.find((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    const body = post!.body as { decisions: Record<string, unknown>[] };
    expect(body.decisions).toHaveLength(2);

    // Only expansion lines in the batch
    for (const d of body.decisions) {
      expect(typeof d.lineId).toBe("string");
      expect(d.action === "accept" || d.action === "reject").toBe(true);
      // Authority fields must not be sent
      expect("tenantId" in d).toBe(false);
      expect("projectId" in d).toBe(false);
      expect("artifactId" in d).toBe(false);
      expect("reviewedBy" in d).toBe(false);
      expect("reviewedAt" in d).toBe(false);
      expect("pricing" in d).toBe(false);
    }
    // customer line must not appear
    expect(body.decisions.some((d) => d.lineId === "line-cust-1")).toBe(false);
  });

  it("clears the config review panel and re-GETs the workspace after a successful POST", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const refreshed = workspaceWithCfgNeedsReview();
    (refreshed.project as Record<string, unknown>).name = "CFG REVIEW REFRESHED";
    let reviewLoaded = false;

    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        reviewLoaded = true;
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: reviewLoaded ? refreshed : workspaceWithCfgNeedsReview() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(boxes[1]); });

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });

    expect(await screen.findByText("CFG REVIEW REFRESHED")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("config-review-summary")).toBeNull());
  });

  it("does not approve the artifact client-side after a successful review POST", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    let workspaceLoads = 0;
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        workspaceLoads += 1;
        return jsonResponse({
          workspace:
            workspaceLoads === 1
              ? workspaceWithCfgNeedsReview()
              : workspaceWithReviewedCfgNeedsApproval(),
        });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(boxes[1]); });

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });

    await waitFor(() => screen.queryByTestId("project-name"));
    expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("needs review");
    expect(screen.getByTestId("approve-configuration_expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("line-review-required-configuration_expansion")).toBeNull();
  });

  it("shows a controlled error and no stack when the GET review throws", async () => {
    const secret = "cfg-review-get-boom-internal";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
          return Promise.reject(new Error(secret));
        }
        return Promise.resolve(jsonResponse({ workspace: workspaceWithCfgNeedsReview() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });

    const err = await screen.findByTestId("config-review-error");
    expect(err).toHaveTextContent("Unable to load or submit the configuration expansion line review.");
    expect(document.body.textContent ?? "").not.toContain(secret);
    expect(screen.queryByTestId("config-review-summary")).toBeNull();
  });

  it("shows a controlled error when the GET review returns a non-ok status", async () => {
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse({ code: "configuration_expansion_draft_not_reviewable", error: "Draft is not reviewable." }, 409);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });

    const err = await screen.findByTestId("config-review-error");
    expect(err).toHaveTextContent("Draft is not reviewable.");
  });

  it("shows a controlled error and no stack when the review POST throws", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const secret = "cfg-review-post-boom-internal";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
          return Promise.reject(new Error(secret));
        }
        if (CFG_REVIEW_ROUTE_RE.test(url)) {
          return Promise.resolve(jsonResponse(cfgReviewOkResponse()));
        }
        return Promise.resolve(jsonResponse({ workspace: workspaceWithCfgNeedsReview() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    // Default selection (all accept) is enough to submit; the POST then throws.
    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });

    const err = await screen.findByTestId("config-review-error");
    expect(err).toHaveTextContent("Unable to load or submit the configuration expansion line review.");
    expect(document.body.textContent ?? "").not.toContain(secret);
  });

  it("selects every expansion line by default, leaves customer lines read-only, enables submit, and does not POST until Submit", async () => {
    const calls = stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    const submit = screen.getByTestId("config-review-submit");
    // Defaults are explicit-on-submit, so Submit is enabled from the start.
    expect(submit).not.toBeDisabled();

    // No POST happens before Submit.
    expect(
      calls.some((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")
    ).toBe(false);

    // The customer line never gains a checkbox (read-only) - 2 expansion boxes, both
    // checked by default.
    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);

    // Submit posts exactly one batch of accepts, one per expansion line, no customer line.
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() =>
      expect(calls.some((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );
    const posts = calls.filter((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    expect(posts).toHaveLength(1);
    const body = posts[0].body as { decisions: Record<string, unknown>[] };
    expect(body.decisions).toHaveLength(2);
    expect(body.decisions.every((d) => d.action === "accept")).toBe(true);
    expect(body.decisions.some((d) => d.lineId === "line-cust-1")).toBe(false);
    expect(new Set(body.decisions.map((d) => d.lineId))).toEqual(
      new Set(["line-exp-1", "line-exp-2"])
    );
  });

  it("does not render any bulk select/deselect action in the editable config review", async () => {
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    expect(screen.queryByTestId("config-review-select-all")).toBeNull();
    expect(screen.queryByTestId("config-review-deselect-all")).toBeNull();
  });

  it("deselecting then re-checking a row flips its decision; summary and submit follow the explicit choice", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Not needed for this site");
    const calls = stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (CFG_REVIEW_ROUTE_RE.test(url) && init?.method === "POST") {
        return jsonResponse(cfgReviewPostOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => { fireEvent.click(screen.getByTestId("config-review-load")); });
    await screen.findByTestId("config-review-summary");

    // Both expansion lines start selected for downstream.
    expect(screen.getByTestId("config-review-summary")).toHaveTextContent(
      "2 selected for downstream, 0 excluded"
    );

    // Deselect the second expansion line (reject + note) - summary updates.
    const boxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(boxes[1]); });
    expect(boxes[1].checked).toBe(false);
    expect(screen.getByTestId("config-review-summary")).toHaveTextContent(
      "1 selected for downstream, 1 excluded"
    );

    // Re-check that same row to include it downstream again - summary returns to all selected.
    const afterDeselect = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(afterDeselect[1]); });
    expect(
      (screen.getAllByTestId("config-review-checkbox")[1] as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByTestId("config-review-summary")).toHaveTextContent(
      "2 selected for downstream, 0 excluded"
    );

    // Deselect once more, then submit: one decision per expansion line, none for customer.
    const finalBoxes = screen.getAllByTestId("config-review-checkbox") as HTMLInputElement[];
    await act(async () => { fireEvent.click(finalBoxes[1]); });

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-submit"));
    });
    await waitFor(() =>
      expect(calls.some((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST")).toBe(true)
    );

    const post = calls.find((c) => CFG_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    const body = post!.body as { decisions: Record<string, unknown>[] };
    expect(body.decisions).toHaveLength(2);
    expect(body.decisions.some((d) => d.lineId === "line-cust-1")).toBe(false);
    const exp1 = body.decisions.find((d) => d.lineId === "line-exp-1")!;
    const exp2 = body.decisions.find((d) => d.lineId === "line-exp-2")!;
    expect(exp1.action).toBe("accept");
    expect("note" in exp1).toBe(false);
    expect(exp2.action).toBe("reject");
    expect(exp2.note).toBe("Not needed for this site");
  });

  it("does not render review payload canary fields (evidence paths etc.) in the DOM", async () => {
    stubFetch((url, init) => {
      if (CFG_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: workspaceWithCfgNeedsReview() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-review-load"));
    });
    await screen.findByTestId("config-review-summary");

    const body = document.body.textContent ?? "";
    expect(body).not.toContain(CFG_REVIEW_CANARY);
    expect(body).not.toContain(PAYLOAD_CANARY);
    // Structural key names must not be visible in the DOM
    expect(body).not.toContain("originalCells");
    expect(body).not.toContain("evidenceNote");
  });
});

// -- Reviewed (approved) configuration-expansion read-only viewer fixtures --
const CFG_APPROVED_ROUTE_RE =
  /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-cfg-reviewed\/configuration-expansion\/review$/;

function cfgApprovedOkResponse(): Record<string, unknown> {
  return {
    review: {
      mode: "reviewed",
      project: {
        id: PROJECT_ID, tenantId: TENANT, name: "Honeywell Quick BoM", mode: "quick_bom",
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
      },
      artifact: {
        id: "art-cfg-reviewed", projectId: PROJECT_ID,
        stageId: "configuration_expansion_review",
        type: "configuration_expansion", status: "needs_review", version: 3,
        sourceFileIds: [], sourceArtifactIds: ["art-norm", "art-sku", CFG_ARTIFACT_ID],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      reviewedSummary: {
        customerLineCount: 1,
        acceptedExpansionLineCount: 1,
        rejectedExpansionLineCount: 1,
        totalAcceptedLineCount: 2,
        reviewedExpansionLineCount: 2,
      },
      lines: [
        { lineId: "line-cust-1", origin: "customer", sku: "C9300-48P-A", description: "Customer switch", quantity: 2, evidenceCount: 0, evidenceSourceTypes: [] },
        { lineId: "line-exp-1", origin: "expansion", sku: "C9300-NM-4G", description: "Network module", quantity: 2, sourceRuleId: "rule-nm-4g", evidenceCount: 1, evidenceSourceTypes: ["ccw_estimate"], decision: "accepted" },
        // Planted canary on a recorded line; the read-only viewer must never render it.
        { lineId: "line-exp-2", origin: "expansion", sku: "PWR-C1-715WAC", description: "Power supply", quantity: 2, evidenceCount: 0, evidenceSourceTypes: [], decision: "rejected", sourcePath: CFG_REVIEW_CANARY },
      ],
    },
  };
}

describe("ProjectQuickBomPage - reviewed configuration expansion read-only viewer", () => {
  it("mounts the read-only viewer (not the draft panel) for a reviewed artifact, keeping the separate Approve control", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithReviewedCfgNeedsApproval() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Read-only viewer present; the editable draft panel is not.
    expect(screen.getByTestId("config-approved-load")).toBeInTheDocument();
    expect(screen.queryByTestId("config-review-load")).toBeNull();
    // Stage approval stays on the separate generic Approve control (requirement #7).
    expect(screen.getByTestId("approve-configuration_expansion")).toBeInTheDocument();
  });

  it("loads recorded decisions read-only: accepted/rejected badges, no checkbox, no submit", async () => {
    stubFetch((url, init) => {
      if (CFG_APPROVED_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgApprovedOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithReviewedCfgNeedsApproval() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-approved-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-approved-load"));
    });
    const summary = await screen.findByTestId("config-approved-summary");
    expect(summary).toHaveTextContent("2 accepted");
    expect(summary).toHaveTextContent("1 rejected");

    const decisions = screen.getAllByTestId("config-approved-decision");
    expect(decisions).toHaveLength(2);
    const labels = decisions.map((d) => d.getAttribute("data-decision"));
    expect(new Set(labels)).toEqual(new Set(["accepted", "rejected"]));

    // Read-only: no editable controls in this viewer.
    expect(screen.queryByTestId("config-approved-checkbox")).toBeNull();
    expect(screen.queryByTestId("config-review-checkbox")).toBeNull();
    expect(screen.queryByTestId("config-approved-submit")).toBeNull();
    expect(screen.queryByTestId("config-review-submit")).toBeNull();
  });

  it("keeps the read-only viewer after approval (status approved, no Approve control)", async () => {
    stubFetch((url, init) => {
      if (CFG_APPROVED_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgApprovedOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithApprovedCfg() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // Requirement 5: approved decisions remain readable. Viewer still mounts...
    expect(screen.getByTestId("config-approved-load")).toBeInTheDocument();
    expect(screen.getByTestId("spine-configuration_expansion")).toHaveTextContent("approved");
    // ...and the approve/reject control is gone once the artifact is approved.
    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("config-review-load")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-approved-load"));
    });
    const summary = await screen.findByTestId("config-approved-summary");
    expect(summary).toHaveTextContent("2 accepted");
    expect(screen.getAllByTestId("config-approved-decision")).toHaveLength(2);
  });

  it("never renders recorded-line canary fields in the read-only viewer DOM", async () => {
    stubFetch((url, init) => {
      if (CFG_APPROVED_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(cfgApprovedOkResponse());
      }
      if (url.endsWith("/quick-bom")) {
        return jsonResponse({ workspace: workspaceWithReviewedCfgNeedsApproval() });
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("config-approved-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("config-approved-load"));
    });
    await screen.findByTestId("config-approved-summary");

    const body = document.body.textContent ?? "";
    expect(body).not.toContain(CFG_REVIEW_CANARY);
    expect(body).not.toContain(PAYLOAD_CANARY);
  });
});

// -- Priced BoQ line-review fixtures --
const PRICED_ARTIFACT_ID = "art-priced";
const PRICED_REVIEW_ROUTE_RE =
  /\/api\/projects\/proj-1\/quick-bom\/artifacts\/art-priced\/priced-boq\/review$/;
const PRICED_REVIEW_CANARY = "PRICED-REVIEW-UNIT-LIST-PRICE-CANARY";

function pricedReviewOkResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review: {
      project: {
        id: PROJECT_ID, tenantId: TENANT, name: "Honeywell Quick BoM", mode: "quick_bom",
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
      },
      artifact: {
        id: PRICED_ARTIFACT_ID, projectId: PROJECT_ID, stageId: "boq_pricing_review",
        type: "priced_boq", status: "needs_review", version: 1,
        sourceFileIds: [], sourceArtifactIds: [],
        createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
      },
      payloadSummary: {
        sourceConfigurationExpansionArtifactId: "art-ce-7",
        sourceConfigurationExpansionArtifactVersion: 3,
        sourceNormalizedBoqArtifactId: "art-nb-2",
        sourceNormalizedBoqArtifactVersion: 1,
        sourceSkuResolutionArtifactId: "art-skur-5",
        sourceSkuResolutionArtifactVersion: 2,
        sourceFileIds: [],
        pricingConfig: { currency: "SAR", mode: "margin", ratePercent: 30, vatRatePercent: 15, roundingDecimals: 2 },
        lineCount: 2,
        pricingSummary: {
          inputLineCount: 2, pricedLineCount: 1, unpricedLineCount: 1,
          missingDecisionCount: 0, notAcceptedCount: 0, missingPriceCount: 1,
          totals: {
            currency: "SAR", lineCount: 1, subtotalListPriceSar: 2000,
            subtotalSellPriceSar: 1400, vatAmountSar: 210, totalIncVatSar: 1610,
          },
        },
        // Canary: must never reach DOM
        unitListPriceSarBySku: { "C9300-48P-A": PRICED_REVIEW_CANARY },
      },
      reviewSummary: {
        totalLineCount: 2, pricedLineCount: 1, unpricedLineCount: 1,
        missingPriceCount: 1, warningCount: 1,
      },
      lines: [
        {
          sourceFileId: "file-1", sourceRowNumber: 3, originalLineNumber: "L-003",
          originalSku: "WS-OLD", acceptedSku: "C9300-48P-A",
          description: "Catalyst switch", quantity: 2,
          status: "priced",
          amounts: {
            currency: "SAR", quantity: 2,
            unitListPriceSar: 1000, extendedListPriceSar: 2000,
            unitSellPriceSar: 700, extendedSellPriceSar: 1400,
            pricingMode: "margin", ratePercent: 30, vatRatePercent: 15,
            vatAmountSar: 210, totalIncVatSar: 1610,
          },
          // Canary: must never reach DOM
          originalCells: { A1: "ORIGINALCELLS-CANARY" },
        },
        {
          sourceFileId: "file-1", sourceRowNumber: 4, originalLineNumber: "L-004",
          originalSku: "UNKNOWN-SKU",
          description: "Unknown SKU line", quantity: 1,
          status: "missing_price",
          warning: "No price found for SKU UNKNOWN-SKU",
        },
      ],
      ...overrides,
    },
  };
}

describe("ProjectQuickBomPage - priced BoQ review panel", () => {
  it("renders the priced-review-load button when priced_boq is needs_review", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    expect(await screen.findByTestId("priced-review-load")).toBeInTheDocument();
  });

  it("does not render the priced-review-load button when priced_boq is approved", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: fullWorkspace() });
      return jsonResponse({}, 404);
    });
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.queryByTestId("priced-review-load")).toBeNull();
  });

  it("does not render the priced-review-load button when priced_boq is absent", async () => {
    stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.queryByTestId("priced-review-load")).toBeNull();
  });

  it("GETs the exact priced-boq review route and renders summary + line rows", async () => {
    const calls = stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");

    await act(async () => {
      fireEvent.click(screen.getByTestId("priced-review-load"));
    });

    const summary = await screen.findByTestId("priced-review-summary");
    expect(summary).toHaveTextContent("2 lines");
    expect(summary).toHaveTextContent("1 priced");
    expect(summary).toHaveTextContent("1 unpriced");
    expect(summary).toHaveTextContent("1 missing price");
    expect(summary).toHaveTextContent("1 warnings");
    expect(summary).toHaveTextContent("SAR");
    expect(summary).toHaveTextContent("1610");

    const lines = screen.getAllByTestId("priced-review-line");
    expect(lines).toHaveLength(2);

    const getCall = calls.find((c) => PRICED_REVIEW_ROUTE_RE.test(c.url) && c.method === "GET");
    expect(getCall).toBeTruthy();
  });

  it("renders amounts on priced lines", async () => {
    stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });
    await screen.findByTestId("priced-review-summary");

    const lines = screen.getAllByTestId("priced-review-line");
    const pricedLine = lines[0];
    expect(pricedLine).toHaveTextContent("700");
    expect(pricedLine).toHaveTextContent("1610");
    expect(pricedLine).toHaveTextContent("C9300-48P-A");
  });

  it("renders warning on missing-price lines", async () => {
    stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });
    await screen.findByTestId("priced-review-summary");

    const lines = screen.getAllByTestId("priced-review-line");
    const missingLine = lines[1];
    expect(missingLine).toHaveTextContent("No price found for SKU UNKNOWN-SKU");
  });

  it("priced review panel does not POST; no POST call is issued on load", async () => {
    const calls = stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });
    await screen.findByTestId("priced-review-summary");

    const posts = calls.filter((c) => PRICED_REVIEW_ROUTE_RE.test(c.url) && c.method === "POST");
    expect(posts).toHaveLength(0);
  });

  it("approval buttons (approve-priced_boq/reject-priced_boq) still exist alongside the review panel", async () => {
    stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      if (url.endsWith("/priced-boq/review") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: reviewablePriced() }));
      }
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    expect(await screen.findByTestId("approve-priced_boq")).toBeInTheDocument();
    expect(screen.getByTestId("reject-priced_boq")).toBeInTheDocument();
  });

  it("shows a controlled error and no stack when the GET review throws", async () => {
    const secret = "priced-review-get-boom-internal";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
          return Promise.reject(new Error(secret));
        }
        return Promise.resolve(jsonResponse({ workspace: reviewablePriced() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });

    const err = await screen.findByTestId("priced-review-error");
    expect(err).toHaveTextContent("Unable to load the priced BoQ review.");
    expect(document.body.textContent ?? "").not.toContain(secret);
    expect(screen.queryByTestId("priced-review-summary")).toBeNull();
  });

  it("shows a controlled error when GET returns a non-ok status", async () => {
    stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse({ code: "invalid_priced_boq_payload", error: "Payload is invalid." }, 409);
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });

    const err = await screen.findByTestId("priced-review-error");
    expect(err).toHaveTextContent("Payload is invalid.");
  });

  it("does not render review payload canary fields (unitListPriceSarBySku, originalCells) in the DOM", async () => {
    stubFetch((url, init) => {
      if (PRICED_REVIEW_ROUTE_RE.test(url) && (!init?.method || init.method === "GET")) {
        return jsonResponse(pricedReviewOkResponse());
      }
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: reviewablePriced() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("priced-review-load");
    await act(async () => { fireEvent.click(screen.getByTestId("priced-review-load")); });
    await screen.findByTestId("priced-review-summary");

    const body = document.body.textContent ?? "";
    expect(body).not.toContain(PRICED_REVIEW_CANARY);
    expect(body).not.toContain(PAYLOAD_CANARY);
    expect(body).not.toContain("unitListPriceSarBySku");
    expect(body).not.toContain("originalCells");
    expect(body).not.toContain("ORIGINALCELLS-CANARY");
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

// -- archived (read-only) fixtures (QBM-LOG-006) --
const ARCHIVED_AT = "2026-05-25T12:00:00.000Z";

function archivedBase(): Record<string, unknown> {
  const ws = baseWorkspace();
  (ws.project as Record<string, unknown>).archivedAt = ARCHIVED_AT;
  return ws;
}

function archivedFull(): Record<string, unknown> {
  const ws = fullWorkspace();
  (ws.project as Record<string, unknown>).archivedAt = ARCHIVED_AT;
  return ws;
}

describe("ProjectQuickBomPage - archived (read-only)", () => {
  it("shows the archived notice and hides upload + create controls", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: archivedFull() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.getByTestId("archived-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-upload-file")).toBeNull();
    expect(screen.queryByTestId("workflow-upload-normalize")).toBeNull();
    expect(screen.queryByTestId("workflow-create-sku_resolution")).toBeNull();
    expect(screen.queryByTestId("workflow-create-export_package")).toBeNull();
  });

  it("hides artifact approve/reject controls when archived but keeps artifact rows", async () => {
    // baseWorkspace configuration_expansion is `generated` -> normally approvable.
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: archivedBase() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    expect(screen.queryByTestId("approve-configuration_expansion")).toBeNull();
    expect(screen.queryByTestId("reject-configuration_expansion")).toBeNull();
    // Artifact rows themselves stay visible (read-only inspection).
    expect(screen.getByTestId("spine-configuration_expansion")).toBeInTheDocument();
  });

  it("keeps the approved export package download visible when archived", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: archivedFull() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    const link = await screen.findByTestId("download-export_package");
    expect(link).toHaveAttribute(
      "href",
      "/api/projects/proj-1/quick-bom/artifacts/art-export/export-package/download"
    );
  });

  it("hides the editable SKU line-review panel for an archived needs_review artifact", async () => {
    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: archivedBase() });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // baseWorkspace sku_resolution is needs_review (editable) -> hidden when archived.
    expect(screen.queryByTestId("sku-review-load")).toBeNull();
  });

  it("priced BoQ review copy does not reference hidden approval controls when archived", async () => {
    const ws = archivedBase();
    const sa = spineOf(ws);
    (sa.sku_resolution as Record<string, unknown>).status = "approved";
    (sa.configuration_expansion as Record<string, unknown>).status = "approved";
    sa.priced_boq = artifact("art-priced", "priced_boq", "needs_review", "boq_pricing_review");

    stubFetch((url) => {
      if (url.endsWith("/quick-bom")) return jsonResponse({ workspace: ws });
      return jsonResponse({}, 404);
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");

    // The priced review panel remains (read-only) but must not tell the user to use
    // the Approve / Reject controls, which are hidden while archived.
    const panel = screen.getByText(/Inspect priced BoQ lines/);
    expect(panel.textContent ?? "").not.toMatch(/Approve \/ Reject/);
    expect(panel.textContent ?? "").toMatch(/hidden until it is restored/);
    // The priced approve/reject buttons are hidden.
    expect(screen.queryByTestId("approve-priced_boq")).toBeNull();
  });
});
