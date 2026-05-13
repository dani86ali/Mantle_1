/**
 * E5 orchestrator — Design engine top-level entry point.
 * Runtime Architecture §4.5: two phases (HLD, LLD) with three checkpoints
 * (e5-design-approach, e5-hld, e5-lld). Phase routing is driven by
 * inputData.phase: 'hld' | 'lld' | 'full'.
 */

import { logEntry } from '@/coordinator/logger';
import type { EngineInput, EngineOutput } from '@/coordinator/types';
import { buildComponentList } from '@/engines/e5/component-list-builder';
import { runPhase1, type Phase1Result } from './e5-phase1';
import { runPhase2, type Phase2Result } from './e5-phase2';
import type { E5StepLog } from './orchestrator-helpers';
import { runStep } from './orchestrator-helpers';
import type { E5InputData, E5Phase } from './orchestrator-types';
import type { ComponentListItem } from '@/engines/e5/types';

export type {
  E5InputData, CheckpointCallback, CheckpointDecision,
  E5CheckpointId, E5Phase, Phase1Handoff,
} from './orchestrator-types';
export type { Phase1Result } from './e5-phase1';
export type { Phase2Result } from './e5-phase2';
export type { E5StepLog } from './orchestrator-helpers';

export interface E5OrchestratorResult {
  output: EngineOutput<'e5'>;
  phase: E5Phase;
  logs: E5StepLog[];
  phase1?: Phase1Result;
  phase2?: Phase2Result;
  componentList?: ComponentListItem[];
}

function resolvePhase(data: E5InputData): E5Phase {
  return data.phase ?? 'full';
}

function validateInput(data: E5InputData): string | null {
  if (!data.customerName) return 'E5 requires inputData.customerName';
  if (!data.projectName) return 'E5 requires inputData.projectName';
  if (!data.projectType) return 'E5 requires inputData.projectType';
  if (data.vendor !== 'cisco' && data.vendor !== 'fortinet') {
    return 'E5 requires inputData.vendor to be "cisco" or "fortinet"';
  }
  return null;
}

function logEngineStart(input: EngineInput, phase: E5Phase): void {
  logEntry({
    timestamp: new Date(),
    pipelineId: input.pipelineState.id,
    opportunityId: input.pipelineState.opportunityId,
    level: 'info',
    category: 'engine_call',
    engine: 'e5',
    errorMessage: `e5 ${phase} started`,
  });
}

export async function runE5(input: EngineInput): Promise<EngineOutput<'e5'>> {
  const result = await runE5Detailed(input);
  return result.output;
}

export async function runE5Detailed(input: EngineInput): Promise<E5OrchestratorResult> {
  const data = (input.inputData ?? {}) as unknown as E5InputData;
  const phase = resolvePhase(data);
  const validationError = validateInput(data);
  if (validationError) {
    return {
      output: { engine: 'e5', artifacts: {}, warnings: [], error: validationError },
      phase, logs: [],
    };
  }

  const logs: E5StepLog[] = [];
  const warnings: string[] = [];
  logEngineStart(input, phase);

  try {
    if (phase === 'hld') {
      const p1 = await runPhase1(data, logs, warnings, input);
      return {
        output: {
          engine: 'e5',
          artifacts: { hldDocument: p1.hldDocPath, diagrams: p1.diagramXml ? [p1.diagramXml] : [] },
          warnings,
        },
        phase, logs, phase1: p1,
      };
    }

    if (phase === 'lld') {
      const handoff = data.hldHandoff;
      if (!handoff) {
        return {
          output: { engine: 'e5', artifacts: {}, warnings,
            error: 'E5 phase=lld requires inputData.hldHandoff with prior HLD outputs' },
          phase, logs,
        };
      }
      const p2 = await runPhase2(data, handoff.topology, handoff.sizing, logs, warnings, input);
      const componentList = await buildComponentListStep(handoff.sizing, logs, input, warnings);
      return {
        output: {
          engine: 'e5',
          artifacts: {
            lldDocument: p2.lldDocPath,
            ipVlanPlan: JSON.stringify(p2.ipVlanPlan),
            componentList: JSON.stringify(componentList),
          },
          warnings,
        },
        phase, logs, phase2: p2, componentList,
      };
    }

    // full
    const p1 = await runPhase1(data, logs, warnings, input);
    const p2 = await runPhase2(data, p1.topology, p1.sizing, logs, warnings, input);
    const componentList = await buildComponentListStep(p1.sizing, logs, input, warnings);
    return {
      output: {
        engine: 'e5',
        artifacts: {
          hldDocument: p1.hldDocPath,
          lldDocument: p2.lldDocPath,
          diagrams: p1.diagramXml ? [p1.diagramXml] : [],
          ipVlanPlan: JSON.stringify(p2.ipVlanPlan),
          componentList: JSON.stringify(componentList),
        },
        warnings,
      },
      phase, logs, phase1: p1, phase2: p2, componentList,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: { engine: 'e5', artifacts: {}, warnings, error: message },
      phase, logs,
    };
  }
}

async function buildComponentListStep(
  sizing: Parameters<typeof buildComponentList>[0],
  logs: E5StepLog[],
  input: EngineInput,
  warnings: string[],
): Promise<ComponentListItem[]> {
  const step19 = await runStep(19, 'buildComponentList', () =>
    buildComponentList(sizing), logs, input);
  if (!step19.ok) {
    warnings.push('Step 19 buildComponentList failed; emitting empty component list');
    return [];
  }
  return step19.result ?? [];
}
