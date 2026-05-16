import { NextRequest, NextResponse } from "next/server";
import { validateBody, intakeFormSchema } from "@/lib/middleware/validate";
import { createIntake, createAgentRun } from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { IntakeMode } from "@/coordinator/types";
import { parseBomText } from "@/coordinator/intake-to-e2";
import { requireAuth } from "@/lib/middleware/auth";
import { runAndPersistPipeline } from "@/coordinator/run-and-persist";
import { enqueuePipelineJob } from "@/lib/queue/pipeline-job";

type IntakeRequirements = z.infer<typeof intakeFormSchema>;

async function getDefaultTenantId(): Promise<string> {
  const DEFAULT_SLUG = "stc-solutions";
  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_SLUG))
    .limit(1);

  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({
        name: "STC Solutions",
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

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, intakeFormSchema);
  if (data instanceof NextResponse) return data;

  const tenantId = await getDefaultTenantId();

  try {
    const mode = resolveMode(data);
    const rawBomText = data.bomText ?? data.pastedText;
    if (
      mode === "quick_bom" &&
      !data.uploadedBomLines?.length &&
      rawBomText
    ) {
      data.uploadedBomLines = parseBomText(rawBomText);
    }
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
        bomText: data.bomText,
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

    const inline = process.env.INTAKE_INLINE === "1";
    let queued = false;

    if (inline) {
      void runAndPersistPipeline(tenantId, intake.id, data);
    } else {
      try {
        await enqueuePipelineJob({
          tenantId,
          intakeId: intake.id,
          mode,
          requirements: data as unknown as Record<string, unknown>,
        });
        queued = true;
      } catch {
        console.warn(
          "Pipeline queue unavailable, falling back to inline execution"
        );
        void runAndPersistPipeline(tenantId, intake.id, data);
      }
    }

    return NextResponse.json(
      {
        id: intake.id,
        estimateId: intake.id,
        agentRunId: agentRun.id,
        status: "PENDING",
        queued,
        message: "Your request has been received and is being processed.",
      },
      { status: queued ? 202 : 201 }
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
