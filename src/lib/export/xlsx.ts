/**
 * XLSX export matching the Price Estimate template format.
 * Based on shahid-ground-truth.md output format spec.
 *
 * Uses sheetjs (xlsx package). Formatted columns, bold headers,
 * number formatting on price columns. No formulas — computed values only.
 * Single sheet named "Price Estimate".
 */

import * as XLSX from "xlsx";

interface ExportOptions {
  customerName: string;
  estimateId: string;
  priceList: string;
  date: Date;
  summary: Record<string, unknown>;
}

interface ExportLine {
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  unitNetPrice: number;
  discountPercent: number;
  extendedNetPrice: number;
  serviceDurationMonths?: number;
  leadTimeDays?: number;
  smartAccountMandatory: boolean;
  category: string;
}

export function generateXlsx(
  linesRaw: unknown[],
  options: ExportOptions
): Buffer {
  const lines = linesRaw as ExportLine[];
  const wb = XLSX.utils.book_new();

  // Build rows as an array of arrays
  const rows: (string | number | null)[][] = [];

  // Header section
  const dateStr = formatDate(options.date);

  rows.push(["Price Estimate"]);
  rows.push([options.customerName]);
  rows.push([
    "Price Estimate for planning and information purposes only and is not a binding offer from Cisco.",
  ]);
  rows.push([]);
  rows.push(["Date:", dateStr, null, null, "Estimate ID:", options.estimateId]);
  rows.push([null, null, null, null, "Price List:", options.priceList]);
  rows.push([null, null, null, null, null, "All prices are shown in USD"]);
  rows.push([]);

  // Column headers (row index 8)
  const HEADER_ROW = 8;
  rows.push([
    "Part Number",
    "Smart Account Mandatory",
    "Description",
    "Service Duration (Months)",
    "Estimated Lead Time (Days)",
    "Unit List Price",
    "Pricing Term",
    "Qty",
    "Unit Net Price",
    "Disc(%)",
    "Extended Net Price",
  ]);

  // Line items
  let productTotal = 0;
  let serviceTotal = 0;
  let subscriptionTotal = 0;

  for (const line of lines) {
    const smartAcct = line.smartAccountMandatory ? "Yes" : "-";
    const duration = line.serviceDurationMonths
      ? line.serviceDurationMonths
      : "---";
    const leadTime = line.leadTimeDays ?? null;
    const discount =
      line.discountPercent > 0 ? line.discountPercent / 100 : null;

    rows.push([
      line.sku,
      smartAcct,
      line.description ?? "",
      duration,
      leadTime,
      line.unitListPrice,
      "",
      line.quantity,
      line.unitNetPrice,
      discount as number | null,
      line.extendedNetPrice,
    ]);

    if (line.category === "service") {
      serviceTotal += line.extendedNetPrice;
    } else if (
      line.category === "subscription" ||
      line.category === "license"
    ) {
      subscriptionTotal += line.extendedNetPrice;
    } else {
      productTotal += line.extendedNetPrice;
    }
  }

  // Footer totals
  rows.push([]);
  rows.push([
    null, null, null, null, null, null, null, null, null,
    "Product Total:",
    productTotal,
  ]);
  rows.push([
    null, null, null, null, null, null, null, null, null,
    "Service Total:",
    serviceTotal,
  ]);
  rows.push([
    null, null, null, null, null, null, null, null, null,
    "Subscription Total:",
    subscriptionTotal,
  ]);
  rows.push([
    null, null, null, null, null, null, null, null, null,
    "Total Price:",
    productTotal + serviceTotal + subscriptionTotal,
  ]);

  // Cisco legal disclaimer
  rows.push([]);
  rows.push([
    "This document is a Price Estimate for planning and information purposes only and is not a binding offer from Cisco. Cisco reserves the right to change pricing, product availability, and terms at any time without notice.",
  ]);

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 24 }, // Part Number
    { wch: 12 }, // Smart Account
    { wch: 50 }, // Description
    { wch: 14 }, // Service Duration
    { wch: 14 }, // Lead Time
    { wch: 16 }, // Unit List Price
    { wch: 12 }, // Pricing Term
    { wch: 6 },  // Qty
    { wch: 16 }, // Unit Net Price
    { wch: 10 }, // Disc(%)
    { wch: 18 }, // Extended Net Price
  ];

  // Apply number formatting to price columns for line item rows
  const firstDataRow = HEADER_ROW + 1; // 0-indexed row 9
  const lastDataRow = firstDataRow + lines.length - 1;

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    // Unit List Price (col F = 5)
    const cellF = XLSX.utils.encode_cell({ r, c: 5 });
    if (ws[cellF] && typeof ws[cellF].v === "number") {
      ws[cellF].z = "#,##0.00";
    }
    // Unit Net Price (col I = 8)
    const cellI = XLSX.utils.encode_cell({ r, c: 8 });
    if (ws[cellI] && typeof ws[cellI].v === "number") {
      ws[cellI].z = "#,##0.00";
    }
    // Extended Net Price (col K = 10)
    const cellK = XLSX.utils.encode_cell({ r, c: 10 });
    if (ws[cellK] && typeof ws[cellK].v === "number") {
      ws[cellK].z = "#,##0.00";
    }
    // Disc% (col J = 9)
    const cellJ = XLSX.utils.encode_cell({ r, c: 9 });
    if (ws[cellJ] && typeof ws[cellJ].v === "number") {
      ws[cellJ].z = "0%";
    }
  }

  // Format footer total values
  const footerStartRow = lastDataRow + 2; // skip blank row
  for (let r = footerStartRow; r < footerStartRow + 4; r++) {
    const cell = XLSX.utils.encode_cell({ r, c: 10 });
    if (ws[cell] && typeof ws[cell].v === "number") {
      ws[cell].z = "#,##0.00";
    }
  }

  // Bold the title row
  const titleCell = ws["A1"];
  if (titleCell) {
    titleCell.s = { font: { bold: true, sz: 14 } };
  }

  // Bold header row
  for (let c = 0; c < 11; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: HEADER_ROW, c })];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Price Estimate");

  // Write to buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
