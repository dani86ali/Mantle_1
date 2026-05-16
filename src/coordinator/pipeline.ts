import { runE1, type E1Output, type E1Input } from '@/engines/e1/orchestrator';
import { runE2, type E2Output, type E2Input } from '@/engines/e2/orchestrator';
import { runE3, type E3Output } from '@/engines/e3/orchestrator';
import { runE4 } from '@/engines/e4/orchestrator';
import { runE5 } from '@/engines/e5/orchestrator';
import { getEngineSequence } from '@/coordinator/router';
import { buildE1Input, toE1Artifacts } from '@/coordinator/pipeline-e1';
import { buildE2Input, resolveE2Devices, selectBoQFilePath, toE2Artifacts } from '@/coordinator/pipeline-e2';
import { collectCiscoSkus, loadListPrices } from '@/coordinator/pipeline-e2-pricing';
import { buildDeviceConfig, parseBomFromUploadedFiles } from '@/coordinator/intake-to-e2';
import {
  buildE3Input, resolveOutputDir, syntheticE1ForRfi, toE3Artifacts,
} from '@/coordinator/pipeline-e3';
import { buildE4Input, toE4Artifacts } from '@/coordinator/pipeline-e4';
import { buildE5Input, resolveE5OutputDir, toE5Artifacts } from '@/coordinator/pipeline-e5';
import {
  ENGINE_CHECKPOINTS, createInitialState, logEvent, runCheckpoint, startEngineCall,
  type CheckpointCallback,
} from '@/coordinator/pipeline-state';
import { savePipelineState } from '@/lib/db/pipeline-store';
import type {
  CheckpointStatus, EngineId, EngineOutput, IntakeMode, PipelineState,
} from '@/coordinator/types';

const MAX_REVISIONS = 3;

export interface PipelineInput {
  opportunityId: string;
  /** Tenant scope for catalog credentials + price list lookup. */
  tenantId?: string;
  mode: IntakeMode;
  files?: { path: string; content?: string }[];
  devices?: E2Input['devices'];
  pricingConfig?: E2Input['pricingConfig'];
  clientName?: string;
  country?: string;
  solutionContext?: string;
  historicalDeals?: E2Input['historicalDeals'];
  /** E4 inputs (RFI mode). */
  sector?: string;
  existingVendors?: string[];
  projectType?: string;
  responseFilePath?: string;
  responseText?: string;
  /** E5 inputs (RFI mode). */
  vendor?: 'cisco' | 'fortinet';
  projectName?: string;
  isGreenfield?: boolean;
  siteCount?: number;
  buildingCount?: number;
  portCount?: number;
  userCount?: number;
  bandwidthGbps?: number;
  hasOT?: boolean;
  hasHPC?: boolean;
  hasGPON?: boolean;
  hasWireless?: boolean;
  hasVoice?: boolean;
  hasDC?: boolean;
  hasGuest?: boolean;
  isNvidia?: boolean;
  idfRoomsPerFloor?: number;
  baseSubnet?: string;
  vrfEnabled?: boolean;
  hasVideo?: boolean;
  hasRedundancy?: boolean;
  downTimeToleranceHours?: number;
  /** E2 device config overrides sourced from intake. */
  dnaTier?: string;
  licenseTier?: 'essentials' | 'advantage';
  supportTerm?: string;
  redundancyRequired?: boolean;
  onCheckpoint?: CheckpointCallback;
}

export interface PipelineResult {
  state: PipelineState;
  e1Output?: E1Output;
  e2Output?: E2Output;
  e3Output?: E3Output;
  e4Output?: EngineOutput<'e4'>;
  e5Output?: EngineOutput<'e5'>;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const state = createInitialState(input.opportunityId, input.mode);
  // Wizard-driven runs use opportunityId="intake:<uuid>"; lifting the intakeId
  // onto state up-front means the hub can locate the pipeline by intakeId on
  // its very first poll (otherwise it'd render "Not started" until the
  // outer caller sets state.intakeId post-run).
  const intakeMatch = /^intake:(.+)$/.exec(input.opportunityId);
  if (intakeMatch) state.intakeId = intakeMatch[1];
  const sequence = getEngineSequence(input.mode);
  const out: PipelineResult = { state };

