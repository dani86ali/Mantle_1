/**
 * E4 orchestrator — Discovery engine top-level entry point.
 * Runtime Architecture §4.4: two phases separated by a client pause.
 *   Phase 1: project-type detection → questionnaire generation → e4-questionnaire checkpoint.
 *   Phase 2: response parsing/interpretation → gap detection → baseline → e4-baseline checkpoint.
 * Phase routing is driven by the presence of response payload in inputData.
 */

import { logEntry } from '@/coordinator/logger';
import type { EngineInput, EngineOutput } from '@/coordinator/types';
import { runPhase1, type Phase1Result } from './phase1';
import { runPhase2, type Phase2Result } from './phase2';
import { buildPreliminaryBaselineFromProjectType } from './preliminary-baseline';
import type { E4StepLog } from './orchestrator-helpers';
import type { E4InputData } from './orchestrator-types';

export type {
  E4InputData,
  CheckpointCallback,
  CheckpointDecision,
} from './orchestrator-types';
export type { Phase1Result } from './phase1';
export type { Phase2Result } from './phase2';
export type { E4StepLog } from './orchestrator-helpers';

export interface E4OrchestratorResult {
  output: EngineOutput<'e4'>;
  phase: 'phase1' | 'phase2';
  logs: E4StepLog[];
  phase1?: Phase1Result;
  phase2?: Phase2Result;
}

function isPhase2(data: E4InputData): boolean {
  return (
    (Array.isArray(data.clientResponses) && data.clientResponses.length > 0) ||
    typeof data.responseFilePath === 'string' ||
    typeof data.responseText === 'string'
  );
}

function logEngineStart(input: EngineInput<E4InputData>, phase: 'phase1' | 'phase2'): void {
  logEntry({
    timestamp: new Date(),
    pipelineId: input.pipelineState.id,
    opportunityId: input.pipelineState.opportunityId,
    level: 'info',
    category: 'engine_call',
    engine: 'e4',
    errorMessage: `e4 ${phase} started`,
  });
}

export async function runE4(input: EngineInput<E4InputData>): Promise<EngineOutput<'e4'>> {
  const result = await runE4Detailed(input);
  return result.output;
}

export async function runE4Detailed(input: EngineInput<E4InputData>): Promise<E4OrchestratorResult> {
  const data = input.inputData;
  if (!data.clientName || !data.country) {
    return {
      output: {
        engine: 'e4',
        artifacts: {},
        warnings: [],
        error: 'E4 requires inputData.clientName and inputData.country',
      },
      phase: isPhase2(data) ? 'phase2' : 'phase1',
      logs: [],
    };
  }

  const phase: 'phase1' | 'phase2' = isPhase2(data) ? 'phase2' : 'phase1';
  const logs: E4StepLog[] = [];
  const warnings: string[] = [];
  logEngineStart(input, phase);

  try {
    if (phase === 'phase1') {
      const r = await runPhase1(data, logs, warnings, input);
      const preliminaryBaseline = buildPreliminaryBaselineFromProjectType(r.projectType, data);
      return {
        output: {
          engine: 'e4',
          artifacts: {
            questionnaire: r.questionnaireMd,
            requirementsBaseline: JSON.stringify(preliminaryBaseline),
          },
          warnings,
        },
        phase,
        logs,
        phase1: r,
      };
    }
    const r = await runPhase2(data, logs, warnings, input);
    return {
      output: {
        engine: 'e4',
        artifacts: { requirementsBaseline: r.baselineRef },
        warnings,
      },
      phase,
      logs,
      phase2: r,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: { engine: 'e4', artifacts: {}, warnings, error: message },
      phase,
      logs,
    };
  }
}
