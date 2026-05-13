/**
 * /api/estimates/[id]/questionnaire — E4 phase 1 endpoints.
 * GET   — return persisted questionnaire (404 if not yet generated).
 * POST  — run E4 phase 1 to generate/regenerate.
 * PATCH — update questionnaire status (engineer checkpoint).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/middleware/validate";
import { runE4Detailed } from "@/engines/e4/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import {
  loadE4State,
  minimalPipelineState,
  questionsToSections,
  resolveIntake,
  saveE4State,
  type QuestionnaireStatus,
  type StoredQuestionnaire,
} from "@/app/api/estimates/[id]/_e4-state";

const postSchema = z.object({
  brief: z.string().max(20000).optional(),
  sector: z.string().max(200).optional(),
  vertical: z.string().max(200).optional(),
});

const patchSchema = z
  .object({
    status: z.enum(["approved", "sent", "revision"]),
    revisionNotes: z.string().max(5000).optional(),
  })
  .refine(
    (d) => d.status !== "revision" || (typeof d.revisionNotes === "string" && d.revisionNotes.trim().length > 0),
    { message: "revisionNotes is required when status is 'revision'", path: ["revisionNotes"] },
  );

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveIntake(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  const state = await loadE4State(resolved.intakeId);
  if (!state.questionnaire) {
    return NextResponse.json(
      { error: "Questionnaire not generated for this estimate" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    questionnaire: state.questionnaire.sections,
    markdown: state.questionnaire.markdown,
    projectType: state.questionnaire.projectType,
    status: state.questionnaire.status,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const data = await validateBody(request, postSchema);
  if (data instanceof NextResponse) return data;

  const resolved = await resolveIntake(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const description = data.brief ?? resolved.description ?? "";
  const sector = data.sector ?? data.vertical ?? resolved.sector;

  const existing = await loadE4State(resolved.intakeId);
  const revisionNotes =
    existing.questionnaire?.status === "revision"
      ? existing.questionnaire.revisionNotes
      : undefined;

  const input: EngineInput = {
    engine: "e4",
    pipelineState: minimalPipelineState(resolved.intakeId),
    inputData: {
      clientName: resolved.customerName,
      country: resolved.country || "KSA",
      sector,
      description,
    },
    revisionNotes,
  };

  const out = await runE4Detailed(input);
  if (out.output.error || !out.phase1) {
    return NextResponse.json(
      { error: out.output.error ?? "E4 phase 1 did not produce a questionnaire" },
      { status: 500 },
    );
  }

  const stored: StoredQuestionnaire = {
    sections: questionsToSections(out.phase1.questions),
    markdown: out.phase1.questionnaireMd,
    projectType: out.phase1.projectType,
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
  await saveE4State(resolved.intakeId, { questionnaire: stored });

  return NextResponse.json({
    questionnaire: stored.sections,
    markdown: stored.markdown,
    projectType: stored.projectType,
    status: stored.status,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const data = await validateBody(request, patchSchema);
  if (data instanceof NextResponse) return data;

  const resolved = await resolveIntake(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  const state = await loadE4State(resolved.intakeId);
  if (!state.questionnaire) {
    return NextResponse.json(
      { error: "Questionnaire not generated for this estimate" },
      { status: 404 },
    );
  }
  const next: StoredQuestionnaire = {
    ...state.questionnaire,
    status: data.status as QuestionnaireStatus,
    revisionNotes: data.revisionNotes ?? state.questionnaire.revisionNotes,
    updatedAt: new Date().toISOString(),
  };
  await saveE4State(resolved.intakeId, { questionnaire: next });
  return NextResponse.json({
    status: next.status,
    updatedAt: next.updatedAt,
    revisionNotes: next.revisionNotes ?? null,
  });
}
