/** E3 financial proposal Excel writer — companion workbook to the Word TP.
 *  Source: docs/Network_PreSales_Playbook_Final_Consolidated.md §7.1 (cost
 *  stack) and §7.5 (Good/Better/Best). Pure I/O — no LLM, no math beyond
 *  arithmetic over the inputs already produced by margin-analyzer and
 *  pricing-tiers. Sheet layout described in E3-D6.
 */

import * as XLSX from 'xlsx';
import { writeFile } from 'fs/promises';
import type { MarginAnalysis, PricingTier } from './types';
import type { PricingTierResult } from './pricing-tiers';

export interface FinancialProposalMetadata {
  customerName: string;
  projectName: string;
  date: string;
  currency: string;
  validityDays: number;
  country: string;
}

export interface FinancialCostStack {
  hardwareCost: number;
  softwareCost: number;
  servicesCost: number;
  subscriptionCost: number;
  travelCost: number;
  trainingCost: number;
  contingency: number;
  totalCost: number;
}

export interface FinancialProposalInput {
  metadata: FinancialProposalMetadata;
  tiers: PricingTierResult;
  margin: MarginAnalysis;
  costStack: FinancialCostStack;
  paymentTerms?: string;
  /** When 'unvalidated' or 'partial', a disclaimer row is prepended to the
   *  Investment Summary sheet stating that list prices were not verified
   *  against the vendor catalog. */
  validationStatus?: "validated" | "unvalidated" | "partial";
}

const VAT_BY_COUNTRY: Record<string, number> = {
  AE: 0.05, UAE: 0.05,
  SA: 0.15, KSA: 0.15,
  EG: 0.14, EGY: 0.14,
  BH: 0.10, BHR: 0.10,
  OM: 0.05, OMN: 0.05,
  QA: 0.00, QAT: 0.00,
  KW: 0.00, KWT: 0.00,
};

function vatRate(country: string): number {
  return VAT_BY_COUNTRY[country.toUpperCase()] ?? 0;
}

type Row = (string | number | null)[];

function tierColumns(tiers: PricingTier[]): string[] {
  return tiers.map((t) => t.label);
}

function buildInvestmentSummary(input: FinancialProposalInput): Row[] {
  const { metadata, tiers, costStack } = input;
  const tierList = tiers.tiers;
  const rate = vatRate(metadata.country);
  const sharedExtras = costStack.travelCost + costStack.trainingCost + costStack.contingency;
  const rows: Row[] = [];
  if (input.validationStatus && input.validationStatus !== 'validated') {
    rows.push([
      'Pricing is indicative only. List prices have not been verified against vendor catalog.',
    ]);
    rows.push([]);
  }
  rows.push(
    ['Investment Summary'],
    [`Customer: ${metadata.customerName}`],
    [`Project: ${metadata.projectName}`],
    [`Date: ${metadata.date}`, null, `Validity: ${metadata.validityDays} days`],
    [`Currency: ${metadata.currency}`, null, `Country: ${metadata.country}`, null, `VAT: ${(rate * 100).toFixed(0)}%`],
    [],
    ['Item', ...tierColumns(tierList)],
  );
  const tot = tierList.map((t) => t.totals);
  rows.push(['Hardware', ...tot.map((t) => t.hardwareTotal)]);
  rows.push(['Software', ...tot.map((t) => t.softwareTotal)]);
  rows.push(['Professional Services', ...tot.map((t) => t.serviceTotal)]);
  rows.push(['Subscriptions', ...tot.map(() => 0)]);
  rows.push(['Travel & Expenses', ...tot.map(() => costStack.travelCost)]);
  rows.push(['Training', ...tot.map(() => costStack.trainingCost)]);
  rows.push(['Contingency', ...tot.map(() => costStack.contingency)]);
  const subtotals = tot.map((t) => t.grandTotal + sharedExtras);
  rows.push(['Subtotal ex-VAT', ...subtotals]);
  rows.push([`VAT (${(rate * 100).toFixed(0)}%)`, ...subtotals.map((s) => s * rate)]);
  rows.push(['Grand Total inc-VAT', ...subtotals.map((s) => s * (1 + rate))]);
  return rows;
}

