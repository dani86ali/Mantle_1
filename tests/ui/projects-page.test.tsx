import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ProjectsPage from "@/app/projects/page";
import type { ProjectRow } from "@/app/dashboard/helpers";

function project(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    id: "proj-qbm",
    name: "Alpha Quick BoM",
    customerName: "Acme",
    mode: "quick_bom",
    status: "needs_review",
    activeStageId: "sku_resolution",
    activeStageStatus: "needs_review",
    stageCounts: {
      total: 5,
      approved: 2,
      needsReview: 1,
      inProgress: 0,
      blocked: 0,
      rejected: 0,
    },
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(projects: ProjectRow[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.endsWith("/api/projects")) {
        return Promise.resolve(jsonResponse({ projects }));
      }
      return Promise.resolve(jsonResponse({}, 404));
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectsPage", () => {
  it("loads Projects from the Project spine API and routes Quick BoM rows to the workspace", async () => {
    const calls = stubFetch([
      project({ id: "proj-qbm", name: "Alpha Quick BoM", mode: "quick_bom" }),
      project({
        id: "proj-rfp",
        name: "Beta RFP",
        customerName: "Beta",
        mode: "rfp",
        status: "approved",
        stageCounts: {
          total: 7,
          approved: 7,
          needsReview: 0,
          inProgress: 0,
          blocked: 0,
          rejected: 0,
        },
      }),
    ]);

    render(<ProjectsPage />);

    expect(await screen.findByText("Alpha Quick BoM")).toBeInTheDocument();
    expect(screen.getByText("Beta RFP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Quick BoM Project" })).toHaveAttribute(
      "href",
      "/projects/quick-bom/new"
    );
    expect(screen.getByRole("link", { name: "Alpha Quick BoM" })).toHaveAttribute(
      "href",
      "/projects/proj-qbm/quick-bom"
    );
    expect(screen.getByRole("link", { name: "Beta RFP" })).toHaveAttribute(
      "href",
      "/projects/proj-rfp/rfp"
    );
    expect(calls).toEqual(["/api/projects"]);
    expect(calls.some((url) => url.includes("/api/estimates"))).toBe(false);
  });

  it("filters Projects by name, customer, or id without changing routes", async () => {
    stubFetch([
      project({ id: "proj-qbm", name: "Alpha Quick BoM", customerName: "Acme" }),
      project({ id: "proj-rfp", name: "Beta RFP", customerName: "Beta" }),
    ]);

    render(<ProjectsPage />);
    await screen.findByText("Alpha Quick BoM");

    fireEvent.change(
      screen.getByPlaceholderText("Search projects by name, customer, or ID..."),
      { target: { value: "beta" } }
    );

    expect(screen.getByText("Beta RFP")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Quick BoM")).toBeNull();
  });
});

describe("ProjectsPage - archive views and actions (QBM-LOG-006)", () => {
  // Records URL + method for every call; active list, archived list, and the
  // archive/restore mutation routes are all served distinctly.
  function stubArchiveAware(active: ProjectRow[], archived: ProjectRow[]) {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.includes("/archive")) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }
        if (url.includes("archived=only")) {
          return Promise.resolve(jsonResponse({ projects: archived }));
        }
        if (url.endsWith("/api/projects")) {
          return Promise.resolve(jsonResponse({ projects: active }));
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    return calls;
  }

  it("active view fetches /api/projects and shows an Archive action", async () => {
    const calls = stubArchiveAware([project({ id: "proj-a", name: "Active One" })], []);

    render(<ProjectsPage />);
    await screen.findByText("Active One");

    expect(screen.getByTestId("archive-proj-a")).toBeInTheDocument();
    expect(screen.queryByTestId("restore-proj-a")).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["/api/projects"]);
  });

  it("archived view fetches /api/projects?archived=only and shows a Restore action", async () => {
    const calls = stubArchiveAware([], [project({ id: "proj-x", name: "Archived One" })]);

    render(<ProjectsPage />);
    fireEvent.click(screen.getByTestId("view-archived"));

    await screen.findByText("Archived One");
    expect(screen.getByTestId("restore-proj-x")).toBeInTheDocument();
    expect(screen.queryByTestId("archive-proj-x")).toBeNull();
    expect(calls.some((c) => c.url === "/api/projects?archived=only")).toBe(true);
  });

  it("archiving a row POSTs to the archive route and reloads the active list", async () => {
    const calls = stubArchiveAware([project({ id: "proj-a", name: "Active One" })], []);

    render(<ProjectsPage />);
    await screen.findByText("Active One");

    await act(async () => {
      fireEvent.click(screen.getByTestId("archive-proj-a"));
    });

    await waitFor(() =>
      expect(
        calls.some((c) => c.url === "/api/projects/proj-a/archive" && c.method === "POST")
      ).toBe(true)
    );
    // Reloaded the active list after the mutation.
    await waitFor(() =>
      expect(calls.filter((c) => c.url === "/api/projects").length).toBeGreaterThanOrEqual(2)
    );
  });

  it("restoring a row DELETEs the archive route", async () => {
    const calls = stubArchiveAware([], [project({ id: "proj-x", name: "Archived One" })]);

    render(<ProjectsPage />);
    fireEvent.click(screen.getByTestId("view-archived"));
    await screen.findByText("Archived One");

    await act(async () => {
      fireEvent.click(screen.getByTestId("restore-proj-x"));
    });

    await waitFor(() =>
      expect(
        calls.some((c) => c.url === "/api/projects/proj-x/archive" && c.method === "DELETE")
      ).toBe(true)
    );
  });

  it("shows a controlled error when an archive action fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/archive")) {
          return Promise.resolve(
            jsonResponse(
              { code: "duplicate_project_name", error: "Duplicate Project Name. X already exists in your active projects." },
              409
            )
          );
        }
        if (url.endsWith("/api/projects")) {
          return Promise.resolve(jsonResponse({ projects: [project({ id: "proj-a", name: "Active One" })] }));
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );

    render(<ProjectsPage />);
    await screen.findByText("Active One");

    await act(async () => {
      fireEvent.click(screen.getByTestId("archive-proj-a"));
    });

    expect(await screen.findByTestId("action-error")).toHaveTextContent(
      "Duplicate Project Name."
    );
  });
});

describe("ProjectsPage static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/projects-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("uses the Project listing API (active + archived), not legacy estimate APIs", () => {
    // The active list reads /api/projects; the archived view appends ?archived=only.
    expect(source).toContain('"/api/projects"');
    expect(source).toContain('"/api/projects?archived=only"');
    expect(source).not.toContain("/api/estimates");
    expect(source).not.toMatch(/\bEstimates\b/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
