/**
 * Background rerun helper extracted from route.ts. Next.js route files only
 * permit a fixed set of named exports (HTTP verbs + a few config keys), so the
 * rerun worker lives here to keep it testable.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { intakes } from "@/lib/db/schema";
import {
  loadArtifacts,
  savePipelineState,
  saveE2Artifacts,
} from "@/lib/db/pipeline-store";
import { runE2, type E2Input, type E2PricingConfig } from "@/engines/e2/orchestrator";
import {
  devicesFromIntake,
  parseBomFromUploadedFiles,
  type IntakeRequirementsForE2,
} from "@/coordinator/intake-to-e2";
import { devicesFromComponentList } from "@/coordinator/pipeline-e2";
import { collectCiscoSkus, loadListPrices } from "@/coordinator/pipeline-e2-pricing";
import type { PipelineState } from "@/coordinator/types";

export async function rerunE2(
  state: PipelineState,
  tenantId: string,
  newPricingConfig: E2PricingConfig
): Promise<void> {
  const intakeId = state.intakeId!;
  try {
    const existing = await loadArtifacts(intakeId);
    if (existing.e2) {
      state.previousTotals = existing.e2.totals;
    }
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);

    const req = await loadIntakeRequirements(intakeId);
    let devices = devicesFromIntake(req);
    if (devices.length === 0 && req.uploadedFiles && req.uploadedFiles.length > 0) {
      const lines = await parseBomFromUploadedFiles(req.uploadedFiles);
      if (lines.length > 0) {
        devices = devicesFromIntake({ ...req, uploadedBomLines: lines });
      }
    }
    // RFP-mode fallback: when intake has no explicit devices, fall back to the
    // component list E5 produced — that's what the dispatcher uses to price.
    if (devices.length === 0 && state.artifacts.e5?.componentList) {
      const e5Devices = devicesFromComponentList(state.artifacts.e5.componentList);
      if (e5Devices.length > 0) {
        devices = e5Devices;
      }
    }
    if (devices.length === 0) {
      throw new Error("Intake has no devices to re-price");
    }

    const { listPrices } = await loadListPrices(collectCiscoSkus(devices), tenantId);

    const e2Input: E2Input = {
      devices,
      pricingConfig: newPricingConfig,
      filePath: state.artifacts.e2?.clientBoqInputPath,
      listPrices,
      projectContext: {
        sector: state.artifacts.e1?.sector,
        description: req.keyNeeds,
      },
    };

    const e2Output = await runE2(e2Input);
    await saveE2Artifacts(intakeId, e2Output);

    state.artifacts.e2 = {
      ...state.artifacts.e2,
      pricingSummary: `grandTotalIncVat=${e2Output.totals.grandTotalIncVat}`,
    };
    state.timestamps.updatedAt = new Date();
    await savePipelineState(state);
  } catch (err) {
    console.error(`[rerun ${state.id}] E2 re-run failed:`, err);
  }
}

async function loadIntakeRequirements(
  intakeId: string
): Promise<IntakeRequirementsForE2> {
  const [row] = await db
    .select({ requirementsJson: intakes.requirementsJson })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  if (!row) throw new Error(`Intake ${intakeId} not found`);
  return (row.requirementsJson as IntakeRequirementsForE2) ?? {};
}
