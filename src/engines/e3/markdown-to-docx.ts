/** Minimal markdown → docx converter for E3 proposal sections.
 *  Supports: paragraphs, ## / ### headings, **bold**, "- item" bullets,
 *  and pipe-delimited tables. Anything fancier is rendered as plain text.
 */

import {
  AlignmentType,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

type Block = Paragraph | Table;

const BOLD_RE = /\*\*([^*]+)\*\*/g;

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = new RegExp(BOLD_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index) }));
    runs.push(new TextRun({ text: m[1], bold: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }));
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

function parseTable(lines: string[]): Table {
  const splitRow = (line: string): string[] =>
    line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const rows = lines.map(splitRow);
  // Drop the separator row (---|---).
  const dataRows = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  const cols = Math.max(...dataRows.map((r) => r.length));
  const trs = dataRows.map((cells, rIdx) => {
    const tcs: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
      const text = cells[c] ?? '';
      tcs.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text, bold: rIdx === 0 })],
            }),
          ],
        }),
      );
    }
    return new TableRow({ children: tcs });
  });
  return new Table({
    rows: trs,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.includes('|', 1);
}

export function markdownToDocxBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(trimmed.slice(4)) }));
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(trimmed.slice(3)) }));
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(trimmed.slice(2)) }));
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^[-*]\s+/, '');
        blocks.push(
          new Paragraph({
            children: parseInline(item),
            bullet: { level: 0 },
          }),
        );
        i++;
      }
      continue;
    }
    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(parseTable(tableLines));
      continue;
    }
    // Paragraph: gather consecutive non-empty, non-special lines.
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      const nt = next.trim();
      if (nt === '' || nt.startsWith('#') || /^[-*]\s+/.test(nt) || isTableLine(next)) break;
      para.push(nt);
      i++;
    }
    blocks.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: parseInline(para.join(' ')),
      }),
    );
  }
  return blocks;
}
