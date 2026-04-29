import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/middleware/auth";
import { validateBody } from "@/lib/middleware/validate";
import { getTenantById } from "@/lib/db/queries";
import { appendAuditLog } from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants, onboardingEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { OnboardingState } from "@/types/tenant";

const VALID_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  LEAD: ["CISCO_ADMIN_IDENTIFIED"],
  CISCO_ADMIN_IDENTIFIED: ["CCO_ID_VERIFIED"],
  CCO_ID_VERIFIED: ["SAMT_ENTITLEMENT_GRANTED"],
  SAMT_ENTITLEMENT_GRANTED: ["APP_REGISTERED"],
  APP_REGISTERED: ["HELLO_API_PASSED"],
  HELLO_API_PASSED: ["API_ACCESS_REQUESTED"],
  API_ACCESS_REQUESTED: ["API_ACCESS_GRANTED"],
  API_ACCESS_GRANTED: ["CREDS_LOADED"],
  CREDS_LOADED: ["STAGING_VALIDATED"],
  STAGING_VALIDATED: ["LIVE"],
  LIVE: [],
};

const transitionSchema = z.object({
  toState: z.string(),
  notes: z.string().max(2000).optional(),
});

/** GET /api/onboarding — get current onboarding state */
export async function GET(request: NextRequest) {
  const session = requireRole(request, "tenant_admin", "super_admin");
  if (session instanceof NextResponse) return session;

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({
    currentState: tenant.onboardingState,
    validTransitions:
      VALID_TRANSITIONS[tenant.onboardingState as OnboardingState] ?? [],
  });
}

/** POST /api/onboarding — advance onboarding state */
export async function POST(request: NextRequest) {
  const session = requireRole(request, "tenant_admin", "super_admin");
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, transitionSchema);
  if (data instanceof NextResponse) return data;

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const currentState = tenant.onboardingState as OnboardingState;
  const toState = data.toState as OnboardingState;

  // Validate transition
  const validNext = VALID_TRANSITIONS[currentState] ?? [];
  if (!validNext.includes(toState)) {
    return NextResponse.json(
      {
        error: `Invalid transition from ${currentState} to ${toState}. Valid next states: ${validNext.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Update tenant state
  await db
    .update(tenants)
    .set({ onboardingState: toState })
    .where(eq(tenants.id, session.tenantId));

  // Record onboarding event
  await db.insert(onboardingEvents).values({
    tenantId: session.tenantId,
    fromState: currentState,
    toState,
    notes: data.notes,
  });

  await appendAuditLog(
    session.tenantId,
    "onboarding:state_transition",
    session.userId,
    { fromState: currentState, toState, notes: data.notes }
  );

  return NextResponse.json({
    currentState: toState,
    validTransitions: VALID_TRANSITIONS[toState] ?? [],
  });
}
