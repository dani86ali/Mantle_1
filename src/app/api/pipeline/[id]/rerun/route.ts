/**
 * POST /api/pipeline/[id]/rerun
 *
 * Body: { engine: "e2", pricingConfig: E2PricingConfig }
 *
 * Loads the pipeline state, captures the current E2 totals as
 * previousTotals (for the BoM comparison banner), rebuilds E2Input from
 * the original intake's requirements plus the new pricingConfig, then
 * re-runs E2 in the background. Returns 202 immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import { db } from "@/lib/db/index";
import { intakes } from "@/lib/db/schema";
import {
  loadArtifacts,
  loadPipelineState,
  savePipelineState,
  saveE2Artifacts,
} from "@/lib/db/pipeline-store";
import { runE2, type E2Input, type E2PricingConfig } from "@/engines/e2/orchestrator";
import {
  devicesFromIntake,
  type IntakeRequirementsForE2,
} from "@/coordinator/intake-to-e2";
import type { PipelineState } from "@/coordinator/types";

const rerunSchema = z.object({
  engine: z.enum(["e2", "e3"]),
  pricingConfig: z
    .object({
      fxRate: z.number().positive(),
      partnerDiscountPct: z.number().min(0).max(1),
      dealRegDiscountPct: z.number().min(0).max(1),
      profitMode: z.enum(["margin", "markup"]),
      profitPct: z.number().min(0).max(1),
      vatRate: z.number().min(0).max(1),
      country: z.string().min(1),
    })
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await validateBody(request, rerunSchema);
  if (body instanceof NextResponse) return body;

  if (body.engine !== "e2") {
    return NextResponse.json(
      { error: "Only E2 re-run supported" },
      { status: 400 }
    );
  }
  if (!body.pricingConfig) {
    return NextResponse.json(
      { error: "pricingConfig is required for E2 re-run" },
      { status: 400 }
    );
  }

  const state = await loadPipelineState(params.id);
  if (!state) {
    return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
  }
  if (!state.intakeId) {
    return NextResponse.json(
      { error: "Pipeline has no associated intake; cannot rebuild E2 input" },
      { status: 400 }
    );
  }

  void rerunE2(state, body.pricingConfig);

  return NextResponse.json(
    {
      pipelineId: params.id,
      engine: "e2",
      status: "accepted",
      message: "E2 re-run queued; poll the estimate endpoint for updated totals.",
    },
    { status: 202 }
  );
}

async function rerunE2(
  state: PipelineState,
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
    const devices = devicesFromIntake(req);
    if (devices.length === 0) {
      throw new Error("Intake has no devices to re-price");
    }

    const e2Input: E2Input = {
      devices,
      pricingConfig: newPricingConfig,
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
