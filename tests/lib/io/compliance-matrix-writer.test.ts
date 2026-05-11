import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { writeComplianceMatrix } from "@/lib/io/compliance-matrix-writer";
import { readExcelFile } from "@/lib/io/excel-reader";
import type { ComplianceMatrixResult } from "@/engines/e1/compliance-matrix";

let tmpDir: string;

const META = {
  customerName: "Saudi Aramco",
  projectName: "Storage Modernization 2026",
  date: "2026-05-11",
  frameworks: ["NCA-ECC", "SAMA-CSF"],
};

const MATRIX: ComplianceMatrixResult = {
  rows: [
    {
      requirementId: "4.2.1",
      requirementText: "All admin access must use MFA.",
      classification: "Mandatory",
      frameworkId: "NCA-ECC",
      controlId: "2-2-3",
      controlName: "Identity & Access Management",
      status: "Compliant",
      notes: "Cisco ISE + Duo MFA across all admin planes.",
      tpSection: "TP §5.3",
    },
    {
      requirementId: "4.2.2",
      requirementText: "Encrypt data at rest using AES-256.",
      classification: "Mandatory",
      frameworkId: "NCA-ECC",
      controlId: "2-6-1",
      controlName: "Cryptography",
      status: "Partially Compliant",
      notes: "AES-256 on all primary stores; legacy archive uses AES-128.",
      tpSection: "TP §5.7",
    },
    {
      requirementId: "4.2.3",
      requirementText: "Provide on-prem SIEM integration.",
      classification: "Optional",
      frameworkId: "SAMA-CSF",
      controlId: "3-3-2",
      controlName: "Logging & Monitoring",
      status: "Non-Compliant",
      notes: "Cloud-only SIEM proposed; see alternative in §6.4.",
      tpSection: "TP §6.4",
    },
    {
      requirementId: "4.2.4",
      requirementText: "Quarterly penetration testing.",
      classification: "Conditional",
      frameworkId: "SAMA-CSF",
      controlId: "3-4-1",
      controlName: "Vulnerability Management",
      status: "Alternative Proposed",
      notes: "Bi-annual pentest + continuous attack surface monitoring.",
      tpSection: "TP §6.5",
    },
  ],
  gaps: {
    coverageGaps: [
      {
        frameworkId: "NCA-ECC",
        controlId: "2-7-1",
        controlName: "Backup & Recovery",
      },
      {
        frameworkId: "SAMA-CSF",
        controlId: "3-5-1",
        controlName: "Third Party Risk",
      },
    ],
    orphanRequirements: [
      {
        requirementId: "9.9.9",
        requirementText: "Vendor must have headquarters in Riyadh.",
      },
    ],
  },
  stats: {
    total: 4,
    compliant: 1,
    partial: 1,
    nonCompliant: 1,
    alternative: 1,
  },
};

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-compl-writer-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("writeComplianceMatrix", () => {
  it("returns the output path it wrote to", async () => {
    const out = join(tmpDir, "matrix-1.xlsx");
    const result = await writeComplianceMatrix(MATRIX, META, out);
    expect(result).toBe(out);
  });

  it("throws on empty outputPath", async () => {
    await expect(writeComplianceMatrix(MATRIX, META, "")).rejects.toThrow();
  });

  it("produces a file with the four required sheets", async () => {
    const out = join(tmpDir, "matrix-2.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    expect(read.sheetNames).toContain("Header");
    expect(read.sheetNames).toContain("Compliance Matrix");
    expect(read.sheetNames).toContain("Coverage Gaps");
    expect(read.sheetNames).toContain("Orphan Requirements");
  });

  it("writes one data row per matrix row in the Compliance Matrix sheet", async () => {
    const out = join(tmpDir, "matrix-3.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    const sheet = read.sheets["Compliance Matrix"];
    const dataRows = sheet.filter((r) => r[0] && /^\d+\.\d+\.\d+$/.test(String(r[0])));
    expect(dataRows.length).toBe(MATRIX.rows.length);
  });

  it("preserves every compliance status value", async () => {
    const out = join(tmpDir, "matrix-4.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    const sheet = read.sheets["Compliance Matrix"];
    const headerRow = sheet.find((r) => r[0] === "Req ID");
    expect(headerRow).toBeDefined();
    const statusIdx = headerRow!.indexOf("Compliance Status");
    expect(statusIdx).toBeGreaterThan(-1);

    const reqIdToStatus = new Map<string, string>();
    for (const row of sheet) {
      if (row[0] && /^\d+\.\d+\.\d+$/.test(String(row[0]))) {
        reqIdToStatus.set(String(row[0]), String(row[statusIdx]));
      }
    }
    for (const r of MATRIX.rows) {
      expect(reqIdToStatus.get(r.requirementId)).toBe(r.status);
    }
  });

  it("writes the Playbook §6.2 column headers", async () => {
    const out = join(tmpDir, "matrix-5.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    const sheet = read.sheets["Compliance Matrix"];
    const headerRow = sheet.find((r) => r[0] === "Req ID");
    expect(headerRow).toEqual([
      "Req ID",
      "Requirement Text",
      "Classification",
      "Framework",
      "Control ID",
      "Control Name",
      "Compliance Status",
      "Response Notes",
      "TP Section",
    ]);
  });

  it("writes coverage gaps and orphan requirements", async () => {
    const out = join(tmpDir, "matrix-6.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);

    const gapsSheet = read.sheets["Coverage Gaps"];
    const gapData = gapsSheet.filter((r) => r[0] && r[0] !== "Framework");
    expect(gapData.length).toBe(MATRIX.gaps.coverageGaps.length);

    const orphansSheet = read.sheets["Orphan Requirements"];
    const orphanData = orphansSheet.filter((r) => r[0] && r[0] !== "Requirement ID");
    expect(orphanData.length).toBe(MATRIX.gaps.orphanRequirements.length);
  });

  it("writes project metadata in the Header sheet", async () => {
    const out = join(tmpDir, "matrix-7.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    const flat = read.sheets["Header"].flat().map(String);
    expect(flat).toContain("Saudi Aramco");
    expect(flat).toContain("Storage Modernization 2026");
    expect(flat).toContain("2026-05-11");
    expect(flat.some((c) => c.includes("NCA-ECC"))).toBe(true);
  });

  it("includes a summary row at the top of the Compliance Matrix sheet", async () => {
    const out = join(tmpDir, "matrix-8.xlsx");
    await writeComplianceMatrix(MATRIX, META, out);
    const read = readExcelFile(out);
    const sheet = read.sheets["Compliance Matrix"];
    const firstNonEmpty = sheet.find((r) => r.some((c) => c !== ""));
    expect(firstNonEmpty).toBeDefined();
    const joined = firstNonEmpty!.join(" | ");
    expect(joined).toContain("Total: 4");
    expect(joined).toContain("Compliant: 1");
    expect(joined).toContain("Coverage:");
  });
});
