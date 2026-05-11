import * as XLSX from "xlsx";
import { writeFile } from "fs/promises";
import type {
  ComplianceMatrixResult,
  ComplianceMatrixStats,
  ComplianceStatus,
  MatrixRow,
} from "@/engines/e1/compliance-matrix";

export interface ComplianceMatrixMetadata {
  customerName: string;
  projectName: string;
  date: string;
  frameworks: string[];
}

const STATUS_FILL: Record<ComplianceStatus, string> = {
  Compliant: "C6EFCE",
  "Partially Compliant": "FFEB9C",
  "Non-Compliant": "FFC7CE",
  "Alternative Proposed": "BDD7EE",
};

const MAIN_COLS = [
  "Req ID",
  "Requirement Text",
  "Classification",
  "Framework",
  "Control ID",
  "Control Name",
  "Compliance Status",
  "Response Notes",
  "TP Section",
] as const;

const GAP_COLS = ["Framework", "Control ID", "Control Name"] as const;
const ORPHAN_COLS = ["Requirement ID", "Requirement Text"] as const;

export async function writeComplianceMatrix(
  matrix: ComplianceMatrixResult,
  metadata: ComplianceMatrixMetadata,
  outputPath: string,
): Promise<string> {
  if (!outputPath || typeof outputPath !== "string") {
    throw new Error("writeComplianceMatrix: outputPath must be a non-empty string");
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildHeaderSheet(metadata, matrix.stats), "Header");
  XLSX.utils.book_append_sheet(wb, buildMatrixSheet(matrix), "Compliance Matrix");
  XLSX.utils.book_append_sheet(wb, buildGapsSheet(matrix), "Coverage Gaps");
  XLSX.utils.book_append_sheet(wb, buildOrphansSheet(matrix), "Orphan Requirements");

  const buf = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer;
  await writeFile(outputPath, buf);
  return outputPath;
}

function buildHeaderSheet(
  metadata: ComplianceMatrixMetadata,
  stats: ComplianceMatrixStats,
): XLSX.WorkSheet {
  const coverage = coveragePct(stats);
  const rows: (string | number)[][] = [
    ["Compliance Matrix"],
    ["Customer", metadata.customerName],
    ["Project", metadata.projectName],
    ["Date", metadata.date],
    ["Frameworks", metadata.frameworks.join(", ")],
    [],
    ["Total Requirements", stats.total],
    ["Compliant", stats.compliant],
    ["Partially Compliant", stats.partial],
    ["Non-Compliant", stats.nonCompliant],
    ["Alternative Proposed", stats.alternative],
    ["Coverage %", coverage],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 48 }];
  return ws;
}

function buildMatrixSheet(matrix: ComplianceMatrixResult): XLSX.WorkSheet {
  const s = matrix.stats;
  const summary: (string | number)[] = [
    `Total: ${s.total}`,
    `Compliant: ${s.compliant}`,
    `Partial: ${s.partial}`,
    `Non-Compliant: ${s.nonCompliant}`,
    `Alternative: ${s.alternative}`,
    `Coverage: ${coveragePct(s)}%`,
  ];

  const rows: (string | number)[][] = [];
  rows.push(summary);
  rows.push([]);
  rows.push([...MAIN_COLS]);
  const headerRowIdx = rows.length - 1;
  const firstDataRow = rows.length;

  for (const r of matrix.rows) {
    rows.push(matrixRowValues(r));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = computeColWidths(rows, MAIN_COLS.length);
  ws["!views"] = [{ state: "frozen", ySplit: headerRowIdx + 1 }];

  const statusColIdx = MAIN_COLS.indexOf("Compliance Status");
  for (let i = 0; i < matrix.rows.length; i++) {
    applyStatusFill(ws, firstDataRow + i, statusColIdx, matrix.rows[i].status);
  }
  return ws;
}

function matrixRowValues(r: MatrixRow): (string | number)[] {
  return [
    r.requirementId,
    r.requirementText,
    r.classification,
    r.frameworkId,
    r.controlId,
    r.controlName,
    r.status,
    r.notes,
    r.tpSection,
  ];
}

function buildGapsSheet(matrix: ComplianceMatrixResult): XLSX.WorkSheet {
  const rows: (string | number)[][] = [[...GAP_COLS]];
  for (const g of matrix.gaps.coverageGaps) {
    rows.push([g.frameworkId, g.controlId, g.controlName]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = computeColWidths(rows, GAP_COLS.length);
  ws["!views"] = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

function buildOrphansSheet(matrix: ComplianceMatrixResult): XLSX.WorkSheet {
  const rows: (string | number)[][] = [[...ORPHAN_COLS]];
  for (const o of matrix.gaps.orphanRequirements) {
    rows.push([o.requirementId, o.requirementText]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = computeColWidths(rows, ORPHAN_COLS.length);
  ws["!views"] = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

function computeColWidths(rows: (string | number)[][], colCount: number): XLSX.ColInfo[] {
  const widths = new Array(colCount).fill(8);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const v = row[c];
      if (v === undefined || v === null) continue;
      const len = String(v).length;
      if (len > widths[c]) widths[c] = len;
    }
  }
  return widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 10), 60) }));
}

function applyStatusFill(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  status: ComplianceStatus,
): void {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = ws[ref];
  if (!cell) return;
  const rgb = STATUS_FILL[status];
  if (!rgb) return;
  cell.s = {
    fill: { patternType: "solid", fgColor: { rgb }, bgColor: { rgb } },
  };
}

function coveragePct(stats: ComplianceMatrixStats): number {
  if (stats.total === 0) return 0;
  const covered = stats.compliant + stats.partial + stats.alternative;
  return Number(((covered / stats.total) * 100).toFixed(1));
}
