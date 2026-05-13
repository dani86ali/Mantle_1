// Aramco Ariba column maps — single source of truth for parser + filler.
// Indices verified from real fixtures (Aramco_4203079088, 4203164336, 4203193153).
// IMPORTANT: 2022 is NOT a simple "shift left by 1" of 2024+.
// 2022 swaps the L/M/N triple (Helper, Price, Quantity) vs 2024+ (Quantity, Helper, Price).

export type ColMap = {
  itemNum: number;
  description: number;
  intendToRespond: number;
  currency: number;
  uom: number;
  qty: number;
  unitPrice: number;
  leadTime: number;
  mpn: number;
  manufacturer: number;
  modelPartNum: number;
  countryOfOrigin: number;
  remarks: number;
};

// 2024+ (42 cols). L=Quantity, M=Helper, N=Price, O=Discount%, P=ChinaVAT%,
// Q=ReqDelivery, R=LeadTime, ..., U=MPN, V=Manufacturer, X=Model/Part, Z=Country, AO=Remarks.
export const COLS_2024: ColMap = {
  itemNum: 0,           // A
  description: 5,       // F
  intendToRespond: 6,   // G
  currency: 8,          // I
  uom: 9,               // J
  qty: 11,              // L
  unitPrice: 13,        // N
  leadTime: 17,         // R
  mpn: 20,              // U
  manufacturer: 21,     // V
  modelPartNum: 23,     // X
  countryOfOrigin: 25,  // Z
  remarks: 40,          // AO
};

// 2022 (41 cols). L=Helper, M=Price, N=Quantity (different from 2024+!),
// O=HSCode, P=LeadTime, R=ReqDelivery, S=MPN, T=Manufacturer, V=Model/Part, X=Country, AM=Remarks.
export const COLS_2022: ColMap = {
  itemNum: 0,           // A
  description: 5,       // F
  intendToRespond: 6,   // G
  currency: 8,          // I
  uom: 9,               // J
  qty: 13,              // N (Quantity in 2022)
  unitPrice: 12,        // M (* Price in 2022)
  leadTime: 15,         // P
  mpn: 18,              // S
  manufacturer: 19,     // T
  modelPartNum: 21,     // V
  countryOfOrigin: 23,  // X
  remarks: 38,          // AM
};

// Sheet name prefix is the strongest signal ('6 ' = 2022, '7 ' = 2024+).
// Column count is the fallback (41 = 2022, >=42 = 2024+).
export function detectVersion(sheetName: string, headerWidth: number): ColMap {
  if (sheetName.startsWith("6 ")) return COLS_2022;
  if (sheetName.startsWith("7 ")) return COLS_2024;
  return headerWidth >= 42 ? COLS_2024 : COLS_2022;
}

export function findCommercialSheetName(sheetNames: string[]): string | undefined {
  return sheetNames.find((s) => s.includes("Commercial Envelope"));
}
