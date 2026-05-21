import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadProjectBoqFile,
  type LoadProjectBoqFileInput,
} from "@/lib/projects/boq-file-loader";
import { INVALID_BOQ_FORMAT_MESSAGE } from "@/lib/projects/boq-formats";
import type { ProjectFile } from "@/types/project";

const FORMAT_1_HEADER = ["Line Number", "Item Name", "Description", "Quantity"];
const FORMAT_2_HEADER = ["#", "Description", "Part Number", "Qty"];

let tmpDir: string;

/** Build an `.xlsx` on disk from name->rows pairs in the given sheet order. */
async function writeXlsx(
  fileName: string,
  sheets: ReadonlyArray<{ name: string; rows: (string | number)[][] }>
): Promise<string> {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filePath = join(tmpDir, fileName);
  await writeFile(filePath, buf);
  return filePath;
}

/** Write CSV text to disk and return its path. */
async function writeCsv(fileName: string, text: string): Promise<string> {
  const filePath = join(tmpDir, fileName);
  await writeFile(filePath, text, "utf8");
  return filePath;
}

/** A minimal recorded-file input pointing at a real path on disk. */
function fileInput(
  id: string,
  fileName: string,
  storagePath: string
): LoadProjectBoqFileInput {
  return { file: { id, fileName, storagePath } };
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-boq-loader-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("loadProjectBoqFile - .xlsx", () => {
  it("loads and normalizes a format #1 workbook", async () => {
    const path = await writeXlsx("fmt1.xlsx", [
      {
        name: "MAIN BOQ",
        rows: [
          FORMAT_1_HEADER,
          ["1", "C9300-48P-E", "Catalyst 9300 switch", "5"],
          ["2", "AIR-AP-T", "Access point", "10"],
        ],
      },
    ]);
    const result = loadProjectBoqFile(fileInput("file-1", "fmt1.xlsx", path));

    expect(result.sourceFileId).toBe("file-1");
    expect(result.sourceFileName).toBe("fmt1.xlsx");
    expect(result.sourceSheetName).toBe("MAIN BOQ");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].sourceFormat).toBe("format_1_line_item");
    expect(result.lines[0].sku).toBe("C9300-48P-E");
    expect(result.lines[0].quantity).toBe(5);
    expect(result.lines[1].quantity).toBe(10);
  });

  it("loads and normalizes a format #2 workbook", async () => {
    const path = await writeXlsx("fmt2.xlsx", [
      {
        name: "Sheet1",
        rows: [FORMAT_2_HEADER, ["1", "Catalyst 9300 switch", "C9300-48P-E", "5"]],
      },
    ]);
    const result = loadProjectBoqFile(fileInput("file-2", "fmt2.xlsx", path));

    expect(result.sourceSheetName).toBe("Sheet1");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].sourceFormat).toBe("format_2_number_part_qty");
    expect(result.lines[0].sku).toBe("C9300-48P-E");
  });

  it("scans sheets in workbook order and picks the first matching one", async () => {
    const path = await writeXlsx("multi.xlsx", [
      { name: "Cover", rows: [["Some title"], ["not a boq"]] },
      { name: "BOQ A", rows: [FORMAT_1_HEADER, ["1", "SKU-A", "First", "1"]] },
      { name: "BOQ B", rows: [FORMAT_2_HEADER, ["1", "Second", "SKU-B", "2"]] },
    ]);
    const result = loadProjectBoqFile(fileInput("file-3", "multi.xlsx", path));

    expect(result.sourceSheetName).toBe("BOQ A");
    expect(result.lines[0].sourceFormat).toBe("format_1_line_item");
  });

  it("throws the exact invalid format message when no sheet matches", async () => {
    const path = await writeXlsx("nomatch.xlsx", [
      { name: "One", rows: [["Part", "Cost"], ["x", "1"]] },
      { name: "Two", rows: [["A", "B"], ["c", "d"]] },
    ]);
    expect(() =>
      loadProjectBoqFile(fileInput("file-4", "nomatch.xlsx", path))
    ).toThrow(INVALID_BOQ_FORMAT_MESSAGE);
  });

  it("includes sourceSheetName on every returned line", async () => {
    const path = await writeXlsx("sheeted.xlsx", [
      { name: "MAIN BOQ", rows: [FORMAT_1_HEADER, ["1", "SKU-A", "First", "1"]] },
    ]);
    const result = loadProjectBoqFile(fileInput("file-5", "sheeted.xlsx", path));
    expect(result.lines[0].sourceSheetName).toBe("MAIN BOQ");
  });
});

