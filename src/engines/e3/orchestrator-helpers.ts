/** E3 orchestrator helpers — mapping E1 + E2 + cost-stack into the shapes
 *  consumed by deterministic sections, the pricing-tier builder, the margin
 *  analyzer, and the financial-proposal writer. Pure functions, no I/O.
 *  AI-section input builders live in orchestrator-ai-inputs.ts.
 */

import { getBoilerplate, renderBoilerplate } from './boilerplate-kb';
import { makeSection } from './section-helpers';
import type { ProposalSection, ProposalMetadata, PricingTierBomLine } from './types';
import type { MarginInput } from './margin-analyzer';
import type {
  E3BomLine,
  E3CostStack,
  E3E1Data,
  E3Totals,
} from './orchestrator-types';
import type {
  FinancialCostStack,
  FinancialProposalMetadata,
} from './financial-proposal-writer';

export const TOP_REQS_LIMIT = 5;

export function inferVendor(sku: string): string {
  const up = sku.toUpperCase();
  if (up.startsWith('FG-') || up.startsWith('FC-') || up.startsWith('FAZ-')) return 'Fortinet';
  if (up.startsWith('C9') || up.startsWith('N9K') || up.startsWith('ISR') || up.startsWith('CON-')) return 'Cisco';
  return '';
}

export function vendorList(prefs: E3E1Data['vendorPreferences'], bom: E3BomLine[]): string[] {
  const fromPrefs = prefs.map((v) => v.vendor).filter(Boolean);
  if (fromPrefs.length > 0) return Array.from(new Set(fromPrefs));
  const fromBom = bom.map((b) => inferVendor(b.sku));
  return Array.from(new Set(fromBom.filter((v) => v.length > 0)));
}

export function categoryList(bom: E3BomLine[]): string[] {
  return Array.from(new Set(bom.map((b) => b.category).filter(Boolean)));
}

export function deviceCount(bom: E3BomLine[]): number {
  return bom
    .filter((b) => b.category === 'hardware' || b.category === 'accessory')
    .reduce((s, b) => s + b.qty, 0);
}

export function topRequirements(reqs: E3E1Data['requirements']): string[] {
  return reqs
    .filter((r) => r.classification === 'mandatory')
    .slice(0, TOP_REQS_LIMIT)
    .map((r) => r.text);
}

export function coverageFromStats(s: E3E1Data['complianceMatrix']['stats']): number {
  if (s.total === 0) return 0;
  return ((s.compliant + s.alternative) / s.total) * 100;
}

export function mapBomForTiers(bom: E3BomLine[]): PricingTierBomLine[] {
  return bom.map((b) => ({
    sku: b.sku,
    description: b.description,
    qty: b.qty,
    category: b.category,
    unitSellPrice: b.unitSellPrice,
    extendedSell: b.extendedSell,
  }));
}

export function buildMarginInput(costStack: E3CostStack, totals: E3Totals): MarginInput {
  return {
    hardwareCost: costStack.hardwareCost,
    hardwareSell: totals.hardwareTotal,
    softwareCost: costStack.softwareCost,
    softwareSell: totals.softwareTotal,
    servicesCost: costStack.servicesCost,
    servicesSell: totals.serviceTotal,
    subscriptionCost: costStack.subscriptionCost,
    subscriptionSell: totals.subscriptionTotal,
  };
}

export function buildBoilerplateSection(
  slug: 'company_profile' | 'references',
  meta: ProposalMetadata,
): ProposalSection {
  const entry = getBoilerplate(slug);
  const { text } = renderBoilerplate(entry, {
    customerName: meta.customerName,
    projectName: meta.projectName,
    tenantName: meta.tenantName,
  });
  return makeSection(slug, text);
}

export function buildFinancialMetadata(meta: ProposalMetadata): FinancialProposalMetadata {
  return {
    customerName: meta.customerName,
    projectName: meta.projectName,
    date: meta.date,
    currency: meta.currency,
    validityDays: meta.validityDays,
    country: meta.country,
  };
}

export function buildFinancialCostStack(cs: E3CostStack): FinancialCostStack {
  const travelCost = cs.travelCost ?? 0;
  const trainingCost = cs.trainingCost ?? 0;
  const contingency = cs.contingency ?? 0;
  return {
    hardwareCost: cs.hardwareCost,
    softwareCost: cs.softwareCost,
    servicesCost: cs.servicesCost,
    subscriptionCost: cs.subscriptionCost,
    travelCost,
    trainingCost,
    contingency,
    totalCost:
      cs.hardwareCost +
      cs.softwareCost +
      cs.servicesCost +
      cs.subscriptionCost +
      travelCost +
      trainingCost +
      contingency,
  };
}
