import { basename, dirname } from 'path';
import { classifyFile } from '@/engines/e1/file-classifier';
import { extractReferences } from '@/engines/e1/missing-doc-detector';
import {
  extractRequirements,
  type Requirement,
} from '@/engines/e1/requirements-extractor';
import { readExcelFile } from '@/lib/io/excel-reader';
import type { E1InputFile, E1ClassifiedFile } from '@/engines/e1/orchestrator-types';

export function classifyAll(files: E1InputFile[]): E1ClassifiedFile[] {
  return files.map((f) => {
    const filename = basename(f.path);
    const folder = basename(dirname(f.path));
    const c = classifyFile(filename, folder, f.content);
    return { ...c, path: f.path, filename };
  });
}

export function loadExcelSheets(classified: E1ClassifiedFile[]): {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
} {
  const sheetNames: string[] = [];
  const sheets: Record<string, string[][]> = {};
  for (const f of classified) {
    if (f.format !== 'xlsx') continue;
    try {
      const r = readExcelFile(f.path);
      for (const name of r.sheetNames) {
        sheetNames.push(name);
        sheets[name] = r.sheets[name] ?? [];
      }
    } catch {
      // Skip excel files that cannot be opened — surfaced via classifications.
    }
  }
  return { sheetNames, sheets };
}

export function buildTextMap(files: E1InputFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) {
    if (f.content && f.content.length > 0) m.set(basename(f.path), f.content);
  }
  return m;
}

export async function extractAllRequirements(
  textMap: Map<string, string>,
): Promise<Requirement[]> {
  const entries: Array<[string, string]> = [];
  textMap.forEach((text, filename) => entries.push([filename, text]));
  const all: Requirement[] = [];
  for (const [filename, text] of entries) {
    const r = await extractRequirements(text, filename);
    all.push(...r.requirements);
  }
  // Per-file IDs collide; re-key globally so downstream consumers can rely on uniqueness.
  return all.map((r, i) => ({ ...r, id: `R-${String(i + 1).padStart(3, '0')}` }));
}

export function collectReferencedStandards(textMap: Map<string, string>): string[] {
  const seen = new Set<string>();
  textMap.forEach((text, filename) => {
    for (const ref of extractReferences(text, filename)) {
      if (ref.pattern === 'aramco_standard' || ref.pattern === 'external_standard') {
        seen.add(ref.ref);
      }
    }
  });
  return Array.from(seen);
}
