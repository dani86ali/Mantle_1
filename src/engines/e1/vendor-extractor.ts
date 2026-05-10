import { z } from "zod";

// --- Schema & Types ---

export const VendorPreferenceSchema = z.object({
  vendor: z.string(),
  category: z.string(),
  status: z.enum(["required", "preferred", "or_equivalent"]),
  source: z.string(),
  specificModels: z.array(z.string()),
});
export type VendorPreference = z.infer<typeof VendorPreferenceSchema>;

// --- Constants ---

const KNOWN_VENDORS = [
  "Cisco", "Fortinet", "Palo Alto", "HPE", "Dell", "Juniper", "Aruba", "Huawei",
];

const OR_EQUIVALENT_RE = /\bor\s+(?:equivalent|equal|approved\s+alternative)\b/i;

// Model codes have a digit AND a letter (filters plain acronyms like OEM, SAR, USD)
const MODEL_RE = /\b[A-Z][A-Z0-9-]{2,}\b/g;

function extractModels(text: string): string[] {
  return (text.match(MODEL_RE) ?? []).filter((m) => /\d/.test(m) && /[A-Z]/.test(m));
}

// A real header row has ≥2 non-empty cells; title rows are usually single-cell
function findHeaderRow(sheet: string[][]): number {
  for (let i = 0; i < Math.min(5, sheet.length); i++) {
    if (sheet[i].filter((c) => c && c.trim().length > 0).length >= 2) return i;
  }
  return 0;
}

function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h ?? ""));
}

// --- Source 1: Dedicated vendor/brand/OEM/approved sheet tab ---

function parseVendorSheet(sheetData: string[][], sheetName: string): VendorPreference[] {
  if (sheetData.length < 2) return [];
  const hi = findHeaderRow(sheetData);
  const headers = sheetData[hi].map((h) => (h ?? "").toLowerCase());

  const vendorCol = findCol(headers, /vendor|brand|manufacturer|oem|approved/);
  if (vendorCol === -1) return [];
  const categoryCol = findCol(headers, /\bcategory\b|\btype\b|\bproduct\b/);

  const results: VendorPreference[] = [];
  for (let i = hi + 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const vendorCell = (row[vendorCol] ?? "").trim();
    if (!vendorCell) continue;
    const category = categoryCol >= 0 ? (row[categoryCol] ?? "").trim() || "General" : "General";

    for (const token of vendorCell.split(/[,/]/).map((v) => v.trim()).filter(Boolean)) {
      const matched = KNOWN_VENDORS.find((v) => new RegExp(v, "i").test(token)) ?? token;
      results.push(
        VendorPreferenceSchema.parse({
          vendor: matched,
          category,
          status: "required",
          source: sheetName,
          specificModels: extractModels(token),
        })
      );
    }
  }
  return results;
}

// --- Source 2: Vendor column within a BoQ sheet ---

function extractFromBoQVendorColumn(sheetData: string[][], sheetName: string): VendorPreference[] {
  if (sheetData.length < 2) return [];
  const hi = findHeaderRow(sheetData);
  const headers = sheetData[hi].map((h) => (h ?? "").toLowerCase());

  const vendorCol = findCol(headers, /vendor|brand|oem|manufacturer/);
  if (vendorCol === -1) return [];
  const categoryCol = findCol(headers, /\bcategory\b|\btype\b|\bproduct\b/);

  const results: VendorPreference[] = [];
  const seen = new Set<string>();

  for (let i = hi + 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const vendorCell = (row[vendorCol] ?? "").trim();
    if (!vendorCell) continue;
    const category = categoryCol >= 0 ? (row[categoryCol] ?? "").trim() || "General" : "General";
    const matched = KNOWN_VENDORS.find((v) => new RegExp(v, "i").test(vendorCell)) ?? vendorCell;

    // Deduplicate by vendor+category tuple so multi-category vendors are preserved
    const key = `${matched.toLowerCase()}|${category.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push(
      VendorPreferenceSchema.parse({
        vendor: matched,
        category,
        status: "preferred",
        source: sheetName,
        specificModels: extractModels(vendorCell),
      })
    );
  }
  return results;
}

// --- Source 3: RFP text scan for known vendor names ---

function extractFromRFPText(text: string): VendorPreference[] {
  const results: VendorPreference[] = [];
  const seen = new Set<string>();

  for (const vendor of KNOWN_VENDORS) {
    const vendorRe = new RegExp(`\\b${vendor.replace(" ", "\\s+")}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = vendorRe.exec(text)) !== null) {
      if (seen.has(vendor.toLowerCase())) break;
      seen.add(vendor.toLowerCase());

      const start = Math.max(0, m.index - 50);
      const end = Math.min(text.length, m.index + vendor.length + 100);
      const context = text.slice(start, end);
      const status: VendorPreference["status"] = OR_EQUIVALENT_RE.test(context)
        ? "or_equivalent"
        : "preferred";

      results.push(
        VendorPreferenceSchema.parse({
          vendor,
          category: "General",
          status,
          source: "RFP text",
          specificModels: extractModels(context),
        })
      );
    }
  }
  return results;
}

// --- Public Function ---

export function extractVendors(
  sheetNames: string[],
  sheets: Record<string, string[][]>,
  rfpText?: string
): VendorPreference[] {
  const results: VendorPreference[] = [];

  const vendorSheetName = sheetNames.find((n) => /vendor|brand|manufacturer|oem|approved/i.test(n));
  if (vendorSheetName && sheets[vendorSheetName]) {
    results.push(...parseVendorSheet(sheets[vendorSheetName], vendorSheetName));
  }

  const boqSheetName = sheetNames.find((n) => /boq|bill/i.test(n));
  if (boqSheetName && sheets[boqSheetName]) {
    results.push(...extractFromBoQVendorColumn(sheets[boqSheetName], boqSheetName));
  }

  if (rfpText) {
    results.push(...extractFromRFPText(rfpText));
  }

  return results;
}
