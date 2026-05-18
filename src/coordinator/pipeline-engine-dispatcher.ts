/**
 * Per-engine dispatch — given an engine id and the running pipeline state,
 * run the matching engine and write its output into the PipelineResult /
 * state.artifacts slot. Kept separate from pipeline.ts so the orchestrator
 * doesn't have to carry the union of every engine's input-builder imports.
 *
 * Called by pipeline.ts. The orchestration logic (which engine to run next,
 * pause/resume, state transitions) lives there — this file is the
 * "how to invoke each specific engine" half of the seam.
 */

import { runE1, type E1Output } from '@/engines/e1/orchestrator';
import { runE2, type E2Output } from '@/engines/e2/orchestrator';
import { runE3, type E3Output } from '@/engines/e3/orchestrator';
import { runE4 } from '@/engines/e4/orchestrator';
import { runE5 } from '@/engines/e5/orchestrator';
import { buildE1Input, toE1Artifacts } from '@/coordinator/pipeline-e1';
import { buildE2Input, resolveE2Devices, selectBoQFilePath, toE2Artifacts } from '@/coordinator/pipeline-e2';
import { collectCiscoSkus, loadListPrices } from '@/coordinator/pipeline-e2-pricing';
import { buildDeviceConfig, parseBomFromUploadedFiles } from '@/coordinator/intake-to-e2';
import {
  buildE3Input, resolveOutputDir, syntheticE1ForRfi, toE3Artifacts,
} from '@/coordinator/pipeline-e3';
import { buildE4Input, toE4Artifacts } from '@/coordinator/pipeline-e4';
import { buildE5Input, resolveE5OutputDir, toE5Artifacts } from '@/coordinator/pipeline-e5';
import { logEvent } from '@/coordinator/pipeline-state';
import type { EngineId, PipelineState } from '@/coordinator/types';
import type { PipelineInput, PipelineResult } from '@/coordinator/pipeline-types';

export async function runEngine(
  engine: EngineId, input: PipelineInput, state: PipelineState, out: PipelineResult,
): Promise<void> {
  if (engine === 'e1') {
    out.e1Output = await runE1(buildE1Input(input));
    state.artifacts.e1 = toE1Artifacts(out.e1Output);
  } else if (engine === 'e2') {
    await runE2Stage(input, state, out);
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

async function runE2Stage(
  input: PipelineInput, state: PipelineState, out: PipelineResult,
): Promise<void> {
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
}

async function runE3Stage(
  input: PipelineInput, state: PipelineState,
  e1?: E1Output, e2?: E2Output,
): Promise<E3Output | undefined> {
  if (!e2 || !input.pricingConfig) {
    const missing = !e2 && !input.pricingConfig
      ? 'E2 output and pricingConfig missing'
      : !e2
        ? 'E2 output missing'
        : 'pricingConfig missing';
    const reason = `E3 skipped: ${missing}`;
    logEvent(state, 'e3', 'warn', 'engine_call', reason);
    state.artifacts.e3 = { skipReason: reason };
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
