import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import NewProjectQuickBomPage from "@/app/projects/quick-bom/new/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const PROJECT_ID = "proj-77";
const FILE_ID = "file-9";

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

// Default happy-path handler: create -> upload -> normalize all succeed.
function stubHappy(): Recorded[] {
  return stubFetch((url, init) => {
    if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
      return jsonResponse({ project: { id: PROJECT_ID } }, 201);
    }
    if (url.endsWith(`/projects/${PROJECT_ID}/quick-bom/files`) && init?.method === "POST") {
      return jsonResponse({ file: { id: FILE_ID } }, 201);
    }
    if (
      url.endsWith(`/quick-bom/files/${FILE_ID}/normalize`) &&
      init?.method === "POST"
    ) {
      return jsonResponse({ artifact: { id: "art-x" } }, 201);
    }
    return jsonResponse({}, 404);
  });
}

function fillForm() {
  fireEvent.change(screen.getByTestId("field-name"), {
    target: { value: "Acme Quick BoM" },
  });
  fireEvent.change(screen.getByTestId("field-customer"), {
    target: { value: "Acme" },
  });
  fireEvent.change(screen.getByTestId("field-rate"), { target: { value: "18" } });
  fireEvent.change(screen.getByTestId("field-vat"), { target: { value: "15" } });
}

