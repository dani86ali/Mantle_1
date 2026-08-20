/**
 * Operator command: write the Honeywell Quick BoM Mantle demo workbook on demand.
 *
 * This is the Prompt 73 local command for the Honeywell Quick BoM demo. It
 * runs the SAME verified
 * in-memory path the Prompt 71 end-to-end test proves
 * (tests/lib/projects/honeywell-quick-bom-demo-e2e.test.ts): it builds the
 * Honeywell-shaped normalized BoQ and human-accepted SKU decisions inline, builds
 * the configuration-expansion draft, generates EXPLICIT accept decisions for every
 * expansion line (nothing is auto-approved), runs
 * runHoneywellQuickBomDemoMantleExportModel, and writes the resulting Mantle model
 * to a fresh .xlsx with writeMantlePriceEstimateWorkbook. It then prints a concise
 * operator summary (output path, line counts, representative quantities, totals)
 * derived from the computed model - never hardcoded.
 *
 * Authority stays split. Configuration authority is the approved Batch 1+2+3 rule
 * pack (selected inside the runner) plus the explicit engineer expansion review
 * generated here; pricing authority is the committed Honeywell demo pricing fixture
 * only - demo scope only, not production Cisco pricing. The command does NO runtime
 * AI, catalog lookup, SKU replacement/substitution, pricing/validation decision, API
 * call, DB write, artifact creation, approval transition, or export_package creation.
 * Optics stay standalone customer lines; replacements stay deferred.
 *
 * It reads NO customer-uploaded or benchmark workbook at runtime (not
 * Honeywell_BoQ_priced.xlsx, Estimate_NB167337237YA.xlsx, or cisco_gpl_sar.csv -
 * those were evidence for the committed fixture, never runtime inputs) and never
 * mutates the committed Mantle template: the writer reads the template and writes a
 * separate output file. Imports are relative so the script runs under tsx without
 * tsconfig path-alias resolution (matching worker.ts). Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11A.1).
 *
 * Run:
 *   npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts
 *   npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts --output <path>
 *   npx.cmd tsx scripts/write-honeywell-quick-bom-demo.ts --output <path> --project-id <id> --deal-id <id> --price-list <name>
 */
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import {
  buildHoneywellQuickBomConfigurationExpansionDraft,
  runHoneywellQuickBomDemoMantleExportModel,
} from "../src/lib/projects/quick-bom-runner";
import { writeMantlePriceEstimateWorkbook } from "../src/lib/projects/mantle-workbook-writer";
import type {
  CanonicalBoqLine,
  ProjectPricingConfig,
  SkuResolutionDecision,
} from "../src/types/project";

// --- Customer-provided Honeywell SKUs (demo fixture, mirrors the Prompt 71 e2e) ---

const CW9178 = "CW9178I-CFG";
const SUB = "CISCO-NETWORK-SUB";
const C9300X = "C9300X-48HX-A";
const C9300L = "C9300L-24P-4X-A";
const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";
const PHONE = "CP-7841-K9=";

// Customer BoQ in customer order: wireless AP, subscription parent, two switches,
// two standalone optics, then the phone. Quantities are the demo-specified values.
const FIXTURE_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, CW9178, 12],
  [2, SUB, 1],
  [3, C9300X, 7],
  [4, C9300L, 6],
  [5, OPTIC_A, 12],
  [6, OPTIC_B, 14],
  [7, PHONE, 59],
];

// Caller-supplied pricing config: SAR, markup, rate 0, VAT 15, rounding 2. With
// markup 0 the unit net equals the unit list, so extended net is list * quantity.
const PRICING_CONFIG: ProjectPricingConfig = {
  currency: "SAR",
  mode: "markup",
  ratePercent: 0,
  vatRatePercent: 15,
  roundingDecimals: 2,
};

// Caller-supplied priced-BoQ provenance ids/versions (the runner reads no store).
const PROVENANCE = {
  sourceConfigurationExpansionArtifactId: "ce-demo-cli",
  sourceConfigurationExpansionArtifactVersion: 1,
  sourceNormalizedBoqArtifactId: "nb-demo-cli",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "sku-demo-cli",
  sourceSkuResolutionArtifactVersion: 1,
};

// Default workbook metadata, written into the Mantle summary cells (overridable).
const DEFAULT_META = {
  projectId: "HW-DEMO-PRJ",
  dealId: "HW-DEMO-DEAL",
  priceList: "STC SAR Price List",
};

// Default output sits under a temp/demo folder, never inside tracked source dirs.
const DEFAULT_OUTPUT_PATH = path.join(
  tmpdir(),
  "bomatic-demo-outputs",
  "honeywell-quick-bom-mantle-demo.xlsx"
);

