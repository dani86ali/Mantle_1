// Tier-1 post-extraction polish — pure transforms.
// 1. Drop placeholder SKUs (STC BoQ-template leaks).
// 2. Canonicalize vendor strings (table in _data/vendor-canonical.ts).
// 3. Re-derive productCategory from SKU shape + keywords.
// Wired by scripts/polish-catalog-tier1.ts.

import { VENDOR_CANONICAL } from "./_data/vendor-canonical";
export { VENDOR_CANONICAL };

export type ProductCategory =
  | "hardware"
  | "license"
  | "subscription"
  | "service"
  | "accessory"
  | "software"
  | "other";

const EXACT_PLACEHOLDERS = new Set([
  "pm",
  "ps",
  "mrc",
  "otc",
  "m&s",
  "m&s-",
  "local",
]);

const PLACEHOLDER_REGEXES: ReadonlyArray<RegExp> = [
  /^STCS-PM/i,
  /^PM-STCS/i,
  /^PS-/i,
  /^EXC-\d/i,
  /^TSS-?\d/i,
  // Pass #2: `^MS-\d+$` missed `MS-STCS` (the only STCS-prefixed entry that
  // had crept into the top-10). Broaden to cover both forms.
  /^MS-(STCS|\d+)$/i,
  /^SVC-\d+$/i,
  // Pass #3 (Tier 1.1): STCS is STC Solutions' internal code; drop any SKU
  // prefixed or suffixed with STCS- / -STCS that escaped the narrower regexes.
  /^STCS-/i,
  /-STCS$/i,
];

const NON_VENDOR_STRINGS = new Set([
  "Blank",
  "blank",
  "",
]);

// True when SKU is a placeholder / non-product entry that should be dropped.
// Anchored, case-insensitive matches against STC-internal markers plus
// structural sanity checks. `^PM-STCS` is anchored to avoid culling
// legitimate Cisco PM* part numbers.
export function isPlaceholderSku(
  sku: string | undefined | null,
  vendor?: string | null,
  description?: string | null,
): boolean {
  if (!sku) return true;
  const skuStr = String(sku);
  if (EXACT_PLACEHOLDERS.has(skuStr.toLowerCase())) return true;
  for (const re of PLACEHOLDER_REGEXES) {
    if (re.test(skuStr)) return true;
  }
  if (skuStr.length > 30) return true;
  if (skuStr.includes(" ")) return true;
  if (description != null && skuStr === description) return true;
  if (vendor == null || NON_VENDOR_STRINGS.has(vendor)) return true;
  return false;
}

// Maps raw vendor through the canonical table.
// Returns null for explicitly-blocked non-vendor strings (caller substitutes
// "Unknown"). Returns input unchanged when not in the table.
export function normalizeVendor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (raw in VENDOR_CANONICAL) return VENDOR_CANONICAL[raw];
  return raw;
}

// Re-derive productCategory from SKU shape + description keywords.
// First match wins; ordering is load-bearing:
// service → subscription (year-suffixed) → license (no year) →
// software → accessory → hardware → fall-through.
export function inferCategory(
  sku: string,
  description: string,
  currentCategory: string,
): ProductCategory {
  const s = (sku || "").toUpperCase();
  const d = (description || "").toLowerCase();

  if (/^CON-/.test(s)) return "service";
  if (/-(SVC|SUPPORT|SUPP)-/.test(s)) return "service";
  if (d.includes("smart net") || d.includes("smartnet") || d.includes("snt")) {
    return "service";
  }

  if (/-([1-9]|10|12|24|36|60)Y$/.test(s)) return "subscription";
  if (/-(MONTHLY|MTHLY|MTH)$/.test(s)) return "subscription";
  if (d.includes("term license") && /-\d+Y/.test(s)) return "subscription";

  if (/^LIC-/.test(s)) return "license";
  if (/-LIC-/.test(s)) return "license";
  if (/-(DNA|NW|NWK|DNX|HSEC|TE)-/.test(s) && !/-\d+Y/.test(s)) return "license";
  if (
    d.includes("license") &&
    !d.includes("user license") &&
    !/-\d+Y/.test(s)
  ) {
    return "license";
  }

  if (/^SW-/.test(s)) return "software";
  if (/-SW-/.test(s)) return "software";

  if (/-(PWR|FAN|BLANK|COVER|CAB|BRKT|RACK|MNT|SLED)-/.test(s)) return "accessory";
  if (/^(PWR|CAB)-/.test(s)) return "accessory";
  if (
    d.includes("power cord") ||
    d.includes("rack kit") ||
    d.includes("bracket")
  ) {
    return "accessory";
  }

  if (/^[A-Z]\d{4}/.test(s)) return "hardware";
  if (/^(ISR|ASR|N9|EX|QFX|MX|SRX|GLC|SFP|XCVR|TRX|FGT|FG-|FG\d)/.test(s)) {
    return "hardware";
  }
  if (/^(R\d{3}|H\d{3,4}|P\d{3,4}[A-Z]?)$/.test(s)) return "hardware";
  if (/^(C8|C9|N3|N5|N7|N9|MS|MR|MX|GR|VMX|CCM|UCS|HX|MERAKI)/.test(s)) {
    return "hardware";
  }

  const knownCats: ReadonlyArray<ProductCategory> = [
    "hardware",
    "license",
    "subscription",
    "service",
    "accessory",
    "software",
    "other",
  ];
  if (
    currentCategory &&
    currentCategory !== "unknown" &&
    knownCats.includes(currentCategory as ProductCategory)
  ) {
    return currentCategory as ProductCategory;
  }
  return "other";
}
