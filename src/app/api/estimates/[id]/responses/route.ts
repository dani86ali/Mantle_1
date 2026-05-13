/**
 * /api/estimates/[id]/responses — E4 phase 2 endpoints.
 * GET   — return persisted responses + gaps + baseline (404 if not processed).
 * POST  — accepts free-text JSON or multipart Excel; runs E4 phase 2.
 * PATCH — validate baseline or re-process phase 2 with revision notes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import { runE4Detailed } from "@/engines/e4/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type { Question } from "@/engines/e4/types";
import {
  loadE4State,
  minimalPipelineState,
  resolveIntake,
  saveE4State,
  type StoredResponses,
} from "@/app/api/estimates/[id]/_e4-state";
import { readPayload } from "./_payload";
import { requireAuth } from "@/lib/middleware/auth";

const patchSchema = z
  .object({
    action: z.enum(["validate", "reprocess"]),
    revisionNotes: z.string().max(5000).optional(),
  })
  .refine(
    (d) => d.action !== "reprocess" || (typeof d.revisionNotes === "string" && d.revisionNotes.trim().length > 0),
    { message: "revisionNotes is required when action is 'reprocess'", path: ["revisionNotes"] },
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
  const state = await loadE4State(resolved.intakeId);
  if (!state.responses) {
    return NextResponse.json(
      { error: "Responses not processed for this estimate" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    responses: state.responses.list,
    gaps: state.responses.gaps,
    baseline: state.responses.baseline,
    status: state.responses.status,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const payload = await readPayload(request);
  if (payload instanceof NextResponse) return payload;

  const state = await loadE4State(resolved.intakeId);
  const questions: Question[] | undefined =
    state.questionnaire?.sections.flatMap((s) => s.questions);

  const input: EngineInput = {
    engine: "e4",
    pipelineState: minimalPipelineState(resolved.intakeId),
    inputData: {
      clientName: resolved.customerName,
      country: resolved.country || "KSA",
      sector: resolved.sector,
      description: resolved.description,
      projectType: state.questionnaire?.projectType,
      questions,
      ...(payload.kind === "text"
        ? { responseText: payload.text }
        : { responseFilePath: payload.filePath }),
    },
  };

  const out = await runE4Detailed(input);
  if (out.output.error || !out.phase2) {
    return NextResponse.json(
      { error: out.output.error ?? "E4 phase 2 did not produce responses" },
      { status: 500 },
    );
  }

  const stored: StoredResponses = {
    list: out.phase2.responses,
    gaps: out.phase2.gaps,
    baseline: out.phase2.baseline,
    status: "processed",
    updatedAt: new Date().toISOString(),
  };
  await saveE4State(resolved.intakeId, { responses: stored });

  return NextResponse.json({
    responses: stored.list,
    gaps: stored.gaps,
    baseline: stored.baseline,
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
  const state = await loadE4State(resolved.intakeId);
  if (!state.responses) {
    return NextResponse.json(
      { error: "Responses not processed for this estimate" },
      { status: 404 },
    );
  }

  if (data.action === "validate") {
    const next: StoredResponses = {
      ...state.responses,
      status: "validated",
      updatedAt: new Date().toISOString(),
    };
    await saveE4State(resolved.intakeId, { responses: next });
    return NextResponse.json({
      status: next.status,
      responses: next.list,
      gaps: next.gaps,
      baseline: next.baseline,
    });
  }

  const questions: Question[] | undefined =
    state.questionnaire?.sections.flatMap((s) => s.questions);
  const input: EngineInput = {
    engine: "e4",
    pipelineState: minimalPipelineState(resolved.intakeId),
    inputData: {
      clientName: resolved.customerName,
      country: resolved.country || "KSA",
      sector: resolved.sector,
      description: resolved.description,
      projectType: state.questionnaire?.projectType,
      questions,
      clientResponses: state.responses.list,
    },
    revisionNotes: data.revisionNotes,
  };
  const out = await runE4Detailed(input);
  if (out.output.error || !out.phase2) {
    return NextResponse.json(
      { error: out.output.error ?? "E4 phase 2 did not produce responses" },
      { status: 500 },
    );
  }
  const next: StoredResponses = {
    list: out.phase2.responses,
    gaps: out.phase2.gaps,
    baseline: out.phase2.baseline,
    status: "processed",
    updatedAt: new Date().toISOString(),
  };
  await saveE4State(resolved.intakeId, { responses: next });
  return NextResponse.json({
    status: next.status,
    responses: next.list,
    gaps: next.gaps,
    baseline: next.baseline,
  });
}

