/**
 * Operator-runnability test for the Honeywell Quick BoM demo command
 * (scripts/write-honeywell-quick-bom-demo.ts, Prompt 73). It proves the script is
 * RUNNABLE as a command, not just importable: it spawns
 *   npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts --output <temp-xlsx>
 * from the repo root with an explicit temp output path, then asserts the command
 * exits 0, the workbook is written non-empty, the workbook re-opens through the
 * existing Mantle layout locator, the written rows/order/total prove it is the
 * Honeywell Mantle demo workbook, and stdout carries the output path, line counts,
 * representative quantities, and totals.
 *
 * No-stray-write proof: the output lands under the temp dir and the committed Mantle
 * template is byte-identical before and after the run (the writer reads the template
 * and writes a separate file; it never mutates it). Source-hygiene proof: the script
 * imports no AI/catalog/API/UI/DB/artifact/coordinator/adapter/engine/replacement
 * module (the Mantle workbook writer import is allowed). The script source is scanned
 * as text only - never imported - so this test triggers none of the script's runtime.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import ExcelJS from "exceljs";

import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
  type MantlePriceEstimateLayout,
} from "@/lib/projects/mantle-layout-locator";

const REPO_ROOT = process.cwd();
const SCRIPT_REL = "scripts/write-honeywell-quick-bom-demo.ts";
const SCRIPT_PATH = join(REPO_ROOT, SCRIPT_REL);
const TEMPLATE_PATH = join(
  REPO_ROOT,
  "src/templates/mantle/Mantle_Priced_BoQBoM.template.xlsx"
);

// Stable demo landmarks (not the full fixture): the first written part number and
// the last four, in order. Enough to prove the workbook is the Honeywell demo.
const FIRST_SKU = "CW9178I-CFG";
const LAST_FOUR_SKUS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S=", "CP-7841-K9=", "CON-L1NBD-P7PK94P1"];
const EXPECTED_ROW_COUNT = 60;
const EXPECTED_TOTAL_PRICE_SAR = 2185708.76;

let tmpDir: string;
let outputPath: string;
let run: ReturnType<typeof spawnSync>;
let stdout: string;
let templateBefore: Buffer;
let templateAfter: Buffer;
let layout: MantlePriceEstimateLayout;
let ws: ExcelJS.Worksheet;

function colNum(header: string): number {
  return layout.columns.find((c) => c.header === header)!.columnNumber;
}

function partNumberAt(rowOffset: number): ExcelJS.CellValue {
  return ws.getRow(layout.dataStartRowNumber + rowOffset).getCell(colNum("Part Number")).value;
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-hw-quick-bom-cmd-"));
  outputPath = join(tmpDir, "honeywell-quick-bom-demo.xlsx");

  // Run the actual operator command and capture exit status + stdout. The template
  // is read immediately before and after to prove the run never mutates it.
  templateBefore = readFileSync(TEMPLATE_PATH);
  run = spawnSync(`npx.cmd tsx "${SCRIPT_REL}" --output "${outputPath}"`, {
    cwd: REPO_ROOT,
    shell: true,
    encoding: "utf8",
  });
  templateAfter = readFileSync(TEMPLATE_PATH);
  stdout = typeof run.stdout === "string" ? run.stdout : "";

  // Re-open the written workbook through the existing Mantle layout locator.
  layout = await locateMantlePriceEstimateLayout(outputPath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outputPath);
  const sheet = wb.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!sheet) throw new Error("written workbook is missing the Price Estimate sheet");
  ws = sheet;
}, 60000);

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("write-honeywell-quick-bom-demo command - runs and exits 0", () => {
  it("exits 0 with no spawn error", () => {
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
  });
});

describe("write-honeywell-quick-bom-demo command - writes a locatable workbook", () => {
  it("writes a non-empty .xlsx at the explicit temp output path", async () => {
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("re-opens through the Mantle layout locator as the Price Estimate sheet", () => {
    expect(layout.sheetName).toBe(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
    expect(layout.columns.map((c) => c.header)).toContain("Part Number");
    expect(layout.columns.map((c) => c.header)).toContain("Extended Net Price");
  });
});

describe("write-honeywell-quick-bom-demo command - rows prove the Honeywell demo", () => {
  it("writes exactly 60 contiguous data rows before the footer", () => {
    const start = layout.dataStartRowNumber;
    const footerStart = layout.footerRows.reduce(
      (m, f) => Math.min(m, f.rowNumber),
      Number.POSITIVE_INFINITY
    );
    let nonBlank = 0;
    for (let r = start; r < footerStart; r += 1) {
      const v = ws.getRow(r).getCell(colNum("Part Number")).value;
      if (v !== null && v !== undefined && v !== "") nonBlank += 1;
    }
    expect(nonBlank).toBe(EXPECTED_ROW_COUNT);
  });

  it("orders the first row and the last four rows as the demo specifies", () => {
    expect(partNumberAt(0)).toBe(FIRST_SKU);
    expect([56, 57, 58, 59].map((i) => partNumberAt(i))).toEqual(LAST_FOUR_SKUS);
  });

  it("writes the demo Total Price footer result (markup 0, VAT 15)", () => {
    const totalCol = colNum("Extended Net Price");
    const totalPriceRow = layout.footerRows.find((f) => f.label === "Total Price:")!.rowNumber;
    expect(ws.getRow(totalPriceRow).getCell(totalCol).result).toBe(EXPECTED_TOTAL_PRICE_SAR);
  });
});

describe("write-honeywell-quick-bom-demo command - stdout operator summary", () => {
  it("prints the output path", () => {
    expect(stdout).toContain(resolve(outputPath));
  });

  it("prints the line counts", () => {
    expect(stdout).toContain("row count: 60");
    expect(stdout).toContain("unique priced SKU count: 50");
    expect(stdout).toContain("unpriced line count: 0");
  });

  it("prints the standalone optic quantities with their SKUs", () => {
    expect(stdout).toContain("SFP-10G-LR-S= 12");
    expect(stdout).toContain("SFP-10/25G-LR-S= 14");
  });

  it("prints the representative Batch 3 quantities", () => {
    expect(stdout).toContain("FAN-T2 18");
    expect(stdout).toContain("C9300L-STACK-A 12");
    expect(stdout).toContain("STACK-T3A-50CM 6");
  });

  it("prints the totals", () => {
    expect(stdout).toContain("totalPriceSar 2185708.76");
    expect(stdout).toContain("VAT 327856.31");
    expect(stdout).toContain("totalIncVatSar 2513565.07");
  });
});

describe("write-honeywell-quick-bom-demo command - no stray write", () => {
  it("writes the output under the temp dir, not a tracked source dir", () => {
    expect(outputPath.startsWith(tmpdir())).toBe(true);
  });

  it("leaves the committed Mantle template byte-identical", () => {
    expect(templateBefore.equals(templateAfter)).toBe(true);
  });
});

// --- Source hygiene (scanned over the script's import specifiers only) ------

// Tokens the script must never reference in an import specifier: AI/LLM, catalog,
// API/UI, DB/artifact, coordinator, adapter, engine, replacement. Scanned over the
// extracted `from "..."` specifiers ONLY (never raw source), so this list cannot
// self-match. The Mantle workbook writer import is explicitly allowed.
const FORBIDDEN_IMPORT_TOKENS = [
  "anthropic", "open" + "ai", "gemini", "claude", "generative-ai", "llm", "/ai", "agent",
  "catalog", "/api", "route", ".tsx", "/ui", "component",
  "drizzle", "schema", "/db", "db/", "artifact", "coordinator", "adapter", "engine",
  "replacement",
];

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

describe("write-honeywell-quick-bom-demo command - source hygiene", () => {
  it("keeps the script source ASCII-only", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(join(REPO_ROOT, "tests/scripts/write-honeywell-quick-bom-demo.test.ts"), "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("imports no AI, catalog, API/UI, DB/artifact, coordinator, adapter, engine, or replacement module", () => {
    const specs = importSpecifiers(readFileSync(SCRIPT_PATH, "utf8"));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      const lower = s.toLowerCase();
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(lower.includes(token), `import "${s}" matches forbidden "${token}"`).toBe(false);
      }
    }
    // Positive: the command runs the verified path through the runner and the
    // Mantle workbook writer (the writer import is allowed).
    expect(specs).toContain("../src/lib/projects/quick-bom-runner");
    expect(specs).toContain("../src/lib/projects/mantle-workbook-writer");
  });
});