  // New pause-after-first-engine behavior: only for the production wizard path
  // (no onCheckpoint callback supplied) on RFP / Quick BoM. RFI still runs
  // end-to-end so its existing E4-phase1 pause + responses-driven resumption
  // remain intact. Callers that pass an onCheckpoint (tests, scripts) also keep
  // end-to-end behavior so they can drive every checkpoint inline.
  if (!input.onCheckpoint && (input.mode === 'rfp' || input.mode === 'quick_bom')) {
    await runOneEngineAndPause(state, input, sequence[0], out);
    return out;
  }

  await runEndToEnd(state, input, sequence, out);
  return out;
}

/**
 * Resume a paused pipeline. Caller supplies the persisted state, the rebuilt
 * pipeline input (via `buildPipelineInputForIntake`), and any already-saved
 * engine artifacts so the next engine can read its upstream inputs.
 *
 * Runs exactly one engine (the next one after `state.currentEngine` in the
 * mode's sequence), adds its checkpoints as pending, persists, and returns.
 * If there is no next engine, marks the pipeline as completed.
 */
export async function resumePipeline(
  state: PipelineState,
  input: PipelineInput,
  artifacts: { e1?: E1Output; e2?: E2Output; e3?: E3Output },
): Promise<PipelineResult> {
  const sequence = getEngineSequence(input.mode);
  const idx = sequence.indexOf(state.currentEngine);
  const out: PipelineResult = {
    state,
    e1Output: artifacts.e1,
    e2Output: artifacts.e2,
    e3Output: artifacts.e3,
  };

  if (idx < 0 || idx >= sequence.length - 1) {
    state.status = 'completed';
    state.timestamps.completedAt = new Date();
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);
    return out;
  }
  await runOneEngineAndPause(state, input, sequence[idx + 1], out);
  return out;
}

async function runOneEngineAndPause(
  state: PipelineState,
  input: PipelineInput,
  engine: EngineId,
  out: PipelineResult,
): Promise<void> {
  state.currentEngine = engine;
  state.status = 'running';
  state.timestamps.updatedAt = new Date();
  await savePipelineState(state);

  const call = startEngineCall(state, engine, 0);
  let failed = false;
  try {
    await runEngine(engine, input, state, out);
    call.outcome = 'pass';
  } catch (err) {
    failed = true;
    call.outcome = 'failed';
    const msg = err instanceof Error ? err.message : String(err);
    state.error = { message: `${engine}: ${msg}` };
    logEvent(state, engine, 'error', 'error', msg);
  } finally {
    call.completedAt = new Date();
    state.timestamps.updatedAt = new Date();
  }

  if (failed) {
    state.status = undefined;
    await savePipelineState(state);
    return;
  }

  // Record this engine's checkpoint defs as 'pending' so the hub can render
  // actionable cards. Skip duplicates if the engine ran before (e.g. revisions
  // in some future flow).
  const defs = ENGINE_CHECKPOINTS[engine];
  for (const def of defs) {
    if (state.checkpoints.find((c) => c.id === def.id)) continue;
    state.checkpoints.push({
      id: def.id, engine, label: def.label,
      status: 'pending', revisionsUsed: 0,
    });
  }

  state.status = 'paused_at_checkpoint';
  state.timestamps.updatedAt = new Date();
  await savePipelineState(state);
}