describe("loadProjectBoqFile - .csv", () => {
  it("loads and normalizes a format #1 CSV", async () => {
    const path = await writeCsv(
      "fmt1.csv",
      "Line Number,Item Name,Description,Quantity\n1,C9300-48P-E,Catalyst 9300 switch,5\n2,AIR-AP-T,Access point,10\n"
    );
    const result = loadProjectBoqFile(fileInput("csv-1", "fmt1.csv", path));

    expect(result.sourceFileId).toBe("csv-1");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].sourceFormat).toBe("format_1_line_item");
    expect(result.lines[0].sku).toBe("C9300-48P-E");
    expect(result.lines[1].quantity).toBe(10);
  });

  it("loads and normalizes a format #2 CSV", async () => {
    const path = await writeCsv(
      "fmt2.csv",
      "#,Description,Part Number,Qty\n1,Catalyst 9300 switch,C9300-48P-E,5\n"
    );
    const result = loadProjectBoqFile(fileInput("csv-2", "fmt2.csv", path));

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].sourceFormat).toBe("format_2_number_part_qty");
    expect(result.lines[0].sku).toBe("C9300-48P-E");
  });

  it("omits sourceSheetName for CSV (top-level and per-line)", async () => {
    const path = await writeCsv(
      "nosheet.csv",
      "Line Number,Item Name,Description,Quantity\n1,SKU-A,First,1\n"
    );
    const result = loadProjectBoqFile(fileInput("csv-3", "nosheet.csv", path));
    expect("sourceSheetName" in result).toBe(false);
    expect("sourceSheetName" in result.lines[0]).toBe(false);
  });

  it("throws the exact invalid format message when required columns are missing", async () => {
    const path = await writeCsv("missing.csv", "Part,Cost\nx,1\n");
    expect(() =>
      loadProjectBoqFile(fileInput("csv-4", "missing.csv", path))
    ).toThrow(INVALID_BOQ_FORMAT_MESSAGE);
  });

  it("throws the exact invalid format message for blank or non-numeric quantity", async () => {
    const blank = await writeCsv(
      "blankqty.csv",
      "Line Number,Item Name,Description,Quantity\n1,SKU-A,First,\n"
    );
    expect(() =>
      loadProjectBoqFile(fileInput("csv-5", "blankqty.csv", blank))
    ).toThrow(INVALID_BOQ_FORMAT_MESSAGE);

    const bad = await writeCsv(
      "badqty.csv",
      "Line Number,Item Name,Description,Quantity\n1,SKU-A,First,abc\n"
    );
    expect(() =>
      loadProjectBoqFile(fileInput("csv-6", "badqty.csv", bad))
    ).toThrow(INVALID_BOQ_FORMAT_MESSAGE);
  });
});

describe("loadProjectBoqFile - extension validation", () => {
  it("throws the exact invalid format message for unsupported extensions", () => {
    for (const name of ["legacy.xls", "notes.txt", "proposal.docx", "myfile"]) {
      expect(() =>
        loadProjectBoqFile(fileInput("x", name, join(tmpDir, name)))
      ).toThrow(INVALID_BOQ_FORMAT_MESSAGE);
    }
  });
});

describe("loadProjectBoqFile - canonical metadata & purity", () => {
  it("uses ProjectFile.id as CanonicalBoqLine.sourceFileId", async () => {
    const path = await writeXlsx("idcheck.xlsx", [
      { name: "MAIN BOQ", rows: [FORMAT_1_HEADER, ["1", "SKU-A", "First", "1"]] },
    ]);
    const result = loadProjectBoqFile(fileInput("the-id", "idcheck.xlsx", path));
    expect(result.lines.every((l) => l.sourceFileId === "the-id")).toBe(true);
  });

  it("does not mutate the input ProjectFile object", async () => {
    const path = await writeXlsx("nomutate.xlsx", [
      { name: "MAIN BOQ", rows: [FORMAT_1_HEADER, ["1", "SKU-A", "First", "1"]] },
    ]);
    const uploadedAt = new Date("2026-05-21T00:00:00.000Z");
    const file: ProjectFile = {
      id: "file-9",
      projectId: "proj-1",
      fileRole: "boq",
      fileName: "nomutate.xlsx",
      storagePath: path,
      uploadedAt,
      retainUntil: new Date("2027-05-21T00:00:00.000Z"),
    };
    const snapshot = JSON.stringify(file);
    loadProjectBoqFile({ file });
    expect(JSON.stringify(file)).toBe(snapshot);
  });
});

describe("loadProjectBoqFile - module isolation & no persistence", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/boq-file-loader.ts"),
    "utf8"
  );

  it("does not import from the legacy E2 engine", () => {
    expect(source).not.toContain("@/engines/e2");
  });

  it("performs no DB writes or artifact creation (no db/artifact imports)", () => {
    expect(source).not.toContain("@/lib/db");
    expect(source).not.toContain("project-file-store");
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.update\(/);
  });
});
