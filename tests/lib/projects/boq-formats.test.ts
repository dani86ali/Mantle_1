import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  INVALID_BOQ_FORMAT_MESSAGE,
  SUPPORTED_BOQ_EXTENSIONS,
  isSupportedBoqExtension,
  assertSupportedBoqExtension,
  detectLockedBoqFormat,
  parseLockedBoqRows,
} from "@/lib/projects/boq-formats";

const FORMAT_1_HEADER = ["Line Number", "Item Name", "Description", "Quantity"];
const FORMAT_2_HEADER = ["#", "Description", "Part Number", "Qty"];

describe("isSupportedBoqExtension", () => {
  it("accepts bare .xlsx/.csv and full filenames case-insensitively", () => {
    expect(isSupportedBoqExtension(".xlsx")).toBe(true);
    expect(isSupportedBoqExtension(".csv")).toBe(true);
    expect(isSupportedBoqExtension("EnergyTech_BoQ.xlsx")).toBe(true);
    expect(isSupportedBoqExtension("Honeywell_BoQ.XLSX")).toBe(true);
    expect(isSupportedBoqExtension("boq.CSV")).toBe(true);
  });

  it("rejects .xls, .txt, .docx, empty input, and extensionless names", () => {
    expect(isSupportedBoqExtension(".xls")).toBe(false);
    expect(isSupportedBoqExtension("legacy.xls")).toBe(false);
    expect(isSupportedBoqExtension("notes.txt")).toBe(false);
    expect(isSupportedBoqExtension("proposal.docx")).toBe(false);
    expect(isSupportedBoqExtension("")).toBe(false);
    expect(isSupportedBoqExtension("myfile")).toBe(false);
  });

  it("exposes exactly the two supported extensions", () => {
    expect(SUPPORTED_BOQ_EXTENSIONS).toEqual([".xlsx", ".csv"]);
  });
});

describe("assertSupportedBoqExtension", () => {
  it("does not throw for supported extensions", () => {
    expect(() => assertSupportedBoqExtension("boq.xlsx")).not.toThrow();
    expect(() => assertSupportedBoqExtension("boq.csv")).not.toThrow();
  });

  it("throws the exact invalid format message for unsupported extensions", () => {
    expect(() => assertSupportedBoqExtension("legacy.xls")).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
    expect(() => assertSupportedBoqExtension("notes.txt")).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
  });
});

describe("detectLockedBoqFormat", () => {
  it("detects format #1 from its required columns", () => {
    const rows = [FORMAT_1_HEADER, ["1", "C9300-48P-E", "Switch", "5"]];
    expect(detectLockedBoqFormat(rows)).toBe("format_1_line_item");
  });

  it("detects format #2 from its required columns", () => {
    const rows = [FORMAT_2_HEADER, ["1", "Switch", "C9300-48P-E", "5"]];
    expect(detectLockedBoqFormat(rows)).toBe("format_2_number_part_qty");
  });

  it("returns null when required columns are missing", () => {
    const rows = [["Part", "Cost"], ["x", "1"]];
    expect(detectLockedBoqFormat(rows)).toBeNull();
  });
});

describe("parseLockedBoqRows - format #1", () => {
  it("normalizes format #1 with source file/sheet/row metadata", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["1", "C9300-48P-E", "Catalyst 9300 switch", "5"],
      ["2", "AIR-AP-T", "Access point", "10"],
    ];
    const lines = parseLockedBoqRows({
      rows,
      sourceFileId: "file-1",
      sourceSheetName: "MAIN BOQ",
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      sourceFormat: "format_1_line_item",
      sourceFileId: "file-1",
      sourceSheetName: "MAIN BOQ",
      sourceRowNumber: 2,
      originalLineNumber: "1",
      sku: "C9300-48P-E",
      description: "Catalyst 9300 switch",
      quantity: 5,
      originalCells: {
        "Line Number": "1",
        "Item Name": "C9300-48P-E",
        Description: "Catalyst 9300 switch",
        Quantity: "5",
      },
    });
    expect(lines[1].sourceRowNumber).toBe(3);
    expect(lines[1].quantity).toBe(10);
  });

  it("omits sourceSheetName when not provided", () => {
    const rows = [FORMAT_1_HEADER, ["1", "SKU-A", "Desc", "1"]];
    const [line] = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect("sourceSheetName" in line).toBe(false);
  });
});

describe("parseLockedBoqRows - format #2", () => {
  it("normalizes format #2 with source file/sheet/row metadata", () => {
    const rows = [
      FORMAT_2_HEADER,
      ["1", "Catalyst 9300 switch", "C9300-48P-E", "5"],
    ];
    const lines = parseLockedBoqRows({
      rows,
      sourceFileId: "file-2",
      sourceSheetName: "Sheet1",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      sourceFormat: "format_2_number_part_qty",
      sourceFileId: "file-2",
      sourceSheetName: "Sheet1",
      sourceRowNumber: 2,
      originalLineNumber: "1",
      sku: "C9300-48P-E",
      description: "Catalyst 9300 switch",
      quantity: 5,
      originalCells: {
        "#": "1",
        Description: "Catalyst 9300 switch",
        "Part Number": "C9300-48P-E",
        Qty: "5",
      },
    });
  });
});

