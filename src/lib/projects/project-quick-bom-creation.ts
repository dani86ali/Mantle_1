/**
 * Quick BoM Project creation service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Creates ONLY the Project shell ("Project Created", section 11): a quick_bom
 * Project plus its materialized stages and the SAR pricing config chosen at
 * creation. It does NOT upload a BoQ, persist project files or evidence, record
 * approvals, version artifacts, normalize rows, resolve SKUs, expand
 * configuration, calculate pricing, export, run engines/coordinator/adapters,
 * call AI, or look up the catalog. mode is always quick_bom and immutable
 * (section 2); the caller's tenantId is passed through to createProject unchanged
 * so tenant scoping is preserved (section 3). createProjectPricingConfig is used
 * only to validate and materialize the pricing config selected here (it forces
 * SAR and defaults VAT 15 / rounding 2); pricing CALCULATION, catalog lookup,
 * priced BoQ, and export stay out of this module, keeping pricing authority and
 * configuration authority separate (section 9, section 11A).
 */
import { createProject } from "@/lib/db/project-store";
import { createProjectPricingConfig } from "@/lib/projects/pricing";
import type { CreateProjectPricingConfigInput } from "@/lib/projects/pricing";
import type {
  ProjectStageSummary,
  ProjectSummary,
} from "@/lib/projects/project-quick-bom-workspace";
import type {
  Project,
  ProjectPricingConfig,
  ProjectStage,
} from "@/types/project";

/**
 * Input for {@link createQuickBomProject}. tenantId is passed through to
 * createProject unchanged. pricingConfig is the minimal selection; the helper
 * forces SAR and defaults VAT 15 / rounding 2.
 */
export interface CreateQuickBomProjectInput {
  tenantId: string;
  name: string;
  customerName?: string;
  pricingConfig: CreateProjectPricingConfigInput;
}

/** Discriminated result of {@link createQuickBomProject}. */
export type CreateQuickBomProjectResult =
  | { status: "invalid_input"; code: string; error: string }
  | { status: "ok"; project: ProjectSummary; stages: ProjectStageSummary[] };

function iso(value: Date): string {
  return value.toISOString();
}

/**
 * Payload-free Project projection. The creation response never exposes files,
 * evidence, artifacts, approvals, or the full aggregate; pricingConfig is copied
 * so the result cannot alias the created aggregate.
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
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
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
 * Create a Quick BoM Project shell. Trims and requires a name, materializes the
 * SAR pricing config via createProjectPricingConfig, then creates the Project
 * (mode always quick_bom) with its stages and returns serializable summaries
 * only. The input object is never mutated. A blank/missing name, or a pricing
 * config the helper rejects, returns invalid_input; the helper owns the
 * margin/markup/VAT/rounding validation and createProject is not called when it
 * fails.
 */
export async function createQuickBomProject(
  input: CreateQuickBomProjectInput
): Promise<CreateQuickBomProjectResult> {
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

  let pricingConfig: ProjectPricingConfig;
  try {
    pricingConfig = createProjectPricingConfig(input.pricingConfig);
  } catch (error) {
    return {
      status: "invalid_input",
      code: "invalid_pricing_config",
      error: error instanceof Error ? error.message : "Invalid pricing config.",
    };
  }

  const project = await createProject({
    tenantId: input.tenantId,
    name,
    mode: "quick_bom",
    ...(customerName !== undefined ? { customerName } : {}),
    pricingConfig,
  });

  return {
    status: "ok",
    project: toProjectSummary(project),
    stages: project.stages.map(toStageSummary),
  };
}
