/**
 * /api/estimates/[id]/responses — E4 phase 2 endpoints.
 * GET  — return persisted responses + gaps + baseline (404 if not processed).
 * POST — accepts free-text JSON or multipart Excel; runs E4 phase 2.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runE4Detailed } from "@/engines/e4/orchestrator";
import type { EngineInput } from "@/coordinator/types";
import type { Question } from "@/engines/e4/types";
import {
  loadE4State,
  minimalPipelineState,
  resolveIntake,
  saveE4State,
  saveResponseUpload,
  type StoredResponses,
} from "@/app/api/estimates/[id]/_e4-state";

const textSchema = z.object({
  responseText: z.string().min(1).max(200_000),
});

type Payload = { kind: "text"; text: string } | { kind: "file"; filePath: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const resolved = await resolveIntake(params.id);
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
  const resolved = await resolveIntake(params.id);
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

async function readPayload(request: NextRequest): Promise<Payload | NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart body" },
        { status: 400 },
      );
    }
    const saved = await saveResponseUpload(form);
    if ("kind" in saved) {
      if (saved.kind === "missing") {
        return NextResponse.json(
          { error: "Missing 'file' field in multipart body" },
          { status: 400 },
        );
      }
      if (saved.kind === "extension") {
        return NextResponse.json(
          { error: `Unsupported extension '${saved.ext}'. Allowed: .xlsx, .xls` },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `File '${saved.name}' exceeds 10MB limit` },
        { status: 400 },
      );
    }
    return { kind: "file", filePath: saved.filePath };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }
  const result = textSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  return { kind: "text", text: result.data.responseText };
}
