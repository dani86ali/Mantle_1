import { NextRequest, NextResponse } from "next/server";
import { validateBody, intakeFormSchema } from "@/lib/middleware/validate";
import { createIntake, createAgentRun } from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

export async function POST(request: NextRequest) {
  const data = await validateBody(request, intakeFormSchema);
  if (data instanceof NextResponse) return data;

  const tenantId = await getDefaultTenantId();

  try {
    const intake = await createIntake({
      tenantId,
      path: data.path,
      source: "ui_form",
      customerName: data.customerName,
      region: data.region,
      country: data.country,
      domain: data.domain,
      requirementsJson: {
        keyNeeds: data.keyNeeds,
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
      },
      status: "PENDING",
    });

    // Create agent run record
    const agentRun = await createAgentRun({
      tenantId,
      intakeId: intake.id,
      status: "PENDING",
    });

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
  // Return estimates from the API
  return NextResponse.json({ intakes: [] });
}
