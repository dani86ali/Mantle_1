import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import DashboardPage from "@/app/dashboard/page";
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
      approved: 1,
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

describe("DashboardPage", () => {
  it("loads canonical Projects and links Quick BoM rows to the Project workspace", async () => {
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

    render(<DashboardPage />);

    expect(await screen.findAllByText("Alpha Quick BoM")).toHaveLength(2);
    expect(screen.getAllByText("Beta RFP")).toHaveLength(2);
    expect(screen.getByText("Total Projects")).toBeInTheDocument();
    expect(screen.getByText("Recent Projects")).toBeInTheDocument();
    expect(screen.getByText("Project Activity")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Alpha Quick BoM" })
        .some((link) => link.getAttribute("href") === "/projects/proj-qbm/quick-bom")
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Beta RFP" })
        .some((link) => link.getAttribute("href") === "/projects/proj-rfp/rfp")
    ).toBe(true);
    expect(calls).toEqual(["/api/projects"]);
    expect(calls.some((url) => url.includes("/api/estimates"))).toBe(false);
  });

  it("renders an approved Quick BoM as Approved, 5/5, and completed activity (QBM-LOG-002A)", async () => {
    stubFetch([
      project({
        id: "proj-qbm",
        name: "Alpha Quick BoM",
        mode: "quick_bom",
        status: "approved",
        activeStageId: "export_approval",
        activeStageStatus: "approved",
        stageCounts: {
          total: 5,
          approved: 5,
          needsReview: 0,
          inProgress: 0,
          blocked: 0,
          rejected: 0,
        },
      }),
    ]);

    const { container } = render(<DashboardPage />);

    expect(await screen.findAllByText("Alpha Quick BoM")).not.toHaveLength(0);
    // Status badge + progress count reflect a completed deliverable. ("Approved"
    // also labels the stats card, so assert at least one occurrence.)
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getByText("5/5")).toBeInTheDocument();
    // Activity feed renders "completed", never a running/spinning state.
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("renders a Project-centered empty state", async () => {
    stubFetch([]);

    render(<DashboardPage />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Quick BoM Project" })).toHaveAttribute(
      "href",
      "/projects/quick-bom/new"
    );
  });
});

describe("DashboardPage static source checks", () => {
  const SRC_PATH = join(process.cwd(), "src/app/dashboard/page.tsx");
  const TEST_PATH = join(process.cwd(), "tests/ui/dashboard-page.test.tsx");
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
