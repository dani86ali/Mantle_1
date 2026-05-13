/** E3 orchestrator — runs the full 15-section proposal pipeline:
 *  deterministic sections → 5 AI sections → pricing tiers → margin analysis
 *  → Word + Excel artifacts.
 *  Source: docs/BOMATIC_Runtime_Architecture.md §4.3 (E3 pipeline flow).
 *  AI sections degrade to deterministic fallbacks inside their generators,
 *  so an AI outage still yields a complete proposal.
 */

import { join } from 'path';
import { generateCoverLetter } from './ai-sections/cover-letter';
import { generateExecutiveSummary } from './ai-sections/executive-summary';
import { generateImplementation } from './ai-sections/implementation';
import { generateProposedSolution } from './ai-sections/proposed-solution';
import { generateScope } from './ai-sections/scope-customizer';
import { generateProposalDocx } from './docx-generator';
import { writeFinancialProposal } from './financial-proposal-writer';
import { analyzeMargin } from './margin-analyzer';
import { generatePricingTiers } from './pricing-tiers';
import {
  generateAllDeterministicSections,
  type SectionRequirement,
} from './section-generators';
import {
  buildBoilerplateSection,
  buildFinancialCostStack,
  buildFinancialMetadata,
  buildMarginInput,
  mapBomForTiers,
} from './orchestrator-helpers';
import {
  buildCoverLetterInput,
  buildExecSummaryInput,
  buildImplementationInput,
  buildScopeInput,
  buildSolutionInput,
} from './orchestrator-ai-inputs';
import { applyEnrichments } from './section-enrichers';
import type { ProposalSection, TierName } from './types';
import type { E3Input, E3Output } from './orchestrator-types';

export type {
  E3Input,
  E3Output,
  E3CostStack,
  E3E1Data,
  E3E2Data,
  E3BomLine,
  E3Totals,
  E3Requirement,
  E3E4Data,
  E3E5Data,
  E3RequirementsBaseline,
  E3BaselineEntry,
  E3DesignApproach,
  E3DesignSizing,
  E3DesignDevice,
  E3HLDSection,
} from './orchestrator-types';

const FILE_PREFIX_RE = /[^A-Za-z0-9_-]+/g;

function safeFilePrefix(meta: { projectName: string; estimateId: string }): string {
  const slug = `${meta.projectName}-${meta.estimateId}`.replace(FILE_PREFIX_RE, '_');
  return slug.replace(/^_+|_+$/g, '') || 'proposal';
}

function tierMap(tiers: { name: TierName; totals: { grandTotal: number } }[]):
  | { good: number; better: number; best: number }
  | undefined {
  const find = (n: TierName): number | undefined =>
    tiers.find((t) => t.name === n)?.totals.grandTotal;
  const good = find('good');
  const better = find('better');
  const best = find('best');
  if (good === undefined || better === undefined || best === undefined) return undefined;
  return { good, better, best };
}

function mergeAndSort(
  deterministic: ProposalSection[],
  ai: ProposalSection[],
): ProposalSection[] {
  return [...deterministic, ...ai].sort((a, b) => a.id - b.id);
}

function toSectionRequirements(reqs: E3Input['e1']['requirements']): SectionRequirement[] {
  return reqs.map((r) => ({ id: r.id, text: r.text, classification: r.classification }));
}

export async function runE3(input: E3Input): Promise<E3Output> {
  const { metadata, e1, e2, costStack, tierConfig, outputDir } = input;

  // (1) Pricing tiers and margin analysis (deterministic, no AI).
  const tiers = generatePricingTiers(mapBomForTiers(e2.bom), tierConfig ?? {});
  const margin = analyzeMargin(buildMarginInput(costStack, e2.totals));
  const tierTotals = tierMap(tiers.tiers);

  // (2) Deterministic sections (8 from the helper + references + company_profile).
  const deterministicCore = generateAllDeterministicSections(
    {
      requirements: toSectionRequirements(e1.requirements),
      complianceMatrix: { stats: e1.complianceMatrix.stats },
    },
    { bom: e2.bom, totals: e2.totals },
    metadata,
  );
  const deterministic: ProposalSection[] = [
    ...deterministicCore,
    buildBoilerplateSection('references', metadata),
    buildBoilerplateSection('company_profile', metadata),
  ];

  // (3) Five AI sections — each falls back to its deterministic brief on failure.
  const [coverLetter, execSummary, proposedSolution, implementation, scope] = await Promise.all([
    generateCoverLetter(buildCoverLetterInput(metadata, e1, input.contactName, input.keyStrengths)),
    generateExecutiveSummary(buildExecSummaryInput(metadata, e1, e2, tierTotals, input.timeline)),
    generateProposedSolution(buildSolutionInput(metadata, e1, e2)),
    generateImplementation(
      buildImplementationInput(metadata, e2, input.siteCount, input.migrationApproach, undefined),
    ),
    generateScope(buildScopeInput(metadata, e1, e2, input.siteCount)),
  ]);

  const merged = mergeAndSort(deterministic, [coverLetter, execSummary, proposedSolution, implementation, scope]);

  // (3a) Optional E4/E5 enrichment — appends discovery + design context to relevant sections.
  const sections = applyEnrichments(merged, input.e4, input.e5);

  // (4) Emit artifacts.
  const emitFiles = input.emitFiles ?? true;
  let proposalPath: string | undefined;
  let financialPath: string | undefined;
  if (emitFiles) {
    const prefix = safeFilePrefix(metadata);
    proposalPath = await generateProposalDocx(
      sections,
      metadata,
      join(outputDir, `${prefix}-proposal.docx`),
    );
    financialPath = await writeFinancialProposal(
      {
        metadata: buildFinancialMetadata(metadata),
        tiers,
        margin,
        costStack: buildFinancialCostStack(costStack),
        validationStatus: e2.validationStatus,
      },
      join(outputDir, `${prefix}-financial.xlsx`),
    );
  }

  return { sections, tiers, margin, proposalPath, financialPath };
}
