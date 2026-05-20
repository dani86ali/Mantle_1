// Single dispatch point for BoQ parsing. Replaces the two byte-identical
// parseByType copies that previously lived in orchestrator.ts and
// pipeline-e2-pricing.ts.
//
// Typed layouts (A–E) route to their dedicated deterministic parsers.
// Everything else (TYPE_UNKNOWN — all CCW variants and unrecognized customer
// spreadsheets) routes to the generic catalog-grounded tabular extractor.

import type { BoQLineItem } from "@/engines/e2/boq-types";
import { BoQType } from "@/engines/e2/boq-types";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";
import { parseTypeB } from "@/engines/e2/parsers/type-b-nrm2";
import { parseTypeC } from "@/engines/e2/parsers/type-c-vendor-quote";
import { parseTypeD } from "@/engines/e2/parsers/type-d-bom";
import { parseTypeE } from "@/engines/e2/parsers/type-e-telecom";
import { extractLineItems } from "@/lib/io/tabular-extractor";

export interface ParseBoQOptions {
  /** Catalog SKU keyset for the generic extractor's Tier-3 grounding. */
  catalogSkus?: string[];
}

export function parseBoQ(
  type: BoQType,
  sheets: Record<string, string[][]>,
  opts: ParseBoQOptions = {},
): BoQLineItem[] {
  switch (type) {
    case BoQType.TYPE_A_ARIBA:
      return parseTypeA(sheets);
    case BoQType.TYPE_B_NRM2:
      return parseTypeB(sheets, "base");
    case BoQType.TYPE_B_NRM2_ADDOMMIT:
      return parseTypeB(sheets, "addommit");
    case BoQType.TYPE_C_VENDOR_QUOTE:
      return parseTypeC(sheets);
    case BoQType.TYPE_D_BOM_NO_PRICE:
      return parseTypeD(sheets);
    case BoQType.TYPE_E_TELECOM:
      return parseTypeE(sheets);
    case BoQType.TYPE_UNKNOWN:
    default:
      return extractLineItems(sheets, { catalogSkus: opts.catalogSkus }).lineItems;
  }
}
