/**
 * Deterministic RFP HLD intake artifact creation service (Stage 6.2a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Persists ONE reviewable `hld_intake` artifact (status `needs_review`) on the
 * existing `hld_design_delta_review` stage from human-provided engineer design
 * context. This is HLD readiness FOUNDATION, not HLD generation: the intake is an
 * INPUT authority (like `input_package`), captured against a fixed local field
 * catalog so HLD work later consumes structured answers, never raw RFP documents.
 *
 * AUTHORITY BOUNDARY: the answers are engineer-authored context, so the created
 * artifact carries EMPTY sourceFileIds/sourceArtifactIds - it is derived from no
 * raw RFP file and no upstream artifact payload. This service runs no AI and makes
 * no SKU/pricing/catalog/validation/configuration/design decision: it only trims,
 * validates against the local catalog, and writes. It imports exactly the project
 * store, the artifact store, and the canonical project types - no file/evidence
 * store, no fs/path, no pricing/SKU/catalog/config authority, no AI/provider, no
 * route or UI module.
 */
import { getProjectById } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/** Stable operator intake field ids; the order here is the canonical answer order. */
export type RfpHldIntakeFieldId =
  | "existing_network_context"
  | "target_topology_intent"
  | "site_room_context"
  | "resiliency_expectations"
  | "wan_lan_boundaries"
  | "rack_power_assumptions"
  | "implementation_constraints"
  | "exclusions"
  | "diagram_notes";

/** A catalog field: its stable id and the canonical label persisted with answers. */
export interface RfpHldIntakeField {
  fieldId: RfpHldIntakeFieldId;
  label: string;
}

/**
 * The fixed local intake field catalog. Labels are persisted from HERE, never from
 * caller input, so the artifact carries canonical wording regardless of the request.
 */
export const RFP_HLD_INTAKE_FIELDS: readonly RfpHldIntakeField[] = [
  { fieldId: "existing_network_context", label: "Existing network context" },
  { fieldId: "target_topology_intent", label: "Target topology intent" },
  { fieldId: "site_room_context", label: "Site and room context" },
  { fieldId: "resiliency_expectations", label: "Resiliency expectations" },
  { fieldId: "wan_lan_boundaries", label: "WAN/LAN boundaries" },
  { fieldId: "rack_power_assumptions", label: "Rack and power assumptions" },
  { fieldId: "implementation_constraints", label: "Implementation constraints" },
  { fieldId: "exclusions", label: "Exclusions" },
  { fieldId: "diagram_notes", label: "Diagram notes" },
];

const FIELD_IDS: ReadonlySet<string> = new Set(
  RFP_HLD_INTAKE_FIELDS.map((field) => field.fieldId)
);

/** Allowed answer dispositions for one intake field. */
export type RfpHldIntakeAnswerStatus = "answered" | "unknown" | "not_applicable";

/** Caller-supplied answer; `label` is ignored in favor of the catalog label. */
export interface RfpHldIntakeAnswerInput {
  fieldId: string;
  status: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
  label?: string;
}

/** Normalized, persisted answer. `value` is retained only when status=answered. */
export interface RfpHldIntakeAnswer {
  fieldId: RfpHldIntakeFieldId;
  label: string;
  status: RfpHldIntakeAnswerStatus;
  value?: string;
  notes?: string;
}

/** Per-status answer tally carried on the payload and the result summary. */
export interface RfpHldIntakeStatusCounts {
  answered: number;
  unknown: number;
  not_applicable: number;
}

/** The persisted `hld_intake` payload (full answers live here, not in the result). */
type RfpHldIntakePayload = {
  payloadKind: "rfp_hld_intake";
  createdBy: string;
  createdAt: string;
  answers: RfpHldIntakeAnswer[];
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
};

/** Input for {@link createRfpHldIntakeDraft}. */
export interface CreateRfpHldIntakeDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  answers: readonly RfpHldIntakeAnswerInput[];
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldIntakeProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied (empty) source arrays, no payload. */
export interface RfpHldIntakeArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance and counts only, never the full answer values. */
export interface RfpHldIntakePayloadSummary {
  payloadKind: "rfp_hld_intake";
  createdBy: string;
  createdAt: string;
  answerCount: number;
  statusCounts: RfpHldIntakeStatusCounts;
  fieldIds: RfpHldIntakeFieldId[];
}

