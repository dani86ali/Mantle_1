import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type VerifierVerdictValue = "commit" | "cleanup" | "stop";

export interface VerifierVerdict {
  verdict: VerifierVerdictValue;
  commitMessage?: string;
  cleanupPrompt?: string;
  reason: string;
  warnings: string[];
}

export interface GuardrailFinding {
  code: string;
  severity: "hard_stop" | "warning";
  message: string;
  paths?: string[];
}

export interface GuardrailReport {
  status: "pass" | "stop";
  findings: GuardrailFinding[];
  changedFiles: string[];
}

export interface GuardrailInput {
  changedFiles: string[];
  allowedPaths: string[];
  diffText: string;
  headBefore: string;
  headAfter: string;
  stashBefore: string;
  stashAfter: string;
  claudeExitCode: number;
  typecheckExitCode: number | null;
  testsExitCode: number | null;
  allowDependencyChanges?: boolean;
}

interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

interface GitSnapshot {
  status: CommandResult;
  log: CommandResult;
  diffStat: CommandResult;
  diffPatch: CommandResult;
  diffNameOnly: CommandResult;
  untracked: CommandResult;
  head: CommandResult;
  stashRef: CommandResult;
  stashList: CommandResult;
  changedFiles: string[];
  headFingerprint: string;
  stashFingerprint: string;
}

interface HarnessOptions {
  repoDir: string;
  promptFile: string;
  promptNumber: string;
  runRoot: string;
  model: string;
  effort: string;
  agent: string;
  allowedPaths: string[];
  maxCleanupAttempts: number;
  typecheckCommand: string;
  testCommand: string;
  skipTypecheck: boolean;
  skipTests: boolean;
  allowDependencyChanges: boolean;
  verifierCommand?: string;
  planningFile?: string;
  claudeTimeoutMs: number;
  commandTimeoutMs: number;
}

interface QueueFile {
  defaults?: Partial<HarnessOptions>;
  prompts: Array<Partial<HarnessOptions> & { promptFile: string; promptNumber: string }>;
}

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_EFFORT = "max";
const DEFAULT_AGENT = "ultracode";
const DEFAULT_RUN_ROOT =
  process.platform === "win32" ? "C:\\tmp\\bomatic-runs" : path.join(os.tmpdir(), "bomatic-runs");
const DEFAULT_TYPECHECK_COMMAND = "npm run typecheck";
const DEFAULT_TEST_COMMAND = "npm test";
const DEFAULT_CLAUDE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

const DEFAULT_FORBIDDEN_PATHS = ["stc-knowledge/**", ".claude/settings.local.json"];
const DEFAULT_DEPENDENCY_PATHS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

const DEFAULT_FORBIDDEN_DIFF_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: "runtime_ai_boundary",
    pattern:
      /^\+.*(from\s+["']@\/lib\/(ai|llm)\b|from\s+["']@\/lib\/adapters\/.*catalog|from\s+["']@\/lib\/projects\/catalog-lookup|@anthropic-ai\/sdk|openai|generateObject|generateText|chat\.completions)/im,
    message:
      "Diff introduces runtime AI/catalog decision plumbing. Configuration, SKU, and pricing decisions must stay deterministic and approved.",
  },
];

