import { NextRequest, NextResponse } from "next/server";
import { validateBody, intakeFormSchema } from "@/lib/middleware/validate";
import { createIntake, createAgentRun } from "@/lib/db/queries";
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
import type {
  E2Device,
  E2DeviceConfig,
  E2PricingConfig,
} from "@/engines/e2/orchestrator";
import type { IntakeMode } from "@/coordinator/types";

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

function defaultPricingConfig(country?: string): E2PricingConfig {
  return {
    fxRate: 3.75,
    partnerDiscountPct: 0.35,
    dealRegDiscountPct: 0.08,
    profitMode: "margin",
    profitPct: 0.18,
    vatRate: 0.15,
    country: country ?? "SA",
  };
}

function resolvePricingConfig(req: IntakeRequirements): E2PricingConfig {
  if (!req.pricingConfig) return defaultPricingConfig(req.country);
  return {
    ...req.pricingConfig,
    country: req.country ?? "SA",
  };
}

function resolveMode(req: IntakeRequirements): IntakeMode {
  if (req.mode) return req.mode;
  if (req.path === "path_a") return "quick_bom";
  return "rfp";
}

function modeToPath(mode: IntakeMode): "path_a" | "path_b" {
  return mode === "quick_bom" ? "path_a" : "path_b";
}

function buildDeviceConfig(req: IntakeRequirements): E2DeviceConfig {
  const dnaMap: Record<string, E2DeviceConfig["dnaTier"]> = {
    essentials: "essentials",
    advantage: "advantage",
    opt_out: "optout",
  };
  const termMap: Record<string, 3 | 5 | 7> = {
    "3yr": 3, "3": 3, "5yr": 5, "5": 5, "7yr": 7, "7": 7,
  };
  return {
    redundantPsu: req.redundancyRequired,
    dnaTier: req.dnaTier ? dnaMap[req.dnaTier] : "advantage",
    networkTier: req.licenseTier ?? "advantage",
    licenseTerm: req.supportTerm ? (termMap[req.supportTerm] ?? 5) : 5,
    supportCriticality: "standard",
    vendor: "cisco",
  };
}

function devicesFromIntake(req: IntakeRequirements): E2Device[] {
  const config = buildDeviceConfig(req);
  if (req.uploadedBomLines && req.uploadedBomLines.length > 0) {
    return req.uploadedBomLines.map((l) => ({
      model: l.sku, qty: l.quantity, config,
    }));
  }
  if (req.quantities && req.quantities.length > 0) {
    return req.quantities.map((q) => ({
      model: q.description, qty: q.quantity, config,
    }));
  }
  return [];
}

async function runAndPersistPipeline(
  intakeId: string,
  req: IntakeRequirements,
): Promise<void> {
  try {
    const devices = devicesFromIntake(req);
    const pricingConfig = resolvePricingConfig(req);
    const mode = resolveMode(req);
    const result = await runPipeline({
      opportunityId: `intake:${intakeId}`,
      mode,
      devices,
      pricingConfig,
      clientName: req.customerName,
      country: req.country,
      solutionContext: req.keyNeeds,
    });
    result.state.intakeId = intakeId;
    await savePipelineState(result.state);
    if (result.e1Output) await saveE1Artifacts(intakeId, result.e1Output);
    if (result.e2Output) await saveE2Artifacts(intakeId, result.e2Output);
    if (result.e3Output) await saveE3Artifacts(intakeId, result.e3Output);
  } catch (err) {
    console.error(`[intake ${intakeId}] pipeline failed:`, err);
  }
}

export async function POST(request: NextRequest) {
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
        licenseTier: data.licenseTier,
        dnaTier: data.dnaTier,
        supportTerm: data.supportTerm,
        constraints: data.constraints,
        pastedText: data.pastedText,
        uploadedBomLines: data.uploadedBomLines,
        pricingConfig: data.pricingConfig,
      },
      status: "PENDING",
    });

    const agentRun = await createAgentRun({
      tenantId,
      intakeId: intake.id,
      status: "PENDING",
    });

    void runAndPersistPipeline(intake.id, data);

    return NextResponse.json(
      {
        id: intake.id,
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

export async function GET() {
  return NextResponse.json({ intakes: [] });
}
