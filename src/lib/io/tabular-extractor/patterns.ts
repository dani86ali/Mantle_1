// Shared regexes for the generic tabular BoQ extractor.
//
// SKU_RE requires at least one letter (the (?=.*[A-Z]) lookahead) so dotted
// line-numbers like "1.0" / "1.0.1" are NOT matched as SKUs — a validated bug
// from the CCW EstimateDetails layout where col A holds such line numbers.
export const SKU_RE = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9.\/-]{2,}[A-Z0-9=]$/i;

/** Column-role header keywords. Order matters only for documentation. */
export const ROLE_KEYWORDS = {
  sku: /\b(part\s*(no|number|#)|sku|item\s*(code|name|number)|model|material\s*(code|number)?|mfg\s*part|cisco\s*(ref|part))\b/i,
  description: /\b(desc|description|details|item\s*description|particulars)\b/i,
  qty: /\b(qty|quantity|count|nos|units|q'?ty)\b/i,
  unitPrice:
    /\b(unit\s*(list\s*)?price|u\.?\s*price|list\s*price|listprice|rate|price\/unit)\b/i,
  uom: /\b(uom|unit\s*of\s*measure)\b/i,
} as const;

export type ColumnRole = keyof typeof ROLE_KEYWORDS;

/** True when a stringified cell parses as a finite number. */
export function isNumeric(cell: string): boolean {
  const s = (cell ?? "").trim();
  if (s === "") return false;
  return !Number.isNaN(Number(s));
}

export function parseNum(cell: string): number | undefined {
  const s = (cell ?? "").trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}
