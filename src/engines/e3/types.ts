/** E3 Proposal Engine — types for the 15-section solution document.
 *  Outline source: docs/reference/hld/Network_PreSales_Playbook_Final_Consolidated.md §6.1
 */

export type GenerationMethod = 'deterministic' | 'ai' | 'semi';

export type ProposalStatus = 'draft' | 'generated' | 'reviewed' | 'approved';

export type TierName = 'good' | 'better' | 'best';

export type ProposalMode = 'rfp' | 'rfi';

export type ProposalLanguage = 'en' | 'ar' | 'bilingual';

export type ApprovalLevel =
  | 'account_manager'
  | 'presales_lead'
  | 'country_manager'
  | 'regional_md';

export type MarginFlagType =
  | 'low_margin'
  | 'low_attach'
  | 'fx_risk'
  | 'discount_threshold';

export type MarginFlagSeverity = 'info' | 'warning' | 'error';

export interface ProposalSection {
  id: number;
  title: string;
  slug: string;
  content: string;
  generationMethod: GenerationMethod;
  status: ProposalStatus;
}

export interface ProposalMetadata {
  customerName: string;
  projectName: string;
  estimateId: string;
  date: string;
  validityDays: number;
  country: string;
  currency: string;
  tenantName: string;
  tenantLogo?: string;
}

export interface PricingTierTotals {
  hardwareTotal: number;
  softwareTotal: number;
  serviceTotal: number;
  grandTotal: number;
}

export interface PricingTierBomLine {
  sku: string;
  description: string;
  qty: number;
  category: string;
  unitSellPrice: number;
  extendedSell: number;
}

export interface PricingTier {
  name: TierName;
  label: string;
  description: string;
  sections: ProposalSection[];
  totals: PricingTierTotals;
  bom?: PricingTierBomLine[];
}

export interface MarginFlag {
  type: MarginFlagType;
  severity: MarginFlagSeverity;
  message: string;
  threshold: number;
  actual: number;
}

export interface MarginAnalysis {
  totalCost: number;
  totalSell: number;
  grossMargin: number;
  grossMarginPct: number;
  hardwareMarginPct: number;
  servicesMarginPct: number;
  servicesAttachRate: number;
  approvalLevel: ApprovalLevel;
  requiresStrategicJustification: boolean;
  flags: MarginFlag[];
}

export interface ProposalConfig {
  mode: ProposalMode;
  tiers: TierName[];
  includeCompliance: boolean;
  includeImplementation: boolean;
  language: ProposalLanguage;
}

export interface ProposalSectionSpec {
  id: number;
  title: string;
  slug: string;
  generationMethod: GenerationMethod;
}

export const PROPOSAL_SECTIONS: readonly ProposalSectionSpec[] = [
  { id: 0, title: 'Cover Page', slug: 'cover_page', generationMethod: 'deterministic' },
  { id: 1, title: 'Cover Letter / Introduction', slug: 'cover_letter', generationMethod: 'ai' },
  { id: 2, title: 'Executive Summary', slug: 'executive_summary', generationMethod: 'ai' },
  { id: 3, title: 'Understanding of Customer Requirements', slug: 'requirements', generationMethod: 'deterministic' },
  { id: 4, title: 'Proposed Solution', slug: 'proposed_solution', generationMethod: 'ai' },
  { id: 5, title: 'Technical Specifications', slug: 'technical_specs', generationMethod: 'deterministic' },
  { id: 6, title: 'Implementation Approach', slug: 'implementation', generationMethod: 'semi' },
  { id: 7, title: 'Service Levels & Support', slug: 'service_levels', generationMethod: 'deterministic' },
  { id: 8, title: 'Commercial Proposal', slug: 'commercial', generationMethod: 'deterministic' },
  { id: 9, title: 'Scope, Assumptions, Exclusions, Dependencies', slug: 'scope_assumptions', generationMethod: 'semi' },
  { id: 10, title: 'Compliance Matrix', slug: 'compliance_matrix', generationMethod: 'deterministic' },
  { id: 11, title: 'References / Case Studies', slug: 'references', generationMethod: 'deterministic' },
  { id: 12, title: 'Company Profile', slug: 'company_profile', generationMethod: 'deterministic' },
  { id: 13, title: 'Appendices', slug: 'appendices', generationMethod: 'deterministic' },
  { id: 14, title: 'Signature Page', slug: 'signature_page', generationMethod: 'deterministic' },
] as const;
