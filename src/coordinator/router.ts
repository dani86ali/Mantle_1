import type { EngineId, IntakeMode, PipelineState } from './types';

const SEQUENCES: Record<IntakeMode, EngineId[]> = {
  rfp: ['e1', 'e2', 'e3'],
  rfi: ['e4', 'e5', 'e2', 'e3'],
  quick_bom: ['e2', 'e3'],
};

export function getEngineSequence(mode: IntakeMode): EngineId[] {
  return SEQUENCES[mode];
}

function hasProducedArtifacts(artifacts: Record<string, unknown>): boolean {
  return Object.values(artifacts).some(v => v !== undefined);
}

export function getNextEngine(state: PipelineState): EngineId | 'complete' {
  const sequence = getEngineSequence(state.mode);
  for (const engine of sequence) {
    if (!hasProducedArtifacts(state.artifacts[engine] as Record<string, unknown>)) {
      return engine;
    }
  }
  return 'complete';
}
