/**
 * Reconstruct a PipelineInput from a persisted intake row.
 *
 * Used by:
 * - run-and-persist (initial run after T-013)
 * - resume after checkpoint approval (Option B pause/resume)
 *
 * The intake row's requirementsJson stores the validated form payload; the
 * customer/country live as top-level columns. We rehydrate both, then run the
 * same devices/pricing/file-enrichment plumbing the initial submit did.
 */

import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db/index";
import { intakes } from "@/lib/db/schema";
import type { intakeFormSchema } from "@/lib/middleware/validate";
import type { PipelineInput } from "@/coordinator/pipeline";
import type { IntakeMode } from "@/coordinator/types";
import { devicesFromIntake } from "@/coordinator/intake-to-e2";
import { resolvePricingConfig } from "@/coordinator/intake-pricing";
import { enrichFileContent } from "@/coordinator/intake-file-loader";

export type IntakeRequirements = z.infer<typeof intakeFormSchema>;

function resolveMode(req: IntakeRequirements): IntakeMode {
  if (req.mode) return req.mode;
  if (req.path === "path_a") return "quick_bom";
  return "rfp";
}

function pickRfiFields(req: IntakeRequirements) {
  return {
    vendor: req.vendor, projectType: req.projectType,
    siteCount: req.siteCount, buildingCount: req.buildingCount,
    portCount: req.portCount, userCount: req.userCount,
    bandwidthGbps: req.bandwidthGbps, isGreenfield: req.isGreenfield,
    hasOT: req.hasOT, hasHPC: req.hasHPC, hasGPON: req.hasGPON,
    hasWireless: req.hasWireless, hasVoice: req.hasVoice,
    hasDC: req.hasDC, vrfEnabled: req.vrfEnabled,
  };
}

export async function loadIntakeAsRequirements(
  intakeId: string,
): Promise<IntakeRequirements & { customerName: string; country?: string }> {
  const [row] = await db
    .select({
      customerName: intakes.customerName,
      country: intakes.country,
      region: intakes.region,
      domain: intakes.domain,
      requirementsJson: intakes.requirementsJson,
    })
    .from(intakes)
    .where(eq(intakes.id, intakeId))
    .limit(1);
  if (!row) throw new Error(`Intake ${intakeId} not found`);
  const reqJson = (row.requirementsJson as Partial<IntakeRequirements>) ?? {};
  return {
    ...(reqJson as IntakeRequirements),
    customerName: row.customerName,
    country: row.country ?? undefined,
    region: row.region,
    domain: row.domain as IntakeRequirements["domain"],
  };
}

export async function buildPipelineInputForIntake(
  tenantId: string,
  intakeId: string,
  reqOverride?: IntakeRequirements,
): Promise<PipelineInput> {
  const req = reqOverride ?? (await loadIntakeAsRequirements(intakeId));
  const devices = devicesFromIntake(req);
  const pricingConfig = await resolvePricingConfig(tenantId, req);
  const mode = resolveMode(req);
  const enriched = await enrichFileContent(req.uploadedFiles);
  if (enriched.warnings.length > 0) {
    console.warn(`[intake ${intakeId}] file extraction:`, enriched.warnings);
  }
  return {
    opportunityId: `intake:${intakeId}`,
    tenantId,
    mode,
    devices,
    pricingConfig,
    clientName: req.customerName,
    country: req.country,
    solutionContext: req.keyNeeds,
    files: enriched.files,
    dnaTier: req.dnaTier,
    licenseTier: req.licenseTier,
    supportTerm: req.supportTerm,
    redundancyRequired: req.redundancyRequired,
    ...pickRfiFields(req),
  };
}
