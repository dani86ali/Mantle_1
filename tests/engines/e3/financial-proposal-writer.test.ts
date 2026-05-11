import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  writeFinancialProposal,
  type FinancialProposalInput,
} from '@/engines/e3/financial-proposal-writer';
import { generatePricingTiers } from '@/engines/e3/pricing-tiers';
import { analyzeMargin } from '@/engines/e3/margin-analyzer';
import type { PricingTierBomLine } from '@/engines/e3/types';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-fp-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const BASE: PricingTierBomLine[] = [
  {
    sku: 'C9300-48P',
    description: 'Catalyst 9300 48-port PoE',
    qty: 4,
    category: 'hardware',
    unitSellPrice: 10000,
    extendedSell: 40000,
  },
  {
    sku: 'C9300-DNA-E',
    description: 'DNA Essentials 3yr',
    qty: 4,
    category: 'subscription',
    unitSellPrice: 1500,
    extendedSell: 6000,
  },
  {
    sku: 'CON-SNT-C9300',
    description: 'SmartNet 8x5xNBD 3yr',
    qty: 4,
    category: 'service',
    unitSellPrice: 800,
    extendedSell: 3200,
  },
];

function buildInput(): FinancialProposalInput {
  const tiers = generatePricingTiers(BASE);
  const margin = analyzeMargin({
    hardwareCost: 30000,
    hardwareSell: 40000,
    softwareCost: 4500,
    softwareSell: 6000,
    servicesCost: 1800,
    servicesSell: 3200,
    subscriptionCost: 0,
    subscriptionSell: 0,
  });
  return {
    metadata: {
      customerName: 'Al Rajhi Bank',
      projectName: 'Branch Network Refresh',
      date: '2026-05-11',
      currency: 'USD',
      validityDays: 30,
      country: 'SA',
    },
    tiers,
    margin,
    costStack: {
      hardwareCost: 30000,
      softwareCost: 4500,
      servicesCost: 1800,
      subscriptionCost: 0,
      travelCost: 2500,
      trainingCost: 3000,
      contingency: 1500,
      totalCost: 30000 + 4500 + 1800 + 2500 + 3000 + 1500,
    },
    paymentTerms: 'Net 30 days from invoice.',
  };
}

function aoa(wb: XLSX.WorkBook, sheet: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
}

describe('writeFinancialProposal', () => {
  it('returns the output path it wrote to', async () => {
    const out = join(tmpDir, 'fp-1.xlsx');
    const result = await writeFinancialProposal(buildInput(), out);
    expect(result).toBe(out);
  });

  it('throws on empty outputPath', async () => {
    await expect(writeFinancialProposal(buildInput(), '')).rejects.toThrow();
  });

  it('creates 4 sheets with the expected names', async () => {
    const out = join(tmpDir, 'fp-2.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    expect(wb.SheetNames).toContain('Investment Summary');
    expect(wb.SheetNames).toContain('Cost Stack');
    expect(wb.SheetNames).toContain('Tier Comparison');
    expect(wb.SheetNames).toContain('Payment Schedule');
    expect(wb.SheetNames).toHaveLength(4);
  });

  it('Investment Summary has all required row labels', async () => {
    const out = join(tmpDir, 'fp-3.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Investment Summary');
    const labels = rows.map((r) => String(r[0] ?? ''));
    const required = [
      'Hardware',
      'Software',
      'Professional Services',
      'Subscriptions',
      'Travel & Expenses',
      'Training',
      'Contingency',
      'Subtotal ex-VAT',
      'Grand Total inc-VAT',
    ];
    for (const lbl of required) {
      expect(labels, `missing row: ${lbl}`).toContain(lbl);
    }
    expect(labels.some((l) => l.startsWith('VAT'))).toBe(true);
  });

  it('Investment Summary has tier columns (Good/Better/Best)', async () => {
    const out = join(tmpDir, 'fp-4.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Investment Summary');
    const headerRow = rows.find(
      (r) => String(r[0]) === 'Item',
    );
    expect(headerRow).toBeDefined();
    const headers = headerRow!.map((c) => String(c));
    expect(headers.some((h) => h.toLowerCase().includes('good'))).toBe(true);
    expect(headers.some((h) => h.toLowerCase().includes('better'))).toBe(true);
    expect(headers.some((h) => h.toLowerCase().includes('best'))).toBe(true);
  });

  it('Cost Stack contains INTERNAL warning and margin analysis', async () => {
    const out = join(tmpDir, 'fp-5.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Cost Stack');
    const flat = rows.flat().map((c) => String(c));
    expect(flat.some((c) => c.includes('INTERNAL'))).toBe(true);
    expect(flat).toContain('Gross Margin %');
    expect(flat).toContain('Approval Level');
  });

  it('Tier Comparison lists every tier with grand total', async () => {
    const out = join(tmpDir, 'fp-6.xlsx');
    const input = buildInput();
    await writeFinancialProposal(input, out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Tier Comparison');
    for (const tier of input.tiers.tiers) {
      const match = rows.find((r) => String(r[0]) === tier.label);
      expect(match, `row for ${tier.label}`).toBeDefined();
      expect(Number(match![1])).toBeCloseTo(tier.totals.grandTotal, 2);
    }
  });

  it('Payment Schedule contains the 5 default milestones summing to 100%', async () => {
    const out = join(tmpDir, 'fp-7.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Payment Schedule');
    const milestones = [
      'Contract Signing',
      'Equipment Delivery',
      'Installation Complete',
      'UAT Sign-off',
      'Final Acceptance',
    ];
    let pctSum = 0;
    for (const m of milestones) {
      const row = rows.find((r) => String(r[0]) === m);
      expect(row, `milestone row: ${m}`).toBeDefined();
      pctSum += Number(row![1]);
    }
    expect(pctSum).toBeCloseTo(1, 6);
  });

  it('Investment Summary grand total = subtotal * (1 + VAT) for KSA (15%)', async () => {
    const out = join(tmpDir, 'fp-8.xlsx');
    await writeFinancialProposal(buildInput(), out);
    const wb = XLSX.readFile(out);
    const rows = aoa(wb, 'Investment Summary');
    const subtotalRow = rows.find((r) => String(r[0]) === 'Subtotal ex-VAT')!;
    const grandRow = rows.find((r) => String(r[0]) === 'Grand Total inc-VAT')!;
    for (let i = 1; i < subtotalRow.length; i++) {
      const sub = Number(subtotalRow[i]);
      const grand = Number(grandRow[i]);
      expect(grand).toBeCloseTo(sub * 1.15, 2);
    }
  });
});
