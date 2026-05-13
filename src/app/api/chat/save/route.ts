/**
 * POST /api/chat/save — persist a chat-generated BoM to the database.
 *
 * Creates intake, agent_run, and bom_draft records so the BoM appears
 * in the estimates list and can be reviewed, exported, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createIntake, createAgentRun, createBomDraft } from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/middleware/auth";

const saveSchema = z.object({
  customerName: z.string().default("Chat Customer"),
  region: z.string().default("EMEAR"),
  country: z.string().default("SA"),
  domain: z.string().default("access_switching"),
  requirements: z.string().default(""),
  lines: z.array(
    z.object({
      sku: z.string(),
      description: z.string().default(""),
      quantity: z.number().default(1),
      unitListPrice: z.number().default(0),
      category: z.string().default("other"),
      serviceDurationMonths: z.number().nullable().optional(),
      leadTimeDays: z.number().nullable().optional(),
    })
  ),
});

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: z.infer<typeof saveSchema>;
  try {
    const raw = await request.json();
    body = saveSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    // Ensure a default tenant exists for chat sessions
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
          name: "BOMatic Chat",
          slug: DEFAULT_SLUG,
          region: body.region,
          onboardingState: "LIVE",
        })
        .returning();
    }

    const tenantId = tenant.id;

    // 1. Create intake record
    const intake = await createIntake({
      tenantId,
      path: "path_b",
      source: "ui_form",
      customerName: body.customerName,
      region: body.region,
      country: body.country,
      domain: body.domain,
      requirementsJson: { keyNeeds: body.requirements, source: "chat" },
      status: "COMPLETED",
    });

    // 2. Create agent run record
    const agentRun = await createAgentRun({
      tenantId,
      intakeId: intake.id,
      status: "COMPLETED",
      completedAt: new Date(),
    });

    // 3. Build BomLine objects with IDs
    const bomLines = body.lines.map((l, i) => ({
      id: `chat-${Date.now()}-${i}`,
      lineNumber: i + 1,
      sku: l.sku,
      description: l.description,
      quantity: l.quantity,
      unitListPrice: l.unitListPrice,
      unitNetPrice: l.unitListPrice,
      discountPercent: 0,
      extendedNetPrice: l.unitListPrice * l.quantity,
      category: l.category,
      serviceDurationMonths: l.serviceDurationMonths ?? undefined,
      leadTimeDays: l.leadTimeDays ?? undefined,
      smartAccountMandatory: false,
      validationFlags: [],
      decision: "pending",
      catalogVerified: true,
    }));

    const productTotal = bomLines
      .filter((l) => !["service", "subscription", "license"].includes(l.category))
      .reduce((s, l) => s + l.extendedNetPrice, 0);
    const serviceTotal = bomLines
      .filter((l) => l.category === "service")
      .reduce((s, l) => s + l.extendedNetPrice, 0);
    const subscriptionTotal = bomLines
      .filter((l) => l.category === "subscription")
      .reduce((s, l) => s + l.extendedNetPrice, 0);

    // 4. Create bom_draft record
    const bomDraft = await createBomDraft({
      tenantId,
      intakeId: intake.id,
      agentRunId: agentRun.id,
      version: 1,
      linesJson: bomLines,
      validationReportJson: { passed: 0, warnings: 0, errors: 0, rules: [] },
      summary: {
        assumptions: ["Generated via chat"],
        exclusions: [],
        openQuestions: [],
        validationWarnings: [],
        totalListPrice: productTotal + serviceTotal + subscriptionTotal,
        productTotal,
        serviceTotal,
        subscriptionTotal,
      },
      status: "READY_FOR_REVIEW",
    });

    return NextResponse.json({
      bomDraftId: bomDraft.id,
      intakeId: intake.id,
      lineCount: bomLines.length,
      totalPrice: productTotal + serviceTotal + subscriptionTotal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save BoM: ${message}` },
      { status: 500 }
    );
  }
}
