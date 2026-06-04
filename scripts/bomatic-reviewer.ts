import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReviewerVerdictValue = "commit" | "cleanup" | "stop";

export interface ReviewerVerdict {
  verdict: ReviewerVerdictValue;
  commitMessage?: string;
  cleanupPrompt?: string;
  reason: string;
  warnings: string[];
}

export interface BuildReviewerPromptInput {
  repoDir: string;
  runDir: string;
  background: string;
  artifacts: Record<string, string>;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

interface ReviewerOptions {
  repoDir: string;
  runDir: string;
  codexCommand: string;
  backgroundFile: string;
  model?: string;
  profile?: string;
  timeoutMs: number;
  maxFileChars: number;
  dryRun: boolean;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_FILE_CHARS = 180_000;
const DEFAULT_BACKGROUND_FILE =
  process.platform === "win32"
    ? "C:\\tmp\\bomatic-reviewer-background.md"
    : path.join(os.tmpdir(), "bomatic-reviewer-background.md");

const REVIEW_ARTIFACTS = [
  "bomatic-review-summary.md",
  "prompt.md",
  "guard-report.json",
  "changed-files.txt",
  "git-status.txt",
  "git-diff-stat.txt",
  "git-diff.patch",
  "typecheck.log",
  "tests.log",
  "claude-transcript.txt",
] as const;

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["commit", "cleanup", "stop"] },
    commitMessage: { type: "string" },
    cleanupPrompt: { type: "string" },
    reason: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "commitMessage", "cleanupPrompt", "reason", "warnings"],
};

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseNumberOption(args: string[], name: string, fallback: number): number {
  const raw = readOption(args, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const headChars = Math.floor(maxChars * 0.45);
  const tailChars = Math.floor(maxChars * 0.45);
  const omitted = value.length - headChars - tailChars;
  return [
    value.slice(0, headChars),
    "",
    `[... omitted ${omitted} chars; full artifact is available in the run directory ...]`,
    "",
    value.slice(value.length - tailChars),
  ].join("\n");
}

async function readArtifact(runDir: string, name: string, maxChars: number): Promise<string> {
  const filePath = path.join(runDir, name);
  if (!existsSync(filePath)) return "(missing)";
  return truncate(await readFile(filePath, "utf8"), maxChars);
}

async function collectArtifacts(runDir: string, maxChars: number): Promise<Record<string, string>> {
  const entries = await Promise.all(
    REVIEW_ARTIFACTS.map(async (name) => [name, await readArtifact(runDir, name, maxChars)] as const)
  );
  return Object.fromEntries(entries);
}

export function buildReviewerPrompt(input: BuildReviewerPromptInput): string {
  const artifactSections = Object.entries(input.artifacts)
    .map(
      ([name, content]) => [
        `## ${name}`,
        "",
        "```text",
        content.trimEnd(),
        "```",
        "",
      ].join("\n")
    )
    .join("\n");

  return [
    "You are BOMATIC #3, the verifier/reviewer/architect for the BOMATIC Claude/Codex implementation loop.",
    "",
    "You are not the implementation executor. Claude already edited the repo. Your job is to decide whether the run is complete, needs a cleanup prompt for the same Claude session, or must stop.",
    "",
    `Repo: ${input.repoDir}`,
    `Harness run directory: ${input.runDir}`,
    "",
    "Durable BOMATIC reviewer background follows. Treat it as feedforward context, then review the run artifacts below.",
    "",
    "## BOMATIC Reviewer Background Pack",
    "",
    "```text",
    input.background.trimEnd(),
    "```",
    "",
    "Return only one JSON object matching this schema. Include every key; use an empty string for commitMessage or cleanupPrompt when the field is not applicable.",
    "",
    "```json",
    JSON.stringify(
      {
        verdict: "commit | cleanup | stop",
        commitMessage: "Required when verdict is commit, otherwise empty string.",
        cleanupPrompt: "Required when verdict is cleanup, otherwise empty string.",
        reason: "Required.",
        warnings: [],
      },
      null,
      2
    ),
    "```",
    "",
    "Verdict rules:",
    "- Use commit only when the prompt is actually complete, the changed files are scoped, typecheck/tests pass or are intentionally skipped with a defensible reason, and the architecture boundaries are respected.",
    "- Use cleanup when the same Claude session can fix the issue with a narrow follow-up. The cleanupPrompt must be pasteable directly to Claude and must say not to commit.",
    "- Use stop for forbidden path changes, stash changes, Claude-created commits, unscoped/dependency changes, architecture boundary violations, runtime AI/catalog/pricing/config decisions where forbidden, or anything that needs human intervention.",
    "- Commit messages should be concise conventional commits.",
    "- Treat the local guard report as evidence, not as your decision. You are the reviewer.",
    "",
    "Architecture boundaries to enforce:",
    "- Durable product object is Project.",
    "- Quick BoM flow is normalized BoQ -> SKU/intent resolution -> configuration expansion draft -> engineer review -> accepted configuration_expansion artifact -> deterministic SAR pricing -> pricing review approval -> Mantle-format export.",
    "- Runtime AI must not make SKU/configuration/pricing decisions.",
    "- Runtime must use deterministic approved structured data.",
    "- Pricing authority and configuration authority must remain separate.",
    "- Do not allow stc-knowledge/ or .claude/settings.local.json changes.",
    "",
    "Evidence follows.",
    "",
    artifactSections,
  ].join("\n");
}

export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenced) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  throw new Error("Reviewer output did not contain a JSON object.");
}

