import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
      "/projects/proj-rfp"
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

describe("ProjectsPage static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/projects/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/projects-page.test.tsx");
  const source = readFileSync(SRC_PATH, "utf8");

  it("uses the Project listing API, not legacy estimate APIs", () => {
    expect(source).toContain('fetch("/api/projects")');
    expect(source).not.toContain("/api/estimates");
    expect(source).not.toMatch(/\bEstimates\b/);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
