// Bridge: pair priced BoM lines back with the source BoQ items and fill the
// client's original BoQ template. Keeps the orchestrator small.

import { basename, join } from "path";
import { tmpdir } from "os";
import type { BoQLineItem } from "@/engines/e2/boq-types";
import { BoQType } from "@/engines/e2/boq-types";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { readExcelFile } from "@/lib/io/excel-reader";
import { fillBoQTemplate, type PricedLineItem } from "@/engines/e2/boq-template-filler";
import type { PricedBomLine } from "@/engines/e2/orchestrator-helpers";

export interface FillFromPricedInput {
  sourceFilePath: string;
  boqLines: BoQLineItem[];
  pricedBoqLines: PricedBomLine[];
  outputDir?: string;
}

// Returns the filled workbook path, or undefined if the source isn't a supported
// fillable template (currently only Type A / Ariba).
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
  if (type !== BoQType.TYPE_A_ARIBA) return undefined;

  const currency = inferCurrency(input.boqLines);
  const items: PricedLineItem[] = input.boqLines.map((b, i) => {
    const priced = input.pricedBoqLines[i];
    return {
      itemNumber: b.itemNumber,
      unitPrice: priced.unitSellPrice,
      currency,
      manufacturer: b.manufacturer,
      modelPartNumber: b.metadata?.modelPartNumber,
      mpn: b.partNumber,
      intendToRespond: "Yes" as const,
    };
  });

  const outDir = input.outputDir ?? tmpdir();
  const outPath = join(outDir, `filled-${basename(input.sourceFilePath)}`);
  return fillBoQTemplate({
    sourceWorkbookPath: input.sourceFilePath,
    lineItems: items,
    outputPath: outPath,
    templateType: "type_a",
  });
}

function inferCurrency(boqLines: BoQLineItem[]): string {
  for (const b of boqLines) {
    if (b.currency) return b.currency;
  }
  return "USD";
}
