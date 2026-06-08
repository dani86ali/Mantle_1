/**
 * Operator command: capture controlled Quick BoM demo QA evidence before a demo.
 *
 * This is an evidence-CAPTURE helper only. It does not change product behavior and
 * does not itself perform browser QA. It drives the existing deterministic operator
 * command (scripts/write-honeywell-quick-bom-demo.ts, Prompt 73) as a child process,
 * records exactly what automated evidence was produced, and records whether a human
 * ran manual browser QA - defaulting to not_run so the evidence never overstates what
 * was checked.
 *
 * Flow: parse the narrow flag set (validating the manual browser status BEFORE writing
 * anything, so an unsupported status fails fast with no misleading evidence on disk),
 * run "npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts --output <workbook>",
 * capture its command string, exit code, stdout, and stderr, then write a markdown
 * evidence file. The automated workbook command is marked "pass" ONLY when the child
 * exits 0 and the workbook file exists non-empty; otherwise the evidence honestly
 * records "fail" and the script exits nonzero. The full child stdout is embedded
 * verbatim (it already carries the operator summary line counts and totals).
 *
 * Authority stays split and is restated in the evidence as boundaries, never as
 * runtime behavior: configuration authority is the approved Honeywell Batch 1+2+3 rule
 * pack only; pricing authority is the committed Honeywell demo fixture only. This
 * script does NO runtime AI decision, catalog lookup, pricing/validation decision, SKU
 * replacement or silent substitution, API call, DB write, or UI work. It imports only
 * Node built-ins and shells out to the existing operator command - it imports no
 * product module. Default output lands under the OS temp dir, never inside a tracked
 * source path. Source is ASCII-only.
 *
 * Run:
 *   npx.cmd tsx scripts/write-quick-bom-demo-qa-evidence.ts
 *   npx.cmd tsx scripts/write-quick-bom-demo-qa-evidence.ts --output-dir <dir>
 *   npx.cmd tsx scripts/write-quick-bom-demo-qa-evidence.ts --manual-browser-status passed --manual-browser-notes "..."
 */
import { spawnSync } from "child_process";
import { mkdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// The deterministic operator workbook command this evidence writer drives. Run as a
// child process (never imported), so this script imports only Node built-ins.
const CHILD_SCRIPT_REL = "scripts/write-honeywell-quick-bom-demo.ts";

// Default output sits under a temp/demo folder, never inside tracked source dirs.
const DEFAULT_OUTPUT_DIR = path.join(tmpdir(), "bomatic-quick-bom-demo-qa");
const EVIDENCE_FILE_NAME = "quick-bom-demo-qa-evidence.md";
const WORKBOOK_FILE_NAME = "honeywell-quick-bom-demo.xlsx";

const MANUAL_BROWSER_STATUSES = ["not_run", "passed", "failed"] as const;
type ManualBrowserStatus = (typeof MANUAL_BROWSER_STATUSES)[number];

// --- Arguments --------------------------------------------------------------

interface CliArgs {
  outputDir?: string;
  evidenceFile?: string;
  workbookOutput?: string;
  manualBrowserStatus: ManualBrowserStatus;
  manualBrowserNotes?: string;
}

function isManualBrowserStatus(value: string): value is ManualBrowserStatus {
  return (MANUAL_BROWSER_STATUSES as readonly string[]).includes(value);
}

/**
 * Parse the narrow flag set. The manual browser status is validated here so an
 * unsupported value throws before any directory or file is written.
 */
function parseArgs(argv: readonly string[]): CliArgs {
  let outputDir: string | undefined;
  let evidenceFile: string | undefined;
  let workbookOutput: string | undefined;
  let manualBrowserStatus = "not_run";
  let manualBrowserNotes: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    const take = (): string => {
      if (value === undefined) throw new Error(`missing value for ${flag}`);
      i += 1;
      return value;
    };
    if (flag === "--output-dir") outputDir = take();
    else if (flag === "--evidence-file") evidenceFile = take();
    else if (flag === "--workbook-output") workbookOutput = take();
    else if (flag === "--manual-browser-status") manualBrowserStatus = take();
    else if (flag === "--manual-browser-notes") manualBrowserNotes = take();
    else throw new Error(`unknown argument: ${flag}`);
  }

  if (!isManualBrowserStatus(manualBrowserStatus)) {
    throw new Error(
      `unsupported --manual-browser-status: ${manualBrowserStatus} ` +
        `(expected one of ${MANUAL_BROWSER_STATUSES.join(", ")})`
    );
  }

  return { outputDir, evidenceFile, workbookOutput, manualBrowserStatus, manualBrowserNotes };
}

// --- Helpers ----------------------------------------------------------------