async function runEndToEnd(
  state: PipelineState,
  input: PipelineInput,
  sequence: EngineId[],
  out: PipelineResult,
): Promise<void> {
  let lastEngineError: string | undefined;
  try {
    for (const engine of sequence) {
      state.currentEngine = engine;
      let revisions = 0;
      let decision: CheckpointStatus = 'approved';
      while (true) {
        const call = startEngineCall(state, engine, revisions);
        try {
          await runEngine(engine, input, state, out);
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

      if (
        input.mode === 'rfi'
        && engine === 'e4'
        && !input.responseText
        && !input.responseFilePath
        && state.artifacts.e4.questionnaire
      ) {
        state.status = 'paused_at_checkpoint';
        state.currentEngine = 'e4';
        state.timestamps.updatedAt = new Date();
        logEvent(state, 'e4', 'info', 'engine_call',
          'RFI pipeline paused at E4 phase1 — awaiting client responses');
        await savePipelineState(state);
        return;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.error = { message: msg };
    logEvent(state, state.currentEngine, 'error', 'error', `Pipeline aborted: ${msg}`);
  }

  if (!state.error && lastEngineError) state.error = { message: lastEngineError };
  state.timestamps.completedAt = new Date();
}

async function runEngine(
  engine: EngineId, input: PipelineInput, state: PipelineState, out: PipelineResult,
): Promise<void> {
  if (engine === 'e1') {
    out.e1Output = await runE1(buildE1Input(input));
    state.artifacts.e1 = toE1Artifacts(out.e1Output);
  } else if (engine === 'e2') {
    const deviceConfigOverrides = buildDeviceConfig({
      dnaTier: input.dnaTier,
      licenseTier: input.licenseTier,
      supportTerm: input.supportTerm,
      redundancyRequired: input.redundancyRequired,
    });
    let devices = input.devices;
    if (
      (!devices || devices.length === 0)
      && input.mode === 'quick_bom'
      && input.files && input.files.length > 0
    ) {
      const lines = await parseBomFromUploadedFiles(input.files);
      if (lines.length > 0) {
        devices = lines.map((l) => ({
          model: l.sku, qty: l.quantity,
          config: { ...deviceConfigOverrides, vendor: 'cisco' as const },
        }));
        logEvent(state, 'e2', 'info', 'engine_call',
          `Parsed ${lines.length} BoM line(s) from uploaded file`);
      }
    }
    const boqFilePath = input.mode === 'rfp' ? selectBoQFilePath(out.e1Output) : undefined;
    const e2BuildInput = { ...input, devices, deviceConfigOverrides, filePath: boqFilePath };
    const resolvedDevices = resolveE2Devices(e2BuildInput, state.artifacts.e5);
    let listPrices: Record<string, number> | undefined;
    if (input.tenantId) {
      const skus = collectCiscoSkus(resolvedDevices);
      const priced = await loadListPrices(skus, input.tenantId);
      listPrices = priced.listPrices;
      for (const w of priced.warnings) {
        logEvent(state, 'e2', 'warn', 'engine_call', w);
      }
    }
    out.e2Output = await runE2(buildE2Input(
      { ...e2BuildInput, listPrices },
      out.e1Output, state.artifacts.e5,
    ));
    state.artifacts.e2 = toE2Artifacts(out.e2Output, boqFilePath);
  } else if (engine === 'e3') {
    out.e3Output = await runE3Stage(input, state, out.e1Output, out.e2Output);
    if (out.e3Output) state.artifacts.e3 = toE3Artifacts(out.e3Output);
  } else if (engine === 'e4') {
    out.e4Output = await runE4(buildE4Input(input, state));
    state.artifacts.e4 = toE4Artifacts(out.e4Output);
    if (out.e4Output.error) throw new Error(out.e4Output.error);
  } else if (engine === 'e5') {
    const e5OutputDir = await resolveE5OutputDir({ intakeId: state.intakeId, pipelineId: state.id });
    out.e5Output = await runE5(buildE5Input(input, state, state.artifacts.e4, e5OutputDir));
    state.artifacts.e5 = toE5Artifacts(out.e5Output);
    if (out.e5Output.error) throw new Error(out.e5Output.error);
  }
}

async function runE3Stage(
  input: PipelineInput, state: PipelineState,
  e1?: E1Output, e2?: E2Output,
): Promise<E3Output | undefined> {
  if (!e2 || !input.pricingConfig) {
    logEvent(state, 'e3', 'warn', 'engine_call', 'E3 skipped: E2 output or pricingConfig missing');
    return undefined;
  }
  const ctx = {
    opportunityId: state.opportunityId, pipelineId: state.id,
    intakeId: state.intakeId, clientName: input.clientName, country: input.country,
  };
  const outputDir = await resolveOutputDir(ctx);
  return runE3(buildE3Input(
    ctx, e1 ?? syntheticE1ForRfi(), e2, input.pricingConfig, outputDir,
    state.artifacts.e4, state.artifacts.e5,
  ));
}
