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
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import { loadPipelineStateForTenant } from "@/lib/db/pipeline-store";
import { requireAuth } from "@/lib/middleware/auth";
import { rerunE2 } from "./_rerun-e2";

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
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

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

  const state = await loadPipelineStateForTenant(params.id, session.tenantId);
  if (!state) {
    return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
  }
  if (!state.intakeId) {
    return NextResponse.json(
      { error: "Pipeline has no associated intake; cannot rebuild E2 input" },
      { status: 400 }
    );
  }

  void rerunE2(state, session.tenantId, body.pricingConfig);

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
