import { z } from "zod";
import { BoQType } from "@/engines/e2/boq-types";

const DetectBoQTypeSchema = z.object({
  sheetNames: z.array(z.string()),
  fileName: z.string(),
  headerSample: z.array(z.array(z.string())),
});

export function detectBoQType(
  sheetNames: string[],
  fileName: string,
  headerSample: string[][]
): BoQType {
  DetectBoQTypeSchema.parse({ sheetNames, fileName, headerSample });

  const headerText = headerSample.flat().join(" ");
  const fileNameLower = fileName.toLowerCase();

  // TYPE_A: SAP Ariba — sheet sentinel or Aramco_{10-digit} filename
  if (sheetNames.includes("Intend To Respond Instructions")) {
    return BoQType.TYPE_A_ARIBA;
  }
  if (/Aramco_\d{10}/.test(fileName)) {
    return BoQType.TYPE_A_ARIBA;
  }

  // TYPE_B_NRM2_ADDOMMIT: Add/Omit variant — Bill02a sheet present
  if (sheetNames.some((s) => s.startsWith("Bill02a"))) {
    return BoQType.TYPE_B_NRM2_ADDOMMIT;
  }

  // TYPE_B_NRM2: Government QS BoQ — MAIN BOQ sheet
  if (sheetNames.includes("MAIN BOQ")) {
    return BoQType.TYPE_B_NRM2;
  }

  // TYPE_E: Legacy .xls telecom RFQ — STC reference column in headers
  if (
    fileNameLower.endsWith(".xls") &&
    headerText.includes("STC ITEM DESCRIPTION")
  ) {
    return BoQType.TYPE_E_TELECOM;
  }

  // TYPE_C: Vendor quotation template — U. Price column present
  if (headerText.includes("U. Price")) {
    return BoQType.TYPE_C_VENDOR_QUOTE;
  }

  // TYPE_D: BOM without pricing — Service Duration + Part Number columns
  if (
    headerText.includes("Service Duration") &&
    headerText.includes("Part Number")
  ) {
    return BoQType.TYPE_D_BOM_NO_PRICE;
  }

  return BoQType.TYPE_UNKNOWN;
}
