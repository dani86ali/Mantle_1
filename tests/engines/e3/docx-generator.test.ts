import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import { generateProposalDocx } from '@/engines/e3/docx-generator';
import type { ProposalMetadata, ProposalSection } from '@/engines/e3/types';

async function readDocXml(path: string, entry: string): Promise<string> {
  const buf = await readFile(path);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(entry);
  if (!file) throw new Error(`zip entry not found: ${entry}`);
  return file.async('string');
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-docx-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const METADATA: ProposalMetadata = {
  customerName: 'Al Rajhi Bank',
  projectName: 'Branch Network Refresh',
  estimateId: 'EST-2026-0042',
  date: '2026-05-11',
  validityDays: 30,
  country: 'SA',
  currency: 'SAR',
  tenantName: 'Nexus Global Affiliates',
};

const SECTIONS: ProposalSection[] = [
  {
    id: 2,
    title: 'Executive Summary',
    slug: 'executive_summary',
    content:
      'Your network will be **refreshed** with modern Catalyst 9300 switches.\n\n## Goals\n\n- Reduce mean-time-to-repair\n- Improve campus throughput\n- Enable zero-trust segmentation',
    generationMethod: 'ai',
    status: 'generated',
  },
  {
    id: 5,
    title: 'Technical Specifications',
    slug: 'technical_specs',
    content:
      'The proposed solution centers on Cisco Catalyst access switches.\n\n| SKU | Description | Qty |\n| --- | --- | --- |\n| C9300-48P | 48-port PoE | 4 |\n| C9300-DNA-E | DNA Essentials | 4 |',
    generationMethod: 'deterministic',
    status: 'generated',
  },
  {
    id: 8,
    title: 'Commercial Proposal',
    slug: 'commercial',
    content: '### Pricing Summary\n\nTotal investment: SAR 240,000 ex-VAT.',
    generationMethod: 'deterministic',
    status: 'generated',
  },
];

describe('generateProposalDocx', () => {
  it('returns the output path it wrote to', async () => {
    const out = join(tmpDir, 'proposal-1.docx');
    const result = await generateProposalDocx(SECTIONS, METADATA, out);
    expect(result).toBe(out);
  });

  it('creates a non-empty file', async () => {
    const out = join(tmpDir, 'proposal-2.docx');
    await generateProposalDocx(SECTIONS, METADATA, out);
    const s = await stat(out);
    expect(s.size).toBeGreaterThan(0);
  });

  it('writes a valid docx (PK zip header)', async () => {
    const out = join(tmpDir, 'proposal-3.docx');
    await generateProposalDocx(SECTIONS, METADATA, out);
    const buf = await readFile(out);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it('throws on empty outputPath', async () => {
    await expect(generateProposalDocx(SECTIONS, METADATA, '')).rejects.toThrow();
  });

  it('handles a section list with one section', async () => {
    const out = join(tmpDir, 'proposal-4.docx');
    await generateProposalDocx([SECTIONS[0]], METADATA, out);
    const s = await stat(out);
    expect(s.size).toBeGreaterThan(0);
  });

  it('embeds project, customer and tenant text in document.xml + header', async () => {
    const out = join(tmpDir, 'proposal-5.docx');
    await generateProposalDocx(SECTIONS, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    expect(doc).toContain('Branch Network Refresh');
    expect(doc).toContain('Al Rajhi Bank');
    expect(doc).toContain('Nexus Global Affiliates');
    const header = await readDocXml(out, 'word/header1.xml');
    expect(header).toContain('CONFIDENTIAL');
    expect(header).toContain('Nexus Global Affiliates');
  });

  it('renders each section title as a Heading1', async () => {
    const out = join(tmpDir, 'proposal-6.docx');
    await generateProposalDocx(SECTIONS, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    for (const sec of SECTIONS) {
      expect(doc).toContain(sec.title);
    }
    // Heading1 style appears at least once per section + the TOC heading.
    const heading1Hits = (doc.match(/w:val="Heading1"/g) ?? []).length;
    expect(heading1Hits).toBeGreaterThanOrEqual(SECTIONS.length);
  });

  it('renders the pipe-table as a Word table', async () => {
    const out = join(tmpDir, 'proposal-7.docx');
    await generateProposalDocx(SECTIONS, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('C9300-48P');
  });
});