/** Discriminated result of {@link createRfpHldIntakeDraft}. */
export type CreateRfpHldIntakeDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldIntakeProjectSummary }
  | {
      status: "ok";
      artifact: RfpHldIntakeArtifactSummary;
      payloadSummary: RfpHldIntakePayloadSummary;
    };

/** Trim a value to a string, or "" when it is not a string. */
function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate and normalize the answer set against the local catalog: require every
 * catalog field exactly once, rejecting missing, duplicate, or unknown field ids.
 * Throws before any store call on a malformed set.
 */
function normalizeAnswers(rawAnswers: unknown): RfpHldIntakeAnswer[] {
  if (!Array.isArray(rawAnswers)) {
    throw new Error("HLD intake answers must be an array.");
  }
  const byFieldId = new Map<string, Record<string, unknown>>();
  for (const raw of rawAnswers) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Each HLD intake answer must be an object.");
    }
    const record = raw as Record<string, unknown>;
    const fieldId = record.fieldId;
    if (typeof fieldId !== "string" || !FIELD_IDS.has(fieldId)) {
      throw new Error(`Unknown HLD intake field id: ${String(fieldId)}.`);
    }
    if (byFieldId.has(fieldId)) {
      throw new Error(`Duplicate HLD intake answer for field id: ${fieldId}.`);
    }
    byFieldId.set(fieldId, record);
  }
  return RFP_HLD_INTAKE_FIELDS.map((field) => {
    const record = byFieldId.get(field.fieldId);
    if (record === undefined) {
      throw new Error(`Missing HLD intake answer for field id: ${field.fieldId}.`);
    }
    return normalizeAnswer(field, record);
  });
}

/** Normalize one answer: enforce status, trim value/notes, persist the catalog label. */
function normalizeAnswer(
  field: RfpHldIntakeField,
  record: Record<string, unknown>
): RfpHldIntakeAnswer {
  const status = record.status;
  if (status !== "answered" && status !== "unknown" && status !== "not_applicable") {
    throw new Error(`Invalid HLD intake answer status for field id: ${field.fieldId}.`);
  }
  // Canonical label from the local catalog; the caller-supplied label is ignored.
  const answer: RfpHldIntakeAnswer = {
    fieldId: field.fieldId,
    label: field.label,
    status,
  };
  if (status === "answered") {
    const value = asTrimmed(record.value);
    if (value === "") {
      throw new Error(`Answered HLD intake field requires a value: ${field.fieldId}.`);
    }
    answer.value = value;
  }
  // unknown / not_applicable drop any value; notes are optional and retained when nonblank.
  const notes = asTrimmed(record.notes);
  if (notes !== "") {
    answer.notes = notes;
  }
  return answer;
}

/** Tally answers by status. */
function countStatuses(answers: readonly RfpHldIntakeAnswer[]): RfpHldIntakeStatusCounts {
  const counts: RfpHldIntakeStatusCounts = { answered: 0, unknown: 0, not_applicable: 0 };
  for (const answer of answers) {
    counts[answer.status]++;
  }
  return counts;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpHldIntakeProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(artifact: ProjectArtifact): RfpHldIntakeArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Project the payload to a lean summary: counts and field ids, never answer values. */
function toPayloadSummary(payload: RfpHldIntakePayload): RfpHldIntakePayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    answerCount: payload.answerCount,
    statusCounts: { ...payload.statusCounts },
    fieldIds: payload.answers.map((answer) => answer.fieldId),
  };
}

/**
 * Create ONE `needs_review` `hld_intake` artifact on `hld_design_delta_review` from
 * validated engineer intake answers. Blank identifiers and malformed answer sets are
 * rejected BEFORE any store call. The project is verified within its tenant
 * (not_found / wrong_mode, lean summary that never leaks tenantId) before the single
 * write. The created artifact carries empty source arrays (engineer-authored context).
 * Returns lean summaries only; the full answer values stay in the persisted payload.
 */
export async function createRfpHldIntakeDraft(
  input: CreateRfpHldIntakeDraftInput
): Promise<CreateRfpHldIntakeDraftResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") throw new Error("HLD intake requires a projectId.");
  if (createdBy === "") throw new Error("HLD intake requires a createdBy.");

  // Validate the catalog answer set before touching any store.
  const answers = normalizeAnswers(input.answers);

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const payload: RfpHldIntakePayload = {
    payloadKind: "rfp_hld_intake",
    createdBy,
    createdAt,
    answers,
    answerCount: answers.length,
    statusCounts: countStatuses(answers),
  };

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: "hld_design_delta_review",
    type: "hld_intake",
    status: "needs_review",
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
