import { v4 as uuid } from 'uuid';
import { runE1, type E1Input, type E1Output } from '@/engines/e1/orchestrator';
import { runE2, type E2Input, type E2Output } from '@/engines/e2/orchestrator';
import { runE3, type E3Output } from '@/engines/e3/orchestrator';
import { getEngineSequence } from '@/coordinator/router';
import { logEntry } from '@/coordinator/logger';
import {
  buildE3Input, resolveOutputDir, toE3Artifacts,
} from '@/coordinator/pipeline-e3';
import type {
  ArtifactRegistry, Checkpoint, CheckpointStatus, EngineCall, EngineId,
  IntakeMode, PipelineState,
} from '@/coordinator/types';

const MAX_REVISIONS = 3;
const STUB_ENGINES: EngineId[] = ['e4', 'e5'];

const ENGINE_CHECKPOINTS: Record<EngineId, { id: string; label: string }[]> = {
  e1: [
    { id: 'e1-requirements', label: 'Requirements baseline review' },
    { id: 'e1-compliance', label: 'Compliance matrix review' },
  ],
  e2: [
    { id: 'e2-sku-confirmation', label: 'SKU confirmation' },
    { id: 'e2-pricing-review', label: 'Pricing review' },
  ],
  e3: [{ id: 'e3-proposal', label: 'Proposal review' }],
  e4: [],
  e5: [],
};

export interface PipelineInput {
  opportunityId: string;
  mode: IntakeMode;
  files?: { path: string; content?: string }[];
  devices?: E2Input['devices'];
  pricingConfig?: E2Input['pricingConfig'];
  clientName?: string;
  country?: string;
  solutionContext?: string;
  historicalDeals?: E2Input['historicalDeals'];
  onCheckpoint?: (state: PipelineState, engine: EngineId) => Promise<CheckpointStatus>;
}

export interface PipelineResult {
  state: PipelineState;
  e1Output?: E1Output;
  e2Output?: E2Output;
  e3Output?: E3Output;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const state = createInitialState(input);
  const sequence = getEngineSequence(input.mode);
  let e1Output: E1Output | undefined;
  let e2Output: E2Output | undefined;
  let e3Output: E3Output | undefined;

  let lastEngineError: string | undefined;

