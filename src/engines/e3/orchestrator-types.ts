/** E3 orchestrator — public input/output types.
 *  Per file ownership rule, src/engines/e3 cannot import from other engines.
 *  These interfaces mirror the structural shape of E1Output / E2Output fields
 *  that runE3 consumes, so callers can pass those outputs directly.
 */

import type { MarginAnalysis, ProposalMetadata, ProposalSection } from './types';
import type { PricingTierResult, TierConfig } from './pricing-tiers';

export interface E3CostStack {
  hardwareCost: number;
  softwareCost: number;
  servicesCost: number;
  subscriptionCost: number;
  travelCost?: number;
  trainingCost?: number;
  contingency?: number;
}

export interface E3Requirement {
  id?: string;
  text: string;
  classification: 'mandatory' | 'optional' | 'conditional';
}

export interface E3ComplianceStats {
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  alternative: number;
}

export interface E3ComplianceMatrix {
  stats: E3ComplianceStats;
}

export interface E3SectorDetection {
  sector: string;
  frameworks?: string[];
}

export interface E3VendorPreference {
  vendor: string;
  category?: string;
  status?: string;
}

export interface E3RiskFlag {
  severity: 'critical' | 'high' | 'medium' | string;
  category?: string;
  matchedText?: string;
}

export interface E3E1Data {
  requirements: E3Requirement[];
  stats: { totalRequirements: number; mandatoryCount: number; criticalRisks?: number };
  complianceMatrix: E3ComplianceMatrix;
  riskFlags: E3RiskFlag[];
  evalCriteria: { methodology?: string; iktvaRequired?: boolean };
  vendorPreferences: E3VendorPreference[];
  sectorDetection: E3SectorDetection;
  clarifications: { questions?: unknown[] };
}

export interface E3BomLine {
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitSellPrice: number;
  extendedSell: number;
}

export interface E3Totals {
  hardwareTotal: number;
  softwareTotal: number;
  serviceTotal: number;
  subscriptionTotal: number;
  grandTotalExVat: number;
  vatAmount: number;
  grandTotalIncVat: number;
}

export interface E3E2Data {
  bom: E3BomLine[];
  totals: E3Totals;
  validationResults: unknown[];
}

export interface E3Input {
  metadata: ProposalMetadata;
  e1: E3E1Data;
  e2: E3E2Data;
  costStack: E3CostStack;
  tierConfig?: TierConfig;
  outputDir: string;
  contactName?: string;
  timeline?: string;
  siteCount?: number;
  migrationApproach?: 'cutover' | 'parallel' | 'phased';
  keyStrengths?: string[];
  /** If false, skip docx + xlsx file emission (used by tests / dry runs). */
  emitFiles?: boolean;
}

export interface E3Output {
  sections: ProposalSection[];
  tiers: PricingTierResult;
  margin: MarginAnalysis;
  proposalPath?: string;
  financialPath?: string;
}
