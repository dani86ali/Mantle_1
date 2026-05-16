/**
 * /api/estimates/[id]/design — E5 design engine endpoints.
 * GET   — return persisted design state (404 if not generated).
 * POST  — start design generation (runs E5 phase=hld).
 * PATCH — checkpoint actions: approve_x/revise_x per Runtime Architecture §4.5.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import { runE5Detailed } from "@/engines/e5/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type { E5InputData } from "@/engines/e5/orchestrator-types";
import {
  loadE5State,
  minimalPipelineState,
  parseJson,
  resolveIntake,
  saveE5State,
  type E5StoredState,
} from "@/app/api/estimates/[id]/_e5-state";
import { loadE4State } from "@/app/api/estimates/[id]/_e4-state";
import { handlePatchAction } from "./_actions";
import { requireAuth } from "@/lib/middleware/auth";
import { resolveE5OutputDir } from "@/coordinator/pipeline-e5";

const designInputSchema = z.object({
  vendor: z.enum(["cisco", "fortinet"]),
  customerName: z.string().min(1).max(500),
  projectName: z.string().min(1).max(500),
  projectType: z.string().min(1).max(200),
  siteCount: z.number().int().nonnegative(),
  buildingCount: z.number().int().nonnegative(),
  portCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  bandwidthGbps: z.number().nonnegative(),
  isGreenfield: z.boolean().optional(),
  hasOT: z.boolean().optional(),
  hasHPC: z.boolean().optional(),
  hasGPON: z.boolean().optional(),
  hasWireless: z.boolean().optional(),
  hasVoice: z.boolean().optional(),
  hasDC: z.boolean().optional(),
  hasGuest: z.boolean().optional(),
  isNvidia: z.boolean().optional(),
  idfRoomsPerFloor: z.number().int().nonnegative().optional(),
  baseSubnet: z.string().max(50).optional(),
  vrfEnabled: z.boolean().optional(),
  hasVideo: z.boolean().optional(),
  hasRedundancy: z.boolean().optional(),
  downTimeToleranceHours: z.number().nonnegative().optional(),
});

const patchSchema = z
  .object({
    action: z.enum([
      "approve_design",
      "approve_hld",
      "approve_lld",
      "revise_design",
      "revise_hld",
      "revise_lld",
    ]),
    revisionNotes: z.string().max(5000).optional(),
  })
  .refine(
    (d) =>
      !d.action.startsWith("revise") ||
      (typeof d.revisionNotes === "string" && d.revisionNotes.trim().length > 0),
    {
      message: "revisionNotes is required for revise_* actions",
      path: ["revisionNotes"],
    },
  );

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  const state = await loadE5State(resolved.intakeId);
  if (!state) {
    return NextResponse.json(
      { error: "Design not generated for this estimate" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    status: state.phase,
    designApproach: parseJson(state.designApproach),
    topology: state.topology ?? null,
    sizingResult: parseJson(state.sizingResult),
    compatibilityResult: parseJson(state.compatibilityResult),
    hldSections: parseJson(state.hldSections),
    hldDocxPath: state.hldDocxPath ?? null,
    diagramXml: state.diagramXml ?? null,
    lldSections: parseJson(state.lldSections),
    lldDocxPath: state.lldDocxPath ?? null,
    ipVlanPlan: parseJson(state.ipVlanPlan),
    componentList: parseJson(state.componentList),
    revisionNotes: state.revisionNotes ?? null,
    updatedAt: state.updatedAt,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, designInputSchema);
  if (data instanceof NextResponse) return data;

  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const outputDir = await resolveE5OutputDir({
    intakeId: resolved.intakeId,
    pipelineId: `e5-route-${resolved.intakeId}`,
  });
  const e4State = await loadE4State(resolved.intakeId);
  const requirementsBaseline = e4State?.responses?.baseline ?? {};
  const input: EngineInput<E5InputData> = {
    engine: "e5",
    pipelineState: minimalPipelineState(resolved.intakeId),
    inputData: { ...data, phase: "hld", outputDir, requirementsBaseline },
  };
  const out = await runE5Detailed(input);
  if (out.output.error || !out.phase1) {
    return NextResponse.json(
      { error: out.output.error ?? "E5 HLD did not produce a result" },
      { status: 500 },
    );
  }

  const next: E5StoredState = {
    phase: "hld_in_progress",
    inputData: { ...data, requirementsBaseline },
    designApproach: JSON.stringify(out.phase1.designApproach),
    topology: out.phase1.topology,
    sizingResult: JSON.stringify(out.phase1.sizing),
    compatibilityResult: JSON.stringify(out.phase1.compatibility),
    hldSections: JSON.stringify(out.phase1.hldSections),
    hldDocxPath: out.phase1.hldDocPath,
    diagramXml: out.phase1.diagramXml,
    updatedAt: new Date().toISOString(),
  };
  await saveE5State(resolved.intakeId, next);

  return NextResponse.json({
    status: next.phase,
    designApproach: out.phase1.designApproach,
    sizingResult: out.phase1.sizing,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, patchSchema);
  if (data instanceof NextResponse) return data;

  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  const state = await loadE5State(resolved.intakeId);
  if (!state) {
    return NextResponse.json(
      { error: "Design not generated for this estimate" },
      { status: 404 },
    );
  }

  try {
    return await handlePatchAction(
      resolved.intakeId,
      state,
      data.action,
      data.revisionNotes,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