// --- Inline fixture builders (mirror the Prompt 71 e2e fixture) -------------

function boqLine(row: number, sku: string, quantity: number): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    sku,
    description: sku,
    quantity,
    originalCells: { "#": String(row), "Part Number": sku },
  };
}

// Human-accepted SKU decision: each customer SKU is accepted as itself. No AI, fuzzy
// matching, catalog lookup, or replacement is involved (acceptedSku === originalSku).
function acceptDecision(row: number, sku: string): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    originalSku: sku,
    status: "accepted",
    suggestions: [],
    acceptedSku: sku,
  };
}

function buildInput(): { lines: CanonicalBoqLine[]; skuDecisions: SkuResolutionDecision[] } {
  return {
    lines: FIXTURE_ROWS.map(([r, s, q]) => boqLine(r, s, q)),
    skuDecisions: FIXTURE_ROWS.map(([r, s]) => acceptDecision(r, s)),
  };
}

// Explicit engineer accept decision for every expansion draft line. Built from the
// draft itself - the runner never generates these and never auto-approves.
function buildAcceptAllReviewDecisions(input: {
  lines: CanonicalBoqLine[];
  skuDecisions: SkuResolutionDecision[];
}): Array<{ lineId: string; action: "accept" }> {
  const { draft } = buildHoneywellQuickBomConfigurationExpansionDraft(input);
  return draft.lines
    .filter((l) => l.origin === "expansion")
    .map((l) => ({ lineId: l.lineId, action: "accept" as const }));
}

// --- Arguments --------------------------------------------------------------

interface CliArgs {
  output?: string;
  projectId?: string;
  dealId?: string;
  priceList?: string;
}

/** Parse the narrow flag set; only --output is meaningful for a default run. */
function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    const take = (): string => {
      if (value === undefined) throw new Error(`missing value for ${flag}`);
      i += 1;
      return value;
    };
    if (flag === "--output") args.output = take();
    else if (flag === "--project-id") args.projectId = take();
    else if (flag === "--deal-id") args.dealId = take();
    else if (flag === "--price-list") args.priceList = take();
    else throw new Error(`unknown argument: ${flag}`);
  }
  return args;
}

// --- Run + write + summary --------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output ?? DEFAULT_OUTPUT_PATH);
  const projectId = args.projectId ?? DEFAULT_META.projectId;
  const dealId = args.dealId ?? DEFAULT_META.dealId;
  const priceList = args.priceList ?? DEFAULT_META.priceList;

  const input = buildInput();
  const reviewDecisions = buildAcceptAllReviewDecisions(input);
  const run = runHoneywellQuickBomDemoMantleExportModel({
    ...input,
    reviewDecisions,
    pricingConfig: PRICING_CONFIG,
    ...PROVENANCE,
  });

  mkdirSync(path.dirname(outputPath), { recursive: true });
  await writeMantlePriceEstimateWorkbook({
    model: run.mantleModel,
    outputPath,
    projectId,
    dealId,
    priceList,
  });

  // Derive every printed number from the computed model - never hardcode.
  const rows = run.mantleModel.rows;
  const totals = run.mantleModel.totals;
  const uniquePricedSkuCount = new Set(
    run.pricedBoq.lines.filter((l) => l.status === "priced").map((l) => l.acceptedSku)
  ).size;
  const qtyOf = (sku: string): number => {
    const row = rows.find((r) => r.partNumber === sku);
    if (!row) throw new Error(`expected demo SKU not found in model: ${sku}`);
    return row.quantity;
  };

  console.log("[write-honeywell-quick-bom-demo] Honeywell Quick BoM Mantle demo workbook");
  console.log(`output path: ${outputPath}`);
  console.log(`row count: ${rows.length}`);
  console.log(`unique priced SKU count: ${uniquePricedSkuCount}`);
  console.log(`unpriced line count: ${totals.unpricedLineCount}`);
  console.log(`standalone optics: ${OPTIC_A} ${qtyOf(OPTIC_A)}, ${OPTIC_B} ${qtyOf(OPTIC_B)}`);
  console.log(
    `representative Batch 3: FAN-T2 ${qtyOf("FAN-T2")}, ` +
      `C9300L-STACK-A ${qtyOf("C9300L-STACK-A")}, STACK-T3A-50CM ${qtyOf("STACK-T3A-50CM")}`
  );
  console.log(
    `totals (SAR): totalPriceSar ${totals.totalPriceSar}, ` +
      `VAT ${totals.vatAmountSar}, totalIncVatSar ${totals.totalIncVatSar}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
