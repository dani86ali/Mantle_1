/**
 * Polish-pass for the Tier-1 catalog (post-extraction).
 *
 * Reads src/lib/adapters/_mock-data/catalog-responses.json, applies three
 * transforms from catalog-polish.ts, writes back the cleaned JSON, and emits
 * a markdown report to bomatic_planning/polish-reports/.
 *
 * Run from worktree root:  npx tsx scripts/polish-catalog-tier1.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import {
  isPlaceholderSku,
  normalizeVendor,
  inferCategory,
  VENDOR_CANONICAL,
} from "../src/lib/adapters/catalog-polish";

const CATALOG_PATH = "src/lib/adapters/_mock-data/catalog-responses.json";
const REPORT_DIR = "../bomatic_planning/polish-reports";
// Pass #2: raised from 3 to 8. Transform 1 (vendor canonicalization) alone
// projected ~80 distinct vendors; spec requires ≤50. At threshold=8 the
// long tail demotes to ~42, comfortably under the cap. SKU count is not
// affected — demote relabels vendor to "Unknown", does not drop entries.
const LONG_TAIL_MIN_OCCURRENCES = 8;

interface CatalogItem {
  sku: string;
  description?: string;
  vendor?: string;
  productCategory?: string;
  listPrice?: number;
  bidFrequency?: number;
  [k: string]: unknown;
}

interface CatalogFile {
  _metadata?: unknown;
  items: Record<string, CatalogItem>;
  errors?: unknown;
}

function inc(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] || 0) + 1;
}

function dropReason(item: CatalogItem): string | null {
  const sku = item.sku;
  if (!sku) return "missing-sku";
  const lower = sku.toLowerCase();
  if (["pm", "ps", "mrc", "otc", "m&s", "m&s-", "local"].includes(lower)) {
    return "exact-placeholder";
  }
  if (/^STCS-PM/i.test(sku)) return "regex:STCS-PM";
  if (/^PM-STCS/i.test(sku)) return "regex:PM-STCS";
  if (/^PS-/i.test(sku)) return "regex:PS-";
  if (/^EXC-\d/i.test(sku)) return "regex:EXC-N";
  if (/^TSS-?\d/i.test(sku)) return "regex:TSS-N";
  if (/^MS-(STCS|\d+)$/i.test(sku)) return "regex:MS-N";
  if (/^SVC-\d+$/i.test(sku)) return "regex:SVC-N";
  if (sku.length > 30) return "sku-too-long";
  if (sku.includes(" ")) return "sku-has-space";
  if (item.description != null && sku === item.description) return "sku-eq-desc";
  if (item.vendor == null || ["Blank", "blank", ""].includes(item.vendor)) {
    return "blank-vendor";
  }
  return null;
}

function loadCatalog(): CatalogFile {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as CatalogFile;
}

function distinctVendors(items: CatalogItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it.vendor) set.add(it.vendor);
  return Array.from(set).sort();
}

function categoryDist(items: CatalogItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) inc(out, String(it.productCategory ?? "(none)"));
  return out;
}

function fmtTable(rows: Array<[string, number | string]>): string {
  const w = Math.max(...rows.map((r) => r[0].length));
  return rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join("\n");
}

function main(): void {
  const catalog = loadCatalog();
  const before = Object.values(catalog.items);
  const beforeCount = before.length;
  const beforeVendors = distinctVendors(before);
  const beforeCats = categoryDist(before);

  // ── Transform 1: placeholder filter ──
  const dropReasons: Record<string, number> = {};
  const kept: CatalogItem[] = [];
  for (const it of before) {
    const reason = dropReason(it);
    if (reason || isPlaceholderSku(it.sku, it.vendor, it.description)) {
      inc(dropReasons, reason || "isPlaceholderSku-other");
    } else {
      kept.push(it);
    }
  }

  // ── Transform 2: vendor normalization ──
  const tableMappings: Record<string, number> = {};
  const phase1: CatalogItem[] = kept.map((it) => {
    const orig = it.vendor;
    if (orig != null && orig in VENDOR_CANONICAL) {
      const mapped = normalizeVendor(orig);
      inc(tableMappings, `${orig} → ${mapped ?? "Unknown"}`);
      return { ...it, vendor: mapped ?? "Unknown" };
    }
    return it;
  });

  // Long-tail demote
  const vendorCounts: Record<string, number> = {};
  for (const it of phase1) {
    const v = it.vendor ?? "Unknown";
    inc(vendorCounts, v);
  }
  const longTailDemoted: Record<string, number> = {};
  const unmappedFrequent: Array<[string, number]> = [];
  for (const [v, c] of Object.entries(vendorCounts)) {
    if (v === "Unknown") continue;
    if (!(v in VENDOR_CANONICAL) && c >= LONG_TAIL_MIN_OCCURRENCES) {
      unmappedFrequent.push([v, c]);
    }
  }
  unmappedFrequent.sort((a, b) => b[1] - a[1]);

  const phase2: CatalogItem[] = phase1.map((it) => {
    const v = it.vendor ?? "Unknown";
    if (v === "Unknown") return it;
    if (vendorCounts[v] < LONG_TAIL_MIN_OCCURRENCES) {
      inc(longTailDemoted, v);
      return { ...it, vendor: "Unknown" };
    }
    return it;
  });

  // ── Transform 3: category re-inference ──
  const categoryFlips: Record<string, number> = {};
  const polished: CatalogItem[] = phase2.map((it) => {
    const before = it.productCategory ?? "(none)";
    const after = inferCategory(
      it.sku,
      it.description ?? "",
      String(it.productCategory ?? ""),
    );
    if (before !== after) inc(categoryFlips, `${before} → ${after}`);
    return { ...it, productCategory: after };
  });

  // ── Persist polished catalog ──
  // Also record workbooks whose entire contribution was dropped, so the
  // per-file-coverage invariant ("no silent drops") can account for them.
  const sourcesBefore = new Set<string>();
  for (const it of before) {
    for (const obs of (it.priceObservations as Array<{ source: string }>) ??
      []) {
      const m = obs.source.match(/^(?:TA|CCW)\s+(.+)$/);
      if (m) sourcesBefore.add(m[1]);
    }
  }
  const sourcesAfter = new Set<string>();
  for (const it of polished) {
    for (const obs of (it.priceObservations as Array<{ source: string }>) ??
      []) {
      const m = obs.source.match(/^(?:TA|CCW)\s+(.+)$/);
      if (m) sourcesAfter.add(m[1]);
    }
  }
  // Union with any drained set from prior polish passes — pass N's
  // "before" snapshot has already lost workbooks pass N-1 drained, so
  // overwriting would silently lose that history.
  const priorDrained = ((catalog._metadata as Record<string, unknown>)
    ?.workbooksDrainedByPolish ?? []) as string[];
  const drainedByPolish = Array.from(
    new Set([
      ...priorDrained,
      ...Array.from(sourcesBefore).filter((s) => !sourcesAfter.has(s)),
    ]),
  ).sort();

  const newItems: Record<string, CatalogItem> = {};
  for (const it of polished) newItems[it.sku] = it;
  const newMeta = {
    ...(catalog._metadata as Record<string, unknown>),
    workbooksDrainedByPolish: drainedByPolish,
  };
  const polishedFile: CatalogFile = {
    ...catalog,
    _metadata: newMeta,
    items: newItems,
  };
  writeFileSync(CATALOG_PATH, JSON.stringify(polishedFile, null, 2), "utf-8");

  // ── Report ──
  const afterVendors = distinctVendors(polished);
  const afterCats = categoryDist(polished);
  const top10 = [...polished]
    .sort((a, b) => (b.bidFrequency ?? 0) - (a.bidFrequency ?? 0))
    .slice(0, 10);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(REPORT_DIR, `tier1-polish-${ts}.md`);
  mkdirSync(dirname(reportPath), { recursive: true });

  const report = [
    `# Tier-1 Catalog Polish — ${ts}`,
    "",
    "## Totals",
    fmtTable([
      ["Entries before", beforeCount],
      ["Entries after", polished.length],
      ["Δ (dropped)", beforeCount - polished.length],
    ]),
    "",
    "## Placeholder-filter drops by reason",
    fmtTable(
      Object.entries(dropReasons).sort((a, b) => b[1] - a[1]) as Array<
        [string, number]
      >,
    ) || "  (none)",
    "",
    "## Vendor normalization",
    fmtTable([
      ["Distinct vendors before", beforeVendors.length],
      ["Distinct vendors after", afterVendors.length],
    ]),
    "",
    "### Top table mappings applied",
    fmtTable(
      Object.entries(tableMappings)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20) as Array<[string, number]>,
    ) || "  (none)",
    "",
    `### Long-tail demoted to Unknown (vendors with <${LONG_TAIL_MIN_OCCURRENCES} occurrences)`,
    fmtTable([["Distinct vendor strings demoted", Object.keys(longTailDemoted).length]]),
    "",
    `### Unmapped vendors with ≥${LONG_TAIL_MIN_OCCURRENCES} occurrences (extend canonical table next pass)`,
    fmtTable(unmappedFrequent.slice(0, 80) as Array<[string, number]>) ||
      "  (none)",
    "",
    "## Category re-classification",
    "### Before",
    fmtTable(
      Object.entries(beforeCats).sort((a, b) => b[1] - a[1]) as Array<
        [string, number]
      >,
    ),
    "",
    "### After",
    fmtTable(
      Object.entries(afterCats).sort((a, b) => b[1] - a[1]) as Array<
        [string, number]
      >,
    ),
    "",
    "### Top flips",
    fmtTable(
      Object.entries(categoryFlips)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15) as Array<[string, number]>,
    ) || "  (none)",
    "",
    "## Named-SKU regression check",
    ...[
      ["CON-SNT-C9410R", 29773.5],
      ["C9400-DNA-A-5Y", 25271.85],
      ["C9400-PWR-2100AC", 2406.84],
      ["C9400X-SUP-2XL", 28944.3],
      ["C9400-LC-48XS", 46110.4],
    ].map(([sku, expected]) => {
      const it = newItems[sku as string];
      const got = it?.listPrice;
      const pass =
        got != null && Math.abs(got - (expected as number)) < 0.01 ? "✅" : "❌";
      return `- ${pass} ${sku}: expected ${expected}, got ${got ?? "(missing)"} (cat=${it?.productCategory ?? "n/a"})`;
    }),
    "",
    "## Top 10 by bidFrequency (after polish)",
    fmtTable(
      top10.map((it) => [
        `${it.sku} [${it.productCategory}/${it.vendor}]`,
        it.bidFrequency ?? 0,
      ]),
    ),
    "",
  ].join("\n");

  writeFileSync(reportPath, report, "utf-8");

  console.log(`Polished ${beforeCount} → ${polished.length} entries`);
  console.log(`Report: ${reportPath}`);
}

main();
