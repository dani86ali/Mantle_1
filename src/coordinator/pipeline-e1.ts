/** Coordinator → E1 bridge: input builder + artifact mapper. */

import type { E1Input, E1Output } from '@/engines/e1/orchestrator';
import type { ArtifactRegistry } from '@/coordinator/types';
import type { DocumentType } from '@/types/document-type';

export interface E1BuildInput {
  files?: { path: string; content?: string; documentType?: DocumentType }[];
  clientName?: string;
  country?: string;
  solutionContext?: string;
}

export function buildE1Input(input: E1BuildInput): E1Input {
  return {
    files: input.files ?? [],
    clientName: input.clientName,
    country: input.country,
    solutionContext: input.solutionContext,
  };
}

export function toE1Artifacts(out: E1Output): ArtifactRegistry['e1'] {
  return {
    complianceMatrix: JSON.stringify(out.complianceMatrix),
    requirementsBaseline: JSON.stringify(out.requirements),
    riskFlags: out.riskFlags.map((r) => `${r.severity}:${r.pattern}`),
    vendorList: out.vendorPreferences.map((v) => v.vendor),
    sector: out.sectorDetection.sector,
  };
}
