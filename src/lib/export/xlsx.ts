/**
 * XLSX export matching the Cisco Price Estimate template format.
 * Based on shahid-ground-truth.md and reference/Routing&Switching.xlsx.
 *
 * Header shows:
 *   - "Price Estimate" title
 *   - Tenant/SI name (e.g., "MantelTech") — the company using BOMatic
 *   - Customer name (e.g., "Al Rajhi Bank") — the end customer
 *   - Cisco legal disclaimer
 *   - Date, Estimate ID, Price List
 */

import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { join } from "path";

const TENANT_NAME = "MantelTech";

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

  const rows: (string | number | null)[][] = [];
  const dateStr = formatDate(options.date);
  const customerDisplay = options.customerName || "Customer";

  // Header section — matches Shahid's real estimate format
  // Row 0: Title
  rows.push(["Price Estimate"]);
  // Row 1: Tenant/SI name (the company using BOMatic)
  rows.push([TENANT_NAME]);
  // Row 2: Customer name (the end customer)
  rows.push([`Customer: ${customerDisplay}`]);
  // Row 3: Cisco disclaimer
  rows.push([
    "Price Estimate for planning and information purposes only and is not a binding offer from Cisco.",
  ]);
  // Row 4: blank
  rows.push([]);
  // Row 5: Date + Estimate ID
  rows.push(["Date:", dateStr, null, null, "Estimate ID:", options.estimateId]);
  // Row 6: Deal ID + Price List
  rows.push([null, null, null, null, "Deal ID:", "N/A"]);
  // Row 7: Price List
  rows.push([null, null, null, null, "Price List:", options.priceList]);
  // Row 8: Currency note
  rows.push([null, null, null, null, null, "All prices are shown in USD"]);
  // Row 9: blank
  rows.push([]);

  // Column headers (row index 10)
  const HEADER_ROW = 10;
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
    const netPrice = line.unitNetPrice ?? line.unitListPrice ?? 0;
    const extended = line.extendedNetPrice ?? netPrice * line.quantity;
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
      netPrice,
      discount as number | null,
      extended,
    ]);

    if (line.category === "service") {
      serviceTotal += extended;
    } else if (
      line.category === "subscription" ||
      line.category === "license"
    ) {
      subscriptionTotal += extended;
    } else {
      productTotal += extended;
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
  const firstDataRow = HEADER_ROW + 1;
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
  const footerStartRow = lastDataRow + 2;
  for (let r = footerStartRow; r < footerStartRow + 4; r++) {
    const cell = XLSX.utils.encode_cell({ r, c: 10 });
    if (ws[cell] && typeof ws[cell].v === "number") {
      ws[cell].z = "#,##0.00";
    }
  }

  // Try to embed the logo image
  try {
    const logoPath = join(process.cwd(), "reference", "ChatGPT Image Apr 30, 2026, 01_20_24 AM.png");
    const logoData = readFileSync(logoPath);
    if (!ws["!images"]) ws["!images"] = [];
    (ws["!images"] as unknown[]).push({
      "!pos": { x: 0, y: 0, w: 120, h: 60 },
      "!datatype": "buffer",
      "!data": logoData,
    });
  } catch {
    // Logo file not found — continue without it
  }

  XLSX.utils.book_append_sheet(wb, ws, "Price Estimate");

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
