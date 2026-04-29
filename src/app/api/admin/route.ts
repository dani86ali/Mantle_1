import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/middleware/auth";
import { validateBody, tenantConfigSchema } from "@/lib/middleware/validate";
import { getTenantById } from "@/lib/db/queries";
import { appendAuditLog } from "@/lib/db/queries";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/admin — get tenant configuration */
export async function GET(request: NextRequest) {
  const session = requireRole(request, "tenant_admin", "super_admin");
  if (session instanceof NextResponse) return session;

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      region: tenant.region,
      priceListId: tenant.priceListId,
      brandingConfig: tenant.brandingConfig,
      standardsConfig: tenant.standardsConfig,
      onboardingState: tenant.onboardingState,
      locale: tenant.locale,
      timezone: tenant.timezone,
    },
  });
}

/** PATCH /api/admin — update tenant configuration */
export async function PATCH(request: NextRequest) {
  const session = requireRole(request, "tenant_admin", "super_admin");
  if (session instanceof NextResponse) return session;

  const data = await validateBody(request, tenantConfigSchema);
  if (data instanceof NextResponse) return data;

  const updateData: Record<string, unknown> = {};
  if (data.name) updateData.name = data.name;
  if (data.region) updateData.region = data.region;
  if (data.priceListId) updateData.priceListId = data.priceListId;
  if (data.locale) updateData.locale = data.locale;
  if (data.timezone) updateData.timezone = data.timezone;
  if (data.brandingConfig) updateData.brandingConfig = data.brandingConfig;
  if (data.standardsConfig) updateData.standardsConfig = data.standardsConfig;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(tenants)
    .set(updateData)
    .where(eq(tenants.id, session.tenantId))
    .returning();

  await appendAuditLog(
    session.tenantId,
    "tenant:config_updated",
    session.userId,
    { fields: Object.keys(updateData) }
  );

  return NextResponse.json({ tenant: updated });
}