export function parseReviewerVerdict(raw: string): ReviewerVerdict {
  const parsed: unknown = JSON.parse(extractJsonObject(raw));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Reviewer verdict must be a JSON object.");
  }
  const value = parsed as Record<string, unknown>;
  const verdict = value.verdict;
  const reason = value.reason;
  if (verdict !== "commit" && verdict !== "cleanup" && verdict !== "stop") {
    throw new Error("Reviewer verdict must be commit, cleanup, or stop.");
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new Error("Reviewer verdict requires a non-empty reason.");
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

async function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; input: string; timeoutMs: number; shell: boolean }
): Promise<CommandResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell,
      windowsHide: true,
      env: process.env,
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
    child.stdin?.on("error", (error) => {
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
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
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
      });
    });

    try {
      child.stdin?.write(options.input);
      child.stdin?.end();
    } catch (error: unknown) {
      stderr += `${error instanceof Error ? error.message : String(error)}\n`;
    }
  });
}

async function writeText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function runReviewer(options: ReviewerOptions): Promise<ReviewerVerdict> {
  const background = existsSync(options.backgroundFile)
    ? await readFile(options.backgroundFile, "utf8")
    : `(missing background file: ${options.backgroundFile})`;
  const artifacts = await collectArtifacts(options.runDir, options.maxFileChars);
  const prompt = buildReviewerPrompt({
    repoDir: options.repoDir,
    runDir: options.runDir,
    background,
    artifacts,
  });

  const promptPath = path.join(options.runDir, "bomatic-reviewer-prompt.md");
  const schemaPath = path.join(options.runDir, "bomatic-reviewer-verdict.schema.json");
  const lastMessagePath = path.join(options.runDir, "bomatic-reviewer-last-message.txt");
  const logPath = path.join(options.runDir, "bomatic-reviewer-codex.log");
  await writeText(promptPath, prompt);
  await writeText(path.join(options.runDir, "bomatic-reviewer-background.snapshot.md"), background);
  await writeText(schemaPath, `${JSON.stringify(VERDICT_SCHEMA, null, 2)}\n`);

  if (options.dryRun) {
    return {
      verdict: "stop",
      reason: `Dry run wrote reviewer prompt to ${promptPath}.`,
      warnings: [],
    };
  }

  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--cd",
    options.repoDir,
    "--add-dir",
    options.runDir,
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    lastMessagePath,
    "--color",
    "never",
    "--ephemeral",
  ];
  if (options.model) args.push("--model", options.model);
  if (options.profile) args.push("--profile", options.profile);
  args.push("-");

  const result = await runProcess(options.codexCommand, args, {
    cwd: options.repoDir,
    input: prompt,
    timeoutMs: options.timeoutMs,
    shell: process.platform === "win32",
  });
  await writeText(
    logPath,
    [
      `$ ${options.codexCommand} ${args.join(" ")}`,
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
    ].join("\n")
  );

  if (result.exitCode !== 0) {
    throw new Error(`Codex reviewer exited with code ${result.exitCode}. See ${logPath}`);
  }

  const raw = existsSync(lastMessagePath)
    ? await readFile(lastMessagePath, "utf8")
    : result.stdout;
  const verdict = parseReviewerVerdict(raw);
  await writeText(path.join(options.runDir, "bomatic-reviewer-verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

function optionsFromArgs(args: string[]): ReviewerOptions {
  const runDir = readOption(args, "--run-dir") ?? process.env.BOMATIC_RUN_DIR;
  if (!runDir) throw new Error("--run-dir is required, or set BOMATIC_RUN_DIR.");
  return {
    repoDir: path.resolve(readOption(args, "--repo") ?? process.cwd()),
    runDir: path.resolve(runDir),
    codexCommand: readOption(args, "--codex-command") ?? "codex",
    backgroundFile: path.resolve(readOption(args, "--background-file") ?? DEFAULT_BACKGROUND_FILE),
    model: readOption(args, "--model"),
    profile: readOption(args, "--profile"),
    timeoutMs: parseNumberOption(args, "--timeout-ms", DEFAULT_TIMEOUT_MS),
    maxFileChars: parseNumberOption(args, "--max-file-chars", DEFAULT_MAX_FILE_CHARS),
    dryRun: hasFlag(args, "--dry-run"),
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/bomatic-reviewer.ts --run-dir <C:\\tmp\\bomatic-runs\\prompt-###> [options]",
    "",
    "Harness usage:",
    "  --verifier-command \"npx.cmd tsx scripts/bomatic-reviewer.ts\"",
    "",
    "Options:",
    "  --repo <dir>             Repo directory. Defaults to cwd.",
    "  --background-file <file>  Reviewer background pack. Defaults to C:\\tmp\\bomatic-reviewer-background.md on Windows.",
    "  --model <model>          Optional Codex model override.",
    "  --profile <profile>      Optional Codex config profile.",
    "  --timeout-ms <ms>        Reviewer timeout. Defaults to 30 minutes.",
    "  --max-file-chars <n>     Per-artifact prompt excerpt size. Defaults to 180000.",
    "  --dry-run                Write the reviewer prompt and return a stop JSON without calling Codex.",
  ].join("\n");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return 0;
  }
  const verdict = await runReviewer(optionsFromArgs(args));
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  return 0;
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
