import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import { generateHLDDocx } from '@/engines/e5/hld-docx-generator';
import type { HLDSection } from '@/engines/e5/types';

async function readDocXml(path: string, entry: string): Promise<string> {
  const buf = await readFile(path);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(entry);
  if (!file) throw new Error(`zip entry not found: ${entry}`);
  return file.async('string');
}

let tmpDir: string;
beforeAll(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-hld-docx-')); });
afterAll(async () => { await rm(tmpDir, { recursive: true, force: true }); });

const METADATA = {
  customerName: 'Aramco',
  projectName: 'Refinery Campus Refresh',
  version: '1.0',
  date: '2026-05-12',
};

function fakeHldSections(): HLDSection[] {
  const titles = [
    'Document Control', 'Executive Summary', 'Scope and Assumptions',
    'Current-State Summary', 'Solution Requirements', 'Solution Architecture',
    'Resilience and HA Design', 'Capacity and Scalability',
    'Security Architecture', 'Migration Approach', 'Risks and Mitigations',
    'Appendices',
  ];
  return titles.map((title, i) => ({
    sectionNumber: i + 1,
    title,
    content: `Body of section ${i + 1}.\n\n- bullet one\n- bullet two`,
  }));
}

describe('generateHLDDocx', () => {
  it('returns the output path it wrote to', async () => {
    const out = join(tmpDir, 'hld-1.docx');
    const result = await generateHLDDocx(fakeHldSections(), METADATA, out);
    expect(result).toBe(out);
  });

  it('creates a valid non-empty docx file (PK zip header)', async () => {
    const out = join(tmpDir, 'hld-2.docx');
    await generateHLDDocx(fakeHldSections(), METADATA, out);
    const s = await stat(out);
    expect(s.size).toBeGreaterThan(0);
    const buf = await readFile(out);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('throws on empty outputPath', async () => {
    await expect(
      generateHLDDocx(fakeHldSections(), METADATA, ''),
    ).rejects.toThrow();
  });

  it('embeds all 12 section titles', async () => {
    const out = join(tmpDir, 'hld-3.docx');
    const sections = fakeHldSections();
    await generateHLDDocx(sections, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    for (const s of sections) {
      expect(doc).toContain(s.title);
    }
  });

  it('title page contains customer name, project name, version, date', async () => {
    const out = join(tmpDir, 'hld-4.docx');
    await generateHLDDocx(fakeHldSections(), METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    expect(doc).toContain('Aramco');
    expect(doc).toContain('Refinery Campus Refresh');
    expect(doc).toContain('High-Level Design Document');
    expect(doc).toContain('1.0');
    expect(doc).toContain('2026-05-12');
  });

  it('renders diagram references when sections include diagrams', async () => {
    const out = join(tmpDir, 'hld-5.docx');
    const sections = fakeHldSections();
    sections[5] = { ...sections[5], diagrams: ['logical-topology.drawio'] };
    await generateHLDDocx(sections, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    expect(doc).toContain('logical-topology.drawio');
  });
});
