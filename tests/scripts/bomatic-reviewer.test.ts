import { describe, expect, it } from "vitest";
import {
  buildReviewerPrompt,
  extractJsonObject,
  parseReviewerVerdict,
} from "../../scripts/bomatic-reviewer";

describe("bomatic reviewer JSON extraction", () => {
  it("extracts a plain JSON object", () => {
    expect(extractJsonObject('{"verdict":"stop","reason":"x","warnings":[]}')).toBe(
      '{"verdict":"stop","reason":"x","warnings":[]}'
    );
  });

  it("extracts JSON from a fenced response", () => {
    expect(
      extractJsonObject(
        [
          "Here is the verdict:",
          "```json",
          '{"verdict":"cleanup","cleanupPrompt":"Fix it.","reason":"Needs cleanup.","warnings":[]}',
          "```",
        ].join("\n")
      )
    ).toBe('{"verdict":"cleanup","cleanupPrompt":"Fix it.","reason":"Needs cleanup.","warnings":[]}');
  });
});

describe("bomatic reviewer verdict parsing", () => {
  it("accepts a commit verdict with a commit message", () => {
    expect(
      parseReviewerVerdict(
        JSON.stringify({
          verdict: "commit",
          commitMessage: "test(projects): add workbook integration",
          reason: "All checks passed.",
          warnings: [],
        })
      )
    ).toEqual({
      verdict: "commit",
      commitMessage: "test(projects): add workbook integration",
      reason: "All checks passed.",
      warnings: [],
    });
  });

  it("requires cleanupPrompt for cleanup verdicts", () => {
    expect(() =>
      parseReviewerVerdict(
        JSON.stringify({
          verdict: "cleanup",
          reason: "Needs cleanup.",
          warnings: [],
        })
      )
    ).toThrow("Cleanup verdict requires cleanupPrompt.");
  });

  it("requires commitMessage for commit verdicts", () => {
    expect(() =>
      parseReviewerVerdict(
        JSON.stringify({
          verdict: "commit",
          reason: "Looks done.",
          warnings: [],
        })
      )
    ).toThrow("Commit verdict requires commitMessage.");
  });
});

describe("bomatic reviewer prompt", () => {
  it("instructs Codex to act as BOMATIC #3 reviewer and return only JSON", () => {
    const prompt = buildReviewerPrompt({
      repoDir: "C:\\Pre-Sales\\bomatic",
      runDir: "C:\\tmp\\bomatic-runs\\prompt-044",
      background: "Project-centered architecture. Runtime processing must be deterministic.",
      artifacts: {
        "bomatic-review-summary.md": "localGuardReport: pass",
        "git-diff.patch": "diff --git a/file b/file",
      },
    });

    expect(prompt).toContain("You are BOMATIC #3");
    expect(prompt).toContain("BOMATIC Reviewer Background Pack");
    expect(prompt).toContain("Runtime processing must be deterministic");
    expect(prompt).toContain("Return only one JSON object");
    expect(prompt).toContain("verdict");
    expect(prompt).toContain("cleanupPrompt");
    expect(prompt).toContain("Treat the local guard report as evidence, not as your decision");
    expect(prompt).toContain("## bomatic-review-summary.md");
    expect(prompt).toContain("## git-diff.patch");
  });
});
