/**
 * Input validation middleware using Zod schemas.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or NextResponse error.
 */
export async function validateBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T> | NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  return result.data;
}

// ─── Zod schemas for intake forms ────────────────────────────────────────

export const intakeFormSchema = z.object({
  path: z.enum(["path_a", "path_b"]).optional(),
  mode: z.enum(["rfp", "quick_bom", "rfi"]).optional(),
  customerName: z.string().min(1).max(500),
  region: z.string().min(1).max(50),
  country: z.string().max(100).optional(),
  domain: z.enum(["access_switching", "wireless", "access_switching_wireless"]),
  keyNeeds: z.string().max(5000).optional(),
  vendorPreferences: z.string().max(5000).optional(),
  quantities: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().int().positive(),
        portCount: z.number().int().positive().optional(),
        portType: z.string().optional(),
      })
    )
    .optional(),
  poeRequired: z.boolean().optional(),
  poeClass: z.string().optional(),
  redundancyRequired: z.boolean().optional(),
  stackingRequired: z.boolean().optional(),
  licenseTier: z.enum(["essentials", "advantage"]).optional(),
  dnaTier: z.enum(["essentials", "advantage", "opt_out"]).optional(),
  supportTerm: z.string().optional(),
  constraints: z.string().max(5000).optional(),
  pastedText: z.string().max(10000).optional(),
  uploadedBomLines: z
    .array(
      z.object({
        sku: z.string(),
        description: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().optional(),
      })
    )
    .optional(),
  uploadedFiles: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
      })
    )
    .optional(),
  pricingConfig: z
    .object({
      fxRate: z.number().positive(),
      partnerDiscountPct: z.number().min(0).max(1),
      dealRegDiscountPct: z.number().min(0).max(1),
      profitMode: z.enum(["margin", "markup"]),
      profitPct: z.number().min(0).max(1),
      vatRate: z.number().min(0).max(1),
    })
    .optional(),
});

export const reviewActionSchema = z.object({
  bomDraftId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["approved", "approved_with_changes", "rejected"]).optional(),
  lineOverrides: z
    .array(
      z.object({
        lineId: z.string(),
        field: z.string(),
        oldValue: z.string(),
        newValue: z.string(),
      })
    )
    .optional(),
  comments: z
    .array(
      z.object({
        lineId: z.string().optional(),
        text: z.string().max(2000),
      })
    )
    .optional(),
});

export const tenantConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  region: z.string().max(50).optional(),
  priceListId: z.string().max(100).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  brandingConfig: z
    .object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().max(20).optional(),
      companyName: z.string().max(255).optional(),
      legalEntity: z.string().max(500).optional(),
      address: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      phone: z.string().max(50).optional(),
    })
    .optional(),
  standardsConfig: z
    .object({
      approvedProductFamilies: z.array(z.string()).optional(),
      preferredLicenseTier: z.enum(["essentials", "advantage"]).optional(),
      preferredDnaTier: z.enum(["essentials", "advantage"]).optional(),
      defaultSupportLevel: z.string().optional(),
      defaultPowerCableType: z.string().optional(),
      requireRedundantPsu: z.boolean().optional(),
    })
    .optional(),
});

// ─── File upload validation ─────────────────────────────────────────────

const ALLOWED_FILE_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFileUpload(
  file: File
): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} not allowed. Accepted: CSV, XLSX, PDF`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit`,
    };
  }

  return { valid: true };
}
