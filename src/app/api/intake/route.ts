import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { requireAuth } from "@/lib/middleware/auth";
import { validateBody, intakeFormSchema } from "@/lib/middleware/validate";
import { createIntake, getIntakesByTenant, createAgentRun } from "@/lib/db/queries";
import { enqueueAgentJob } from "@/lib/queue/agent-job";
import { appendAuditLog } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, intakeFormSchema);
  if (data instanceof NextResponse) return data;

  const intake = await createIntake({
    tenantId: session.tenantId,
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
    tenantId: session.tenantId,
    intakeId: intake.id,
    status: "PENDING",
  });

  // Enqueue background job
  await enqueueAgentJob({
    tenantId: session.tenantId,
    intakeId: intake.id,
    agentRunId: agentRun.id,
    priceListId: "Global Price List Emerging (USD)",
  });

  await appendAuditLog(session.tenantId, "intake:created", session.userId, {
    intakeId: intake.id,
    path: data.path,
    customerName: data.customerName,
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
}

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const intakes = await getIntakesByTenant(session.tenantId, status);
  return NextResponse.json({ intakes });
}
