/** Coordinator → E3 bridge.
 *  Pure mapping helpers: turn pipeline-state inputs + E1/E2 outputs into the
 *  shapes consumed by runE3, and turn the E3Output back into the path-string
 *  E3Artifacts the coordinator tracks. No I/O beyond outputDir construction.
 */

import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  E3CostStack,
  E3E1Data,
  E3E2Data,
  E3Input,
  E3Output,
} from '@/engines/e3/orchestrator';
import type { E1Output } from '@/engines/e1/orchestrator';
import type { E2Output, E2PricingConfig } from '@/engines/e2/orchestrator';
import type {
  E3Artifacts, E4Artifacts, E5Artifacts,
} from '@/coordinator/types';
import { mapE4, mapE5 } from '@/coordinator/pipeline-e3-rfi';

export { mapE4, mapE5 };

interface ProposalContext {
  opportunityId: string;
  pipelineId: string;
  intakeId?: string;
  clientName?: string;
  country?: string;
}

function deriveCurrency(country?: string): string {
  if (!country) return 'USD';
  const c = country.toUpperCase();
  if (c === 'SA' || c === 'KSA' || c === 'SAU') return 'SAR';
  if (c === 'AE' || c === 'UAE' || c === 'ARE') return 'AED';
  if (c === 'EG' || c === 'EGY') return 'EGP';
  return 'USD';
}

export function deriveCostStack(
  totals: E2Output['totals'],
  cfg: E2PricingConfig,
): E3CostStack {
  const factor = cfg.profitMode === 'margin'
    ? 1 - cfg.profitPct
    : 1 / (1 + cfg.profitPct);
  return {
    hardwareCost: totals.hardwareTotal * factor,
    softwareCost: totals.softwareTotal * factor,
    servicesCost: totals.serviceTotal * factor,
    subscriptionCost: totals.subscriptionTotal * factor,
    travelCost: 0,
    trainingCost: 0,
    contingency: 0,
  };
}

function mapE1(out: E1Output): E3E1Data {
  return {
    requirements: out.requirements.map((r) => ({
      id: r.id, text: r.text, classification: r.classification,
    })),
    stats: {
      totalRequirements: out.stats.totalRequirements,
      mandatoryCount: out.stats.mandatoryCount,
      criticalRisks: out.stats.criticalRisks,
    },
    complianceMatrix: { stats: out.complianceMatrix.stats },
    riskFlags: out.riskFlags.map((r) => ({
      severity: r.severity, category: r.category, matchedText: r.matchedText,
    })),
    evalCriteria: {
      methodology: out.evalCriteria.methodology,
      iktvaRequired: out.evalCriteria.iktvaRequired,
    },
    vendorPreferences: out.vendorPreferences.map((v) => ({
      vendor: v.vendor, category: v.category, status: v.status,
    })),
    sectorDetection: {
      sector: out.sectorDetection.sector,
      frameworks: out.frameworks.map((f) => f.id),
    },
    clarifications: { questions: out.clarifications.questions },
  };
}

function mapE2(out: E2Output): E3E2Data {
  return {
    bom: out.bom.map((b) => ({
      sku: b.sku, description: b.description, qty: b.qty, category: b.category,
      unitSellPrice: b.unitSellPrice, extendedSell: b.extendedSell,
    })),
    totals: out.totals,
    validationResults: out.validationResults,
    validationStatus: out.validationStatus,
  };
}

export async function resolveOutputDir(ctx: ProposalContext): Promise<string> {
  const slug = ctx.intakeId ?? ctx.pipelineId;
  const dir = join(tmpdir(), 'bomatic-e3', slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function buildE3Input(
  ctx: ProposalContext,
  e1Output: E1Output,
  e2Output: E2Output,
  pricingConfig: E2PricingConfig,
  outputDir: string,
  e4Artifacts?: E4Artifacts,
  e5Artifacts?: E5Artifacts,
): E3Input {
  const customerName = ctx.clientName ?? 'Customer';
  const country = ctx.country ?? pricingConfig.country;
  const e4 = mapE4(e4Artifacts);
  const e5 = mapE5(e5Artifacts);
  const input: E3Input = {
    metadata: {
      customerName,
      projectName: `${customerName} Network Solution`,
      estimateId: ctx.opportunityId,
      date: new Date().toISOString().slice(0, 10),
      validityDays: 30,
      country,
      currency: deriveCurrency(country),
      tenantName: 'MantelTech',
    },
    e1: mapE1(e1Output),
    e2: mapE2(e2Output),
    costStack: deriveCostStack(e2Output.totals, pricingConfig),
    outputDir,
  };
  if (e4) input.e4 = e4;
  if (e5) input.e5 = e5;
  return input;
}

export function toE3Artifacts(out: E3Output): E3Artifacts {
  const artifacts: E3Artifacts = {};
  if (out.proposalPath) artifacts.technicalProposal = out.proposalPath;
  if (out.financialPath) artifacts.financialProposal = out.financialPath;
  return artifacts;
}

export function syntheticE1ForRfi(): E1Output {
  return {
    fileClassifications: [], missingDocuments: [], requirements: [],
    riskFlags: [], deadlines: [],
    evalCriteria: { methodology: 'unknown', envelopes: [], iktvaRequired: false, source: 'rfi' },
    vendorPreferences: [],
    sectorDetection: { sector: 'general', confidence: 0, method: 'client_lookup', evidence: 'rfi' },
    frameworks: [],
    complianceMatrix: {
      rows: [], gaps: { coverageGaps: [], orphanRequirements: [] },
      stats: { total: 0, compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 },
    },
    clarifications: { questions: [], stats: { total: 0, critical: 0, important: 0, niceToHave: 0 } },
    stats: { totalFiles: 0, totalRequirements: 0, mandatoryCount: 0, criticalRisks: 0 },
  };
}
