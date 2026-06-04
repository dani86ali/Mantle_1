import { describe, expect, it } from "vitest";
import {
  buildReviewerPrompt,
  extractJsonObject,
  parseReviewerVerdict,
  validateEvidenceManifest,
  type ArtifactManifestEntry,
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
          cleanupPrompt: "",
          reason: "All checks passed.",
          warnings: [],
        })
      )
    ).toEqual({
      verdict: "commit",
      commitMessage: "test(projects): add workbook integration",
      cleanupPrompt: "",
      reason: "All checks passed.",
      warnings: [],
    });
  });

  it("requires cleanupPrompt for cleanup verdicts", () => {
    expect(() =>
      parseReviewerVerdict(
        JSON.stringify({
          verdict: "cleanup",
          commitMessage: "",
          cleanupPrompt: "",
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
          commitMessage: "",
          cleanupPrompt: "",
          reason: "Looks done.",
          warnings: [],
        })
      )
    ).toThrow("Commit verdict requires commitMessage.");
  });

  it("rejects malformed warnings instead of filtering them", () => {
    expect(() =>
      parseReviewerVerdict(
        JSON.stringify({
          verdict: "stop",
          commitMessage: "",
          cleanupPrompt: "",
          reason: "Malformed.",
          warnings: ["ok", 42],
        })
      )
    ).toThrow("Reviewer verdict warnings must be an array of strings.");
  });
});

describe("bomatic reviewer prompt", () => {
  it("instructs Codex to act as BOMATIC #3 reviewer and return only JSON", () => {
    const prompt = buildReviewerPrompt({
      repoDir: "C:\\Pre-Sales\\bomatic",
      runDir: "C:\\tmp\\bomatic-runs\\prompt-044",
      background: "Project-centered architecture. Runtime processing must be deterministic.",
      planningFile: "C:\\Pre-Sales\\bomatic_planning\\MVP_CANONICAL_PROJECT_STATE.md",
      manifest: [
        {
          name: "prompt.md",
          path: "C:\\tmp\\bomatic-runs\\prompt-044\\prompt.md",
          missing: false,
          truncated: false,
          originalChars: 100,
          includedChars: 100,
        },
      ],
      artifacts: {
        "bomatic-review-summary.md": "localGuardReport: pass",
        "git-diff.patch": "diff --git a/file b/file",
      },
    });

    expect(prompt).toContain("You are BOMATIC #3");
    expect(prompt).toContain("BOMATIC Reviewer Background Pack");
    expect(prompt).toContain("Runtime processing must be deterministic");
    expect(prompt).toContain("Planning source of truth");
    expect(prompt).toContain("Return only one JSON object");
    expect(prompt).toContain("Do not commit when required verification was skipped");
    expect(prompt).toContain("## Artifact Manifest");
    expect(prompt).toContain("verdict");
    expect(prompt).toContain("cleanupPrompt");
    expect(prompt).toContain("Treat the local guard report as evidence, not as your decision");
    expect(prompt).toContain("## bomatic-review-summary.md");
    expect(prompt).toContain("## git-diff.patch");
  });
});

describe("bomatic reviewer artifact manifest", () => {
  const entry = (overrides: Partial<ArtifactManifestEntry>): ArtifactManifestEntry => ({
    name: "prompt.md",
    path: "C:\\tmp\\bomatic-runs\\prompt-044\\prompt.md",
    missing: false,
    truncated: false,
    originalChars: 10,
    includedChars: 10,
    ...overrides,
  });

  it("fails closed when critical artifacts are missing", () => {
    expect(validateEvidenceManifest([entry({ name: "guard-report.json", missing: true })])).toEqual([
      "planning-source.md is absent from the artifact manifest.",
      "prompt.md is absent from the artifact manifest.",
      "changed-files.txt is absent from the artifact manifest.",
      "git-status.txt is absent from the artifact manifest.",
      "git-diff-stat.txt is absent from the artifact manifest.",
      "git-diff.patch is absent from the artifact manifest.",
      "typecheck.log is absent from the artifact manifest.",
      "tests.log is absent from the artifact manifest.",
      "guard-report.json is missing.",
    ]);
  });

  it("fails closed when critical artifacts are truncated", () => {
    expect(validateEvidenceManifest([entry({ name: "git-diff.patch", truncated: true })])).toEqual([
      "planning-source.md is absent from the artifact manifest.",
      "prompt.md is absent from the artifact manifest.",
      "guard-report.json is absent from the artifact manifest.",
      "changed-files.txt is absent from the artifact manifest.",
      "git-status.txt is absent from the artifact manifest.",
      "git-diff-stat.txt is absent from the artifact manifest.",
      "typecheck.log is absent from the artifact manifest.",
      "tests.log is absent from the artifact manifest.",
      "git-diff.patch is truncated.",
    ]);
  });

  it("does not block missing non-critical review summaries", () => {
    const criticalEntries = [
      "planning-source.md",
      "prompt.md",
      "guard-report.json",
      "changed-files.txt",
      "git-status.txt",
      "git-diff-stat.txt",
      "git-diff.patch",
      "typecheck.log",
      "tests.log",
    ].map((name) => entry({ name }));

    expect(
      validateEvidenceManifest([
        entry({ name: "bomatic-review-summary.md", missing: true }),
        ...criticalEntries,
      ])
    ).toEqual([]);
  });
});
