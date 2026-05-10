import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

// Column indices for base BoQ (MAIN BOQ sheet, cols A–F used for parsing)
const BASE = {
  ref: 0,  // A - REF. (hierarchical: 1.00 / 1.01 / 'a')
  b: 1,    // B - major element name (L1)
  c: 2,    // C - sub-element name (L2)
  d: 3,    // D - line-item description (L3/L4)
  qty: 4,  // E - QTY
  unit: 5, // F - UNIT
} as const;

// Column indices for add/omit variant (Bill02a sheet, cols A–G used)
const ADDOMMIT = {
  ref: 0,    // A - REF.
  b: 1,      // B - major element
  c: 2,      // C - sub-element
  d: 3,      // D - description
  oldQty: 4, // E - OLD QTY (negative = omit; null = pure add)
  newQty: 5, // F - NEW QTY (positive = add; null = pure omit)
  unit: 6,   // G - UNIT
} as const;

// col A = "d.dd" → section/sub-section header
const SECTION_REF_RE = /^\d+\.\d+$/;
// col A = one or more lowercase letters → line item; "REF." is auto-skipped
const LINE_ITEM_REF_RE = /^[a-z]+$/;
const SUBTOTAL_RE = /carried to collection/i;

function cell(row: string[], idx: number): string {
  return (row[idx] ?? "").trim();
}

function parseNum(s: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

function buildDescription(b: string, c: string, d: string): string {
  return [b, c, d].filter((p) => p !== "").join(" | ");
}

function findSheet(
  sheets: Record<string, string[][]>,
  predicate: (name: string) => boolean,
  errMsg: string
): string[][] {
  const name = Object.keys(sheets).find(predicate);
  if (!name) {
    throw new Error(`${errMsg}; available: ${Object.keys(sheets).join(", ")}`);
  }
  return sheets[name];
}

function parseBase(rows: string[][]): BoQLineItem[] {
  const items: BoQLineItem[] = [];
  let sectionL1 = "";
  let sectionL2 = "";

  for (const row of rows) {
    const ref = cell(row, BASE.ref);

    if (SUBTOTAL_RE.test(cell(row, BASE.b))) continue;

    if (SECTION_REF_RE.test(ref)) {
      const b = cell(row, BASE.b);
      const c = cell(row, BASE.c);
      if (b) sectionL1 = `${ref} ${b}`;
      sectionL2 = c;
      continue;
    }

    if (!LINE_ITEM_REF_RE.test(ref)) continue;

    const qty = parseNum(cell(row, BASE.qty));
    if (qty === undefined) continue;

    const section = sectionL2 ? `${sectionL1} > ${sectionL2}` : sectionL1;

    items.push({
      itemNumber: ref,
      description: buildDescription(
        cell(row, BASE.b),
        cell(row, BASE.c),
        cell(row, BASE.d)
      ),
      qty,
      unit: cell(row, BASE.unit),
      section: section || undefined,
    });
  }

  return items;
}

function parseAddOmmit(rows: string[][]): BoQLineItem[] {
  const items: BoQLineItem[] = [];
  let sectionL1 = "";
  let sectionL2 = "";

  for (const row of rows) {
    const ref = cell(row, ADDOMMIT.ref);

    if (SUBTOTAL_RE.test(cell(row, ADDOMMIT.b))) continue;

    if (SECTION_REF_RE.test(ref)) {
      const b = cell(row, ADDOMMIT.b);
      const c = cell(row, ADDOMMIT.c);
      if (b) sectionL1 = `${ref} ${b}`;
      sectionL2 = c;
      continue;
    }

    if (!LINE_ITEM_REF_RE.test(ref)) continue;

    const oldQtyNum = parseNum(cell(row, ADDOMMIT.oldQty));
    const newQtyNum = parseNum(cell(row, ADDOMMIT.newQty));
    // Skip rows where neither qty column carries a value (blanks / sub-totals)
    if (oldQtyNum === undefined && newQtyNum === undefined) continue;

    const section = sectionL2 ? `${sectionL1} > ${sectionL2}` : sectionL1;
    const metadata: Record<string, string> = {};
    if (oldQtyNum !== undefined) metadata.oldQty = String(oldQtyNum);
    if (newQtyNum !== undefined) metadata.newQty = String(newQtyNum);

    items.push({
      itemNumber: ref,
      description: buildDescription(
        cell(row, ADDOMMIT.b),
        cell(row, ADDOMMIT.c),
        cell(row, ADDOMMIT.d)
      ),
      qty: 0, // effective qty undefined in add/omit context; see metadata
      unit: cell(row, ADDOMMIT.unit),
      section: section || undefined,
      metadata,
    });
  }

  return items;
}

export function parseTypeB(
  sheets: Record<string, string[][]>,
  variant: "base" | "addommit"
): BoQLineItem[] {
  SheetsSchema.parse(sheets);

  if (variant === "base") {
    const rows = findSheet(
      sheets,
      (n) => n === "MAIN BOQ",
      'No "MAIN BOQ" sheet found'
    );
    return parseBase(rows);
  }

  const rows = findSheet(
    sheets,
    (n) => n.startsWith("Bill02a"),
    'No sheet starting with "Bill02a" found'
  );
  return parseAddOmmit(rows);
}
