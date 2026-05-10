import { z } from "zod";

export enum BoQType {
  TYPE_A_ARIBA = "TYPE_A_ARIBA",
  TYPE_B_NRM2 = "TYPE_B_NRM2",
  TYPE_B_NRM2_ADDOMMIT = "TYPE_B_NRM2_ADDOMMIT",
  TYPE_C_VENDOR_QUOTE = "TYPE_C_VENDOR_QUOTE",
  TYPE_D_BOM_NO_PRICE = "TYPE_D_BOM_NO_PRICE",
  TYPE_E_TELECOM = "TYPE_E_TELECOM",
  TYPE_UNKNOWN = "TYPE_UNKNOWN",
}

export const BoQLineItemSchema = z.object({
  itemNumber: z.string(),
  description: z.string(),
  qty: z.number(),
  unit: z.string(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
  currency: z.string().optional(),
  partNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  leadTime: z.string().optional(),
  serviceDuration: z.string().optional(),
  section: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type BoQLineItem = z.infer<typeof BoQLineItemSchema>;
