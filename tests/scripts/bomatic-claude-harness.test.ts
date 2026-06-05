import { describe, expect, it } from "vitest";
import {
  buildBomaticReviewSummary,
  combineGitDiffOutput,
  evaluateGuardrails,
  normalizeRepoPath,
  parseVerifierVerdict,
  pathMatchesSpec,
  promptDirName,
} from "../../scripts/bomatic-claude-harness";

const passingBase = {
  changedFiles: ["src/lib/projects/priced-boq-artifact.ts"],
  allowedPaths: ["src/lib/projects/priced-boq-artifact.ts"],
  diffText: "diff --git a/src/lib/projects/priced-boq-artifact.ts b/src/lib/projects/priced-boq-artifact.ts\n",
  headBefore: "abc",
  headAfter: "abc",
  stashBefore: "stash-ref",
  stashAfter: "stash-ref",
  claudeExitCode: 0,
  typecheckExitCode: 0,
  testsExitCode: 0,
};

describe("bomatic Claude harness path matching", () => {
  it("normalizes Windows paths to repo-relative slash paths", () => {
    expect(normalizeRepoPath(".\\src\\lib\\projects\\priced-boq.ts")).toBe("src/lib/projects/priced-boq.ts");
  });

  it("matches exact files, directory prefixes, and glob scopes", () => {
    expect(pathMatchesSpec("src/lib/projects/priced-boq.ts", "src/lib/projects/priced-boq.ts")).toBe(true);
    expect(pathMatchesSpec("src/lib/projects/priced-boq.ts", "src/lib/projects")).toBe(true);
    expect(pathMatchesSpec("tests/lib/projects/foo.test.ts", "tests/**/*.test.ts")).toBe(true);
    expect(pathMatchesSpec("src/app/page.tsx", "tests/**/*.test.ts")).toBe(false);
  });
});

describe("bomatic Claude harness prompt run directory naming", () => {
  it("pads numeric prompt numbers", () => {
    expect(promptDirName("54")).toBe("prompt-054");
    expect(promptDirName("prompt-54")).toBe("prompt-054");
  });

  it("preserves cleanup suffixes such as 54b", () => {
    expect(promptDirName("54b")).toBe("prompt-054b");
    expect(promptDirName("prompt-54b")).toBe("prompt-054b");
  });
});

describe("bomatic Claude harness diff capture", () => {
  it("combines tracked and untracked diff output without dropping either side", () => {
    expect(combineGitDiffOutput("tracked diff\n", "untracked diff\n")).toBe(
      "tracked diff\n\nuntracked diff\n"
    );
  });

  it("keeps an untracked-only diff non-empty", () => {
    expect(combineGitDiffOutput("", "new file diff\n")).toBe("new file diff\n");
  });
});

describe("bomatic Claude harness guardrails", () => {
  it("passes when changed files stay in scope and checks pass", () => {
    const report = evaluateGuardrails(passingBase);
    expect(report.status).toBe("pass");
    expect(report.findings.filter((finding) => finding.severity === "hard_stop")).toEqual([]);
  });

  it("fails closed when no prompt scope is configured", () => {
    const report = evaluateGuardrails({ ...passingBase, allowedPaths: [] });
    expect(report.status).toBe("stop");
    expect(report.findings.map((finding) => finding.code)).toContain("missing_scope");
  });

  it("stops on forbidden path changes", () => {
    const report = evaluateGuardrails({
      ...passingBase,
      changedFiles: [".claude/settings.local.json", "stc-knowledge/notes.md"],
      allowedPaths: [".claude/settings.local.json", "stc-knowledge/**"],
    });
    expect(report.status).toBe("stop");
    expect(report.findings.map((finding) => finding.code)).toContain("forbidden_paths_changed");
  });

  it("stops when dependency files change unexpectedly", () => {
    const report = evaluateGuardrails({
      ...passingBase,
      changedFiles: ["package.json"],
      allowedPaths: ["package.json"],
    });
    expect(report.status).toBe("stop");
    expect(report.findings.map((finding) => finding.code)).toContain("dependency_files_changed");
  });

  it("stops when Claude changes HEAD or stash", () => {
    const report = evaluateGuardrails({
      ...passingBase,
      headAfter: "def",
      stashAfter: "different-stash-ref",
    });
    expect(report.status).toBe("stop");
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["claude_created_commit", "stash_changed"])
    );
  });

  it("stops on runtime AI/catalog decision imports in added diff lines", () => {
    const report = evaluateGuardrails({
      ...passingBase,
      diffText: '+import { client } from "@/lib/ai/client";\n',
    });
    expect(report.status).toBe("stop");
    expect(report.findings.map((finding) => finding.code)).toContain("runtime_ai_boundary");
  });
});

describe("bomatic Claude harness review summary", () => {
  it("builds a BOMATIC #3 handoff instead of a harness decision", () => {
    const report = evaluateGuardrails(passingBase);
    const summary = buildBomaticReviewSummary({
      promptNumber: "42",
      runDir: "C:\\tmp\\bomatic-runs\\prompt-042",
      sessionId: "11111111-1111-1111-1111-111111111111",
      turnIndex: 0,
      changedFiles: ["tests/lib/projects/mantle-export-artifact-workbook.test.ts"],
      guardReport: report,
      gitStatus: "?? tests/lib/projects/mantle-export-artifact-workbook.test.ts\n",
      gitDiffStat: " tests/lib/projects/mantle-export-artifact-workbook.test.ts | 10 ++++++++++\n",
      claudeExitCode: 0,
      typecheckExitCode: 0,
      testsExitCode: 0,
    });

    expect(summary).toContain("Prompt 42 Harness Review For BOMATIC #3");
    expect(summary).toContain("BOMATIC #3 decides");
    expect(summary).toContain("verdict");
    expect(summary).toContain("cleanupPrompt");
    expect(summary).toContain("tests/lib/projects/mantle-export-artifact-workbook.test.ts");
    expect(summary).toContain("localGuardReport: pass (evidence only; BOMATIC #3 is the reviewer)");
  });
});

describe("bomatic Claude harness verifier verdict parsing", () => {
  it("accepts a commit verdict with a commit message", () => {
    expect(
      parseVerifierVerdict(
        JSON.stringify({
          verdict: "commit",
          commitMessage: "feat(projects): tighten priced BoM contract",
          reason: "Checks pass.",
          warnings: ["reviewed manually"],
        })
      )
    ).toEqual({
      verdict: "commit",
      commitMessage: "feat(projects): tighten priced BoM contract",
      reason: "Checks pass.",
      warnings: ["reviewed manually"],
    });
  });

  it("rejects commit verdicts without a commit message", () => {
    expect(() =>
      parseVerifierVerdict(
        JSON.stringify({
          verdict: "commit",
          reason: "Looks good.",
        })
      )
    ).toThrow("Commit verdict requires commitMessage.");
  });

  it("rejects cleanup verdicts without a cleanup prompt", () => {
    expect(() =>
      parseVerifierVerdict(
        JSON.stringify({
          verdict: "cleanup",
          reason: "Needs changes.",
        })
      )
    ).toThrow("Cleanup verdict requires cleanupPrompt.");
  });
});
