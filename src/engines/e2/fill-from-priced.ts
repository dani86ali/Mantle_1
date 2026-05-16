// Bridge: pair priced BoM lines back with the source BoQ items and fill the
// client's original BoQ template. Dispatches to a per-type writer that walks
// the source workbook in the same order as the parser, so priced[i] lands in
// the same row that produced boqLines[i].

import { basename, join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { BoQLineItem } from "@/engines/e2/boq-types";
import { BoQType } from "@/engines/e2/boq-types";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { readExcelFile } from "@/lib/io/excel-reader";
import { fillBoQTemplate, type PricedLineItem } from "@/engines/e2/boq-template-filler";
import { writeTypeB } from "@/engines/e2/writers/write-type-b";
import { writeTypeC } from "@/engines/e2/writers/write-type-c";
import { writeTypeD } from "@/engines/e2/writers/write-type-d";
import { writeTypeE } from "@/engines/e2/writers/write-type-e";
import type { PricedFillLine } from "@/engines/e2/writers/excel-cell";
import { writeBomWorkbook } from "@/engines/e2/bom-workbook-writer";
import { buildTotals, type PricedBomLine } from "@/engines/e2/orchestrator-helpers";

export interface FillFromPricedInput {
  sourceFilePath: string;
  boqLines: BoQLineItem[];
  pricedBoqLines: PricedBomLine[];
  outputDir?: string;
}

export async function fillFromPriced(
  input: FillFromPricedInput,
): Promise<string | undefined> {
  if (input.boqLines.length === 0) return undefined;
  if (input.boqLines.length !== input.pricedBoqLines.length) {
    throw new Error(
      `fillFromPriced: expected pricedBoqLines.length=${input.boqLines.length}, got ${input.pricedBoqLines.length}`
    );
  }

  const excel = readExcelFile(input.sourceFilePath);
  const headerSample = excel.sheets[excel.sheetNames[0]]?.slice(0, 5) ?? [];
  const type = detectBoQType(excel.sheetNames, excel.fileName, headerSample);
  const outPath = defaultOutputPath(input);

  switch (type) {
    case BoQType.TYPE_A_ARIBA:
      return fillTypeA(input, outPath);
    case BoQType.TYPE_B_NRM2:
    case BoQType.TYPE_B_NRM2_ADDOMMIT:
      return writeTypeB(input.sourceFilePath, toFillLines(input), outPath);
    case BoQType.TYPE_C_VENDOR_QUOTE:
      return writeTypeC(input.sourceFilePath, toFillLines(input), outPath);
    case BoQType.TYPE_D_BOM_NO_PRICE:
      return writeTypeD(input.sourceFilePath, toFillLines(input), outPath);
    case BoQType.TYPE_E_TELECOM:
      return writeTypeE(input.sourceFilePath, toFillLines(input), outPath);
    case BoQType.TYPE_UNKNOWN:
    default:
      return fallbackUnknown(input);
  }
}

function defaultOutputPath(input: FillFromPricedInput): string {
  const outDir = input.outputDir ?? tmpdir();
  return join(outDir, `filled-${basename(input.sourceFilePath)}`);
}

function toFillLines(input: FillFromPricedInput): PricedFillLine[] {
  return input.boqLines.map((b, i) => ({
    itemNumber: b.itemNumber,
    partNumber: b.partNumber,
    unitPrice: input.pricedBoqLines[i].unitSellPrice,
    qty: b.qty,
  }));
}

function fillTypeA(input: FillFromPricedInput, outPath: string): Promise<string> {
  const currency = inferCurrency(input.boqLines);
  const items: PricedLineItem[] = input.boqLines.map((b, i) => ({
    itemNumber: b.itemNumber,
    unitPrice: input.pricedBoqLines[i].unitSellPrice,
    currency,
    manufacturer: b.manufacturer,
    modelPartNumber: b.metadata?.modelPartNumber,
    mpn: b.partNumber,
    intendToRespond: "Yes" as const,
  }));
  return fillBoQTemplate({
    sourceWorkbookPath: input.sourceFilePath,
    lineItems: items,
    outputPath: outPath,
    templateType: "type_a",
  });
}

// Used when the source workbook doesn't match any known template — we can't
// fill it format-preservingly, so we emit a standalone priced workbook the
// caller can attach alongside their submission.
async function fallbackUnknown(
  input: FillFromPricedInput,
): Promise<string> {
  console.warn(
    `fillFromPriced: client BoQ format unrecognized for ${basename(input.sourceFilePath)} — emitting standalone priced workbook instead of a filled template`
  );
  const totals = buildTotals(input.pricedBoqLines);
  const outDir = input.outputDir
    ? join(input.outputDir, "fallback")
    : join(tmpdir(), "bomatic-e2-fallback", randomUUID());
  return writeBomWorkbook({
    priced: input.pricedBoqLines,
    totals,
    validationResults: [],
    vatRate: 0,
    country: "",
    outputDir: outDir,
  });
}

function inferCurrency(boqLines: BoQLineItem[]): string {
  for (const b of boqLines) {
    if (b.currency) return b.currency;
  }
  return "USD";
}
