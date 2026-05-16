import type { z } from "zod";
import { runPipeline } from "@/coordinator/pipeline";
import { devicesFromIntake } from "@/coordinator/intake-to-e2";
import { enrichFileContent } from "@/coordinator/intake-file-loader";
import { resolvePricingConfig } from "@/coordinator/intake-pricing";
import {
  savePipelineState,
  saveE1Artifacts,
  saveE2Artifacts,
  saveE3Artifacts,
} from "@/lib/db/pipeline-store";
import { updateIntakeStatus } from "@/lib/db/queries";
import type { intakeFormSchema } from "@/lib/middleware/validate";
import type { IntakeMode } from "@/coordinator/types";

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

export async function runAndPersistPipeline(
  tenantId: string,
  intakeId: string,
  req: IntakeRequirements,
): Promise<void> {
  try {
    const devices = devicesFromIntake(req);
    const pricingConfig = await resolvePricingConfig(tenantId, req);
    const mode = resolveMode(req);
    const enriched = await enrichFileContent(req.uploadedFiles);
    if (enriched.warnings.length > 0) {
      console.warn(`[intake ${intakeId}] file extraction:`, enriched.warnings);
    }
    const result = await runPipeline({
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
    });
    result.state.intakeId = intakeId;
    await savePipelineState(result.state);
    if (result.e1Output) await saveE1Artifacts(intakeId, result.e1Output);
    if (result.e2Output) await saveE2Artifacts(intakeId, result.e2Output);
    if (result.e3Output) await saveE3Artifacts(intakeId, result.e3Output);
    if (result.state.error) {
      await updateIntakeStatus(tenantId, intakeId, "FAILED");
    }
  } catch (err) {
    console.error(`[intake ${intakeId}] pipeline failed:`, err);
    try {
      await updateIntakeStatus(tenantId, intakeId, "FAILED");
    } catch (statusErr) {
      console.error(`[intake ${intakeId}] failed to update status:`, statusErr);
    }
  }
}
