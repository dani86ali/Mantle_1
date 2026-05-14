/**
 * Background re-run of E2 (BoM) and E3 (proposal) after E5 LLD approval.
 * Fire-and-forget from handleApproveLLD so the API response isn't blocked.
 * Errors are logged, never thrown.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { intakes } from "@/lib/db/schema";
import {
  loadPipelineStateByIntake,
  savePipelineState,
  saveE2Artifacts,
  saveE3Artifacts,
} from "@/lib/db/pipeline-store";
import { runE2, type E2PricingConfig } from "@/engines/e2/orchestrator";
import { runE3 } from "@/engines/e3/orchestrator";
import { buildE2Input, toE2Artifacts } from "@/coordinator/pipeline-e2";
import {
  buildE3Input,
  resolveOutputDir,
  syntheticE1ForRfi,
  toE3Artifacts,
} from "@/coordinator/pipeline-e3";
import { resolvePricingConfig } from "@/coordinator/intake-pricing";
import type { E5StoredState } from "@/app/api/estimates/[id]/_e5-state";

interface IntakeRow {
  tenantId: string;
  country: string | null;
  customerName: string | null;
  requirementsJson: Record<string, unknown> | null;
}

async function loadIntakeRow(intakeId: string): Promise<IntakeRow | null> {
  const [row] = await db
    .select({
      tenantId: intakes.tenantId,
      country: intakes.country,
      customerName: intakes.customerName,
      requirementsJson: intakes.requirementsJson,
    })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  if (!row) return null;
  return row as IntakeRow;
}

export async function rerunE2E3AfterDesign(
  intakeId: string,
  e5State: E5StoredState,
): Promise<void> {
  try {
    const state = await loadPipelineStateByIntake(intakeId);
    if (!state) {
      console.warn(
        `[design-rerun ${intakeId}] no pipeline state found; skipping E2/E3 re-run`,
      );
      return;
    }

    state.artifacts.e5 = {
      ...state.artifacts.e5,
      componentList: e5State.componentList,
      hldDocument: e5State.hldDocxPath,
      lldDocument: e5State.lldDocxPath,
      ipVlanPlan: e5State.ipVlanPlan,
    };
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);

    const intake = await loadIntakeRow(intakeId);
    if (!intake) {
      console.warn(
        `[design-rerun ${intakeId}] intake row missing; aborting E2/E3 re-run`,
      );
      return;
    }
    const req = (intake.requirementsJson ?? {}) as {
      pricingConfig?: Omit<E2PricingConfig, "country">;
      keyNeeds?: string;
    };
    const pricingConfig = await resolvePricingConfig(intake.tenantId, {
      country: intake.country ?? undefined,
      pricingConfig: req.pricingConfig,
    });

    const e2Input = buildE2Input(
      { pricingConfig, solutionContext: req.keyNeeds },
      undefined,
      state.artifacts.e5,
    );
    const e2Output = await runE2(e2Input);
    await saveE2Artifacts(intakeId, e2Output);
    state.artifacts.e2 = toE2Artifacts(e2Output);
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);

    const ctx = {
      opportunityId: state.opportunityId,
      pipelineId: state.id,
      intakeId,
      clientName: intake.customerName ?? undefined,
      country: intake.country ?? undefined,
    };
    const outputDir = await resolveOutputDir(ctx);
    const e3Input = buildE3Input(
      ctx,
      syntheticE1ForRfi(),
      e2Output,
      pricingConfig,
      outputDir,
      state.artifacts.e4,
      state.artifacts.e5,
    );
    const e3Output = await runE3(e3Input);
    await saveE3Artifacts(intakeId, e3Output);
    state.artifacts.e3 = toE3Artifacts(e3Output);
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);
  } catch (err) {
    console.error(`[design-rerun ${intakeId}] E2/E3 re-run failed:`, err);
  }
}
