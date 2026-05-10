import { describe, it, expect } from "vitest";
import { parseTypeD } from "@/engines/e2/parsers/type-d-bom";

// 5-col row builder: A=0 LineNum, B=1 PartNum, C=2 Desc,
// D=3 SvcDur, E=4 Qty
function row(overrides: Record<number, string>): string[] {
  const r = Array(5).fill("");
  for (const [idx, val] of Object.entries(overrides)) r[Number(idx)] = val;
  return r;
}

const HEADER_ROW = row({ 0: "Line Number", 1: "Part Number", 2: "Description", 3: "Service Duration (Months)", 4: "Qty" });
const GROUP_ROUTER = row({ 0: "Group Name: Internet and WAN Router" });
const GROUP_SWITCH = row({ 0: "Group Name: Access Switches" });
const ITEM_HW = row({ 0: "1.0", 1: "C8500-12X", 2: "Cisco C8500 Router", 3: "---", 4: "2" });
const ITEM_SW = row({ 0: "1.1", 1: "C8500-DNA-L", 2: "DNA License", 3: "36", 4: "2" });
const ITEM_CCW = row({
  0: "1.2",
  1: "Initial Term - 36.00 Months | Auto Renewal Term - 0 Months | Billing Model - Prepaid Term | Requested Start Date - 03-Apr-2021 | Requested End Date - 02-Apr-2024",
  2: "",
  3: "36",
  4: "1",
});
const BLANK_ROW = row({});

describe("parseTypeD — sheet lookup", () => {
  it('throws when "Active BoQ" sheet is missing', () => {
    expect(() => parseTypeD({ Sheet1: [] })).toThrow(/Active BoQ/);
  });

  it("throws on invalid input type", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => parseTypeD(null as any)).toThrow();
  });

  it("returns empty array for empty sheet", () => {
    expect(parseTypeD({ "Active BoQ": [] })).toEqual([]);
  });
});

describe("parseTypeD — group header handling", () => {
  const sheets = { "Active BoQ": [GROUP_ROUTER, ITEM_HW] };

  it("does not emit a line item for group header rows", () => {
    expect(parseTypeD(sheets)).toHaveLength(1);
  });

  it("sets section from Group Name", () => {
    const [item] = parseTypeD(sheets);
    expect(item.section).toBe("Internet and WAN Router");
  });

  it("items before any group header have undefined section", () => {
    const sheets = { "Active BoQ": [ITEM_HW] };
    const [item] = parseTypeD(sheets);
    expect(item.section).toBeUndefined();
  });

  it("section updates when a new group header appears", () => {
    const swItem = row({ 0: "4.0", 1: "C9300-48P", 2: "Catalyst Switch", 3: "---", 4: "10" });
    const sheets = { "Active BoQ": [GROUP_ROUTER, ITEM_HW, GROUP_SWITCH, swItem] };
    const [first, second] = parseTypeD(sheets);
    expect(first.section).toBe("Internet and WAN Router");
    expect(second.section).toBe("Access Switches");
  });
});

describe("parseTypeD — hardware vs subscription", () => {
  const sheets = { "Active BoQ": [GROUP_ROUTER, ITEM_HW, ITEM_SW] };

  it("sets serviceDuration to 'hardware' when D is '---'", () => {
    const [hw] = parseTypeD(sheets);
    expect(hw.serviceDuration).toBe("hardware");
  });

  it("sets serviceDuration to the month count string when D is numeric", () => {
    const [, sw] = parseTypeD(sheets);
    expect(sw.serviceDuration).toBe("36");
  });
});

describe("parseTypeD — regular item mapping", () => {
  const sheets = { "Active BoQ": [GROUP_ROUTER, ITEM_HW] };
  const [item] = parseTypeD(sheets);

  it("maps itemNumber, description, qty", () => {
    expect(item.itemNumber).toBe("1.0");
    expect(item.description).toBe("Cisco C8500 Router");
    expect(item.qty).toBe(2);
  });

  it("maps partNumber from col B when not CCW metadata", () => {
    expect(item.partNumber).toBe("C8500-12X");
  });

  it("sets unit to empty string (no unit column)", () => {
    expect(item.unit).toBe("");
  });
});

describe("parseTypeD — CCW subscription metadata", () => {
  const sheets = { "Active BoQ": [GROUP_ROUTER, ITEM_CCW] };
  const [item] = parseTypeD(sheets);

  it("does not set partNumber when col B is CCW metadata", () => {
    expect(item.partNumber).toBeUndefined();
  });

  it("parses initialTerm into metadata", () => {
    expect(item.metadata?.initialTerm).toBe("36.00 Months");
  });

  it("parses billingModel into metadata", () => {
    expect(item.metadata?.billingModel).toBe("Prepaid Term");
  });

  it("parses requestedStartDate into metadata", () => {
    expect(item.metadata?.requestedStartDate).toBe("03-Apr-2021");
  });

  it("parses requestedEndDate into metadata", () => {
    expect(item.metadata?.requestedEndDate).toBe("02-Apr-2024");
  });

  it("sets serviceDuration from col D alongside CCW metadata", () => {
    expect(item.serviceDuration).toBe("36");
  });
});

describe("parseTypeD — row skipping", () => {
  it("skips blank rows (col A empty)", () => {
    const sheets = { "Active BoQ": [BLANK_ROW, ITEM_HW] };
    expect(parseTypeD(sheets)).toHaveLength(1);
  });

  it("skips header rows (qty is non-numeric)", () => {
    const sheets = { "Active BoQ": [HEADER_ROW, ITEM_HW] };
    expect(parseTypeD(sheets)).toHaveLength(1);
  });

  it("skips rows where qty is blank", () => {
    const noQty = row({ 0: "5.0", 1: "C9300", 2: "Switch", 3: "---" });
    const sheets = { "Active BoQ": [noQty, ITEM_HW] };
    expect(parseTypeD(sheets)).toHaveLength(1);
  });
});
