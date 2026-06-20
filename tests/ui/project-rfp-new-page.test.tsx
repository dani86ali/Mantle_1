import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import NewProjectRfpPage from "@/app/projects/rfp/new/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const PROJECT_ID = "proj-rfp-1";

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

// Default happy-path handler: the single create call succeeds with a Project id.
function stubHappy(): Recorded[] {
  return stubFetch((url, init) => {
    if (url.endsWith("/api/projects/rfp") && init?.method === "POST") {
      return jsonResponse({ project: { id: PROJECT_ID }, stages: [] }, 201);
    }
    return jsonResponse({}, 404);
  });
}

function fillForm() {
  fireEvent.change(screen.getByTestId("field-name"), {
    target: { value: "Acme RFP" },
  });
  fireEvent.change(screen.getByTestId("field-customer"), {
    target: { value: "Acme" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});

describe("NewProjectRfpPage - rendering", () => {
  it("renders the RFP creation form with name and customer fields only", () => {
    stubHappy();
    render(<NewProjectRfpPage />);

    expect(screen.getByTestId("rfp-new-form")).toBeInTheDocument();
    expect(screen.getByTestId("field-name")).toBeInTheDocument();
    expect(screen.getByTestId("field-customer")).toBeInTheDocument();
    expect(screen.getByTestId("submit")).toBeInTheDocument();
    // The RFP shell intake carries no pricing or BoQ file controls.
    expect(screen.queryByTestId("field-mode")).toBeNull();
    expect(screen.queryByTestId("field-rate")).toBeNull();
    expect(screen.queryByTestId("field-vat")).toBeNull();
    expect(screen.queryByTestId("field-file")).toBeNull();
  });
});

describe("NewProjectRfpPage - happy path", () => {
  it("posts only name and customerName to /api/projects/rfp, then routes to the RFP workspace", async () => {
    const calls = stubHappy();
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/rfp`)
    );

    const create = calls.find(
      (c) => c.url.endsWith("/api/projects/rfp") && c.method === "POST"
    );
    expect(create).toBeDefined();
    // Exactly the shell fields - no pricingConfig, files, or catalog payload.
    expect(create!.body).toEqual({ name: "Acme RFP", customerName: "Acme" });
    // A single create call: no upload, normalize, or pricing follow-ups.
    expect(calls).toHaveLength(1);
  });
});

describe("NewProjectRfpPage - controlled errors", () => {
  it("surfaces a controlled API error from the response body and does not route", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/projects/rfp") && init?.method === "POST") {
        return jsonResponse(
          {
            code: "duplicate_project_name",
            error: "Duplicate Project Name. Acme RFP already exists.",
          },
          400
        );
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Duplicate Project Name. Acme RFP already exists."
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to the code when no error string is present", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/projects/rfp") && init?.method === "POST") {
        return jsonResponse({ code: "invalid_rfp_project_create_request" }, 400);
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "invalid_rfp_project_create_request"
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the generic create error when the success response is malformed", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/projects/rfp") && init?.method === "POST") {
        // 201 but no project id - a malformed success body.
        return jsonResponse({ project: {} }, 201);
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to create the RFP project."
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the generic create error when the create fetch rejects", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        return Promise.reject(new Error("network down"));
      })
    );
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to create the RFP project."
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a controlled navigation error when routing throws after create", async () => {
    stubHappy();
    push.mockImplementation(() => {
      throw new Error("route failed");
    });
    render(<NewProjectRfpPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to open the new RFP project."
    );
  });
});

describe("NewProjectRfpPage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/rfp/new/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/project-rfp-new-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not import DB, stores, pricing, config-expansion, runner, adapters, catalog, AI, or legacy intake helpers", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/lib/projects/project-store',
      'from "@/lib/projects/artifact',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "openai",
      "/api/intake",
      "/api/upload",
      "/estimates/",
      "pricingConfig",
      "/files",
      "/normalize",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("posts only to the canonical RFP create route and routes to the RFP workspace", () => {
    expect(source).toContain('method: "POST"');
    expect(source).toContain("/api/projects/rfp");
    expect(source).toContain("${projectId}/rfp");
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
