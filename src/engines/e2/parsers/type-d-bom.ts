import { z } from "zod";
import { BoQLineItem } from "@/engines/e2/boq-types";

const SheetsSchema = z.record(z.string(), z.array(z.array(z.string())));

// A=0 LineNumber, B=1 PartNumber, C=2 Description,
// D=3 ServiceDuration, E=4 Qty
const COL = {
  lineNum: 0,
  partNum: 1,
  desc: 2,
  svcDur: 3,
  qty: 4,
} as const;

const GROUP_RE = /^Group Name:\s*(.+)/i;

function cell(row: string[], idx: number): string {
  return (row[idx] ?? "").trim();
}

function parseNum(s: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}

// Col B holds either an OEM part number OR a CCW subscription metadata string;
// the two are mutually exclusive — if B is CCW metadata, partNumber is omitted.
function isCcwMetadata(s: string): boolean {
  return s.includes("|") && /term/i.test(s);
}

function toCamelCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/(?:\s+)(\S)/g, (_, c: string) => c.toUpperCase());
}

function parseCcwMetadata(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const part of raw.split("|")) {
    const trimmed = part.trim();
    const dashIdx = trimmed.indexOf(" - ");
    if (dashIdx === -1) continue;
    const key = toCamelCase(trimmed.slice(0, dashIdx));
    const val = trimmed.slice(dashIdx + 3).trim();
    if (key) meta[key] = val;
  }
  return meta;
}

function findActiveBoQSheet(sheets: Record<string, string[][]>): string[][] {
  const name = Object.keys(sheets).find((n) => n === "Active BoQ");
  if (!name) {
    throw new Error(
      `No "Active BoQ" sheet found; available: ${Object.keys(sheets).join(", ")}`
    );
  }
  return sheets[name];
}

export function parseTypeD(sheets: Record<string, string[][]>): BoQLineItem[] {
  SheetsSchema.parse(sheets);

  const rows = findActiveBoQSheet(sheets);
  const items: BoQLineItem[] = [];
  let currentGroup = "";

  for (const row of rows) {
    const lineNum = cell(row, COL.lineNum);
    const partNum = cell(row, COL.partNum);
    const desc = cell(row, COL.desc);
    const svcDur = cell(row, COL.svcDur);
    const qtyStr = cell(row, COL.qty);

    const groupMatch = lineNum.match(GROUP_RE);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      continue;
    }

    // Skip blank rows and header rows (qty filter below handles the rest)
    if (!lineNum) continue;

    const qty = parseNum(qtyStr);
    if (qty === undefined) continue;

    const metadata: Record<string, string> = {};
    let partNumber: string | undefined;

    if (isCcwMetadata(partNum)) {
      Object.assign(metadata, parseCcwMetadata(partNum));
    } else {
      partNumber = partNum || undefined;
    }

    // '---' = hardware (no subscription term); numeric = subscription months
    const serviceDuration = svcDur === "---" ? "hardware" : svcDur || undefined;

    items.push({
      itemNumber: lineNum,
      description: desc,
      qty,
      unit: "",
      partNumber,
      serviceDuration,
      section: currentGroup || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }

  return items;
}