function buildCostStack(input: FinancialProposalInput): Row[] {
  const { costStack, margin, tiers } = input;
  const goodSell = tiers.tiers[0]?.totals.grandTotal ?? 0;
  const rows: Row[] = [
    ['*** INTERNAL — DO NOT SHARE WITH CUSTOMER ***'],
    ['Cost Stack (Playbook §7.1)'],
    [],
    ['Category', 'Cost', 'Sell', 'Margin', 'Margin %'],
  ];
  function line(label: string, cost: number, sell: number): void {
    const m = sell - cost;
    const pct = sell === 0 ? 0 : m / sell;
    rows.push([label, cost, sell, m, pct]);
  }
  line('Hardware', costStack.hardwareCost, tiers.tiers[0]?.totals.hardwareTotal ?? 0);
  line('Software', costStack.softwareCost, tiers.tiers[0]?.totals.softwareTotal ?? 0);
  line('Professional Services', costStack.servicesCost, tiers.tiers[0]?.totals.serviceTotal ?? 0);
  line('Subscriptions', costStack.subscriptionCost, 0);
  rows.push(['Travel & Expenses', costStack.travelCost, costStack.travelCost, 0, 0]);
  rows.push(['Training', costStack.trainingCost, costStack.trainingCost, 0, 0]);
  rows.push(['Contingency', costStack.contingency, costStack.contingency, 0, 0]);
  rows.push(['Total Cost', costStack.totalCost, goodSell, goodSell - costStack.totalCost, margin.grossMarginPct]);
  rows.push([]);
  rows.push(['Margin Analysis']);
  rows.push(['Gross Margin %', margin.grossMarginPct]);
  rows.push(['Hardware Margin %', margin.hardwareMarginPct]);
  rows.push(['Services Margin %', margin.servicesMarginPct]);
  rows.push(['Services Attach Rate %', margin.servicesAttachRate]);
  rows.push(['Approval Level', margin.approvalLevel]);
  rows.push(['Strategic Justification Required', margin.requiresStrategicJustification ? 'YES' : 'no']);
  rows.push([]);
  rows.push(['Flags']);
  if (margin.flags.length === 0) {
    rows.push(['(none)']);
  } else {
    rows.push(['Type', 'Severity', 'Message', 'Threshold', 'Actual']);
    for (const f of margin.flags) {
      rows.push([f.type, f.severity, f.message, f.threshold, f.actual]);
    }
  }
  return rows;
}

function buildTierComparison(input: FinancialProposalInput): Row[] {
  const rows: Row[] = [['Tier Comparison'], [], ['Tier', 'Grand Total', '% above Good', 'Description']];
  for (let i = 0; i < input.tiers.tiers.length; i++) {
    const tier = input.tiers.tiers[i];
    const cmp = input.tiers.comparison[i];
    rows.push([tier.label, tier.totals.grandTotal, cmp.vsGoodPct, tier.description]);
  }
  return rows;
}

const DEFAULT_MILESTONES: { label: string; pct: number }[] = [
  { label: 'Contract Signing', pct: 0.20 },
  { label: 'Equipment Delivery', pct: 0.30 },
  { label: 'Installation Complete', pct: 0.30 },
  { label: 'UAT Sign-off', pct: 0.10 },
  { label: 'Final Acceptance', pct: 0.10 },
];

function buildPaymentSchedule(input: FinancialProposalInput): Row[] {
  const goodTotal = input.tiers.tiers[0]?.totals.grandTotal ?? 0;
  const rate = vatRate(input.metadata.country);
  const incVat = goodTotal * (1 + rate);
  const rows: Row[] = [
    ['Payment Schedule'],
    [`Reference total (Good, inc-VAT): ${incVat.toFixed(2)} ${input.metadata.currency}`],
    [],
    ['Milestone', '% of Total', 'Amount'],
  ];
  for (const m of DEFAULT_MILESTONES) {
    rows.push([m.label, m.pct, incVat * m.pct]);
  }
  if (input.paymentTerms) {
    rows.push([]);
    rows.push(['Terms:', input.paymentTerms]);
  }
  return rows;
}

export async function writeFinancialProposal(
  input: FinancialProposalInput,
  outputPath: string,
): Promise<string> {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('writeFinancialProposal: outputPath must be a non-empty string');
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildInvestmentSummary(input)), 'Investment Summary');
  const costSheet = XLSX.utils.aoa_to_sheet(buildCostStack(input));
  XLSX.utils.book_append_sheet(wb, costSheet, 'Cost Stack');
  if (wb.Workbook?.Sheets) {
    const meta = wb.Workbook.Sheets.find((s) => s.name === 'Cost Stack');
    if (meta) meta.Hidden = 1;
  } else {
    wb.Workbook = { Sheets: wb.SheetNames.map((n) => ({ name: n, Hidden: n === 'Cost Stack' ? 1 : 0 })) };
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildTierComparison(input)), 'Tier Comparison');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildPaymentSchedule(input)), 'Payment Schedule');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await writeFile(outputPath, buf);
  return outputPath;
}
