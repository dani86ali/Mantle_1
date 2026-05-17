/**
 * Catalog Tier-1 post-extraction polish — pure transforms.
 *
 * Three concerns:
 *   1. Drop placeholder/junk SKUs that leaked from STC's BoQ templates.
 *   2. Canonicalize vendor strings (case variants, drop non-vendor words).
 *   3. Re-derive productCategory from SKU shape + description keywords.
 *
 * Functions are pure and unit-testable. Wired together by
 * scripts/polish-catalog-tier1.ts.
 */

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
  /^MS-\d+$/i,
  /^SVC-\d+$/i,
];

const NON_VENDOR_STRINGS = new Set([
  "Blank",
  "blank",
  "",
]);

/**
 * Is this SKU a placeholder / non-product entry that should be dropped?
 *
 * Anchored, case-insensitive matches against known STC-internal markers
 * plus structural sanity checks (length, whitespace, description-equals-sku).
 * Conservative on real Cisco SKUs — note `^PM-STCS` is anchored to the
 * STCS suffix to avoid culling legitimate Cisco PM* part numbers.
 */
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

/**
 * Canonicalization table for known vendor strings.
 *
 * `null` value = "this string is not a vendor; demote downstream to Unknown".
 * Vendors not present in the table pass through unchanged at this layer;
 * the long-tail demote rule in normalizeVendor() handles the remainder.
 */
export const VENDOR_CANONICAL: Record<string, string | null> = {
  Blank: null,
  blank: null,
  Giza: null,
  Edwards: null,
  STC: null,
  CISCO: "Cisco",
  cisco: "Cisco",
  HPE: "HPE",
  hpe: "HPE",
  FIREEYE: "FireEye",
  fireeye: "FireEye",
  FORTINET: "Fortinet",
  fortinet: "Fortinet",
  Microsoft: "Microsoft",
  MICROSOFT: "Microsoft",
  PaloAlto: "Palo Alto Networks",
  "Palo Alto": "Palo Alto Networks",
  "PALO ALTO": "Palo Alto Networks",
  PaloAltoNetworks: "Palo Alto Networks",
  "Palo Alto Networks": "Palo Alto Networks",
};

/**
 * Map a raw vendor string through the canonical table.
 * Returns null for explicitly-blocked non-vendor strings (caller should
 * substitute "Unknown"). Returns the input unchanged when not in the table.
 */
export function normalizeVendor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (raw in VENDOR_CANONICAL) return VENDOR_CANONICAL[raw];
  return raw;
}

/**
 * Re-derive productCategory from SKU shape and description keywords.
 *
 * Rule chain — first match wins. Ordering is load-bearing:
 *   service → subscription (year-suffixed) → license (no year) →
 *   software → accessory → hardware → fall-through.
 */
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