function selectFile() {
  const file = new File(["sku,qty\nABC,1"], "boq.csv", { type: "text/csv" });
  fireEvent.change(screen.getByTestId("field-file"), {
    target: { files: [file] },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});

describe("NewProjectQuickBomPage - happy path", () => {
  it("creates the project, uploads the file, normalizes, then routes to the workspace", async () => {
    const calls = stubHappy();
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/quick-bom`)
    );

    const createIdx = calls.findIndex(
      (c) => c.url.endsWith("/api/projects/quick-bom") && c.method === "POST"
    );
    const uploadIdx = calls.findIndex(
      (c) =>
        c.url.endsWith(`/projects/${PROJECT_ID}/quick-bom/files`) &&
        c.method === "POST"
    );
    const normIdx = calls.findIndex(
      (c) =>
        c.url.endsWith(`/quick-bom/files/${FILE_ID}/normalize`) &&
        c.method === "POST"
    );
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(uploadIdx).toBeGreaterThan(createIdx);
    expect(normIdx).toBeGreaterThan(uploadIdx);

    // Upload sends exactly one "file" FormData field; normalize sends no body.
    expect(calls[uploadIdx].body).toBeInstanceOf(FormData);
    expect((calls[uploadIdx].body as FormData).getAll("file")).toHaveLength(1);
    expect(calls[normIdx].body).toBeNull();
  });

  it("defaults to pass-through pricing and posts markup 0 / VAT 15 when pricing is untouched", async () => {
    const calls = stubHappy();
    render(<NewProjectQuickBomPage />);

    // The pricing fields default to pass-through and are left untouched here.
    expect((screen.getByTestId("field-mode") as HTMLSelectElement).value).toBe(
      "markup"
    );
    expect((screen.getByTestId("field-rate") as HTMLInputElement).value).toBe("0");
    expect((screen.getByTestId("field-vat") as HTMLInputElement).value).toBe("15");

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Acme Quick BoM" },
    });
    fireEvent.change(screen.getByTestId("field-customer"), {
      target: { value: "Acme" },
    });
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });
    await waitFor(() => expect(push).toHaveBeenCalled());

    const create = calls.find(
      (c) => c.url.endsWith("/api/projects/quick-bom") && c.method === "POST"
    );
    expect(create!.body).toEqual({
      name: "Acme Quick BoM",
      customerName: "Acme",
      pricingConfig: {
        mode: "markup",
        ratePercent: 0,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    });
  });

  it("respects user-edited pricing and sends percent numbers directly with roundingDecimals 2", async () => {
    const calls = stubHappy();
    render(<NewProjectQuickBomPage />);

    fillForm();
    fireEvent.change(screen.getByTestId("field-mode"), {
      target: { value: "margin" },
    });
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });
    await waitFor(() => expect(push).toHaveBeenCalled());

    const create = calls.find(
      (c) => c.url.endsWith("/api/projects/quick-bom") && c.method === "POST"
    );
    expect(create!.body).toEqual({
      name: "Acme Quick BoM",
      customerName: "Acme",
      pricingConfig: {
        mode: "margin",
        ratePercent: 18,
        vatRatePercent: 15,
        roundingDecimals: 2,
      },
    });
  });
});

describe("NewProjectQuickBomPage - controlled errors", () => {
  it("blocks submit and shows an error when no file is selected", async () => {
    const calls = stubHappy();
    render(<NewProjectQuickBomPage />);

    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(screen.getByTestId("form-error")).toHaveTextContent(
      "Select a BoQ file to upload first."
    );
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the create error and does not upload when create fails", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
        return jsonResponse(
          { code: "x", error: "Create rejected." },
          400
        );
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Create rejected."
    );
    expect(
      calls.some((c) => c.url.includes("/quick-bom/files"))
    ).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the duplicate-name error and does not upload or normalize when create is rejected (QBM-LOG-001)", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
        return jsonResponse(
          {
            code: "duplicate_project_name",
            error:
              "Duplicate Project Name. Test #1 already exists in your projects.",
          },
          400
        );
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Duplicate Project Name. Test #1 already exists in your projects."
    );
    expect(calls.some((c) => c.url.includes("/quick-bom/files"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/normalize"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the upload error and does not normalize when upload fails", async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
        return jsonResponse({ project: { id: PROJECT_ID } }, 201);
      }
      if (url.endsWith(`/quick-bom/files`) && init?.method === "POST") {
        return jsonResponse({ error: "Upload rejected." }, 400);
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Upload rejected."
    );
    expect(calls.some((c) => c.url.includes("/normalize"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the normalize error and does not route when normalize fails", async () => {
    stubFetch((url, init) => {
      if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
        return jsonResponse({ project: { id: PROJECT_ID } }, 201);
      }
      if (url.endsWith(`/quick-bom/files`) && init?.method === "POST") {
        return jsonResponse({ file: { id: FILE_ID } }, 201);
      }
      if (url.endsWith("/normalize") && init?.method === "POST") {
        return jsonResponse({ error: "Normalize rejected." }, 400);
      }
      return jsonResponse({}, 404);
    });
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Normalize rejected."
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the create error (not upload or normalize error) when the create fetch throws", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
          return Promise.reject(new Error("network down"));
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to create the Quick BoM project."
    );
    expect(calls.some((u) => u.includes("/quick-bom/files"))).toBe(false);
    expect(calls.some((u) => u.includes("/normalize"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the upload error (not create or normalize error) when the upload fetch throws", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
          return Promise.resolve(jsonResponse({ project: { id: PROJECT_ID } }, 201));
        }
        if (url.endsWith("/quick-bom/files") && init?.method === "POST") {
          return Promise.reject(new Error("upload network down"));
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to upload the BoQ file."
    );
    expect(calls.some((u) => u.includes("/normalize"))).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the normalize error (not create or upload error) when the normalize fetch throws", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url.endsWith("/api/projects/quick-bom") && init?.method === "POST") {
          return Promise.resolve(jsonResponse({ project: { id: PROJECT_ID } }, 201));
        }
        if (url.endsWith("/quick-bom/files") && init?.method === "POST") {
          return Promise.resolve(jsonResponse({ file: { id: FILE_ID } }, 201));
        }
        if (url.endsWith("/normalize") && init?.method === "POST") {
          return Promise.reject(new Error("normalize network down"));
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    render(<NewProjectQuickBomPage />);

    fillForm();
    selectFile();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit"));
    });

    expect(await screen.findByTestId("form-error")).toHaveTextContent(
      "Unable to normalize the uploaded BoQ file."
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe("NewProjectQuickBomPage - static source purity", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/quick-bom/new/page.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not import DB, stores, pricing, config-expansion, runner, coordinator, engines, adapters, catalog, AI, or legacy intake helpers", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/lib/projects/project-store',
      'from "@/lib/projects/artifact',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
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
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("posts only to the canonical Project Quick BoM routes", () => {
    expect(source).toContain('method: "POST"');
    expect(source).toContain("/api/projects/quick-bom");
    expect(source).toContain("/quick-bom/files");
    expect(source).toContain("/normalize");
    expect(source).not.toContain('method: "PATCH"');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain('method: "DELETE"');
  });

  it("keeps the source ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
