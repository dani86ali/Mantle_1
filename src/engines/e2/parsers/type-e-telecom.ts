import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

// A=0 unused, B=1 ItemCode, C=2 ItemDescription, D=3 UOM,
// E=4 UnitPrice, F=5 STCQty, G=6 VendorQty,
// H=7 GrossAmount, I=8 Discount, J=9 NetAmount,
// K=10 NetUnitPrice, L=11 STCDescription
const COL = {
  itemCode: 1,
  itemDesc: 2,
  uom: 3,
  unitPrice: 4,
  stcQty: 5,
  vendorQty: 6,
  gross: 7,
  discount: 8,
  net: 9,
  stcDesc: 11,
} as const;

function cell(row: string[], idx: number): string {
  return (row[idx] ?? "").trim();
}

function parseNum(s: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

type FoundSheet = { rows: string[][]; headerIdx: number };

function findMainSheet(sheets: Record<string, string[][]>): FoundSheet {
  for (const rows of Object.values(sheets)) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (
        cell(row, COL.itemCode).toLowerCase().includes("item code") &&
        cell(row, COL.unitPrice).toLowerCase().includes("unit price")
      ) {
        return { rows, headerIdx: i };
      }
    }
  }
  throw new Error(
    'No sheet with "Item Code" and "Unit Price" header found in Type E workbook'
  );
}

export function parseTypeE(sheets: Record<string, string[][]>): BoQLineItem[] {
  SheetsSchema.parse(sheets);

  const { rows, headerIdx } = findMainSheet(sheets);
  const items: BoQLineItem[] = [];
  let stcItemIndex = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const itemCode = cell(row, COL.itemCode);
    const itemDesc = cell(row, COL.itemDesc);
    const stcDescVal = cell(row, COL.stcDesc);
    const uom = cell(row, COL.uom);
    const unitPriceStr = cell(row, COL.unitPrice);
    const stcQtyStr = cell(row, COL.stcQty);
    const vendorQtyStr = cell(row, COL.vendorQty);
    const grossStr = cell(row, COL.gross);
    const discountStr = cell(row, COL.discount);
    const netStr = cell(row, COL.net);

    // STC-defined: L non-blank, B/C/D/E all blank
    const isStcDefined =
      stcDescVal !== "" &&
      itemCode === "" &&
      itemDesc === "" &&
      uom === "" &&
      unitPriceStr === "";

    // Vendor item: B and C both non-blank
    const isVendorItem = itemCode !== "" && itemDesc !== "";

    if (!isStcDefined && !isVendorItem) continue;

    const stcQty = parseNum(stcQtyStr);
    if (isStcDefined && stcQty === undefined) continue; // malformed STC item

    const metadata: Record<string, string> = {};
    if (vendorQtyStr) metadata.vendorQty = vendorQtyStr;
    if (grossStr) metadata.grossAmount = grossStr;
    if (discountStr) metadata.discountAmount = discountStr;
    if (netStr) metadata.netAmount = netStr;
    if (isVendorItem && stcDescVal) metadata.stcDescription = stcDescVal;

    stcItemIndex++;

    items.push({
      itemNumber: isVendorItem ? itemCode : `STC-${stcItemIndex}`,
      description: isVendorItem ? itemDesc : stcDescVal,
      qty: stcQty ?? 0,
      unit: uom,
      unitPrice: parseNum(unitPriceStr),
      totalPrice: parseNum(netStr),
      currency: "KWD",
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }

  return items;
}
