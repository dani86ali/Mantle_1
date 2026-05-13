import * as XLSX from "xlsx";
import type { BoMSummaryTotals } from "./excel-writer";

/** Builds a "Summary" worksheet with category subtotals, VAT, and grand total.
 *  Pure helper — split out of excel-writer.ts to stay under the 200-line limit. */
export function buildSummarySheet(
  s: BoMSummaryTotals,
  currency: string,
): XLSX.WorkSheet {
  const rows: (string | number | null)[][] = [
    ["BoM Summary"],
    ["Currency:", currency],
    [],
    ["Category", "Amount"],
  ];
  if (s.hardwareTotal !== undefined) rows.push(["Hardware", s.hardwareTotal]);
  if (s.softwareTotal !== undefined) rows.push(["Software", s.softwareTotal]);
  if (s.serviceTotal !== undefined) rows.push(["Services", s.serviceTotal]);
  if (s.subscriptionTotal !== undefined) rows.push(["Subscriptions", s.subscriptionTotal]);
  rows.push(["Subtotal (ex VAT)", s.subtotalExVat]);
  rows.push([
    s.vatRate !== undefined ? `VAT (${(s.vatRate * 100).toFixed(2)}%)` : "VAT",
    s.vatAmount,
  ]);
  rows.push(["Grand Total Inc VAT", s.grandTotalIncVat]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 18 }];
  return ws;
}
