/**
 * GET /api/customers — derive customer directory from unique customerName
 * values in the intakes table for the authenticated tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { intakes } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/middleware/auth";

export interface CustomerSummary {
  name: string;
  region: string;
  country: string | null;
  domain: string;
  estimateCount: number;
  lastActivity: string;
}

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const rows = await db
      .select({
        name: intakes.customerName,
        region: sql<string>`max(${intakes.region})`,
        country: sql<string | null>`max(${intakes.country})`,
        domain: sql<string>`max(${intakes.domain})`,
        estimateCount: sql<number>`count(*)::int`,
        lastActivity: sql<Date>`max(${intakes.createdAt})`,
      })
      .from(intakes)
      .where(eq(intakes.tenantId, session.tenantId))
      .groupBy(intakes.customerName)
      .orderBy(desc(sql`max(${intakes.createdAt})`));

    const customers: CustomerSummary[] = rows.map((r) => ({
      name: r.name,
      region: r.region,
      country: r.country,
      domain: r.domain,
      estimateCount: r.estimateCount,
      lastActivity:
        r.lastActivity instanceof Date
          ? r.lastActivity.toISOString()
          : String(r.lastActivity),
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
