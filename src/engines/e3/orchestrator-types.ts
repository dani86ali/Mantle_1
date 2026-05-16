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

export interface E3MatrixRow {
  requirementId?: string;
  requirementText: string;
  frameworkId: string;
  controlId?: string;
  controlName: string;
  status: string;
}

export interface E3ComplianceMatrix {
  stats: E3ComplianceStats;
  rows?: E3MatrixRow[];
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
  /** Honesty signal from E2 — drives the disclaimer in the financial proposal. */
  validationStatus?: "validated" | "unvalidated" | "partial";
}

/** Structural mirrors of E4 RequirementsBaseline — re-declared so src/engines/e3
 *  does not import from sibling engines (CLAUDE.md file-ownership rule). */
export interface E3BaselineEntry {
  id: string;
  text: string;
  source: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | string;
  validated: boolean;
}
export interface E3RequirementsBaseline {
  business: E3BaselineEntry[];
  functional: E3BaselineEntry[];
  nonFunctional: E3BaselineEntry[];
  constraints: E3BaselineEntry[];
  assumptions: E3BaselineEntry[];
}
export interface E3E4Data {
  requirementsBaseline: E3RequirementsBaseline;
}

/** Structural mirrors of E5 design data. */
export interface E3DesignDevice {
  role: string;
  model: string;
  vendor: string;
  quantity: number;
  reasoning: string;
}
export interface E3DesignSizing {
  coreDevices: E3DesignDevice[];
  distributionDevices: E3DesignDevice[];
  accessDevices: E3DesignDevice[];
  firewalls: E3DesignDevice[];
  wirelessControllers: E3DesignDevice[];
  accessPoints: E3DesignDevice[];
}
export interface E3DesignApproach {
  methodology: string;
  approach: string;
  frameworks: string[];
  topologyPattern: string | null;
  vendor: string;
  projectType: string;
}
export interface E3HLDSection {
  sectionNumber: number;
  title: string;
  content: string;
}
export interface E3E5Data {
  designApproach?: E3DesignApproach;
  sizing?: E3DesignSizing;
  hldSections?: E3HLDSection[];
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
  /** Optional E4 baseline — when present, enriches the requirements section. */
  e4?: E3E4Data;
  /** Optional E5 design data — when present, enriches proposed_solution + implementation. */
  e5?: E3E5Data;
  /** If false, skip docx + xlsx file emission (used by tests / dry runs). */
  emitFiles?: boolean;
}

export interface E3Output {
  sections: ProposalSection[];
  tiers: PricingTierResult;
  margin: MarginAnalysis;
  proposalPath?: string;
  financialPath?: string;
  /** Unresolved boilerplate placeholder names detected in the assembled proposal
   *  (defense-in-depth: prevents shipping `{{foo}}` tokens to customers). */
  warnings: string[];
}
