import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

// A=0 unused, B=1 S.No, C=2 Description, D=3 QTY,
// E=4 U.Price(SAR), F=5 T.Price(SAR), G=6 Delivery ETA
const COL = {
  sNo: 1,
  desc: 2,
  qty: 3,
  unitPrice: 4,
  totalPrice: 5,
  eta: 6,
} as const;

const ITEM_NUM_RE = /^\d+\.\d+$/;

function cell(row: string[], idx: number): string {
  return (row[idx] ?? "").trim();
}

function parseNum(s: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      cell(row, COL.qty).toUpperCase() === "QTY" &&
      cell(row, COL.unitPrice).toLowerCase().includes("price")
    ) {
      return i;
    }
  }
  return -1;
}

export function parseTypeC(sheets: Record<string, string[][]>): BoQLineItem[] {
  SheetsSchema.parse(sheets);

  const items: BoQLineItem[] = [];

  for (const [, rows] of Object.entries(sheets)) {
    const headerIdx = findHeaderRowIndex(rows);
    if (headerIdx === -1) continue;

    let currentSection = "";

    for (const row of rows.slice(headerIdx + 1)) {
      const sNo = cell(row, COL.sNo);
      const desc = cell(row, COL.desc);
      const qtyStr = cell(row, COL.qty);
      const priceStr = cell(row, COL.unitPrice);
      const totalStr = cell(row, COL.totalPrice);

      if (!sNo && !desc) continue;
      if (qtyStr.toUpperCase() === "QTY") continue; // repeat header row

      if (!ITEM_NUM_RE.test(sNo)) {
        // Section/group header: has label text but no numeric data in D/E/F
        if (!qtyStr && !priceStr && !totalStr) {
          currentSection = sNo || desc;
        }
        continue;
      }

      const qty = parseNum(qtyStr);
      if (qty === undefined) continue;

      const eta = cell(row, COL.eta);
      const metadata: Record<string, string> = {};
      if (eta) metadata.deliveryETA = eta;

      items.push({
        itemNumber: sNo,
        description: desc,
        qty,
        unit: "",
        unitPrice: parseNum(priceStr),
        totalPrice: parseNum(totalStr),
        currency: "SAR",
        section: currentSection || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    }
  }

  return items;
}
