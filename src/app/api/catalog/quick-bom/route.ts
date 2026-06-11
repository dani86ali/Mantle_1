/**
 * GET /api/catalog/quick-bom - active/default Quick BoM authority coverage.
 *
 * Read-only Catalog surface metadata. It exposes deterministic coverage and
 * boundaries only; it does not perform customer BoQ lookup, SKU replacement,
 * pricing, configuration decisions, export generation, or AI calls.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { getQuickBomCatalogAuthoritySurface } from "@/lib/projects/quick-bom-catalog-authority-surface";

export async function GET(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    return NextResponse.json(
      { catalog: getQuickBomCatalogAuthoritySurface() },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_catalog_authority_failed",
        error: "Unable to load Quick BoM catalog authority coverage.",
      },
      { status: 500 }
    );
  }
}