describe("parseLockedBoqRows - behavior", () => {
  it("preserves customer line order", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["3", "SKU-C", "Third", "1"],
      ["1", "SKU-A", "First", "1"],
      ["2", "SKU-B", "Second", "1"],
    ];
    const lines = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect(lines.map((l) => l.originalLineNumber)).toEqual(["3", "1", "2"]);
  });

  it("skips fully blank rows after the header", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["1", "SKU-A", "First", "1"],
      ["", "", "", ""],
      [],
      ["2", "SKU-B", "Second", "2"],
    ];
    const lines = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect(lines).toHaveLength(2);
    // Row numbers reflect original worksheet positions, skipping the blanks.
    expect(lines.map((l) => l.sourceRowNumber)).toEqual([2, 5]);
  });

  it("allows empty rows before the header", () => {
    const rows = [
      [],
      ["", "", "", ""],
      ["Some title", "", "", ""],
      FORMAT_1_HEADER,
      ["1", "SKU-A", "First", "1"],
    ];
    const lines = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect(lines).toHaveLength(1);
    expect(lines[0].sourceRowNumber).toBe(5);
    expect(lines[0].originalLineNumber).toBe("1");
  });

  it("keeps unresolved/missing SKU rows in place", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["1", "C9300-48P-E", "Known", "1"],
      ["2", "", "Missing SKU but valid line", "3"],
      ["3", "UNKNOWN-SKU-XYZ", "Unresolved", "2"],
    ];
    const lines = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect(lines).toHaveLength(3);
    expect(lines[1].sku).toBe("");
    expect(lines[1].quantity).toBe(3);
    expect(lines[2].sku).toBe("UNKNOWN-SKU-XYZ");
  });

  it("fills originalCells with all named source headers/cells", () => {
    const rows = [
      ["Line Number", "Item Name", "Description", "Quantity", "Notes"],
      ["1", "SKU-A", "First", "1", "urgent"],
    ];
    const [line] = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect(line.originalCells).toEqual({
      "Line Number": "1",
      "Item Name": "SKU-A",
      Description: "First",
      Quantity: "1",
      Notes: "urgent",
    });
  });

  it("infers parentLineNumber for dotted line numbers", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["1", "SKU-A", "Parent", "1"],
      ["1.2", "SKU-B", "Child", "1"],
      ["1.2.3", "SKU-C", "Grandchild", "1"],
    ];
    const lines = parseLockedBoqRows({ rows, sourceFileId: "file-1" });
    expect("parentLineNumber" in lines[0]).toBe(false);
    expect(lines[1].parentLineNumber).toBe("1");
    expect(lines[2].parentLineNumber).toBe("1.2");
  });

  it("throws the exact invalid format message when no accepted header exists", () => {
    const rows = [["Part", "Cost"], ["x", "1"]];
    expect(() => parseLockedBoqRows({ rows, sourceFileId: "file-1" })).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
    expect(() => parseLockedBoqRows({ rows: [], sourceFileId: "file-1" })).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
  });

  it("throws the exact invalid format message for blank or non-numeric quantity", () => {
    const blankQty = [FORMAT_1_HEADER, ["1", "SKU-A", "First", ""]];
    expect(() => parseLockedBoqRows({ rows: blankQty, sourceFileId: "f" })).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
    const badQty = [FORMAT_1_HEADER, ["1", "SKU-A", "First", "abc"]];
    expect(() => parseLockedBoqRows({ rows: badQty, sourceFileId: "f" })).toThrow(
      INVALID_BOQ_FORMAT_MESSAGE
    );
  });

  it("does not mutate the input rows", () => {
    const rows = [
      FORMAT_1_HEADER,
      ["1", "  SKU-A  ", "  First  ", "1"],
    ];
    const snapshot = structuredClone(rows);
    parseLockedBoqRows({ rows, sourceFileId: "file-1", sourceSheetName: "S" });
    expect(rows).toEqual(snapshot);
  });
});

describe("module isolation from legacy E2 parsers", () => {
  it("does not reference old E2 BoQType / generic parser behavior", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/projects/boq-formats.ts"),
      "utf8"
    );
    expect(source).not.toContain("BoQType");
    expect(source).not.toContain("parseBoQ");
    expect(source).not.toContain("extractLineItems");
    // No imports from the legacy E2 parser/detector modules.
    expect(source).not.toContain("@/engines/e2");
  });
});
