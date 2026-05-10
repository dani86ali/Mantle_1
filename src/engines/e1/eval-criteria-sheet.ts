import type { Envelope, EvalMethodology } from '@/engines/e1/eval-criteria-types';

const EVAL_SHEET_RE = /evaluation|questionnaire|scoring/i;
const IKTVA_RE = /\b(?:IKTVA|local\s+content|saudization)\b/i;

export interface ParsedSheet {
  envelopes: Envelope[];
  iktvaRequired: boolean;
}

interface HeaderInfo {
  headerIdx: number;
  nameCol: number;
  weightCol: number;
  thresholdCol: number;
}

function findHeaderRow(rows: string[][]): HeaderInfo | null {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].map((c) => (c ?? '').toString().toLowerCase());
    const nameCol = cells.findIndex((c) =>
      /\b(?:category|criterion|criteria|name|envelope|item|description|area)\b/.test(c),
    );
    const weightCol = cells.findIndex((c) =>
      /\b(?:weight|weighting|%|percent|points|score)\b/.test(c),
    );
    if (nameCol >= 0 && weightCol >= 0 && nameCol !== weightCol) {
      const thresholdCol = cells.findIndex((c) =>
        /\b(?:threshold|pass|min|minimum)\b/.test(c),
      );
      return { headerIdx: i, nameCol, weightCol, thresholdCol };
    }
  }
  return null;
}

export function parseEvaluationSheet(rows: string[][]): ParsedSheet {
  const header = findHeaderRow(rows);
  if (!header) return { envelopes: [], iktvaRequired: false };

  const envelopes: Envelope[] = [];
  let iktvaRequired = false;

  for (let i = header.headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = (row[header.nameCol] ?? '').toString().trim();
    if (!name) continue;
    const weightStr = (row[header.weightCol] ?? '').toString();
    const wm = weightStr.match(/(\d+(?:\.\d+)?)/);
    const weight = wm ? parseFloat(wm[1]) : 0;
    if (IKTVA_RE.test(name)) iktvaRequired = true;
    let passThreshold = 0;
    if (header.thresholdCol >= 0) {
      const tStr = (row[header.thresholdCol] ?? '').toString();
      const tm = tStr.match(/(\d+(?:\.\d+)?)/);
      if (tm) passThreshold = parseFloat(tm[1]);
    }
    envelopes.push({ name, weight, passThreshold, criteria: [] });
  }

  return { envelopes, iktvaRequired };
}

export function deriveMethodologyFromEnvelopes(envelopes: Envelope[]): EvalMethodology {
  if (envelopes.length === 0) return 'unknown';
  const lower = envelopes.map((e) => e.name.toLowerCase());
  const hasAdmin = lower.some((n) => /administrative/.test(n));
  const hasTech = lower.some((n) => /technical/.test(n));
  const hasComm = lower.some((n) => /commercial/.test(n));
  if (hasAdmin && hasTech && hasComm) return 'sequential_envelope';
  if (envelopes.length >= 2) return 'weighted_score';
  return 'unknown';
}

export function findEvalSheet(
  sheetData: Record<string, string[][]>,
): { name: string; rows: string[][] } | null {
  for (const [name, rows] of Object.entries(sheetData)) {
    if (EVAL_SHEET_RE.test(name)) return { name, rows };
  }
  return null;
}