  try {
    for (const engine of sequence) {
      state.currentEngine = engine;
      let revisions = 0;
      let decision: CheckpointStatus = 'approved';

      while (true) {
        const call = startEngineCall(state, engine, revisions);
        try {
          if (engine === 'e1') {
            e1Output = await runE1(buildE1Input(input));
            state.artifacts.e1 = toE1Artifacts(e1Output);
          } else if (engine === 'e2') {
            e2Output = await runE2(buildE2Input(input, e1Output));
            state.artifacts.e2 = toE2Artifacts(e2Output);
          } else if (engine === 'e3') {
            e3Output = await runE3Stage(input, state, e1Output, e2Output);
            if (e3Output) state.artifacts.e3 = toE3Artifacts(e3Output);
          } else if (STUB_ENGINES.includes(engine)) {
            logEvent(state, engine, 'warn', 'engine_call', 'Engine not yet implemented');
          }
          call.outcome = 'pass';
        } catch (err) {
          call.outcome = 'failed';
          const msg = err instanceof Error ? err.message : String(err);
          lastEngineError = `${engine}: ${msg}`;
          logEvent(state, engine, 'error', 'error', msg);
        } finally {
          call.completedAt = new Date();
          state.timestamps.updatedAt = new Date();
        }

        decision = await runCheckpoint(state, engine, revisions, input.onCheckpoint);
        if (decision === 'revision_requested' && revisions < MAX_REVISIONS) {
          revisions++;
          continue;
        }
        break;
      }

      if (decision === 'rejected') break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.error = { message: msg };
    logEvent(state, state.currentEngine, 'error', 'error', `Pipeline aborted: ${msg}`);
  }

  // Promote any per-engine failure to a pipeline failure so persistence layers
  // mark the run FAILED rather than silently "completed". Outer-catch errors
  // take precedence and are not overwritten.
  if (!state.error && lastEngineError) {
    state.error = { message: lastEngineError };
  }

  state.timestamps.completedAt = new Date();
  return { state, e1Output, e2Output, e3Output };
}

async function runE3Stage(
  input: PipelineInput, state: PipelineState,
  e1?: E1Output, e2?: E2Output,
): Promise<E3Output | undefined> {
  if (!e1 || !e2 || !input.pricingConfig) {
    logEvent(state, 'e3', 'warn', 'engine_call', 'E3 skipped: E1/E2 outputs or pricingConfig missing');
    return undefined;
  }
  const ctx = {
    opportunityId: state.opportunityId, pipelineId: state.id,
    intakeId: state.intakeId, clientName: input.clientName, country: input.country,
  };
  const outputDir = await resolveOutputDir(ctx);
  return runE3(buildE3Input(ctx, e1, e2, input.pricingConfig, outputDir));
}

function createInitialState(input: PipelineInput): PipelineState {
  const now = new Date();
  return {
    id: uuid(),
    opportunityId: input.opportunityId,
    mode: input.mode,
    currentEngine: getEngineSequence(input.mode)[0],
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

function startEngineCall(state: PipelineState, engine: EngineId, retry: number): EngineCall {
  const call: EngineCall = {
    id: uuid(), engine, step: 'run', model: 'n/a',
    startedAt: new Date(), retryCount: retry, outcome: 'pass',
  };
  state.engineCalls.push(call);
  logEntry({
    timestamp: call.startedAt, pipelineId: state.id, opportunityId: state.opportunityId,
    level: 'info', category: 'engine_call', engine,
  });
  return call;
}

async function runCheckpoint(
  state: PipelineState, engine: EngineId, revision: number,
  cb: PipelineInput['onCheckpoint'],
): Promise<CheckpointStatus> {
  const defs = ENGINE_CHECKPOINTS[engine];
  if (defs.length === 0) return 'approved';
  const decision: CheckpointStatus = cb ? await cb(state, engine) : 'approved';
  const decidedAt = new Date();
  for (const def of defs) {
    const existing = state.checkpoints.find((c) => c.id === def.id);
    if (existing) {
      existing.status = decision;
      existing.revisionsUsed = revision;
      existing.decidedAt = decidedAt;
    } else {
      state.checkpoints.push({
        id: def.id, engine, label: def.label, status: decision,
        revisionsUsed: revision, decidedAt,
      });
    }
    logEntry({
      timestamp: decidedAt, pipelineId: state.id, opportunityId: state.opportunityId,
      level: 'info', category: 'checkpoint', engine, checkpointId: def.id, decision,
    });
  }
  return decision;
}

function buildE1Input(input: PipelineInput): E1Input {
  return {
    files: input.files ?? [],
    clientName: input.clientName, country: input.country,
    solutionContext: input.solutionContext,
  };
}

function buildE2Input(input: PipelineInput, e1?: E1Output): E2Input {
  if (!input.devices || !input.pricingConfig) {
    throw new Error('E2 requires devices and pricingConfig');
  }
  return {
    devices: input.devices,
    pricingConfig: input.pricingConfig,
    projectContext: { sector: e1?.sectorDetection.sector, description: input.solutionContext },
    historicalDeals: input.historicalDeals,
  };
}

function toE1Artifacts(out: E1Output): ArtifactRegistry['e1'] {
  return {
    complianceMatrix: 'pipeline://e1/compliance-matrix.json',
    requirementsBaseline: 'pipeline://e1/requirements.json',
    riskFlags: out.riskFlags.map((r) => `${r.severity}:${r.pattern}`),
    vendorList: out.vendorPreferences.map((v) => v.vendor),
    sector: out.sectorDetection.sector,
  };
}

function toE2Artifacts(out: E2Output): ArtifactRegistry['e2'] {
  return {
    bomWorkbook: out.exportPath ?? 'pipeline://e2/bom.xlsx',
    pricingSummary: `grandTotalIncVat=${out.totals.grandTotalIncVat}`,
  };
}

function logEvent(
  state: PipelineState, engine: EngineId,
  level: 'info' | 'warn' | 'error',
  category: 'engine_call' | 'error',
  message: string,
): void {
  logEntry({
    timestamp: new Date(), pipelineId: state.id, opportunityId: state.opportunityId,
    level, category, engine, errorMessage: message,
  });
}
