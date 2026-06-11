/**
 * RFP Project creation service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Creates ONLY the RFP Project shell ("Project Created", section 11): an rfp
 * Project plus its materialized stages. It does NOT upload or read files,
 * persist project files or evidence, record approvals, version artifacts
 * (input package, requirements, compliance, HLD, proposal, priced BoQ,
 * export), run engines/coordinator/adapters, call AI, or look up the catalog.
 * mode is always rfp and immutable (section 2); the caller's tenantId is
 * passed through to createProject unchanged so tenant scoping is preserved
 * (section 3). No pricing config is selected at RFP creation - pricing
 * selection and calculation stay out of this module entirely, keeping pricing
 * authority and configuration authority separate (section 9). Duplicate-name
 * handling is intentionally out of scope for this slice: the Project store
 * exposes only a Quick BoM name guard today and store files are not touched.
 *
 * Summary types are the canonical Project read-model shapes, imported
 * type-only (erased at compile time) so this module gains no runtime coupling
 * to the read-model module.
 */
import { createProject } from "@/lib/db/project-store";
import type {
  ProjectStageSummary,
  ProjectSummary,
} from "@/lib/projects/project-quick-bom-workspace";
import type { Project, ProjectStage } from "@/types/project";

/**
 * Input for {@link createRfpProject}. tenantId is passed through to
 * createProject unchanged. There is no pricing selection at RFP creation.
 */
export interface CreateRfpProjectInput {
  tenantId: string;
  name: string;
  customerName?: string;
}

/** Discriminated result of {@link createRfpProject}. */
export type CreateRfpProjectResult =
  | { status: "invalid_input"; code: string; error: string }
  | { status: "ok"; project: ProjectSummary; stages: ProjectStageSummary[] };

function iso(value: Date): string {
  return value.toISOString();
}

/**
 * Payload-free Project projection. The creation response never exposes files,
 * evidence, artifacts, approvals, or the full aggregate. The RFP shell selects
 * no pricing config, so the summary never carries one.
 */
function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

/** Serializable stage projection; tenantId/projectId are not surfaced. */
function toStageSummary(stage: ProjectStage): ProjectStageSummary {
  return {
    id: stage.id,
    stageId: stage.stageId,
    order: stage.order,
    status: stage.status,
    createdAt: iso(stage.createdAt),
    updatedAt: iso(stage.updatedAt),
  };
}

/**
 * Create an RFP Project shell. Trims and requires a name, trims a blank
 * customerName away, then creates the Project (mode always rfp, no pricing
 * config) with its stages and returns serializable summaries only. The input
 * object is never mutated. A blank/missing name returns invalid_input and
 * createProject is not called.
 */
export async function createRfpProject(
  input: CreateRfpProjectInput
): Promise<CreateRfpProjectResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") {
    return {
      status: "invalid_input",
      code: "project_name_required",
      error: "Project name is required.",
    };
  }

  const trimmedCustomerName =
    typeof input.customerName === "string" ? input.customerName.trim() : "";
  const customerName =
    trimmedCustomerName === "" ? undefined : trimmedCustomerName;

  const project = await createProject({
    tenantId: input.tenantId,
    name,
    mode: "rfp",
    ...(customerName !== undefined ? { customerName } : {}),
  });

  return {
    status: "ok",
    project: toProjectSummary(project),
    stages: project.stages.map(toStageSummary),
  };
}
