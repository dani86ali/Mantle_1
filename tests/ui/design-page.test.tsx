import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import DesignPage from "@/app/estimates/[id]/design/page";
import type {
  DesignApproach, SizingResult, CompatibilityResult, HLDSection,
} from "@/engines/e5/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abcdef0123456789" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const HUB_OK = { estimate: { id: "abcdef0123456789", status: "DRAFT" }, e1: null, e2: null, e3: null, pipeline: null };

const APPROACH: DesignApproach = {
  methodology: "ppdioo", approach: "top_down",
  frameworks: ["ppdioo", "cisco_safe"],
  topologyPattern: "three_tier_core_dist_access",
  vendor: "cisco", projectType: "campus_refresh",
};

const SIZING: SizingResult = {
  coreDevices: [{ role: "core", model: "C9500-48Y4C", vendor: "cisco", quantity: 2, reasoning: "Redundant pair" }],
  distributionDevices: [{ role: "distribution", model: "C9500-24Y4C", vendor: "cisco", quantity: 4, reasoning: "Per floor" }],
  accessDevices: [{ role: "access", model: "C9300-48P", vendor: "cisco", quantity: 12, reasoning: "Edge ports" }],
  firewalls: [], wirelessControllers: [], accessPoints: [],
};

const COMPAT: CompatibilityResult = {
  valid: false,
  errors: [{ rule: "psu-redundancy", device: "C9500-48Y4C", message: "Missing redundant PSU", severity: "error" }],
  warnings: [{ rule: "eox-check", device: "C9300-48P", message: "End-of-sale soon", severity: "warning" }],
};

const HLD_SECTIONS: HLDSection[] = Array.from({ length: 12 }, (_, i) => ({
  sectionNumber: i + 1, title: `HLD Section ${i + 1}`, content: `Content for section ${i + 1}.`,
}));

const DESIGN_OK = {
  status: "hld_complete" as const,
  designApproach: APPROACH,
  topology: "three_tier_core_dist_access",
  sizingResult: SIZING,
  compatibilityResult: COMPAT,
  hldSections: HLD_SECTIONS,
  hldDocxPath: "/tmp/hld.docx",
  diagramXml: "<mxfile/>",
  lldSections: null,
  lldDocxPath: null,
  ipVlanPlan: null,
  componentList: null,
  revisionNotes: null,
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch((url) => {
    if (url.endsWith("/design")) return jsonResponse(DESIGN_OK);
    if (url.endsWith("/estimates/abcdef0123456789")) return jsonResponse(HUB_OK);
    return jsonResponse({}, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DesignPage", () => {
  it("shows loading skeleton initially", () => {
    let resolve: (v: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { container } = render(<DesignPage />);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    resolve(jsonResponse(DESIGN_OK));
  });

  it("renders input form when no design exists (404)", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/design")) return jsonResponse({ error: "not generated" }, 404);
      return jsonResponse(HUB_OK);
    }));
    render(<DesignPage />);
    expect(await screen.findByText(/Start Network Design/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Design/ })).toBeInTheDocument();
  });

  it("shows phase badge reflecting design status", async () => {
    render(<DesignPage />);
    const badge = await screen.findByTestId("phase-badge");
    expect(badge.textContent).toMatch(/hld complete/);
  });

  it("Tab 1 renders design approach data", async () => {
    render(<DesignPage />);
    expect(await screen.findByRole("heading", { name: /Design Approach/ })).toBeInTheDocument();
    expect(screen.getAllByText(/ppdioo/).length).toBeGreaterThan(0);
    expect(screen.getByText(/top down/)).toBeInTheDocument();
    expect(screen.getByText(/three tier core dist access/)).toBeInTheDocument();
  });

  it("Tab 2 renders sizing rows + compatibility errors and warnings", async () => {
    render(<DesignPage />);
    await screen.findByRole("heading", { name: /Design Approach/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sizing & Compatibility/ })); });
    expect(screen.getByText("C9500-48Y4C")).toBeInTheDocument();
    expect(screen.getByText("C9300-48P")).toBeInTheDocument();
    expect(screen.getByTestId("issues-error")).toBeInTheDocument();
    expect(screen.getByTestId("issues-warning")).toBeInTheDocument();
    expect(screen.getByText(/Missing redundant PSU/)).toBeInTheDocument();
    expect(screen.getByText(/End-of-sale soon/)).toBeInTheDocument();
  });

  it("Tab 3 renders all 12 HLD section titles", async () => {
    render(<DesignPage />);
    await screen.findByRole("heading", { name: /Design Approach/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^HLD$/ })); });
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`HLD Section ${i}`)).toBeInTheDocument();
    }
  });

  it("Approve HLD calls PATCH with action=approve_hld", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      calls.push({
        url, method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (url.endsWith("/design") && init?.method === "PATCH") {
        return jsonResponse({ status: "lld_complete" });
      }
      if (url.endsWith("/design")) return jsonResponse(DESIGN_OK);
      return jsonResponse(HUB_OK);
    }));
    render(<DesignPage />);
    await screen.findByRole("heading", { name: /Design Approach/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^HLD$/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Approve HLD/ })); });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(patch!.body).toMatchObject({ action: "approve_hld" });
  });

  it("Revise opens textarea and submits PATCH with revisionNotes", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      calls.push({
        url, method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (url.endsWith("/design") && init?.method === "PATCH") {
        return jsonResponse({ status: "hld_in_progress" });
      }
      if (url.endsWith("/design")) return jsonResponse(DESIGN_OK);
      return jsonResponse(HUB_OK);
    }));
    render(<DesignPage />);
    await screen.findByRole("heading", { name: /Design Approach/ });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Revise Design/ })); });
    const ta = screen.getByLabelText(/Revision notes/) as HTMLTextAreaElement;
    await act(async () => { fireEvent.change(ta, { target: { value: "Need redundancy on edge" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Submit Revision/ })); });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(patch!.body).toMatchObject({ action: "revise_design", revisionNotes: "Need redundancy on edge" });
  });
});
