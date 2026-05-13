/**
 * E5 — shared helpers for /api/estimates/[id]/design and /design/documents.
 * Persistence: stored under intake.requirementsJson.e5 (mirrors E4 pattern).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import type { PipelineState } from "@/coordinator/types";
import type { E5InputData } from "@/engines/e5/orchestrator";

export type E5Phase =
  | "idle"
  | "hld_in_progress"
  | "hld_complete"
  | "lld_in_progress"
  | "lld_complete"
  | "complete";

/** All artifact fields are serialized JSON strings except docx paths and diagramXml. */
export interface E5StoredState {
  phase: E5Phase;
  /** Original POST input — kept so revise_* and approve_hld can re-trigger the orchestrator. */
  inputData?: E5InputData;
  designApproach?: string;
  topology?: string;
  sizingResult?: string;
  compatibilityResult?: string;
  hldSections?: string;
  hldDocxPath?: string;
  diagramXml?: string;
  lldSections?: string;
  lldDocxPath?: string;
  ipVlanPlan?: string;
  componentList?: string;
  revisionNotes?: string;
  updatedAt: string;
}

export interface ResolvedIntake {
  intakeId: string;
  customerName: string;
  country: string;
}

export async function resolveIntake(id: string): Promise<ResolvedIntake | null> {
  const [draft] = await db
    .select({
      intakeId: bomDrafts.intakeId,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(eq(bomDrafts.id, id))
    .limit(1);
  if (draft?.intakeId) {
    return {
      intakeId: draft.intakeId,
      customerName: draft.customerName ?? "estimate",
      country: draft.country ?? "",
    };
  }
  const [intake] = await db
    .select({
      id: intakes.id,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(intakes)
    .where(eq(intakes.id, id))
    .limit(1);
  if (intake) {
    return {
      intakeId: intake.id,
      customerName: intake.customerName ?? "estimate",
      country: intake.country ?? "",
    };
  }
  return null;
}

export async function loadE5State(intakeId: string): Promise<E5StoredState | null> {
  const [row] = await db
    .select({ requirementsJson: intakes.requirementsJson })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  if (!row) return null;
  const reqs = (row.requirementsJson as Record<string, unknown>) ?? {};
  return (reqs.e5 as E5StoredState | undefined) ?? null;
}

export async function saveE5State(
  intakeId: string,
  state: E5StoredState,
): Promise<void> {
  const [row] = await db
    .select({ requirementsJson: intakes.requirementsJson })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  const reqs = (row?.requirementsJson as Record<string, unknown>) ?? {};
  await db
    .update(intakes)
    .set({ requirementsJson: { ...reqs, e5: state } })
    .where(eq(intakes.id, intakeId));
}

export function minimalPipelineState(intakeId: string): PipelineState {
  const now = new Date();
  return {
    id: `e5-route-${intakeId}`,
    opportunityId: `intake:${intakeId}`,
    intakeId,
    mode: "rfi",
    currentEngine: "e5",
    artifacts: { e1: {}, e2: {}, e3: {}, e4: {}, e5: {} },
    checkpoints: [],
    engineCalls: [],
    timestamps: { createdAt: now, updatedAt: now },
  };
}

export function parseJson<T>(s: string | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
