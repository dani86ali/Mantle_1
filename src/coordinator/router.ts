import type { EngineId, IntakeMode, PipelineState } from './types';

// E5 sits between E1 and E2 in RFP mode: it needs E1's requirements to
// synthesise a baseline, and E2 may consume the E5 componentList as a fallback
// device source when no BoQ file is uploaded (see resolveE2Devices).
const SEQUENCES: Record<IntakeMode, EngineId[]> = {
  rfp: ['e1', 'e5', 'e2', 'e3'],
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
