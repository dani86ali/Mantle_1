/**
 * POST /api/pipeline/[id]/rerun — stub.
 *
 * Accepts { engine, pricingConfig } and returns 202 Accepted.
 * TODO: wire actual re-run — persist new pricingConfig, re-run the named
 * engine (e.g. E2) and downstream engines, update artifacts + checkpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";

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

  return NextResponse.json(
    {
      pipelineId: params.id,
      engine: body.engine,
      status: "accepted",
      message: "Re-run queued (stub — engine re-execution not yet wired).",
    },
    { status: 202 }
  );
}
