import ExcelJS from "exceljs";
import { join } from "path";

interface TestRow {
  id: string;
  suite: string;
  name: string;
  steps: number;
}

const TESTS: TestRow[] = [
  { id: "T-001", suite: "Suite 1", name: "Dev server boots", steps: 2 },
  { id: "T-002", suite: "Suite 1", name: "Dashboard renders", steps: 2 },
  { id: "T-003", suite: "Suite 1", name: "Sidebar navigation", steps: 2 },
  { id: "T-004", suite: "Suite 1", name: "API health check", steps: 1 },

  { id: "T-010", suite: "Suite 2", name: "Start new RFP estimate", steps: 2 },
  { id: "T-011", suite: "Suite 2", name: "Upload RFP fixtures", steps: 2 },
  { id: "T-012", suite: "Suite 2", name: "Project details (RFP)", steps: 3 },
  { id: "T-013", suite: "Suite 2", name: "Pricing defaults", steps: 2 },
  { id: "T-014", suite: "Suite 2", name: "Pipeline status visible", steps: 2 },
  { id: "T-015", suite: "Suite 2", name: "CP1 Requirements Review checkpoint", steps: 3 },
  { id: "T-016", suite: "Suite 2", name: "Compliance sub-page", steps: 3 },
  { id: "T-017", suite: "Suite 2", name: "CP2 Compliance approval", steps: 2 },
  { id: "T-018", suite: "Suite 2", name: "Clarifications page", steps: 2 },
  { id: "T-019", suite: "Suite 2", name: "BoM sub-page — SKU phase", steps: 2 },
  { id: "T-020", suite: "Suite 2", name: "CP3a BoM SKU approval", steps: 2 },
  { id: "T-021", suite: "Suite 2", name: "BoM Pricing phase + CP3b approval", steps: 3 },
  { id: "T-022", suite: "Suite 2", name: "Pricing config sub-page", steps: 3 },
  { id: "T-023", suite: "Suite 2", name: "Proposal sub-page renders", steps: 3 },
  { id: "T-024", suite: "Suite 2", name: "CP4 Proposal approval + DOCX download", steps: 3 },
  { id: "T-025", suite: "Suite 2", name: "Margin Review page", steps: 3 },
  { id: "T-026", suite: "Suite 2", name: "Export Center unlocks after approval", steps: 2 },

  { id: "T-030", suite: "Suite 3", name: "Quick BoM intake (paste 5 SKUs)", steps: 3 },
  { id: "T-031", suite: "Suite 3", name: "Quick BoM runs E2 only first", steps: 2 },
  { id: "T-032", suite: "Suite 3", name: "Quick BoM checkpoints (CP3a/b, CP4)", steps: 3 },
  { id: "T-033", suite: "Suite 3", name: "Quick BoM proposal download", steps: 2 },
  { id: "T-034", suite: "Suite 3", name: "Quick BoM file upload variant", steps: 2 },

  { id: "T-040", suite: "Suite 4", name: "RFI intake (skips file step)", steps: 2 },
  { id: "T-041", suite: "Suite 4", name: "Questionnaire generation", steps: 2 },
  { id: "T-042", suite: "Suite 4", name: "Approve questionnaire", steps: 1 },
  { id: "T-043", suite: "Suite 4", name: "Submit free-text responses", steps: 2 },
  { id: "T-044", suite: "Suite 4", name: "Verify gaps + baseline tabs", steps: 3 },
  { id: "T-045", suite: "Suite 4", name: "Design page — 5 tabs render", steps: 3 },
  { id: "T-046", suite: "Suite 4", name: "Approve Design / HLD / LLD", steps: 3 },
  { id: "T-047", suite: "Suite 4", name: "Download HLD DOCX", steps: 1 },
  { id: "T-048", suite: "Suite 4", name: "Download LLD DOCX + diagram XML", steps: 2 },
  { id: "T-049", suite: "Suite 4", name: "RFI BoM from components", steps: 2 },
  { id: "T-050", suite: "Suite 4", name: "RFI proposal with design context", steps: 2 },

  { id: "T-060", suite: "Suite 5", name: "Revision at CP1 (Requirements)", steps: 2 },
  { id: "T-061", suite: "Suite 5", name: "Revision at CP2 (Compliance)", steps: 2 },
  { id: "T-062", suite: "Suite 5", name: "Revision at CP3 (BoM)", steps: 1 },
  { id: "T-063", suite: "Suite 5", name: "Revision at CP4 (Proposal)", steps: 1 },

  { id: "T-070", suite: "Suite 6", name: "Dashboard recent activity", steps: 1 },
  { id: "T-071", suite: "Suite 6", name: "Estimates list filters + tenant isolation", steps: 4 },
  { id: "T-072", suite: "Suite 6", name: "Estimates list delete", steps: 1 },
  { id: "T-073", suite: "Suite 6", name: "Catalog page (Cisco/Fortinet tabs)", steps: 3 },
  { id: "T-074", suite: "Suite 6", name: "Settings (Admin) page", steps: 3 },

  { id: "T-080", suite: "Suite 7", name: "Download Priced BoM workbook", steps: 1 },
  { id: "T-081", suite: "Suite 7", name: "Download Compliance Matrix", steps: 1 },
  { id: "T-082", suite: "Suite 7", name: "Download Technical Proposal DOCX", steps: 1 },
  { id: "T-083", suite: "Suite 7", name: "Download Financial Proposal XLSX", steps: 1 },
  { id: "T-084", suite: "Suite 7", name: "Download HLD DOCX (RFI flow)", steps: 1 },
  { id: "T-085", suite: "Suite 7", name: "Download LLD DOCX (RFI flow)", steps: 1 },
  { id: "T-086", suite: "Suite 7", name: "Download Diagram XML (RFI flow)", steps: 1 },
  { id: "T-087", suite: "Suite 7", name: "Download Compliance export from sub-page", steps: 1 },
  { id: "T-088", suite: "Suite 7", name: "Coming-soon artifacts are disabled", steps: 1 },

  { id: "T-090", suite: "Suite 8", name: "Corrupt file upload", steps: 2 },
  { id: "T-091", suite: "Suite 8", name: "Missing required field gates Continue", steps: 1 },
  { id: "T-092", suite: "Suite 8", name: "Approve without pipeline (defensive)", steps: 1 },
  { id: "T-093", suite: "Suite 8", name: "FAILED status display in list + hub", steps: 2 },
  { id: "T-094", suite: "Suite 8", name: "Approve deal without strategic justification", steps: 2 },
  { id: "T-095", suite: "Suite 8", name: "404 on unknown estimate", steps: 1 },
];

