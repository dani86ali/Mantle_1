import { z } from "zod";

export type FortinetCategory =
  | "firewall"
  | "switch"
  | "ap"
  | "manager"
  | "analyzer"
  | "guard_bundle"
  | "care"
  | "other";

export interface FortinetProduct {
  sku: string;
  description: string;
  listPriceUsd: number;
  category: FortinetCategory;
  family: string;
  eol: boolean;
}

interface HeaderLayout {
  sheetName: string;
  headerRowIdx: number;
  skuCol: number;
  descCol: number;
  priceCol: number;
  commentsCol: number;
}

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

const SKU_HEADER_RE = /^(sku|part\s*number|part\s*#|partnumber)$/i;
const PRICE_HEADER_RE = /(list\s*price|msrp|^price$)/i;
const DESC_HEADER_RE = /^(description(\s*#?\s*\d+)?|product\s*description)$/i;
const COMMENTS_HEADER_RE = /^(comments?|notes?)$/i;
const EOL_RE = /\b(eol|end[\s-]of[\s-]life|discontinued)\b/i;

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function detectHeader(sheets: Record<string, string[][]>): HeaderLayout {
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const scanRows = Math.min(rows.length, 20);
    for (let r = 0; r < scanRows; r++) {
      const row = rows[r] ?? [];
      let skuCol = -1;
      let priceCol = -1;
      let descCol = -1;
      let commentsCol = -1;
      for (let c = 0; c < row.length; c++) {
        const v = norm(row[c]);
        if (!v) continue;
        if (skuCol < 0 && SKU_HEADER_RE.test(v)) skuCol = c;
        else if (priceCol < 0 && PRICE_HEADER_RE.test(v)) priceCol = c;
        else if (descCol < 0 && DESC_HEADER_RE.test(v)) descCol = c;
        else if (commentsCol < 0 && COMMENTS_HEADER_RE.test(v)) commentsCol = c;
      }
      if (skuCol >= 0 && priceCol >= 0) {
        return {
          sheetName,
          headerRowIdx: r,
          skuCol,
          descCol: descCol >= 0 ? descCol : skuCol + 1,
          priceCol,
          commentsCol,
        };
      }
    }
  }
  throw new Error(
    `No sheet has both SKU/Part Number and Price/MSRP headers. Sheets: ${Object.keys(sheets).join(", ")}`
  );
}

function categorize(sku: string): FortinetCategory {
  const u = sku.toUpperCase();
  if (/^(FG|FI)-.*-BDL/.test(u)) return "guard_bundle";
  if (u.startsWith("FC-10")) return "care";
  if (u.startsWith("FG-")) return "firewall";
  if (u.startsWith("FS-")) return "switch";
  if (u.startsWith("FAP-")) return "ap";
  if (u.startsWith("FMG-")) return "manager";
  if (u.startsWith("FAZ-")) return "analyzer";
  return "other";
}

const FAMILY_BY_PREFIX: Record<string, string> = {
  FG: "FortiGate",
  FI: "FortiSwitch",
  FS: "FortiSwitch",
  FAP: "FortiAP",
  FMG: "FortiManager",
  FAZ: "FortiAnalyzer",
  FWB: "FortiWeb",
  FML: "FortiMail",
  FSA: "FortiSandbox",
  FNC: "FortiNAC",
  FAC: "FortiAuthenticator",
  FAD: "FortiADC",
  FDD: "FortiDDoS",
  FTK: "FortiToken",
  FTM: "FortiToken",
  FEX: "FortiExtender",
  FWC: "FortiWLC",
  FC: "FortiCare",
  FN: "Transceiver",
};

function extractFamily(sku: string, description: string): string {
  const descMatch = description.match(/Forti[A-Z][A-Za-z]*/);
  if (descMatch) return descMatch[0];
  const prefix = sku.split("-")[0]?.toUpperCase() ?? "";
  return FAMILY_BY_PREFIX[prefix] ?? "Unknown";
}

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[,$\s]/g, "");
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function rowToProduct(row: string[], layout: HeaderLayout): FortinetProduct | null {
  const sku = norm(row[layout.skuCol]);
  if (!sku) return null;
  // Skip rows where SKU cell repeats the header (some sheets have section banners)
  if (SKU_HEADER_RE.test(sku)) return null;
  const price = parsePrice(norm(row[layout.priceCol]));
  if (price === undefined) return null;
  const description = norm(row[layout.descCol]);
  const comments = layout.commentsCol >= 0 ? norm(row[layout.commentsCol]) : "";
  return {
    sku,
    description,
    listPriceUsd: price,
    category: categorize(sku),
    family: extractFamily(sku, description),
    eol: EOL_RE.test(description) || EOL_RE.test(comments),
  };
}

export function parseFortinetPriceList(
  sheets: Record<string, string[][]>
): FortinetProduct[] {
  SheetsSchema.parse(sheets);
  const layout = detectHeader(sheets);
  const rows = sheets[layout.sheetName];
  const seen = new Set<string>();
  const out: FortinetProduct[] = [];
  for (let r = layout.headerRowIdx + 1; r < rows.length; r++) {
    const product = rowToProduct(rows[r] ?? [], layout);
    if (!product) continue;
    const key = product.sku.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

export function lookupFortinetSku(
  sku: string,
  catalog: FortinetProduct[]
): FortinetProduct | undefined {
  const target = sku.trim().toUpperCase();
  if (!target) return undefined;
  return catalog.find((p) => p.sku.toUpperCase() === target);
}

export function searchFortinetCatalog(
  query: string,
  catalog: FortinetProduct[]
): FortinetProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: FortinetProduct[] = [];
  for (const p of catalog) {
    if (
      p.sku.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    ) {
      results.push(p);
      if (results.length >= 10) break;
    }
  }
  return results;
}