const CLEANUP_ELIGIBLE_HARD_STOPS = new Set(["typecheck_failed", "tests_failed"]);

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(spec: string): RegExp {
  const normalized = normalizeRepoPath(spec);
  let source = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      source += ".*";
      i += 1;
    } else if (ch === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${source}$`);
}

export function pathMatchesSpec(filePath: string, spec: string): boolean {
  const normalizedPath = normalizeRepoPath(filePath);
  const normalizedSpec = normalizeRepoPath(spec);
  if (normalizedSpec.endsWith("/")) return normalizedPath.startsWith(normalizedSpec);
  if (normalizedSpec.includes("*")) return globToRegExp(normalizedSpec).test(normalizedPath);
  return normalizedPath === normalizedSpec || normalizedPath.startsWith(`${normalizedSpec}/`);
}

function pathsMatching(files: string[], specs: string[]): string[] {
  return files.filter((file) => specs.some((spec) => pathMatchesSpec(file, spec)));
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailReport {
  const changedFiles = uniqueSorted(input.changedFiles.map(normalizeRepoPath));
  const findings: GuardrailFinding[] = [];

  const hardStop = (code: string, message: string, paths?: string[]) => {
    findings.push({ code, severity: "hard_stop", message, ...(paths ? { paths } : {}) });
  };
  const warning = (code: string, message: string, paths?: string[]) => {
    findings.push({ code, severity: "warning", message, ...(paths ? { paths } : {}) });
  };

  if (input.claudeExitCode !== 0) {
    hardStop("claude_failed", `Claude exited with code ${input.claudeExitCode}.`);
  }
  if (input.headBefore !== input.headAfter) {
    hardStop("claude_created_commit", "HEAD changed during Claude execution. Claude must not commit.");
  }
  if (input.stashBefore !== input.stashAfter) {
    hardStop("stash_changed", "The git stash ref changed during the run.");
  }

  const forbidden = pathsMatching(changedFiles, DEFAULT_FORBIDDEN_PATHS);
  if (forbidden.length > 0) {
    hardStop("forbidden_paths_changed", "Forbidden paths changed.", forbidden);
  }

  const dependencyFiles = pathsMatching(changedFiles, DEFAULT_DEPENDENCY_PATHS);
  if (dependencyFiles.length > 0 && !input.allowDependencyChanges) {
    hardStop("dependency_files_changed", "Dependency/package files changed unexpectedly.", dependencyFiles);
  }

  if (changedFiles.length === 0) {
    warning("no_changes", "Claude produced no working tree changes.");
  } else if (input.allowedPaths.length === 0) {
    hardStop("missing_scope", "No allowed path scope was configured for this prompt.", changedFiles);
  } else {
    const unscoped = changedFiles.filter(
      (file) => !input.allowedPaths.some((spec) => pathMatchesSpec(file, spec))
    );
    if (unscoped.length > 0) hardStop("unscoped_files_changed", "Files changed outside prompt scope.", unscoped);
  }

  if (input.typecheckExitCode !== null && input.typecheckExitCode !== 0) {
    hardStop("typecheck_failed", `Typecheck exited with code ${input.typecheckExitCode}.`);
  }
  if (input.testsExitCode !== null && input.testsExitCode !== 0) {
    hardStop("tests_failed", `Tests exited with code ${input.testsExitCode}.`);
  }

  for (const check of DEFAULT_FORBIDDEN_DIFF_PATTERNS) {
    if (check.pattern.test(input.diffText)) hardStop(check.code, check.message);
  }

  return {
    status: findings.some((finding) => finding.severity === "hard_stop") ? "stop" : "pass",
    findings,
    changedFiles,
  };
}

export function parseVerifierVerdict(raw: string): VerifierVerdict {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Verifier verdict must be a JSON object.");
  }
  const value = parsed as Record<string, unknown>;
  const verdict = value.verdict;
  const reason = value.reason;
  if (verdict !== "commit" && verdict !== "cleanup" && verdict !== "stop") {
    throw new Error("Verifier verdict must be commit, cleanup, or stop.");
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new Error("Verifier verdict requires a non-empty reason.");
  }

  const commitMessage = typeof value.commitMessage === "string" ? value.commitMessage.trim() : undefined;
  const cleanupPrompt = typeof value.cleanupPrompt === "string" ? value.cleanupPrompt.trim() : undefined;
  if (verdict === "commit" && !commitMessage) {
    throw new Error("Commit verdict requires commitMessage.");
  }
  if (verdict === "cleanup" && !cleanupPrompt) {
    throw new Error("Cleanup verdict requires cleanupPrompt.");
  }

  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  return {
    verdict,
    reason,
    warnings,
    ...(commitMessage ? { commitMessage } : {}),
    ...(cleanupPrompt ? { cleanupPrompt } : {}),
  };
}

function renderCommandResult(result: CommandResult): string {
  return [
    `$ ${result.command}`,
    `exitCode=${result.exitCode}`,
    `durationMs=${result.durationMs}`,
    `timedOut=${result.timedOut}`,
    "",
    "STDOUT:",
    result.stdout,
    "",
    "STDERR:",
    result.stderr,
    "",
  ].join("\n");
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; input?: string; timeoutMs: number; shell?: boolean; env?: NodeJS.ProcessEnv }
): Promise<CommandResult> {
  const started = Date.now();
  const commandLine = [command, ...args].join(" ");

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      env: options.env ?? process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        command: commandLine,
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
      });
    });

    if (options.input !== undefined) {
      child.stdin?.write(options.input);
    }
    child.stdin?.end();
  });
}

async function runShellCommand(command: string, cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runProcess(command, [], { cwd, timeoutMs, shell: true, env });
}

async function runGit(args: string[], repoDir: string, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return runProcess("git", args, { cwd: repoDir, timeoutMs });
}

async function writeText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function appendText(filePath: string, value: string): Promise<void> {
  const current = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
  await writeText(filePath, `${current}${value}`);
}

async function captureGitSnapshot(repoDir: string): Promise<GitSnapshot> {
  const [status, log, diffStat, diffPatch, diffNameOnly, untracked, head, stashRef, stashList] =
    await Promise.all([
      runGit(["status", "--short", "-uall"], repoDir),
      runGit(["log", "-5", "--oneline"], repoDir),
      runGit(["diff", "HEAD", "--stat", "--"], repoDir),
      runGit(["diff", "HEAD", "--"], repoDir),
      runGit(["diff", "HEAD", "--name-only", "--"], repoDir),
      runGit(["ls-files", "--others", "--exclude-standard"], repoDir),
      runGit(["rev-parse", "HEAD"], repoDir),
      runGit(["rev-parse", "--verify", "refs/stash"], repoDir),
      runGit(["stash", "list"], repoDir),
    ]);

  const changedFiles = uniqueSorted([...splitLines(diffNameOnly.stdout), ...splitLines(untracked.stdout)]);
  const stashFingerprint = stashRef.exitCode === 0 ? stashRef.stdout.trim() : "(none)";
  return {
    status,
    log,
    diffStat,
    diffPatch,
    diffNameOnly,
    untracked,
    head,
    stashRef,
    stashList,
    changedFiles,
    headFingerprint: head.stdout.trim(),
    stashFingerprint,
  };
}

async function writeGitSnapshot(runDir: string, snapshot: GitSnapshot, prefix: string): Promise<void> {
  const prefixPart = prefix.length > 0 ? `${prefix}-` : "";
  await writeText(path.join(runDir, `${prefixPart}git-status.txt`), renderCommandResult(snapshot.status));
  await writeText(path.join(runDir, `${prefixPart}git-log.txt`), renderCommandResult(snapshot.log));
  await writeText(path.join(runDir, `${prefixPart}git-diff-stat.txt`), renderCommandResult(snapshot.diffStat));
  await writeText(path.join(runDir, `${prefixPart}git-diff.patch`), snapshot.diffPatch.stdout);
  await writeText(path.join(runDir, `${prefixPart}changed-files.txt`), `${snapshot.changedFiles.join("\n")}\n`);
  await writeText(path.join(runDir, `${prefixPart}git-stash.txt`), renderCommandResult(snapshot.stashList));
  await writeText(path.join(runDir, `${prefixPart}git-head.txt`), renderCommandResult(snapshot.head));
}

function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function promptDirName(promptNumber: string): string {
  const digits = promptNumber.replace(/^prompt-/i, "").replace(/\D/g, "");
  return `prompt-${digits.padStart(3, "0")}`;
}

async function createRunDir(runRoot: string, promptNumber: string): Promise<string> {
  const base = path.join(runRoot, promptDirName(promptNumber));
  const candidate = existsSync(base) ? `${base}-${timestampSlug()}` : base;
  await mkdir(candidate, { recursive: true });
  return candidate;
}

function isInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultPlanningFile(repoDir: string): string {
  return path.resolve(repoDir, "..", "bomatic_planning", "MVP_CANONICAL_PROJECT_STATE.md");
}

function buildExecutorPrompt(promptText: string, repoDir: string): string {
  return [
    "You are the Claude implementation executor in the BOMATIC Claude/Codex loop.",
    `Work in repo: ${repoDir}`,
    "",
    "Hard rules for this turn:",
    "- Edit only the files needed by this numbered prompt.",
    "- Do not commit. Stop before commit.",
    "- Do not touch stc-knowledge/.",
    "- Do not modify .claude/settings.local.json.",
    "- Do not pop, apply, drop, clear, or otherwise modify git stash.",
    "- Do not install packages or change dependency files unless the prompt explicitly requires it.",
    "- Do not introduce runtime AI/catalog/pricing/configuration decisions where the architecture forbids them.",
    "- Keep pricing authority and configuration authority separate.",
    "",
    "Implementation prompt:",
    "",
    promptText,
    "",
  ].join("\n");
}

function buildCleanupPrompt(cleanupPrompt: string): string {
  return [
    "Cleanup prompt from the verifier. Continue in this same Claude session.",
    "",
    "Do not commit. Keep the prior prompt scope and hard rules in force.",
    "",
    cleanupPrompt,
    "",
  ].join("\n");
}

async function copyIfExists(source: string, target: string): Promise<void> {
  if (!existsSync(source)) return;
  const fileStat = await stat(source);
  if (!fileStat.isFile()) return;
  await writeText(target, await readFile(source, "utf8"));
}

async function runClaudeTurn(
  options: HarnessOptions,
  runDir: string,
  sessionId: string,
  promptText: string,
  turnIndex: number
): Promise<CommandResult> {
  const turnDir = path.join(runDir, `turn-${String(turnIndex).padStart(2, "0")}`);
  await mkdir(turnDir, { recursive: true });
  const isFirstTurn = turnIndex === 0;
  const claudeArgs = [
    "--model",
    options.model,
    "--effort",
    options.effort,
    "--agent",
    options.agent,
    "--dangerously-skip-permissions",
    "--print",
    "--output-format",
    "stream-json",
    isFirstTurn ? "--session-id" : "--resume",
    sessionId,
  ];
  const executorPrompt = isFirstTurn
    ? buildExecutorPrompt(promptText, options.repoDir)
    : buildCleanupPrompt(promptText);
  await writeText(path.join(turnDir, "executor-prompt.md"), executorPrompt);

  const result = await runProcess("claude", claudeArgs, {
    cwd: options.repoDir,
    input: executorPrompt,
    timeoutMs: options.claudeTimeoutMs,
    shell: process.platform === "win32",
  });
  await writeText(path.join(turnDir, "claude-stdout.jsonl"), result.stdout);
  await writeText(path.join(turnDir, "claude-stderr.txt"), result.stderr);
  await appendText(
    path.join(runDir, "claude-transcript.txt"),
    [
      `\n===== TURN ${turnIndex} =====\n`,
      renderCommandResult(result),
      "\n",
    ].join("")
  );
  return result;
}

async function runQualityChecks(options: HarnessOptions, runDir: string): Promise<{
  typecheckExitCode: number | null;
  testsExitCode: number | null;
}> {
  let typecheckExitCode: number | null = null;
  let testsExitCode: number | null = null;

  if (options.skipTypecheck) {
    await writeText(path.join(runDir, "typecheck.log"), "Skipped by harness option.\n");
  } else {
    const typecheck = await runShellCommand(options.typecheckCommand, options.repoDir, options.commandTimeoutMs);
    typecheckExitCode = typecheck.exitCode;
    await writeText(path.join(runDir, "typecheck.log"), renderCommandResult(typecheck));
  }

  if (options.skipTests) {
    await writeText(path.join(runDir, "tests.log"), "Skipped by harness option.\n");
  } else {
    const tests = await runShellCommand(options.testCommand, options.repoDir, options.commandTimeoutMs);
    testsExitCode = tests.exitCode;
    await writeText(path.join(runDir, "tests.log"), renderCommandResult(tests));
  }

  return { typecheckExitCode, testsExitCode };
}

async function writeVerifierRequest(runDir: string, report: GuardrailReport): Promise<void> {
  const example: VerifierVerdict = {
    verdict: "cleanup",
    cleanupPrompt: "Describe the smallest cleanup Claude should make in the same session.",
    reason: "Explain why cleanup is required.",
    warnings: [],
  };
  await writeText(path.join(runDir, "verifier-verdict.example.json"), `${JSON.stringify(example, null, 2)}\n`);
  await writeText(
    path.join(runDir, "verifier-request.md"),
    [
      "# BOMATIC Harness Verifier Request",
      "",
      "Review the run artifacts in this directory and write a verifier verdict JSON.",
      "",
      "Required verdict shape:",
      "",
      "```json",
      JSON.stringify(
        {
          verdict: "commit | cleanup | stop",
          commitMessage: "feat(projects): ...",
          cleanupPrompt: "Only when verdict is cleanup.",
          reason: "Required.",
          warnings: [],
        },
        null,
        2
      ),
      "```",
      "",
      "Local guardrail report:",
      "",
      "```json",
      JSON.stringify(report, null, 2),
      "```",
      "",
      "Review at minimum: claude-transcript.txt, git-status.txt, git-diff-stat.txt, git-diff.patch, changed-files.txt, typecheck.log, and tests.log.",
      "Commit is allowed only if the local guard report passes and the diff matches the architecture and prompt scope.",
      "",
    ].join("\n")
  );
}

