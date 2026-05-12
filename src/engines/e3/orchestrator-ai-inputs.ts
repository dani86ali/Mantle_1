/** E3 orchestrator AI-input builders — maps E1 + E2 data into the typed
 *  inputs expected by each AI section generator. Pure functions, no I/O.
 */

import type { CoverLetterInput } from './ai-sections/cover-letter';
import type { ExecSummaryInput } from './ai-sections/executive-summary';
import type {
  ImplementationInput,
  MigrationApproach,
} from './ai-sections/implementation';
import type { ScopeInput } from './ai-sections/scope-customizer';
import type { SolutionDevice, SolutionInput } from './ai-sections/proposed-solution';
import {
  categoryList,
  coverageFromStats,
  deviceCount,
  inferVendor,
  topRequirements,
  vendorList,
} from './orchestrator-helpers';
import type { ProposalMetadata } from './types';
import type { E3E1Data, E3E2Data } from './orchestrator-types';

const DEFAULT_KEY_STRENGTHS = [
  'proven regional delivery track record',
  'certified vendor partnerships and engineering depth',
  'rigorous governance and change-control discipline',
];

export function buildExecSummaryInput(
  meta: ProposalMetadata,
  e1: E3E1Data,
  e2: E3E2Data,
  tiers: { good: number; better: number; best: number } | undefined,
  timeline: string | undefined,
): ExecSummaryInput {
  return {
    customerName: meta.customerName,
    projectName: meta.projectName,
    sector: e1.sectorDetection.sector,
    country: meta.country,
    requirements: {
      mandatory: e1.stats.mandatoryCount,
      optional: e1.requirements.filter((r) => r.classification === 'optional').length,
      total: e1.stats.totalRequirements,
      topRequirements: topRequirements(e1.requirements),
    },
    solution: {
      deviceCount: deviceCount(e2.bom),
      vendors: vendorList(e1.vendorPreferences, e2.bom),
      categories: categoryList(e2.bom),
      keyCapabilities: [],
    },
    commercial: {
      grandTotal: e2.totals.grandTotalExVat,
      currency: meta.currency,
      tiers,
    },
    compliance: {
      coveragePct: coverageFromStats(e1.complianceMatrix.stats),
      frameworks: e1.sectorDetection.frameworks ?? [],
    },
    timeline,
  };
}

export function buildCoverLetterInput(
  meta: ProposalMetadata,
  e1: E3E1Data,
  contactName: string | undefined,
  keyStrengths: string[] | undefined,
): CoverLetterInput {
  return {
    customerName: meta.customerName,
    projectName: meta.projectName,
    tenantName: meta.tenantName,
    contactName,
    date: meta.date,
    sector: e1.sectorDetection.sector,
    keyStrengths: keyStrengths && keyStrengths.length > 0 ? keyStrengths : DEFAULT_KEY_STRENGTHS,
  };
}

export function buildSolutionInput(
  meta: ProposalMetadata,
  e1: E3E1Data,
  e2: E3E2Data,
): SolutionInput {
  const devices: SolutionDevice[] = e2.bom
    .filter((b) => b.category === 'hardware')
    .map((b) => ({
      model: b.sku,
      qty: b.qty,
      category: b.category,
      vendor: inferVendor(b.sku) || 'vendor',
    }));
  return {
    customerName: meta.customerName,
    projectName: meta.projectName,
    requirements: { topRequirements: topRequirements(e1.requirements) },
    devices,
    vendorStack: vendorList(e1.vendorPreferences, e2.bom),
    sectorContext: e1.sectorDetection.sector,
  };
}

export function buildImplementationInput(
  meta: ProposalMetadata,
  e2: E3E2Data,
  siteCount: number | undefined,
  migrationApproach: MigrationApproach | undefined,
  timelineWeeks: number | undefined,
): ImplementationInput {
  return {
    projectName: meta.projectName,
    deviceCount: deviceCount(e2.bom),
    siteCount: siteCount ?? 1,
    migrationApproach,
    timelineWeeks,
  };
}

export function buildScopeInput(
  meta: ProposalMetadata,
  e1: E3E1Data,
  e2: E3E2Data,
  siteCount: number | undefined,
): ScopeInput {
  return {
    projectName: meta.projectName,
    customerName: meta.customerName,
    siteCount: siteCount ?? 1,
    country: meta.country,
    sector: e1.sectorDetection.sector,
    vendorStack: vendorList(e1.vendorPreferences, e2.bom),
  };
}