const HEADERS = [
  "Test ID",
  "Suite",
  "Test Name",
  "Step Count",
  "Status",
  "Tester Name",
  "Date Tested",
  "Bug Description",
  "Expected vs Actual",
  "Screenshot Reference",
  "Severity",
  "Fix Status",
  "CLI Prompt Notes",
];

const COL_WIDTHS = [10, 9, 42, 11, 12, 16, 14, 60, 60, 22, 12, 14, 60];

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOMATIC";
  wb.created = new Date();

  // ----- Tests sheet -----
  const ws = wb.addWorksheet("Tests", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = HEADERS.map((h, i) => ({
    header: h,
    key: h,
    width: COL_WIDTHS[i],
  }));

  // Header row formatting
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F3864" },
  };
  header.height = 22;
  header.border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };

  for (const t of TESTS) {
    ws.addRow([t.id, t.suite, t.name, t.steps, "", "", "", "", "", "", "", "", ""]);
  }

  // Autofilter across all columns
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADERS.length },
  };

  // Data-validation dropdowns
  const lastRow = TESTS.length + 1;
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(`E${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"PASS,FAIL,BLOCKED,SKIP"'],
    };
    ws.getCell(`K${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Critical,High,Medium,Low"'],
    };
    ws.getCell(`L${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Open,In Progress,Fixed,Won\'t Fix"'],
    };
    // Wrap text in long-form columns
    ws.getCell(`C${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`H${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`I${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`M${r}`).alignment = { wrapText: true, vertical: "top" };
  }

  // Conditional formatting on Status column (color-codes PASS/FAIL/BLOCKED/SKIP)
  ws.addConditionalFormatting({
    ref: `E2:E${lastRow}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        text: "PASS",
        priority: 1,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD9EAD3" } },
          font: { color: { argb: "FF274E13" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "FAIL",
        priority: 2,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF4CCCC" } },
          font: { color: { argb: "FF990000" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "BLOCKED",
        priority: 3,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE599" } },
          font: { color: { argb: "FF7F6000" }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        text: "SKIP",
        priority: 4,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEFEFEF" } },
          font: { color: { argb: "FF666666" }, bold: true },
        },
      },
    ],
  });

  // ----- Summary sheet -----
  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 18 },
  ];
  const sumHeader = sum.getRow(1);
  sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  sumHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F3864" },
  };

  const total = TESTS.length;
  const dataRange = `Tests!E2:E${lastRow}`;
  const rows: [string, string | number][] = [
    ["Total tests", total],
    ["PASS count", { formula: `COUNTIF(${dataRange},"PASS")` } as never],
    ["FAIL count", { formula: `COUNTIF(${dataRange},"FAIL")` } as never],
    ["BLOCKED count", { formula: `COUNTIF(${dataRange},"BLOCKED")` } as never],
    ["SKIP count", { formula: `COUNTIF(${dataRange},"SKIP")` } as never],
    ["Untested count", { formula: `COUNTBLANK(${dataRange})` } as never],
    [
      "Pass rate %",
      { formula: `IFERROR(COUNTIF(${dataRange},"PASS")/(COUNTIF(${dataRange},"PASS")+COUNTIF(${dataRange},"FAIL")+COUNTIF(${dataRange},"BLOCKED")),0)` } as never,
    ],
    ["Tests executed", { formula: `${total}-COUNTBLANK(${dataRange})` } as never],
    ["Execution %", { formula: `(${total}-COUNTBLANK(${dataRange}))/${total}` } as never],
  ];
  for (const [m, v] of rows) sum.addRow({ metric: m, value: v });

  sum.getCell("B8").numFmt = "0.0%";
  sum.getCell("B10").numFmt = "0.0%";

  // Style summary numeric cells
  for (let r = 2; r <= rows.length + 1; r++) {
    sum.getCell(`B${r}`).alignment = { horizontal: "right" };
  }

  // Per-suite breakdown
  sum.addRow([]);
  const breakdownHeaderRow = sum.addRow(["Per-suite breakdown", ""]);
  breakdownHeaderRow.font = { bold: true };
  sum.addRow(["Suite", "Pass / Fail / Other"]);

  const suites = Array.from(new Set(TESTS.map((t) => t.suite)));
  for (const s of suites) {
    const suiteRange = `Tests!B2:B${lastRow}`;
    const statusRange = `Tests!E2:E${lastRow}`;
    sum.addRow([
      s,
      {
        formula:
          `COUNTIFS(${suiteRange},"${s}",${statusRange},"PASS")&" / "&` +
          `COUNTIFS(${suiteRange},"${s}",${statusRange},"FAIL")&" / "&` +
          `(COUNTIF(${suiteRange},"${s}")-COUNTIFS(${suiteRange},"${s}",${statusRange},"PASS")-COUNTIFS(${suiteRange},"${s}",${statusRange},"FAIL"))`,
      } as never,
    ]);
  }

  const outPath = join(
    process.cwd(),
    "docs",
    "archive",
    "superseded",
    "DEMO_TEST_TRACKER.xlsx"
  );
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${TESTS.length} tests).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