/** Size in bytes of a regular file, or -1 if it is absent or not a file. */
function fileSizeBytes(p: string): number {
  try {
    const s = statSync(p);
    return s.isFile() ? s.size : -1;
  } catch {
    return -1;
  }
}

interface EvidenceInput {
  generatedAt: string;
  command: string;
  workbookOutput: string;
  automatedStatus: "pass" | "fail";
  childExitCode: number | null;
  childStdout: string;
  childStderr: string;
  manualBrowserStatus: ManualBrowserStatus;
  manualBrowserNotes?: string;
}

/** Build the ASCII markdown evidence document. */
function buildEvidenceMarkdown(input: EvidenceInput): string {
  const exitCodeText = input.childExitCode === null ? "none" : String(input.childExitCode);
  const lines: string[] = [
    "# Quick BoM Demo QA Evidence",
    "",
    `Generated at: ${input.generatedAt}`,
    "",
    "## Automated workbook command",
    "",
    `Command: ${input.command}`,
    `Workbook output: ${input.workbookOutput}`,
    `Child exit code: ${exitCodeText}`,
    `Automated workbook command: ${input.automatedStatus}`,
    "",
    "### Captured stdout",
    "",
    "```",
    input.childStdout.replace(/\s+$/, ""),
    "```",
    "",
    "### Captured stderr",
    "",
    "```",
    input.childStderr.replace(/\s+$/, ""),
    "```",
    "",
    "## Manual browser QA",
    "",
    `Manual browser QA status: ${input.manualBrowserStatus}`,
  ];
  if (input.manualBrowserNotes !== undefined && input.manualBrowserNotes !== "") {
    lines.push(`Manual browser QA notes: ${input.manualBrowserNotes}`);
  }
  lines.push(
    "",
    "## Authority boundaries",
    "",
    "- Honeywell MVP demo scope only",
    "- configuration authority is approved Honeywell Batch 1+2+3 only",
    "- pricing authority is committed Honeywell demo fixture only",
    "- no runtime AI decisions",
    "- no production Cisco pricing claim",
    "- no broad Cisco-general authority",
    "- no silent SKU substitution or replacement authority",
    "- optics are not auto-attached under switches",
    ""
  );
  return lines.join("\n");
}

// --- Run + capture + write --------------------------------------------------

function main(): void {
  // Parse first; an unsupported manual browser status throws here, before any write.
  const args = parseArgs(process.argv.slice(2));

  const outputDir = path.resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
  const workbookOutput = path.resolve(args.workbookOutput ?? path.join(outputDir, WORKBOOK_FILE_NAME));
  const evidenceFile = path.resolve(args.evidenceFile ?? path.join(outputDir, EVIDENCE_FILE_NAME));

  mkdirSync(path.dirname(workbookOutput), { recursive: true });
  mkdirSync(path.dirname(evidenceFile), { recursive: true });

  // Repo-relative command. The child resolves its own --output and creates its dir.
  const command = `npx.cmd tsx "${CHILD_SCRIPT_REL}" --output "${workbookOutput}"`;
  const child = spawnSync(command, { cwd: process.cwd(), shell: true, encoding: "utf8" });

  const childStdout = typeof child.stdout === "string" ? child.stdout : "";
  const childStderr = typeof child.stderr === "string" ? child.stderr : "";
  const childExitCode = typeof child.status === "number" ? child.status : null;

  // Pass only when the child exited 0 AND the workbook exists non-empty. stderr is
  // captured for the record but never gates pass (tooling may warn on a clean run).
  const workbookSize = fileSizeBytes(workbookOutput);
  const commandOk = child.error === undefined && childExitCode === 0;
  const automatedStatus: "pass" | "fail" = commandOk && workbookSize > 0 ? "pass" : "fail";

  const markdown = buildEvidenceMarkdown({
    generatedAt: new Date().toISOString(),
    command,
    workbookOutput,
    automatedStatus,
    childExitCode,
    childStdout,
    childStderr,
    manualBrowserStatus: args.manualBrowserStatus,
    manualBrowserNotes: args.manualBrowserNotes,
  });

  writeFileSync(evidenceFile, markdown, { encoding: "utf8" });

  console.log("[write-quick-bom-demo-qa-evidence] Quick BoM demo QA evidence");
  console.log(`evidence file: ${evidenceFile}`);
  console.log(`workbook output: ${workbookOutput}`);
  console.log(`automated workbook command: ${automatedStatus}`);
  console.log(`manual browser QA status: ${args.manualBrowserStatus}`);

  if (automatedStatus !== "pass") {
    console.error(
      `automated workbook command did not pass (exit code ` +
        `${childExitCode === null ? "none" : childExitCode}, workbook bytes ${workbookSize})`
    );
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
