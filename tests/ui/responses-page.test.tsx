import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ResponsesPage from "@/app/estimates/[id]/responses/page";
import type {
  ClientResponse,
  RequirementsBaseline,
  QuestionnaireSection,
} from "@/engines/e4/types";
import type { EnhancedGapAnalysis } from "@/engines/e4/gap-detector-ai";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abcdef0123456789" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const RESPONSES: ClientResponse[] = [
  { questionId: "A.1", answer: "Q4 2026", source: "structured", confidence: 0.95 },
  { questionId: "B.1", answer: "About fifty sites", source: "free_text", confidence: 0.6 },
];

const GAPS: EnhancedGapAnalysis = {
  completeQuestions: ["A.1"],
  incompleteQuestions: ["A.2"],
  vagueAnswers: [{ questionId: "B.1", answer: "About fifty sites", reason: "Imprecise count" }],
  missingCategories: ["E"],
  contradictions: [{ questionIds: ["A.1", "B.1"], description: "Timeline vs scope mismatch" }],
  unstatedAssumptions: ["Assumes existing fiber"],
};

const BASELINE: RequirementsBaseline = {
  business: [
    { id: "BR-1", text: "Reduce downtime", source: "A.1", priority: "critical", validated: true },
  ],
  functional: [
    { id: "FR-1", text: "Support 50 sites", source: "B.1", priority: "high", validated: false },
  ],
  nonFunctional: [],
  constraints: [],
  assumptions: [],
};

const QUESTIONNAIRE_SECTIONS: QuestionnaireSection[] = [
  {
    id: "A", title: "Business", description: "",
    questions: [
      { id: "A.1", text: "When is launch?", section: "A", priority: "required", responseType: "text" },
      { id: "A.2", text: "Budget?", section: "A", priority: "required", responseType: "number" },
    ],
  },
  {
    id: "B", title: "Network", description: "",
    questions: [
      { id: "B.1", text: "How many sites?", section: "B", priority: "required", responseType: "number" },
    ],
  },
];

const RESPONSES_OK = {
  responses: RESPONSES,
  gaps: GAPS,
  baseline: BASELINE,
  status: "processed" as const,
};

const HUB_OK = {
  estimate: { id: "abcdef0123456789", status: "DRAFT" },
  e1: null, e2: null, e3: null, pipeline: null,
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
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

function defaultHandler(url: string): Response {
  if (url.endsWith("/responses")) return jsonResponse(RESPONSES_OK);
  if (url.endsWith("/questionnaire")) return jsonResponse({ questionnaire: QUESTIONNAIRE_SECTIONS });
  if (url.endsWith(`/estimates/abcdef0123456789`)) return jsonResponse(HUB_OK);
  return jsonResponse({}, 404);
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch(defaultHandler));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ResponsesPage", () => {
  it("renders the responses table by default", async () => {
    render(<ResponsesPage />);
    expect(await screen.findByText("Q4 2026")).toBeInTheDocument();
    expect(screen.getByText(/About fifty sites/)).toBeInTheDocument();
    expect(screen.getByText("structured")).toBeInTheDocument();
    expect(screen.getByText(/free text/)).toBeInTheDocument();
  });

  it("switches to gaps tab and shows incomplete, vague, contradiction, assumption entries", async () => {
    render(<ResponsesPage />);
    await screen.findByText("Q4 2026");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Gaps$/ }));
    });
    expect(screen.getByText(/Incomplete \(required, unanswered\)/)).toBeInTheDocument();
    expect(screen.getByText(/Imprecise count/)).toBeInTheDocument();
    expect(screen.getByText(/Timeline vs scope mismatch/)).toBeInTheDocument();
    expect(screen.getByText(/Assumes existing fiber/)).toBeInTheDocument();
  });

  it("switches to baseline tab and groups by category", async () => {
    render(<ResponsesPage />);
    await screen.findByText("Q4 2026");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Requirements Baseline/ }));
    });
    expect(screen.getByRole("heading", { level: 3, name: "Business" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Functional" })).toBeInTheDocument();
    expect(screen.getByText("Reduce downtime")).toBeInTheDocument();
    expect(screen.getByText("Support 50 sites")).toBeInTheDocument();
  });

  it("shows upload panel when responses are not yet processed (404)", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.endsWith("/responses")) return jsonResponse({ error: "not processed" }, 404);
      if (url.endsWith("/questionnaire")) return jsonResponse({ questionnaire: QUESTIONNAIRE_SECTIONS });
      return jsonResponse(HUB_OK);
    }));
    render(<ResponsesPage />);
    expect(await screen.findByText(/Upload responses/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste client response text/)).toBeInTheDocument();
  });

  it("submits typed text via POST when uploading", async () => {
    const calls: Array<{ url: string; method: string; bodyKind: string }> = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      const bodyKind = init?.body instanceof FormData ? "form" : typeof init?.body === "string" ? "json" : "none";
      calls.push({ url, method, bodyKind });
      if (url.endsWith("/responses") && method === "POST") {
        return jsonResponse({ responses: RESPONSES, gaps: GAPS, baseline: BASELINE });
      }
      if (url.endsWith("/responses")) return jsonResponse({ error: "not processed" }, 404);
      if (url.endsWith("/questionnaire")) return jsonResponse({ questionnaire: QUESTIONNAIRE_SECTIONS });
      return jsonResponse(HUB_OK);
    }));
    render(<ResponsesPage />);
    const textarea = await screen.findByPlaceholderText(/Paste client response text/);
    fireEvent.change(textarea, { target: { value: "All sites use fiber." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Process Text/ }));
    });
    const post = calls.find((c) => c.method === "POST");
    expect(post).toBeTruthy();
    expect(post!.bodyKind).toBe("json");
    expect(await screen.findByText(/Responses processed/)).toBeInTheDocument();
  });

  it("shows loading skeleton initially", () => {
    let resolve: (v: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { container } = render(<ResponsesPage />);
    expect(container.querySelector(".skeleton")).not.toBeNull();
    resolve(jsonResponse(RESPONSES_OK));
  });
});
