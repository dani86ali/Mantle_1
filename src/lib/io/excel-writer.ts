import * as XLSX from "xlsx";
import { writeFile } from "fs/promises";
import { buildSummarySheet } from "./excel-summary-sheet";

export interface BoMExportLine {
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitListPrice: number;
  unitSellPrice: number;
  extendedSell: number;
  currency: string;
  /** Per-line validation rollup ("pass" / "warn" / "fail"). Optional. */
  validationStatus?: string;
}

export interface BoMSummaryTotals {
  hardwareTotal?: number;
  softwareTotal?: number;
  serviceTotal?: number;
  subscriptionTotal?: number;
  subtotalExVat: number;
  vatRate?: number;
  vatAmount: number;
  grandTotalIncVat: number;
}

export interface BoMExportMetadata {
  customerName: string;
  estimateId: string;
  date: string;
  country: string;
  /** Optional totals — when present, the writer emits a Summary sheet and a
   *  VAT + Grand Total Inc VAT row in the Price Estimate footer. */
  summary?: BoMSummaryTotals;
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
const VALIDATION_HEADER = "Validation";

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

  const hasValidationCol = bom.some((l) => typeof l.validationStatus === "string" && l.validationStatus.length > 0);
  const headerRow: (string | null)[] = [...COL_HEADERS];
  if (hasValidationCol) headerRow.push(VALIDATION_HEADER);
  rows.push(headerRow);
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
      const row: (string | number | null)[] = [
        line.sku,
        line.description,
        line.qty,
        line.unitListPrice,
        line.unitSellPrice,
        Number(disc.toFixed(2)),
        line.extendedSell,
      ];
      if (hasValidationCol) row.push(line.validationStatus ?? "");
      rows.push(row);
      totals[group] += line.extendedSell;
    }
  }

  // Footer
  rows.push([]);
  rows.push([null, null, null, null, null, "Product Total:", totals.product]);
  rows.push([null, null, null, null, null, "Service Total:", totals.service]);
  rows.push([null, null, null, null, null, "Subscription Total:", totals.subscription]);
  const grandExVat = totals.product + totals.service + totals.subscription;
  rows.push([null, null, null, null, null, "Grand Total:", grandExVat]);
  if (metadata.summary) {
    rows.push([null, null, null, null, null, "VAT:", metadata.summary.vatAmount]);
    rows.push([null, null, null, null, null, "Grand Total Inc VAT:", metadata.summary.grandTotalIncVat]);
  }

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
  if (metadata.summary) {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(metadata.summary, currency), "Summary");
  }

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
