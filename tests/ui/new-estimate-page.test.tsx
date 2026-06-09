import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import NewEstimatePage from "@/app/estimate/new/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
});

describe("NewEstimatePage - Quick BoM diversion", () => {
  it("routes Quick BoM to the canonical Project page and never calls /api/intake", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<NewEstimatePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("Quick BoM"));
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/projects/quick-bom/new");
    // No legacy intake/estimate path is touched.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("/estimates/"));
    // The wizard did not advance past mode select for Quick BoM.
    expect(screen.getByText("How are you starting?")).toBeInTheDocument();
  });
});

describe("NewEstimatePage - RFP/RFI unchanged", () => {
  it("advances RFP into the legacy wizard without diverting", async () => {
    render(<NewEstimatePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("RFP Response"));
    });

    // Mode select is gone (advanced to step 2) and no diversion occurred.
    expect(screen.queryByText("How are you starting?")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("advances RFI into the legacy wizard without diverting", async () => {
    render(<NewEstimatePage />);
    await act(async () => {
      fireEvent.click(screen.getByText("RFI / Proactive"));
    });

    expect(screen.queryByText("How are you starting?")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
