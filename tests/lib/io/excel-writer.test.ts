import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { writeBoMExport, type BoMExportLine } from "@/lib/io/excel-writer";

let tmpDir: string;

const META = {
  customerName: "Al Rajhi Bank",
  estimateId: "OG164161387AE",
  date: "14-Oct-2025",
  country: "SA",
};

const BOM: BoMExportLine[] = [
  {
    sku: "C9300L-24UXG-4X-A",
    description: "Catalyst 9300L 24-port mGig switch, Network Advantage",
    qty: 2,
    category: "hardware",
    unitListPrice: 10000,
    unitSellPrice: 8000,
    extendedSell: 16000,
    currency: "USD",
  },
  {
    sku: "CON-SNT-C93024GA",
    description: "SmartNet 8x5xNBD, 36 mo",
    qty: 2,
    category: "service",
    unitListPrice: 2584.05,
    unitSellPrice: 2068,
    extendedSell: 4136,
    currency: "USD",
  },
  {
    sku: "C9300L-DNA-A-24-3Y",
    description: "DNA Advantage 24-port 3-year term",
    qty: 2,
    category: "subscription",
    unitListPrice: 2371.45,
    unitSellPrice: 1900,
    extendedSell: 3800,
    currency: "USD",
  },
];

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-writer-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("writeBoMExport", () => {
  it("returns the output path it wrote to", async () => {
    const out = join(tmpDir, "estimate-1.xlsx");
    const result = await writeBoMExport(BOM, META, out);
    expect(result).toBe(out);
  });

  it("produces a readable xlsx file with a 'Price Estimate' sheet", async () => {
    const out = join(tmpDir, "estimate-2.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    expect(wb.SheetNames).toContain("Price Estimate");
  });

  it("writes the header section with title, customer, estimate ID, date", async () => {
    const out = join(tmpDir, "estimate-3.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const flat = rows.flat().map((c) => String(c));
    expect(flat).toContain("Price Estimate");
    expect(flat.some((c) => c.includes("Al Rajhi Bank"))).toBe(true);
    expect(flat.some((c) => c.includes("OG164161387AE"))).toBe(true);
    expect(flat.some((c) => c.includes("14-Oct-2025"))).toBe(true);
  });

  it("writes the column headers row", async () => {
    const out = join(tmpDir, "estimate-4.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const hasHeader = rows.some(
      (r) =>
        r[0] === "Part Number" &&
        r[1] === "Description" &&
        r[2] === "Qty" &&
        r[3] === "Unit List Price" &&
        r[4] === "Unit Net Price" &&
        r[5] === "Disc%" &&
        r[6] === "Extended Net Price"
    );
    expect(hasHeader).toBe(true);
  });

  it("writes every BoM line with its SKU and quantity", async () => {
    const out = join(tmpDir, "estimate-5.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];
    for (const line of BOM) {
      const match = rows.find((r) => r[0] === line.sku);
      expect(match, `row for ${line.sku}`).toBeDefined();
      expect(match![2]).toBe(line.qty);
      expect(match![6]).toBe(line.extendedSell);
    }
  });

  it("groups lines by category with section labels", async () => {
    const out = join(tmpDir, "estimate-6.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const labels = rows.map((r) => String(r[0] ?? ""));
    expect(labels).toContain("Products");
    expect(labels).toContain("Services");
    expect(labels).toContain("Subscriptions");
  });

  it("writes the footer totals (product, service, subscription, grand)", async () => {
    const out = join(tmpDir, "estimate-7.xlsx");
    await writeBoMExport(BOM, META, out);
    const wb = XLSX.readFile(out);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Price Estimate"], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];

    function findTotal(label: string): number | undefined {
      const row = rows.find((r) => r.some((c) => String(c) === label));
      if (!row) return undefined;
      const idx = row.findIndex((c) => String(c) === label);
      return Number(row[idx + 1]);
    }

    expect(findTotal("Product Total:")).toBeCloseTo(16000, 2);
    expect(findTotal("Service Total:")).toBeCloseTo(4136, 2);
    expect(findTotal("Subscription Total:")).toBeCloseTo(3800, 2);
    expect(findTotal("Grand Total:")).toBeCloseTo(23936, 2);
  });

  it("throws on empty outputPath", async () => {
    await expect(writeBoMExport(BOM, META, "")).rejects.toThrow();
  });
});
