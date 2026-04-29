/**
 * CSV export matching the Price Estimate template format.
 * Based on shahid-ground-truth.md output format spec.
 */

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

export function generateCsv(
  linesRaw: unknown[],
  options: ExportOptions
): string {
  const lines = linesRaw as ExportLine[];
  const rows: string[] = [];

  // Header section
  rows.push("Price Estimate");
  rows.push(`"${options.customerName}"`);
  rows.push(
    `"Price Estimate for planning and information purposes only and is not a binding offer from Cisco."`
  );
  rows.push("");

  const dateStr = formatDate(options.date);
  rows.push(
    `Date:,${dateStr},,,Estimate ID:,${options.estimateId}`
  );
  rows.push(
    `,,,,Price List:,"${options.priceList}"`
  );
  rows.push(",,,,,All prices are shown in USD");
  rows.push("");

  // Column headers
  rows.push(
    [
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
    ].join(",")
  );

  // Line items
  let productTotal = 0;
  let serviceTotal = 0;
  let subscriptionTotal = 0;

  for (const line of lines) {
    const smartAcct = line.smartAccountMandatory ? "Yes" : "-";
    const duration = line.serviceDurationMonths
      ? String(line.serviceDurationMonths)
      : "---";
    const leadTime = line.leadTimeDays ?? "";
    const pricingTerm = "";

    rows.push(
      [
        line.sku,
        smartAcct,
        `"${(line.description ?? "").replace(/"/g, '""')}"`,
        duration,
        leadTime,
        formatPrice(line.unitListPrice),
        pricingTerm,
        line.quantity,
        formatPrice(line.unitNetPrice),
        line.discountPercent > 0 ? `${line.discountPercent}%` : "",
        formatPrice(line.extendedNetPrice),
      ].join(",")
    );

    // Accumulate totals by category
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
  rows.push("");
  rows.push(`,,,,,,,,,,Product Total:,${formatPrice(productTotal)}`);
  rows.push(`,,,,,,,,,,Service Total:,${formatPrice(serviceTotal)}`);
  rows.push(
    `,,,,,,,,,,Subscription Total:,${formatPrice(subscriptionTotal)}`
  );
  rows.push(
    `,,,,,,,,,,Total Price:,${formatPrice(productTotal + serviceTotal + subscriptionTotal)}`
  );

  // Cisco legal disclaimer
  rows.push("");
  rows.push(
    `"This document is a Price Estimate for planning and information purposes only and is not a binding offer from Cisco. Cisco reserves the right to change pricing, product availability, and terms at any time without notice."`
  );

  return rows.join("\n");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
