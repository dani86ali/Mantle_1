/**
 * E4 — shared helpers for /api/estimates/[id]/questionnaire and /responses.
 * Persistence: stored under intake.requirementsJson.e4 (no e4Artifacts column).
 */

import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import type { PipelineState } from "@/coordinator/types";
import {
  QUESTIONNAIRE_SECTIONS,
  type ClientResponse,
  type ProjectType,
  type Question,
  type QuestionnaireSection,
  type RequirementsBaseline,
} from "@/engines/e4/types";
import type { EnhancedGapAnalysis } from "@/engines/e4/gap-detector-ai";

export type QuestionnaireStatus = "draft" | "approved" | "sent" | "revision";
export type ResponseStatus = "pending" | "processed" | "validated";

export interface StoredQuestionnaire {
  sections: QuestionnaireSection[];
  markdown: string;
  projectType: ProjectType;
  status: QuestionnaireStatus;
  revisionNotes?: string;
  updatedAt: string;
}

export interface StoredResponses {
  list: ClientResponse[];
  gaps: EnhancedGapAnalysis;
  baseline: RequirementsBaseline;
  status: ResponseStatus;
  updatedAt: string;
}

export interface E4StoredState {
  questionnaire?: StoredQuestionnaire;
  responses?: StoredResponses;
}

export interface ResolvedIntake {
  intakeId: string;
  customerName: string;
  country: string;
  sector?: string;
  description?: string;
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function intakeContext(reqs: Record<string, unknown>): {
  sector?: string;
  description?: string;
} {
  return {
    sector: pickString(reqs, "sector") ?? pickString(reqs, "vertical"),
    description: pickString(reqs, "description") ?? pickString(reqs, "keyNeeds"),
  };
}

export async function resolveIntake(id: string): Promise<ResolvedIntake | null> {
  const [draft] = await db
    .select({
      intakeId: bomDrafts.intakeId,
      customerName: intakes.customerName,
      country: intakes.country,
      requirementsJson: intakes.requirementsJson,
    })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(eq(bomDrafts.id, id))
    .limit(1);
  if (draft?.intakeId) {
    const reqs = (draft.requirementsJson as Record<string, unknown>) ?? {};
    return {
      intakeId: draft.intakeId,
      customerName: draft.customerName ?? "estimate",
      country: draft.country ?? "",
      ...intakeContext(reqs),
    };
  }
  const [intake] = await db
    .select({
      id: intakes.id,
      customerName: intakes.customerName,
      country: intakes.country,
      requirementsJson: intakes.requirementsJson,
    })
    .from(intakes)
    .where(eq(intakes.id, id))
    .limit(1);
  if (intake) {
    const reqs = (intake.requirementsJson as Record<string, unknown>) ?? {};
    return {
      intakeId: intake.id,
      customerName: intake.customerName ?? "estimate",
      country: intake.country ?? "",
      ...intakeContext(reqs),
    };
  }
  return null;
}

export async function loadE4State(intakeId: string): Promise<E4StoredState> {
  const [row] = await db
    .select({ requirementsJson: intakes.requirementsJson })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  if (!row) return {};
  const reqs = (row.requirementsJson as Record<string, unknown>) ?? {};
  return (reqs.e4 as E4StoredState | undefined) ?? {};
}

export async function saveE4State(
  intakeId: string,
  patch: Partial<E4StoredState>,
): Promise<void> {
  const [row] = await db
    .select({ requirementsJson: intakes.requirementsJson })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  const reqs = (row?.requirementsJson as Record<string, unknown>) ?? {};
  const existing = (reqs.e4 as E4StoredState | undefined) ?? {};
  const next: E4StoredState = { ...existing, ...patch };
  await db
    .update(intakes)
    .set({ requirementsJson: { ...reqs, e4: next } })
    .where(eq(intakes.id, intakeId));
}

/** Rebuild QuestionnaireSection[] from Phase1Result.questions by grouping. */
export function questionsToSections(questions: Question[]): QuestionnaireSection[] {
  const bySection = new Map<string, Question[]>();
  for (const q of questions) {
    const bucket = bySection.get(q.section) ?? [];
    bucket.push(q);
    bySection.set(q.section, bucket);
  }
  return QUESTIONNAIRE_SECTIONS
    .filter((s) => bySection.has(s.id))
    .map((s) => ({ ...s, questions: bySection.get(s.id)! }));
}

export function minimalPipelineState(intakeId: string): PipelineState {
  const now = new Date();
  return {
    id: `e4-route-${intakeId}`,
    opportunityId: `intake:${intakeId}`,
    intakeId,
    mode: "rfi",
    currentEngine: "e4",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

const ALLOWED_RESPONSE_EXT = [".xlsx", ".xls"] as const;
const MAX_RESPONSE_FILE = 10 * 1024 * 1024;

export interface SavedResponseFile {
  filePath: string;
}

export type ResponseFileError =
  | { kind: "missing" }
  | { kind: "extension"; ext: string }
  | { kind: "too_large"; name: string };

export async function saveResponseUpload(
  form: FormData,
): Promise<SavedResponseFile | ResponseFileError> {
  const file = form.get("file");
  if (!(file instanceof File)) return { kind: "missing" };
  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_RESPONSE_EXT.includes(ext as (typeof ALLOWED_RESPONSE_EXT)[number])) {
    return { kind: "extension", ext };
  }
  if (file.size > MAX_RESPONSE_FILE) return { kind: "too_large", name: file.name };
  const dir = join(tmpdir(), "bomatic-e4-responses", uuid());
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, file.name.replace(/[^\w.\-]+/g, "_"));
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return { filePath };
}
