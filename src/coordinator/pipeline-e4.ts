/** Coordinator → E4 bridge.
 *  Maps pipeline inputs into the EngineInput shape consumed by runE4 and turns
 *  the EngineOutput<'e4'> back into the E4Artifacts the coordinator tracks.
 *  Phase 1 (questionnaire) runs in the pipeline; phase 2 runs later via the
 *  E4 API routes once client responses arrive.
 */

import type {
  E4Artifacts, EngineInput, EngineOutput, PipelineState,
} from '@/coordinator/types';
import type { E4InputData } from '@/engines/e4/orchestrator-types';
import type { ProjectType } from '@/engines/e4/types';

export interface E4BuildInput {
  clientName?: string;
  country?: string;
  sector?: string;
  solutionContext?: string;
  existingVendors?: string[];
  projectType?: string;
  responseFilePath?: string;
  responseText?: string;
}

export function buildE4Input(
  input: E4BuildInput,
  state: PipelineState,
): EngineInput<E4InputData> {
  const data: E4InputData = {
    clientName: input.clientName ?? 'Customer',
    country: input.country ?? 'KSA',
    sector: input.sector,
    description: input.solutionContext,
    existingVendors: input.existingVendors,
    projectType: input.projectType as ProjectType | undefined,
  };
  if (input.responseFilePath) data.responseFilePath = input.responseFilePath;
  if (input.responseText) data.responseText = input.responseText;
  return {
    engine: 'e4',
    pipelineState: state,
    inputData: data,
  };
}

export function toE4Artifacts(out: EngineOutput<'e4'>): E4Artifacts {
  return { ...out.artifacts };
}
