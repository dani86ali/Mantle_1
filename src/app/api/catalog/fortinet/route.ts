/**
 * GET /api/catalog/fortinet
 *   ?search=FG-601F&category=firewall&limit=50&offset=0
 *
 * Reads docs/Q22026_USD*.xlsx on first call, caches the parsed catalog in
 * module-scope memory, and returns filtered + paginated results.
 */

import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { existsSync, readdirSync } from "fs";
import { readExcelFile } from "@/lib/io/excel-reader";
import {
  parseFortinetPriceList,
  type FortinetProduct,
} from "@/engines/e2/fortinet-catalog";

let cachedCatalog: FortinetProduct[] | null = null;

function locatePriceList(): string {
  const docsDir = join(process.cwd(), "docs");
  if (!existsSync(docsDir)) {
    throw new Error(`docs directory not found at ${docsDir}`);
  }
  const matches = readdirSync(docsDir).filter((f) =>
    /^Q22026_USD.*\.xlsx$/i.test(f)
  );
  if (matches.length === 0) {
    throw new Error("Fortinet price list (Q22026_USD*.xlsx) not found in docs/");
  }
  return join(docsDir, matches[0]);
}

function loadCatalog(): FortinetProduct[] {
  if (cachedCatalog) return cachedCatalog;
  const filePath = locatePriceList();
  const r = readExcelFile(filePath);
  cachedCatalog = parseFortinetPriceList(r.sheets);
  return cachedCatalog;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const search = (sp.get("search") ?? "").trim().toLowerCase();
    const category = (sp.get("category") ?? "").trim();
    const limit = Math.max(1, Math.min(200, Number(sp.get("limit") ?? 50)));
    const offset = Math.max(0, Number(sp.get("offset") ?? 0));

    const all = loadCatalog();
    let filtered = all;
    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.sku.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search)
      );
    }
    if (category) {
      filtered = filtered.filter((p) => p.category === category);
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);
    return NextResponse.json({ items, total, offset, limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