async function getVerifierVerdict(
  options: HarnessOptions,
  runDir: string,
  report: GuardrailReport,
  turnIndex: number,
  sessionId: string
): Promise<VerifierVerdict | null> {
  await writeVerifierRequest(runDir, report);
  if (!options.verifierCommand) return null;

  const env = {
    ...process.env,
    BOMATIC_RUN_DIR: runDir,
    BOMATIC_GUARD_REPORT: path.join(runDir, "guard-report.json"),
    BOMATIC_PROMPT_NUMBER: options.promptNumber,
    BOMATIC_TURN_INDEX: String(turnIndex),
    BOMATIC_CLAUDE_SESSION_ID: sessionId,
  };
  const result = await runShellCommand(options.verifierCommand, options.repoDir, options.commandTimeoutMs, env);
  await writeText(path.join(runDir, `verifier-command-turn-${turnIndex}.log`), renderCommandResult(result));
  if (result.exitCode !== 0) {
    throw new Error(`Verifier command exited with code ${result.exitCode}.`);
  }
  const verdict = parseVerifierVerdict(result.stdout);
  await writeText(path.join(runDir, "verifier-verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function commitApprovedChanges(
  options: HarnessOptions,
  runDir: string,
  changedFiles: string[],
  commitMessage: string
): Promise<void> {
  const normalizedFiles = changedFiles.map(normalizeRepoPath);
  const add = await runGit(["add", "--", ...normalizedFiles], options.repoDir);
  await writeText(path.join(runDir, "git-add.log"), renderCommandResult(add));
  if (add.exitCode !== 0) throw new Error(`git add failed with code ${add.exitCode}.`);

  const commit = await runGit(["commit", "-m", commitMessage], options.repoDir);
  await writeText(path.join(runDir, "git-commit.log"), renderCommandResult(commit));
  if (commit.exitCode !== 0) throw new Error(`git commit failed with code ${commit.exitCode}.`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runOne(options: HarnessOptions): Promise<"committed" | "awaiting_verifier" | "stopped"> {
  const repoDir = path.resolve(options.repoDir);
  const runRoot = path.resolve(options.runRoot);
  if (isInside(runRoot, repoDir)) {
    throw new Error("Run root must be outside the repo so harness logs are not source edits.");
  }

  const runDir = await createRunDir(runRoot, options.promptNumber);
  const promptText = await readFile(options.promptFile, "utf8");
  await writeText(path.join(runDir, "prompt.md"), promptText);
  await copyIfExists(options.planningFile ?? defaultPlanningFile(repoDir), path.join(runDir, "planning-source.md"));

  const sessionId = randomUUID();
  await writeJson(path.join(runDir, "harness-run.json"), {
    repoDir,
    promptFile: path.resolve(options.promptFile),
    promptNumber: options.promptNumber,
    model: options.model,
    effort: options.effort,
    agent: options.agent,
    sessionId,
    allowedPaths: options.allowedPaths,
    maxCleanupAttempts: options.maxCleanupAttempts,
    typecheckCommand: options.skipTypecheck ? null : options.typecheckCommand,
    testCommand: options.skipTests ? null : options.testCommand,
    verifierCommandConfigured: Boolean(options.verifierCommand),
    createdAt: new Date().toISOString(),
  });

  const before = await captureGitSnapshot(repoDir);
  await writeGitSnapshot(runDir, before, "before");
  if (before.status.stdout.trim() !== "") {
    const report: GuardrailReport = {
      status: "stop",
      changedFiles: before.changedFiles,
      findings: [
        {
          code: "dirty_baseline",
          severity: "hard_stop",
          message:
            "Working tree is not clean before Claude execution. Commit, discard, or intentionally handle existing changes before running a numbered prompt.",
          paths: before.changedFiles,
        },
      ],
    };
    await writeJson(path.join(runDir, "guard-report.json"), report);
    await writeVerifierRequest(runDir, report);
    return "stopped";
  }

  let currentPrompt = promptText;
  for (let turnIndex = 0; turnIndex <= options.maxCleanupAttempts; turnIndex += 1) {
    const claude = await runClaudeTurn(options, runDir, sessionId, currentPrompt, turnIndex);
    const checks = await runQualityChecks(options, runDir);
    const after = await captureGitSnapshot(repoDir);
    await writeGitSnapshot(runDir, after, "");

    const report = evaluateGuardrails({
      changedFiles: after.changedFiles,
      allowedPaths: options.allowedPaths,
      diffText: after.diffPatch.stdout,
      headBefore: before.headFingerprint,
      headAfter: after.headFingerprint,
      stashBefore: before.stashFingerprint,
      stashAfter: after.stashFingerprint,
      claudeExitCode: claude.exitCode,
      typecheckExitCode: checks.typecheckExitCode,
      testsExitCode: checks.testsExitCode,
      allowDependencyChanges: options.allowDependencyChanges,
    });
    await writeJson(path.join(runDir, "guard-report.json"), report);

    if (report.status === "stop") {
      const hardStops = report.findings.filter((finding) => finding.severity === "hard_stop");
      const nonRecoverableStops = hardStops.filter((finding) => !CLEANUP_ELIGIBLE_HARD_STOPS.has(finding.code));
      if (nonRecoverableStops.length > 0 || turnIndex === options.maxCleanupAttempts) {
        await writeJson(path.join(runDir, "verifier-verdict.json"), {
          verdict: "stop",
          reason:
            nonRecoverableStops.length > 0
              ? "Non-recoverable local guardrails failed before verifier approval."
              : "Tests/typecheck still fail after cleanup attempts were exhausted.",
          warnings: report.findings
            .filter((finding) => finding.severity === "warning")
            .map((finding) => finding.message),
        });
        return "stopped";
      }
    }

    const verdict = await getVerifierVerdict(options, runDir, report, turnIndex, sessionId);
    if (!verdict) return "awaiting_verifier";
    if (verdict.verdict === "stop") return "stopped";
    if (verdict.verdict === "cleanup") {
      if (turnIndex === options.maxCleanupAttempts) {
        await writeJson(path.join(runDir, "verifier-verdict.json"), {
          verdict: "stop",
          reason: "Cleanup requested but max cleanup attempts were exhausted.",
          warnings: verdict.warnings,
        });
        return "stopped";
      }
      currentPrompt = verdict.cleanupPrompt ?? "";
      continue;
    }
    if (report.status !== "pass") {
      await writeJson(path.join(runDir, "verifier-verdict.json"), {
        verdict: "stop",
        reason: "Verifier requested commit, but local guardrails still block commit.",
        warnings: verdict.warnings,
      });
      return "stopped";
    }

    await commitApprovedChanges(options, runDir, after.changedFiles, verdict.commitMessage ?? "");
    const finalSnapshot = await captureGitSnapshot(repoDir);
    await writeGitSnapshot(runDir, finalSnapshot, "after-commit");
    return "committed";
  }

  return "stopped";
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function readRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseNumberOption(args: string[], name: string, fallback: number): number {
  const raw = readOption(args, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  return value;
}

function optionsFromArgs(args: string[]): HarnessOptions {
  const repoDir = path.resolve(readOption(args, "--repo") ?? process.cwd());
  const promptFile = readOption(args, "--prompt");
  const promptNumber = readOption(args, "--prompt-number");
  if (!promptFile) throw new Error("--prompt is required.");
  if (!promptNumber) throw new Error("--prompt-number is required.");

  return {
    repoDir,
    promptFile: path.resolve(promptFile),
    promptNumber,
    runRoot: readOption(args, "--run-root") ?? DEFAULT_RUN_ROOT,
    model: readOption(args, "--model") ?? DEFAULT_MODEL,
    effort: readOption(args, "--effort") ?? DEFAULT_EFFORT,
    agent: readOption(args, "--agent") ?? DEFAULT_AGENT,
    allowedPaths: readRepeatedOption(args, "--allowed-path"),
    maxCleanupAttempts: parseNumberOption(args, "--max-cleanups", 2),
    typecheckCommand: readOption(args, "--typecheck-command") ?? DEFAULT_TYPECHECK_COMMAND,
    testCommand: readOption(args, "--test-command") ?? DEFAULT_TEST_COMMAND,
    skipTypecheck: hasFlag(args, "--skip-typecheck"),
    skipTests: hasFlag(args, "--skip-tests"),
    allowDependencyChanges: hasFlag(args, "--allow-dependency-changes"),
    verifierCommand: readOption(args, "--verifier-command"),
    planningFile: readOption(args, "--planning-file"),
    claudeTimeoutMs: parseNumberOption(args, "--claude-timeout-ms", DEFAULT_CLAUDE_TIMEOUT_MS),
    commandTimeoutMs: parseNumberOption(args, "--command-timeout-ms", DEFAULT_COMMAND_TIMEOUT_MS),
  };
}

async function runQueue(queuePath: string, cliArgs: string[]): Promise<"committed" | "awaiting_verifier" | "stopped"> {
  const raw = await readFile(queuePath, "utf8");
  const parsed = JSON.parse(raw) as QueueFile;
  if (!Array.isArray(parsed.prompts)) throw new Error("Queue file requires a prompts array.");
  const cliDefaults = optionsFromArgs([
    "--prompt",
    parsed.prompts[0]?.promptFile ?? "placeholder.md",
    "--prompt-number",
    parsed.prompts[0]?.promptNumber ?? "000",
    ...cliArgs,
  ]);

  for (const item of parsed.prompts) {
    const merged: HarnessOptions = {
      ...cliDefaults,
      ...(parsed.defaults ?? {}),
      ...item,
      repoDir: path.resolve(String(item.repoDir ?? parsed.defaults?.repoDir ?? cliDefaults.repoDir)),
      promptFile: path.resolve(item.promptFile),
      promptNumber: item.promptNumber,
      allowedPaths: item.allowedPaths ?? parsed.defaults?.allowedPaths ?? cliDefaults.allowedPaths,
    };
    const result = await runOne(merged);
    if (result !== "committed") return result;
  }
  return "committed";
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/bomatic-claude-harness.ts run --prompt <file> --prompt-number <N> --allowed-path <path> [options]",
    "  npx tsx scripts/bomatic-claude-harness.ts queue --queue <queue.json> [default options]",
    "",
    "Key options:",
    "  --repo <dir>                     Repo directory. Defaults to cwd.",
    "  --run-root <dir>                 Artifact root. Defaults to C:\\tmp\\bomatic-runs on Windows.",
    "  --model <model>                  Claude model. Defaults to claude-opus-4-8.",
    "  --effort <level>                 Claude effort. Defaults to max.",
    "  --agent <agent>                  Claude agent/profile. Defaults to ultracode.",
    "  --allowed-path <path-or-glob>    Repeat for scoped files/directories.",
    "  --verifier-command <command>     Command that prints verifier JSON to stdout.",
    "  --max-cleanups <n>               Cleanup turns in the same Claude session. Defaults to 2.",
    "  --typecheck-command <command>    Defaults to npm run typecheck.",
    "  --test-command <command>         Defaults to npm test.",
    "  --skip-typecheck | --skip-tests  Capture skip logs instead of running checks.",
    "",
    "Commit happens only when local guardrails pass and verifier JSON says commit.",
  ].join("\n");
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return 0;
  }

  if (command === "run") {
    const result = await runOne(optionsFromArgs(args));
    return result === "committed" ? 0 : result === "awaiting_verifier" ? 2 : 1;
  }

  if (command === "queue") {
    const queue = readOption(args, "--queue");
    if (!queue) throw new Error("--queue is required.");
    const result = await runQueue(path.resolve(queue), args.filter((arg) => arg !== "--queue" && arg !== queue));
    return result === "committed" ? 0 : result === "awaiting_verifier" ? 2 : 1;
  }

  throw new Error(`Unknown command: ${command}`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
