import { describe, it, expect } from "vitest";
import { extractVendors } from "@/engines/e1/vendor-extractor";

describe("extractVendors — Source 1: dedicated vendor/brand sheet tab", () => {
  it("parses Product_Vendors sheet into required vendor preferences", () => {
    const sheetNames = ["Product_Vendors", "BoQ"];
    const sheets: Record<string, string[][]> = {
      "Product_Vendors": [
        ["Category", "Approved Vendor"],
        ["Switching", "Cisco"],
        ["Firewall", "Fortinet"],
        ["Wireless", "Aruba"],
      ],
      "BoQ": [["Item", "Description", "Qty", "Unit Price"]],
    };
    const result = extractVendors(sheetNames, sheets);
    expect(result).toHaveLength(3);
    expect(result.find((v) => v.vendor === "Cisco")).toBeDefined();
    expect(result.find((v) => v.vendor === "Fortinet")?.category).toBe("Firewall");
    expect(result.find((v) => v.vendor === "Aruba")?.status).toBe("required");
  });

  it("detects sheet tab named 'Brand_List'", () => {
    const sheetNames = ["Brand_List"];
    const sheets: Record<string, string[][]> = {
      "Brand_List": [
        ["Product Type", "Brand"],
        ["Storage", "HPE"],
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe("HPE");
    expect(result[0].source).toBe("Brand_List");
  });

  it("skips title row and finds real header row (≥2 non-empty cells)", () => {
    const sheetNames = ["Product_Vendors"];
    const sheets: Record<string, string[][]> = {
      "Product_Vendors": [
        ["Approved Vendor List"],     // title row — single cell only
        ["Category", "Approved Vendor"],
        ["Switching", "Cisco"],
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe("Cisco");
    expect(result[0].category).toBe("Switching");
  });

  it("extracts specific models from vendor cell", () => {
    const sheetNames = ["Vendors"];
    const sheets: Record<string, string[][]> = {
      "Vendors": [
        ["Category", "Vendor"],
        ["Switching", "Cisco C9300-48U"],
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    expect(result[0].specificModels).toContain("C9300-48U");
  });
});

describe("extractVendors — Source 2: vendor column in BoQ sheet", () => {
  it("extracts vendors from a Vendor column in the BoQ sheet", () => {
    const sheetNames = ["BoQ"];
    const sheets: Record<string, string[][]> = {
      "BoQ": [
        ["Item", "Category", "Vendor", "Qty", "Unit Price"],
        ["1", "Switching", "Cisco", "2", ""],
        ["2", "Firewall", "Fortinet", "1", ""],
        ["3", "Wireless", "Aruba", "20", ""],
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    expect(result.some((v) => v.vendor === "Cisco")).toBe(true);
    expect(result.some((v) => v.vendor === "Fortinet")).toBe(true);
    expect(result.find((v) => v.vendor === "Cisco")?.status).toBe("preferred");
  });

  it("keeps separate entries for the same vendor in different categories", () => {
    const sheetNames = ["BoQ"];
    const sheets: Record<string, string[][]> = {
      "BoQ": [
        ["Item", "Category", "Vendor", "Qty"],
        ["1", "Switching", "Cisco", "2"],
        ["2", "Routing", "Cisco", "1"],
        ["3", "Wireless", "Cisco", "5"],
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    const ciscoEntries = result.filter((v) => v.vendor === "Cisco");
    expect(ciscoEntries).toHaveLength(3);
    const categories = ciscoEntries.map((v) => v.category);
    expect(categories).toContain("Switching");
    expect(categories).toContain("Routing");
    expect(categories).toContain("Wireless");
  });

  it("deduplicates identical vendor+category combinations", () => {
    const sheetNames = ["BoQ"];
    const sheets: Record<string, string[][]> = {
      "BoQ": [
        ["Item", "Description", "Vendor"],
        ["1", "Core Switch", "Cisco"],
        ["2", "Access Switch", "Cisco"],  // same vendor, no category → both "General"
      ],
    };
    const result = extractVendors(sheetNames, sheets);
    const ciscoEntries = result.filter((v) => v.vendor === "Cisco");
    expect(ciscoEntries).toHaveLength(1);
  });
});

describe("extractVendors — Source 3: RFP text scan", () => {
  it("detects vendors in RFP text as preferred", () => {
    const result = extractVendors(
      [],
      {},
      "The solution shall use Cisco switches and Fortinet firewalls."
    );
    expect(result.some((v) => v.vendor === "Cisco" && v.status === "preferred")).toBe(true);
    expect(result.some((v) => v.vendor === "Fortinet" && v.status === "preferred")).toBe(true);
  });

  it("detects 'or equivalent' and sets status to or_equivalent", () => {
    const result = extractVendors(
      [],
      {},
      "FortiGate 600F (Fortinet) or equivalent shall be provided."
    );
    const fortinet = result.find((v) => v.vendor === "Fortinet");
    expect(fortinet).toBeDefined();
    expect(fortinet?.status).toBe("or_equivalent");
  });

  it("detects 'or equal' as or_equivalent", () => {
    const result = extractVendors(
      [],
      {},
      "Cisco Catalyst 9300 or equal switches are acceptable."
    );
    expect(result.find((v) => v.vendor === "Cisco")?.status).toBe("or_equivalent");
  });

  it("does not flag vendors not in the known vendor list", () => {
    const result = extractVendors([], {}, "The solution shall use Microsoft Azure and AWS.");
    expect(result).toHaveLength(0);
  });

  it("does not extract plain acronyms as specific models", () => {
    const result = extractVendors(
      [],
      {},
      "Please use Cisco OEM equipment. Pricing in SAR or USD or equivalent."
    );
    const cisco = result.find((v) => v.vendor === "Cisco");
    expect(cisco).toBeDefined();
    expect(cisco?.specificModels).not.toContain("OEM");
    expect(cisco?.specificModels).not.toContain("SAR");
    expect(cisco?.specificModels).not.toContain("USD");
  });
});

describe("extractVendors — empty / no preferences", () => {
  it("returns empty array when no vendor info found in sheet", () => {
    const result = extractVendors("Sheet1".split(","), { "Sheet1": [["Item", "Qty", "Price"]] });
    expect(result).toHaveLength(0);
  });

  it("returns empty array for completely empty inputs", () => {
    expect(extractVendors([], {})).toHaveLength(0);
  });

  it("returns empty array when rfpText has no known vendors", () => {
    const result = extractVendors([], {}, "The project scope includes network infrastructure upgrade.");
    expect(result).toHaveLength(0);
  });
});
