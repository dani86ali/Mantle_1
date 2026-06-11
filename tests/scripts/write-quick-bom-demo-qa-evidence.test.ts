/**
 * Operator-runnability test for the Quick BoM demo QA evidence writer
 * (scripts/write-quick-bom-demo-qa-evidence.ts, Prompt 126). It proves the script is
 * RUNNABLE as a command, captures honest automated evidence, and never overstates
 * manual browser QA.
 *
 * The script spawns the existing operator command as its own child, so each run pays
 * two tsx cold starts; every spawn therefore lives in a hook/it with a generous
 * timeout (vitest's 5000ms default would flake). The happy-path run uses the default
 * manual browser status (not_run); a second run supplies an explicit "passed" status
 * with notes; a third run supplies an unsupported status and must exit nonzero WITHOUT
 * leaving a misleading pass evidence file on disk.
 *
 * Source-hygiene proof: the script source is scanned as text only (never imported), so
 * none of its runtime fires here, and its import specifiers must all be Node built-ins;
 * this test's own specifiers must be Node built-ins or the vitest test utility. Both
 * sources must be ASCII-only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { builtinModules } from "module";

const REPO_ROOT = process.cwd();
const SCRIPT_REL = "scripts/write-quick-bom-demo-qa-evidence.ts";
const SCRIPT_PATH = join(REPO_ROOT, SCRIPT_REL);
const TEST_PATH = join(REPO_ROOT, "tests/scripts/write-quick-bom-demo-qa-evidence.test.ts");

const EVIDENCE_NAME = "quick-bom-demo-qa-evidence.md";
const WORKBOOK_NAME = "honeywell-quick-bom-demo.xlsx";

// Every temp dir created here is removed in afterAll, regardless of which run made it.
const createdTmpDirs: string[] = [];

async function makeTmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  createdTmpDirs.push(dir);
  return dir;
}

/** Spawn the evidence writer from repo root, quoting every argument for cmd.exe. */
function runEvidence(args: readonly string[]): ReturnType<typeof spawnSync> {
  const cmd = [`npx.cmd tsx "${SCRIPT_REL}"`, ...args.map((a) => `"${a}"`)].join(" ");
  return spawnSync(cmd, { cwd: REPO_ROOT, shell: true, encoding: "utf8" });
}

afterAll(async () => {
  for (const dir of createdTmpDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Happy path: default manual browser status (not_run) --------------------

describe("write-quick-bom-demo-qa-evidence command - default run", () => {
  let outputDir: string;
  let evidencePath: string;
  let workbookPath: string;
  let run: ReturnType<typeof spawnSync>;
  let stdout: string;
  let evidence: string;

  beforeAll(async () => {
    outputDir = await makeTmpDir("bomatic-qa-evidence-default-");
    evidencePath = resolve(join(outputDir, EVIDENCE_NAME));
    workbookPath = resolve(join(outputDir, WORKBOOK_NAME));
    run = runEvidence(["--output-dir", outputDir]);
    stdout = typeof run.stdout === "string" ? run.stdout : "";
    evidence = readFileSync(evidencePath, "utf8");
  }, 120000);

  it("exits 0 with no spawn error", () => {
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
  });

  it("writes a non-empty .xlsx workbook", async () => {
    const stats = await stat(workbookPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("writes a non-empty markdown evidence file", async () => {
    const stats = await stat(evidencePath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("records the automated workbook command as pass and manual browser QA as not_run", () => {
    expect(evidence).toContain("Automated workbook command: pass");
    expect(evidence).toContain("Manual browser QA status: not_run");
  });

  it("embeds the workbook command stdout operator summary verbatim", () => {
    expect(evidence).toContain("row count: 60");
    expect(evidence).toContain("unique priced SKU count: 50");
    expect(evidence).toContain("unpriced line count: 0");
  });

  it("records the authority boundaries", () => {
    expect(evidence).toContain("Honeywell MVP demo scope only");
    expect(evidence).toContain("no runtime AI decisions");
    expect(evidence).toContain("no production Cisco pricing claim");
    expect(evidence).toContain("no silent SKU substitution");
    expect(evidence).toContain("optics are not auto-attached under switches");
  });

  it("prints the evidence file path and workbook path to stdout", () => {
    expect(stdout).toContain(evidencePath);
    expect(stdout).toContain(workbookPath);
  });
});

// --- Explicit manual browser status + notes ---------------------------------

describe("write-quick-bom-demo-qa-evidence command - supplied manual browser status", () => {
  it("records a supplied passed status and the supplied notes", async () => {
    const outputDir = await makeTmpDir("bomatic-qa-evidence-passed-");
    const notes = "verified switch and optic rows render priced in the browser";
    const run = runEvidence([
      "--output-dir",
      outputDir,
      "--manual-browser-status",
      "passed",
      "--manual-browser-notes",
      notes,
    ]);
    expect(run.status).toBe(0);
    const evidence = readFileSync(resolve(join(outputDir, EVIDENCE_NAME)), "utf8");
    expect(evidence).toContain("Manual browser QA status: passed");
    expect(evidence).toContain(notes);
  }, 120000);
});

// --- Unsupported manual browser status --------------------------------------

describe("write-quick-bom-demo-qa-evidence command - rejects unsupported status", () => {
  it("exits nonzero and writes no misleading pass evidence", async () => {
    const outputDir = await makeTmpDir("bomatic-qa-evidence-bogus-");
    const run = runEvidence(["--output-dir", outputDir, "--manual-browser-status", "bogus"]);
    expect(run.status).not.toBe(0);
    // Validation throws before any write, so no evidence file exists at all.
    expect(existsSync(resolve(join(outputDir, EVIDENCE_NAME)))).toBe(false);
  }, 60000);
});

// --- Source hygiene (ASCII + import allowlist over specifiers only) ----------

const NODE_BUILTIN_ROOTS = new Set(builtinModules);
const ALLOWED_TEST_UTILITIES = new Set(["vitest"]);

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

/** Specifier root, stripping a node: prefix and any subpath (fs/promises -> fs). */
function specifierRoot(spec: string): string {
  return spec.replace(/^node:/, "").split("/")[0];
}

describe("write-quick-bom-demo-qa-evidence command - source hygiene", () => {
  it("keeps the script source ASCII-only", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("imports only Node built-ins in the script", () => {
    const specs = importSpecifiers(readFileSync(SCRIPT_PATH, "utf8"));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(NODE_BUILTIN_ROOTS.has(specifierRoot(s)), `script import "${s}" is not a Node built-in`).toBe(true);
    }
  });

  it("imports only Node built-ins and test utilities in this test", () => {
    const specs = importSpecifiers(readFileSync(TEST_PATH, "utf8"));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      const ok = NODE_BUILTIN_ROOTS.has(specifierRoot(s)) || ALLOWED_TEST_UTILITIES.has(s);
      expect(ok, `test import "${s}" is not a Node built-in or allowed test utility`).toBe(true);
    }
  });
});
