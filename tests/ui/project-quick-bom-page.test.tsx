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

// Stub fetch with a handler and capture every call for body/url assertions.
function stubFetch(
  handler: (url: string, init?: RequestInit) => Response
): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
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

describe("ProjectQuickBomPage - approval gating", () => {
  beforeEach(() => {
    stubDefault();
  });

  it("never shows approve or reject buttons for normalized_boq", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.queryByTestId("approve-normalized_boq")).toBeNull();
    expect(screen.queryByTestId("reject-normalized_boq")).toBeNull();
  });

  it("shows approve and reject buttons for a reviewable sku_resolution artifact", async () => {
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("project-name");
    expect(screen.getByTestId("approve-sku_resolution")).toBeInTheDocument();
    expect(screen.getByTestId("reject-sku_resolution")).toBeInTheDocument();
  });
});

describe("ProjectQuickBomPage - approve and reject POSTs", () => {
  it("approve posts the exact artifactId with decision approved to the approvals route", async () => {
    const calls = stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post!.url).toMatch(/\/api\/projects\/proj-1\/quick-bom\/approvals$/);
    expect(post!.body).toEqual({ artifactId: "art-sku", decision: "approved" });
  });

  it("reject prompts for a note and posts the exact artifactId with decision rejected and the note", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Wrong part mapping");
    const calls = stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("reject-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("reject-sku_resolution"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    expect(window.prompt).toHaveBeenCalledTimes(1);
    const post = calls.find((c) => c.method === "POST");
    expect(post!.body).toEqual({
      artifactId: "art-sku",
      decision: "rejected",
      note: "Wrong part mapping",
    });
  });

  it("omits the note when the reject prompt is blank or cancelled but still posts", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("   ");
    const calls = stubDefault();
    render(<ProjectQuickBomPage />);
    await screen.findByTestId("reject-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("reject-sku_resolution"));
    });
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST");
    expect(post!.body).toEqual({ artifactId: "art-sku", decision: "rejected" });
  });

  it("refreshes the rendered workspace from a successful ok-shaped approval response", async () => {
    const refreshed = baseWorkspace();
    (refreshed.project as Record<string, unknown>).name = "Honeywell Quick BoM REFRESHED";
    ((refreshed.spineArtifacts as Record<string, Record<string, unknown>>).sku_resolution).status =
      "approved";

    stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "ok", workspace: refreshed }));
      }
      return jsonResponse({ workspace: baseWorkspace() });
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });

    expect(await screen.findByText("Honeywell Quick BoM REFRESHED")).toBeInTheDocument();
    // sku_resolution is now approved, so its reviewable buttons are gone.
    expect(screen.queryByTestId("approve-sku_resolution")).toBeNull();
  });

  it("reloads the GET workspace when the approval response has no ok workspace", async () => {
    const reloaded = baseWorkspace();
    (reloaded.project as Record<string, unknown>).name = "Honeywell Quick BoM RELOADED";
    let getCount = 0;

    stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(okApproval({ status: "wrong_mode" }));
      }
      getCount += 1;
      return jsonResponse({ workspace: getCount === 1 ? baseWorkspace() : reloaded });
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
    });

    expect(await screen.findByText("Honeywell Quick BoM RELOADED")).toBeInTheDocument();
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

describe("ProjectQuickBomPage - approval failures (distinct, no stack)", () => {
  it("shows the approval error from a non-ok approval response and keeps the workspace", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/quick-bom/approvals") && init?.method === "POST") {
        return jsonResponse(
          { code: "artifact_not_reviewable", error: "Artifact is not reviewable." },
          409
        );
      }
      return jsonResponse({ workspace: baseWorkspace() });
    });

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
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
        return Promise.resolve(jsonResponse({ workspace: baseWorkspace() }));
      })
    );

    render(<ProjectQuickBomPage />);
    await screen.findByTestId("approve-sku_resolution");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-sku_resolution"));
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

  it("issues only POST writes, and only to the approvals route", () => {
    expect(source).toContain("/quick-bom/approvals");
    expect(source).toContain('method: "POST"');
    expect(source).not.toContain('method: "PATCH"');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain('method: "DELETE"');
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
