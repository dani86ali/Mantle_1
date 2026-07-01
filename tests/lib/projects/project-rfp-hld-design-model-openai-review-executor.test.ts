import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  reviewRfpHldDesignModelOpenAiCandidate,
  type RfpHldDesignModelOpenAiReviewExecutor,
  type RfpHldDesignModelOpenAiReviewInput,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import { validateRfpHldDesignModelReviewPayload } from "@/lib/projects/project-rfp-hld-design-model-review";
import type { RfpHldDesignModelPayload as ModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import type { RfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";

const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEWED_BY = "u-openai-review";
const REVIEWED_AT = "2026-06-26T00:00:00.000Z";

// The boundary only reads ids/versions/timestamps off the bundle; the payload
// bodies are never inspected here, so minimal casts are sufficient.
function reviewInput(): RfpHldDesignModelOpenAiReviewInput {
  return {
    model: { id: MODEL_ID, version: 1, payload: {} as unknown as ModelPayload },
    sourceBundle: {
      id: BUNDLE_ID,
      version: 1,
      payload: {} as unknown as RfpHldSourceBundlePayload,
    },
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
  };
}

function executorReturning(value: unknown): RfpHldDesignModelOpenAiReviewExecutor {
  return vi.fn(async () => value);
}

describe("reviewRfpHldDesignModelOpenAiCandidate - boundary", () => {
  it("returns unavailable and never inspects input when no executor is supplied", async () => {
    expect(await reviewRfpHldDesignModelOpenAiCandidate({ reviewInput: reviewInput() })).toEqual(
      { status: "unavailable" }
    );
    expect(
      await reviewRfpHldDesignModelOpenAiCandidate({
        reviewInput: reviewInput(),
        executor: null,
      })
    ).toEqual({ status: "unavailable" });
  });

  it("returns review_failed with a fixed generic error when the executor throws", async () => {
    const executor: RfpHldDesignModelOpenAiReviewExecutor = vi.fn(async () => {
      throw new Error("SECRET provider stack detail");
    });
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor,
    });
    expect(result).toEqual({ status: "review_failed", error: "hld_quality_review_failed" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("rejects output that is not an object", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning(["findings"]),
    });
    expect(result.status).toBe("invalid_candidate_output");
  });

  it("rejects output missing findings or carrying extra keys, without echoing the body", async () => {
    const missing = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({ notFindings: [] }),
    });
    expect(missing.status).toBe("invalid_candidate_output");

    const extra = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({ findings: [], secret: "LEAK-ME", rawResponse: "LEAK" }),
    });
    expect(extra.status).toBe("invalid_candidate_output");
    expect(JSON.stringify(extra)).not.toContain("LEAK");
  });

  it("rejects when findings is not an array", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({ findings: { severity: "warning" } }),
    });
    expect(result.status).toBe("invalid_candidate_output");
  });

  it("rejects a candidate finding with an invalid severity/category or extra key", async () => {
    const badSeverity = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [{ severity: "critical", category: "other", message: "x" }],
      }),
    });
    expect(badSeverity.status).toBe("invalid_candidate_output");

    const extraKey = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [
          { severity: "warning", category: "other", message: "x", sku: "C9300" },
        ],
      }),
    });
    expect(extraKey.status).toBe("invalid_candidate_output");
  });

  it("rejects an invalid source target token", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [
          { severity: "warning", category: "other", message: "x", sources: ["pricing"] },
        ],
      }),
    });
    expect(result.status).toBe("invalid_candidate_output");
  });

  it("never echoes a forbidden finding message in the validation errors", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [
          { severity: "warning", category: "other", message: "See the technical proposal export." },
        ],
      }),
    });
    expect(result.status).toBe("invalid_candidate_output");
    expect(JSON.stringify(result)).not.toContain("technical proposal");
  });

  it("wraps nonblocking findings into a valid proceed review", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [
          {
            severity: "warning",
            category: "topology_risk",
            message: "Advisory warning only.",
            sources: ["model"],
          },
          {
            severity: "suggestion",
            category: "unclear_narrative",
            message: "Advisory suggestion only.",
          },
        ],
      }),
    });
    expect(result.status).toBe("reviewed");
    if (result.status !== "reviewed") throw new Error("unreachable");
    expect(validateRfpHldDesignModelReviewPayload(result.review).valid).toBe(true);
    expect(result.review.reviewer).toEqual({ type: "ai_advisory", id: REVIEWED_BY });
    expect(result.review.recommendation).toBe("proceed_to_engineer_review");
    expect(result.review.sourceArtifactIds).toEqual([MODEL_ID, BUNDLE_ID]);
    expect(result.review.boundedRebuildInstructions).toBeUndefined();
    // Explicit "model" source resolves to the model ref; the second finding with no
    // sources defaults to both refs.
    expect(result.review.findings[0].sourceReferenceIds).toEqual(["ref-model"]);
    expect(result.review.findings[1].sourceReferenceIds).toEqual(["ref-model", "ref-bundle"]);
  });

  it("wraps a blocking finding into a rebuild_recommended review with a bounded single-attempt directive", async () => {
    const result = await reviewRfpHldDesignModelOpenAiCandidate({
      reviewInput: reviewInput(),
      executor: executorReturning({
        findings: [
          {
            severity: "blocking",
            category: "source_mismatch",
            message: "The model does not match its approved source bundle.",
            sources: ["model", "source_bundle"],
          },
        ],
      }),
    });
    expect(result.status).toBe("reviewed");
    if (result.status !== "reviewed") throw new Error("unreachable");
    expect(validateRfpHldDesignModelReviewPayload(result.review).valid).toBe(true);
    expect(result.review.recommendation).toBe("rebuild_recommended");
    expect(result.review.boundedRebuildInstructions?.maxAttempts).toBe(1);
    expect(result.review.findings[0].sourceReferenceIds).toEqual(["ref-model", "ref-bundle"]);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-openai-review-executor.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no provider SDK, store, fs/path, or env", () => {
    for (const forbidden of [
      'from "openai"',
      "@anthropic-ai",
      "node:fs",
      "node:path",
      "process.env",
      "@/lib/db/",
      "fetch(",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
