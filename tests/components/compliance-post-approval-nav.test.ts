import { describe, it, expect, vi } from "vitest";
import {
  pickNextRoute,
  hasBlockingClarifications,
} from "@/app/estimates/[id]/compliance/post-approval-nav";

function fakeFetcher(json: unknown, ok = true) {
  return vi.fn(async () =>
    ({
      ok,
      json: async () => json,
    }) as unknown as Response,
  );
}

describe("hasBlockingClarifications", () => {
  it("returns true when a critical question exists", () => {
    expect(
      hasBlockingClarifications({
        e1: { clarifications: { questions: [{ priority: "critical" }] } },
      }),
    ).toBe(true);
  });

  it("returns true when an important question exists", () => {
    expect(
      hasBlockingClarifications({
        e1: { clarifications: { questions: [{ priority: "important" }] } },
      }),
    ).toBe(true);
  });

  it("returns false when only nice_to_have questions exist", () => {
    expect(
      hasBlockingClarifications({
        e1: { clarifications: { questions: [{ priority: "nice_to_have" }] } },
      }),
    ).toBe(false);
  });

  it("returns false when no clarifications are present", () => {
    expect(hasBlockingClarifications({})).toBe(false);
    expect(hasBlockingClarifications({ e1: null })).toBe(false);
    expect(hasBlockingClarifications({ e1: { clarifications: { questions: [] } } })).toBe(false);
  });
});

describe("pickNextRoute", () => {
  it("returns Overview when advancing=false (no resume)", async () => {
    const fetcher = fakeFetcher({});
    const next = await pickNextRoute("est-1", false, fetcher);
    expect(next).toBe("/estimates/est-1");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns clarifications when advancing=true AND critical/important questions exist", async () => {
    const fetcher = fakeFetcher({
      e1: { clarifications: { questions: [{ priority: "critical" }] } },
    });
    const next = await pickNextRoute("est-2", true, fetcher);
    expect(next).toBe("/estimates/est-2/clarifications");
    expect(fetcher).toHaveBeenCalledWith("/api/estimates/est-2");
  });

  it("returns Overview when advancing=true AND no blocking clarifications", async () => {
    const fetcher = fakeFetcher({
      e1: { clarifications: { questions: [{ priority: "nice_to_have" }] } },
    });
    const next = await pickNextRoute("est-3", true, fetcher);
    expect(next).toBe("/estimates/est-3");
  });

  it("falls back to Overview when the estimate API errors", async () => {
    const fetcher = fakeFetcher({}, false);
    const next = await pickNextRoute("est-4", true, fetcher);
    expect(next).toBe("/estimates/est-4");
  });

  it("falls back to Overview when fetch rejects", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const next = await pickNextRoute("est-5", true, fetcher);
    expect(next).toBe("/estimates/est-5");
  });
});
