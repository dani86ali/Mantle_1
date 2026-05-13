import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import QuestionnairePage from "@/app/estimates/[id]/questionnaire/page";
import type { QuestionnaireSection } from "@/engines/e4/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abcdef0123456789" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const SECTIONS: QuestionnaireSection[] = [
  {
    id: "A",
    title: "Business Context",
    description: "Industry, scope.",
    questions: [
      {
        id: "A.1",
        text: "What is the target deployment date?",
        section: "A",
        priority: "required",
        responseType: "text",
      },
    ],
  },
  {
    id: "B",
    title: "Current-State Network",
    description: "WAN/LAN/DC.",
    questions: [
      {
        id: "B.1",
        text: "How many sites?",
        section: "B",
        priority: "recommended",
        responseType: "number",
      },
    ],
  },
];

const QUESTIONNAIRE_OK = {
  questionnaire: SECTIONS,
  markdown: "# Discovery\nA.1 ...",
  projectType: "campus_refresh" as const,
  status: "draft" as const,
};


const HUB_OK = {
  estimate: { id: "abcdef0123456789", status: "DRAFT" },
  e1: null,
  e2: null,
  e3: null,
  pipeline: null,
};

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch((url) => {
    if (url.endsWith("/questionnaire")) return jsonResponse(QUESTIONNAIRE_OK);
    if (url.endsWith(`/estimates/abcdef0123456789`)) return jsonResponse(HUB_OK);
    return jsonResponse({}, 404);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuestionnairePage", () => {
  it("renders skeleton then section content", async () => {
    render(<QuestionnairePage />);
    // skeleton has no real section names yet
    expect(screen.queryByText(/Business Context/)).toBeNull();
    expect(await screen.findByText(/Business Context/)).toBeInTheDocument();
    expect(screen.getByText(/Current-State Network/)).toBeInTheDocument();
    expect(screen.getByText(/What is the target deployment date\?/)).toBeInTheDocument();
    expect(screen.getByText(/campus refresh/)).toBeInTheDocument();
  });

  it("approve flow sends PATCH with status=approved", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (url.endsWith("/questionnaire") && (init?.method === "PATCH")) {
        return jsonResponse({ status: "approved", updatedAt: "now", revisionNotes: null });
      }
      if (url.endsWith("/questionnaire")) return jsonResponse(QUESTIONNAIRE_OK);
      return jsonResponse(HUB_OK);
    }));
    render(<QuestionnairePage />);
    await screen.findByText(/Business Context/);
    const btn = screen.getByRole("button", { name: /Approve & Send/ });
    await act(async () => { fireEvent.click(btn); });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(patch!.body).toMatchObject({ status: "approved" });
    expect(await screen.findByText(/Questionnaire approved/)).toBeInTheDocument();
  });

  it("revision flow prompts for notes and PATCHes with revisionNotes", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Need more detail on section B");
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (url.endsWith("/questionnaire") && init?.method === "PATCH") {
        return jsonResponse({ status: "approved", updatedAt: "now", revisionNotes: "Need more detail on section B" });
      }
      if (url.endsWith("/questionnaire")) return jsonResponse(QUESTIONNAIRE_OK);
      return jsonResponse(HUB_OK);
    }));
    render(<QuestionnairePage />);
    await screen.findByText(/Business Context/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Request Revision/ })); });
    expect(promptSpy).toHaveBeenCalled();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch!.body).toMatchObject({ revisionNotes: "Need more detail on section B" });
  });

  it("renders empty state with Generate Now CTA when questionnaire is 404", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/questionnaire")) return jsonResponse({ error: "not generated" }, 404);
      return jsonResponse(HUB_OK);
    }));
    render(<QuestionnairePage />);
    expect(await screen.findByText(/No questionnaire generated yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Now/ })).toBeInTheDocument();
  });

  it("shows loading skeleton initially", () => {
    let resolve: (v: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { container } = render(<QuestionnairePage />);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    resolve(jsonResponse(QUESTIONNAIRE_OK));
  });
});
