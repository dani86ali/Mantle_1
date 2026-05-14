import { NextRequest, NextResponse } from "next/server";
import { validateBody, intakeFormSchema } from "@/lib/middleware/validate";
import {
  createIntake,
  createAgentRun,
  updateIntakeStatus,
} from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { runPipeline } from "@/coordinator/pipeline";
import {
  savePipelineState,
  saveE1Artifacts,
  saveE2Artifacts,
  saveE3Artifacts,
} from "@/lib/db/pipeline-store";
import type { IntakeMode } from "@/coordinator/types";
import { devicesFromIntake } from "@/coordinator/intake-to-e2";
import { enrichFileContent } from "@/coordinator/intake-file-loader";
import { resolvePricingConfig } from "@/coordinator/intake-pricing";
import { requireAuth } from "@/lib/middleware/auth";

type IntakeRequirements = z.infer<typeof intakeFormSchema>;

async function getDefaultTenantId(): Promise<string> {
  const DEFAULT_SLUG = "default-chat";
  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_SLUG))
    .limit(1);

  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({
        name: "MantelTech",
        slug: DEFAULT_SLUG,
        region: "EMEAR",
        onboardingState: "LIVE",
      })
      .returning();
  }
  return tenant.id;
}

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

function modeToPath(mode: IntakeMode): "path_a" | "path_b" {
  return mode === "quick_bom" ? "path_a" : "path_b";
}

async function runAndPersistPipeline(
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
      mode,
      devices,
      pricingConfig,
      clientName: req.customerName,
      country: req.country,
      solutionContext: req.keyNeeds,
      files: enriched.files,
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

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, intakeFormSchema);
  if (data instanceof NextResponse) return data;

  const tenantId = await getDefaultTenantId();

  try {
    const mode = resolveMode(data);
    const intake = await createIntake({
      tenantId,
      path: data.path ?? modeToPath(mode),
      source: "ui_form",
      customerName: data.customerName,
      region: data.region,
      country: data.country,
      domain: data.domain,
      requirementsJson: {
        mode,
        keyNeeds: data.keyNeeds,
        vendorPreferences: data.vendorPreferences,
        quantities: data.quantities,
        poeRequired: data.poeRequired,
        poeClass: data.poeClass,
        redundancyRequired: data.redundancyRequired,
        stackingRequired: data.stackingRequired,
        ...pickRfiFields(data),
        licenseTier: data.licenseTier,
        dnaTier: data.dnaTier,
        supportTerm: data.supportTerm,
        constraints: data.constraints,
        pastedText: data.pastedText,
        uploadedBomLines: data.uploadedBomLines,
        uploadedFiles: data.uploadedFiles,
        pricingConfig: data.pricingConfig,
      },
      status: "PENDING",
    });

    const agentRun = await createAgentRun({
      tenantId,
      intakeId: intake.id,
      status: "PENDING",
    });

    void runAndPersistPipeline(tenantId, intake.id, data);

    return NextResponse.json(
      {
        id: intake.id,
        estimateId: intake.id,
        agentRunId: agentRun.id,
        status: "PENDING",
        message: "Your request has been received and is being processed.",
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Intake failed: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ intakes: [] });
}
