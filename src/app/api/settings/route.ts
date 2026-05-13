import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/index";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTenantConfig, updateTenantConfig } from "@/lib/db/queries";
import type { TenantConfig } from "@/types/tenant";

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

const companyProfileSchema = z.object({
  tenantName: z.string().max(255),
  legalEntity: z.string().max(255),
  city: z.string().max(100),
  country: z.string().max(100),
  address: z.string().max(500),
  phone: z.string().max(50),
});

const pricingDefaultsSchema = z.object({
  fxRate: z.number().positive(),
  partnerDiscountPct: z.number().min(0).max(100),
  dealRegDiscountPct: z.number().min(0).max(100),
  profitMode: z.enum(["margin", "markup"]),
  profitPct: z.number().min(0).max(100),
  vatRate: z.number().min(0).max(100),
});

const tenantConfigPatchSchema = z.object({
  companyProfile: companyProfileSchema.optional(),
  pricingDefaults: pricingDefaultsSchema.optional(),
  boilerplateOverrides: z.record(z.string()).optional(),
});

export async function GET() {
  const tenantId = await getDefaultTenantId();
  const config = await getTenantConfig(tenantId);
  return NextResponse.json({ config });
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = tenantConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid config", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const tenantId = await getDefaultTenantId();
  await updateTenantConfig(tenantId, parsed.data as Partial<TenantConfig>);
  const config = await getTenantConfig(tenantId);
  return NextResponse.json({ config });
}
