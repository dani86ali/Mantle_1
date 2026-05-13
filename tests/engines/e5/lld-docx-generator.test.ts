import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import { generateLLDDocx } from '@/engines/e5/lld-docx-generator';
import type { LLDSection } from '@/engines/e5/types';

async function readDocXml(path: string, entry: string): Promise<string> {
  const buf = await readFile(path);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(entry);
  if (!file) throw new Error(`zip entry not found: ${entry}`);
  return file.async('string');
}

let tmpDir: string;
beforeAll(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'bomatic-lld-docx-')); });
afterAll(async () => { await rm(tmpDir, { recursive: true, force: true }); });

const METADATA = {
  customerName: 'Al Rajhi Bank',
  projectName: 'Branch Network LLD',
  version: '0.9',
  date: '2026-05-12',
};

function fakeLldSections(): LLDSection[] {
  const titles = [
    'Document Control', 'Reference to HLD', 'Physical Topology',
    'Logical Topology', 'Device Inventory', 'IP Addressing Plan',
    'VLAN and VRF Design', 'Routing Design', 'Multicast Design', 'QoS Design',
    'Security Policy', 'Wireless Design', 'WAN/SD-WAN Policy',
    'Management Plane', 'Per-Device Base Configurations', 'Cable Schedule',
    'Rack Elevations', 'Test Plan', 'Cutover Runbook', 'Acceptance Criteria',
    'Appendices',
  ];
  return titles.map((title, i) => ({
    sectionNumber: i + 1,
    title,
    content: `Body of section ${i + 1}.\n\n- detail one\n- detail two`,
  }));
}

describe('generateLLDDocx', () => {
  it('creates a valid non-empty docx file', async () => {
    const out = join(tmpDir, 'lld-1.docx');
    const result = await generateLLDDocx(fakeLldSections(), METADATA, out);
    expect(result).toBe(out);
    const s = await stat(out);
    expect(s.size).toBeGreaterThan(0);
    const buf = await readFile(out);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('embeds all 21 section titles', async () => {
    const out = join(tmpDir, 'lld-2.docx');
    const sections = fakeLldSections();
    expect(sections).toHaveLength(21);
    await generateLLDDocx(sections, METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    for (const s of sections) {
      expect(doc).toContain(s.title);
    }
  });

  it('title page contains customer name, project name, version, date', async () => {
    const out = join(tmpDir, 'lld-3.docx');
    await generateLLDDocx(fakeLldSections(), METADATA, out);
    const doc = await readDocXml(out, 'word/document.xml');
    expect(doc).toContain('Al Rajhi Bank');
    expect(doc).toContain('Branch Network LLD');
    expect(doc).toContain('Low-Level Design Document');
    expect(doc).toContain('0.9');
    expect(doc).toContain('2026-05-12');
  });

  it('throws on empty outputPath', async () => {
    await expect(
      generateLLDDocx(fakeLldSections(), METADATA, ''),
    ).rejects.toThrow();
  });
});
