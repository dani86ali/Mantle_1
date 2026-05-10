import * as XLSX from "xlsx";
import { writeFile } from "fs/promises";

export interface BoMExportLine {
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitListPrice: number;
  unitSellPrice: number;
  extendedSell: number;
  currency: string;
}

export interface BoMExportMetadata {
  customerName: string;
  estimateId: string;
  date: string;
  country: string;
}

type CategoryGroup = "product" | "service" | "subscription";

function classify(category: string): CategoryGroup {
  const c = category.toLowerCase();
  if (c.includes("service") || c.includes("support") || c.includes("smartnet")) {
    return "service";
  }
  if (c.includes("subscription") || c.includes("license") || c.includes("saas")) {
    return "subscription";
  }
  return "product";
}

const GROUP_ORDER: CategoryGroup[] = ["product", "service", "subscription"];
const COL_HEADERS = [
  "Part Number",
  "Description",
  "Qty",
  "Unit List Price",
  "Unit Net Price",
  "Disc%",
  "Extended Net Price",
];

export async function writeBoMExport(
  bom: BoMExportLine[],
  metadata: BoMExportMetadata,
  outputPath: string
): Promise<string> {
  if (!outputPath || typeof outputPath !== "string") {
    throw new Error("writeBoMExport: outputPath must be a non-empty string");
  }

  const currency = bom[0]?.currency || "USD";
  const rows: (string | number | null)[][] = [];

  // Header section
  rows.push(["Price Estimate"]);
  rows.push([`Customer: ${metadata.customerName}`]);
  rows.push([`Country: ${metadata.country}`]);
  rows.push([
    "Price Estimate for planning and information purposes only and is not a binding offer from Cisco.",
  ]);
  rows.push([]);
  rows.push(["Date:", metadata.date, null, null, "Estimate ID:", metadata.estimateId]);
  rows.push([null, null, null, null, "Currency:", currency]);
  rows.push([]);

  // Line items grouped by category
  const totals: Record<CategoryGroup, number> = { product: 0, service: 0, subscription: 0 };
  const grouped: Record<CategoryGroup, BoMExportLine[]> = {
    product: [],
    service: [],
    subscription: [],
  };
  for (const line of bom) {
    grouped[classify(line.category)].push(line);
  }

  rows.push(COL_HEADERS);
  const headerRowIdx = rows.length - 1;

  for (const group of GROUP_ORDER) {
    const lines = grouped[group];
    if (lines.length === 0) continue;
    rows.push([groupLabel(group)]);
    for (const line of lines) {
      const disc =
        line.unitListPrice > 0
          ? ((line.unitListPrice - line.unitSellPrice) / line.unitListPrice) * 100
          : 0;
      rows.push([
        line.sku,
        line.description,
        line.qty,
        line.unitListPrice,
        line.unitSellPrice,
        Number(disc.toFixed(2)),
        line.extendedSell,
      ]);
      totals[group] += line.extendedSell;
    }
  }

  // Footer
  rows.push([]);
  rows.push([null, null, null, null, null, "Product Total:", totals.product]);
  rows.push([null, null, null, null, null, "Service Total:", totals.service]);
  rows.push([null, null, null, null, null, "Subscription Total:", totals.subscription]);
  rows.push([
    null,
    null,
    null,
    null,
    null,
    "Grand Total:",
    totals.product + totals.service + totals.subscription,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 24 },
    { wch: 50 },
    { wch: 6 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
  ];

  applyNumberFormats(ws, headerRowIdx + 1, rows.length - 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Price Estimate");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await writeFile(outputPath, buf);
  return outputPath;
}

function groupLabel(group: CategoryGroup): string {
  if (group === "product") return "Products";
  if (group === "service") return "Services";
  return "Subscriptions";
}

function applyNumberFormats(
  ws: XLSX.WorkSheet,
  firstRow: number,
  lastRow: number
): void {
  const moneyCols = [3, 4, 6];
  const pctCol = 5;
  for (let r = firstRow; r <= lastRow; r++) {
    for (const c of moneyCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
    const pctRef = XLSX.utils.encode_cell({ r, c: pctCol });
    const pctCell = ws[pctRef];
    if (pctCell && typeof pctCell.v === "number") pctCell.z = "0.00";
  }
}
