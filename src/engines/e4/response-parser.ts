/**
 * E4 — Discovery response parser.
 * Reads client responses from Excel (structured) or free-text (email / paste)
 * and emits ClientResponse[] keyed against QUESTION_BANK question IDs.
 */

import { readExcelFile } from '@/lib/io/excel-reader';
import { QUESTION_BANK } from './questionnaire-template';
import type { ClientResponse, Question } from './types';

export interface ParseResponseInput {
  filePath?: string;
  text?: string;
  sheets?: Record<string, string[][]>;
}

export interface ParseResponseResult {
  responses: ClientResponse[];
  format: 'excel' | 'text' | 'unknown';
}

const QUESTION_HEADER_HINTS = ['question', 'id', 'ref', 'qid', 'q#'];
const ANSWER_HEADER_HINTS = ['answer', 'response', 'reply', 'value'];

const QUESTION_ID_RE = /^[A-F]\d+[a-z]?$/;
// Marker patterns: "A1:", "A1.", "A1 -", "[A1]", "Question A1:"
const MARKER_RE =
  /(?:^|\n)[ \t]*(?:Question[ \t]+)?\[?([A-Fa-f]\d+[a-z]?)\]?[ \t]*[:.\-–][ \t]*/g;

const QUESTION_ID_SET = new Set(QUESTION_BANK.map((q) => q.id));

function normalizeId(raw: string): string {
  // QUESTION_BANK uses uppercase letters with optional lowercase suffix (A1, D4a).
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function findHeaderRow(rows: string[][]): {
  rowIndex: number;
  questionCol: number;
  answerCol: number;
} | null {
  const scanLimit = Math.min(rows.length, 20);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    let questionCol = -1;
    let answerCol = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] ?? '').toString().trim().toLowerCase();
      if (!cell) continue;
      if (questionCol === -1 && QUESTION_HEADER_HINTS.some((h) => cell === h || cell.includes(h))) {
        questionCol = c;
      } else if (answerCol === -1 && ANSWER_HEADER_HINTS.some((h) => cell === h || cell.includes(h))) {
        answerCol = c;
      }
    }
    if (questionCol !== -1 && answerCol !== -1) {
      return { rowIndex: r, questionCol, answerCol };
    }
  }
  return null;
}

function parseExcelSheets(sheets: Record<string, string[][]>): ClientResponse[] | null {
  for (const sheetName of Object.keys(sheets)) {
    const rows = sheets[sheetName];
    if (!rows || rows.length === 0) continue;
    const header = findHeaderRow(rows);
    if (!header) continue;
    const out: ClientResponse[] = [];
    for (let r = header.rowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const rawId = (row[header.questionCol] ?? '').toString().trim();
      const rawAnswer = (row[header.answerCol] ?? '').toString().trim();
      if (!rawId) continue;
      // Allow embedded ID like "A1 - some prompt" — extract the leading token.
      const idMatch = rawId.match(/^([A-Fa-f]\d+[a-z]?)/);
      if (!idMatch) continue;
      const id = normalizeId(idMatch[1]);
      if (!QUESTION_ID_SET.has(id)) continue;
      out.push({
        questionId: id,
        answer: rawAnswer.length > 0 ? rawAnswer : null,
        confidence: 1.0,
        source: 'structured',
      });
    }
    if (out.length > 0) return out;
  }
  return null;
}

function parseText(text: string): ClientResponse[] | null {
  const matches: { id: string; start: number; end: number }[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const id = normalizeId(m[1]);
    if (!QUESTION_ID_SET.has(id)) continue;
    matches.push({ id, start: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) return null;

  const found = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const slice = text.slice(cur.end, next ? next.start : text.length).trim();
    if (slice && !found.has(cur.id)) found.set(cur.id, slice);
  }

  // Emit a ClientResponse for every QUESTION_BANK entry — unmatched → null answer.
  return QUESTION_BANK.map((q) => ({
    questionId: q.id,
    answer: found.has(q.id) ? found.get(q.id)! : null,
    confidence: 0.7,
    source: 'free_text' as const,
  }));
}

export async function parseResponse(
  input: ParseResponseInput,
): Promise<ParseResponseResult> {
  if (input.sheets) {
    const responses = parseExcelSheets(input.sheets);
    return responses
      ? { responses, format: 'excel' }
      : { responses: [], format: 'unknown' };
  }

  if (input.filePath) {
    const lower = input.filePath.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const { sheets } = readExcelFile(input.filePath);
      const responses = parseExcelSheets(sheets);
      return responses
        ? { responses, format: 'excel' }
        : { responses: [], format: 'unknown' };
    }
    // Caller should pre-read .docx/.txt via document-reader and pass `text`.
    return { responses: [], format: 'unknown' };
  }

  if (typeof input.text === 'string' && input.text.length > 0) {
    const responses = parseText(input.text);
    return responses
      ? { responses, format: 'text' }
      : { responses: [], format: 'unknown' };
  }

  return { responses: [], format: 'unknown' };
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'is', 'are', 'be', 'by', 'as', 'per', 'from', 'this', 'that', 'these', 'those',
  'do', 'does', 'what', 'which', 'how', 'any', 'all', 'your', 'our', 'we', 'you',
  'list', 'have', 'has', 'will', 'can', 'use', 'used', 'using', 'site', 'sites',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export function matchResponseToQuestion(
  responseText: string,
  questionBank: Question[],
): { questionId: string; answer: string }[] {
  const sentences = responseText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return [];

  const out: { questionId: string; answer: string }[] = [];
  for (const q of questionBank) {
    const qTokens = new Set(tokenize(q.text));
    if (qTokens.size === 0) continue;
    let bestScore = 0;
    let bestSentence = '';
    for (const sentence of sentences) {
      const sTokens = tokenize(sentence);
      let overlap = 0;
      for (const t of sTokens) if (qTokens.has(t)) overlap++;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestSentence = sentence;
      }
    }
    // Threshold: require at least 2 keyword hits to claim a match.
    if (bestScore >= 2) {
      out.push({ questionId: q.id, answer: bestSentence });
    }
  }
  return out;
}
