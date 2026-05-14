import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resolve } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(async () => ({
    success: false as const,
    error: 'mocked-no-ai',
    retryCount: 1,
    fallback: 'engineer_review' as const,
  })),
}));

import { enrichFileContent } from '@/coordinator/intake-file-loader';
import { runE1 } from '@/engines/e1/orchestrator';
import type { E1InputFile } from '@/engines/e1/orchestrator-types';

const FIXTURE_PDF = resolve(__dirname, '../fixtures/boq/Technical Bid Requirements.pdf');
const FIXTURE_DOCX = resolve(
  __dirname,
  '../fixtures/boq/Aramco_6000181983_ Clarification Questions - STCS_R2.docx',
);
const FIXTURE_XLSX = resolve(__dirname, '../fixtures/boq/Aramco_4203164336.xlsx');

const PDF_TERMS = ['aramco', 'technical', 'requirement', 'bid', 'proposal', 'specification'];
// The DOCX body text contains the clarification answers — the title-only words
// ('clarification', 'question', 'STCS') do not appear in the extracted body.
// We assert against terms that actually live in the body.
const DOCX_TERMS = ['aramco', 'vendor', 'proposal', 'response', 'stc'];

function countTermHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
}

const TEST_TIMEOUT = 30_000;

describe('E1 Real File Integration', () => {
  let tmpDir: string;
  let fakePdfPath: string;

  beforeAll(async () => {
    tmpDir = resolve(tmpdir(), `e1-real-extraction-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    fakePdfPath = resolve(tmpDir, 'corrupted.pdf');
    await writeFile(fakePdfPath, 'not a real pdf', 'utf8');
  });

  it(
    'Test 1 — PDF extraction feeds E1',
    async () => {
      const input: E1InputFile = { path: FIXTURE_PDF };
      const enriched = await enrichFileContent([input]);

      expect(enriched.files).toHaveLength(1);
      const [file] = enriched.files;
      expect(typeof file.content).toBe('string');
      expect((file.content ?? '').length).toBeGreaterThan(0);
      expect(countTermHits(file.content ?? '', PDF_TERMS)).toBeGreaterThanOrEqual(2);

      const out = await runE1({
        files: enriched.files,
        clientName: 'Saudi Aramco',
        country: 'SA',
      });

      const hasSignal =
        out.requirements.length > 0 ||
        out.riskFlags.length > 0 ||
        (out.sectorDetection.sector?.length ?? 0) > 0;
      expect(hasSignal).toBe(true);
      expect(out.sectorDetection.sector).toBe('oil_and_gas');
    },
    TEST_TIMEOUT,
  );

  it(
    'Test 2 — DOCX extraction feeds E1',
    async () => {
      const input: E1InputFile = { path: FIXTURE_DOCX };
      const enriched = await enrichFileContent([input]);

      expect(enriched.files).toHaveLength(1);
      const [file] = enriched.files;
      expect((file.content ?? '').length).toBeGreaterThan(0);
      expect(countTermHits(file.content ?? '', DOCX_TERMS)).toBeGreaterThanOrEqual(2);

      const out = await runE1({
        files: enriched.files,
        clientName: 'Saudi Aramco',
        country: 'SA',
      });

      const hasResults =
        out.requirements.length > 0 ||
        out.riskFlags.length > 0 ||
        (out.sectorDetection.sector?.length ?? 0) > 0;
      expect(hasResults).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'Test 3 — XLSX flows through E1 without extraction',
    async () => {
      const input: E1InputFile = { path: FIXTURE_XLSX };

      const out = await runE1({
        files: [input],
        clientName: 'Saudi Aramco',
        country: 'SA',
      });

      expect(out).toBeDefined();
      expect(out.fileClassifications).toHaveLength(1);
      expect(out.fileClassifications[0].format).toBe('xlsx');
      expect(out.stats.totalFiles).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'Test 4 — Mixed PDF + DOCX + XLSX package processes end-to-end',
    async () => {
      const inputs: E1InputFile[] = [
        { path: FIXTURE_PDF },
        { path: FIXTURE_DOCX },
        { path: FIXTURE_XLSX },
      ];
      const enriched = await enrichFileContent(inputs);

      expect(enriched.files).toHaveLength(3);
      const byPath = new Map(enriched.files.map((f) => [f.path, f]));
      expect((byPath.get(FIXTURE_PDF)?.content ?? '').length).toBeGreaterThan(0);
      expect((byPath.get(FIXTURE_DOCX)?.content ?? '').length).toBeGreaterThan(0);
      // XLSX is passthrough — enrichFileContent does not populate content for it.
      expect(byPath.get(FIXTURE_XLSX)?.content).toBeUndefined();

      const out = await runE1({
        files: enriched.files,
        clientName: 'Saudi Aramco',
        country: 'SA',
      });

      expect(out.requirements.length).toBeGreaterThan(0);
      expect(out.stats.totalFiles).toBe(3);
      expect(out.fileClassifications).toHaveLength(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'Test 5 — Corrupted PDF degrades gracefully',
    async () => {
      const enriched = await enrichFileContent([{ path: fakePdfPath }]);

      expect(enriched.files).toHaveLength(1);
      const [file] = enriched.files;
      // Either the document-reader caught the parse failure and returned "",
      // or enrichFileContent caught a thrown error and recorded a warning.
      const contentEmpty = (file.content ?? '').length === 0;
      const warned = enriched.warnings.some((w) => w.includes(fakePdfPath));
      expect(contentEmpty || warned).toBe(true);

      const out = await runE1({
        files: enriched.files,
        clientName: 'Saudi Aramco',
        country: 'SA',
      });

      expect(out).toBeDefined();
      expect(out.fileClassifications).toHaveLength(1);
      expect(out.stats.totalFiles).toBe(1);
    },
    TEST_TIMEOUT,
  );

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});
