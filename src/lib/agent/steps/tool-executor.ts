/**
 * Tool executor — handles tool calls from the agent's tool-use loop.
 * Dispatches to adapters and validation engine.
 */

import { v4 as uuid } from "uuid";
import { getItems, getMappedServices } from "@/lib/adapters/catalog";
import { createEstimate } from "@/lib/adapters/estimate";
import { searchCustomer } from "@/lib/adapters/customer";
import { runValidation, summarizeResults } from "@/lib/validation/engine";
import type { BomLine, AgentSummary, QuoteAdvisory, CiscoCallLog } from "@/types/bom";
import type { ValidationContext, CatalogItemForValidation } from "@/types/validation";
import type { StandardsConfig } from "@/types/tenant";
import type { IntakeRequirements } from "@/types/intake";

interface ToolContext {
  tenantId: string;
  priceListId: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
  standards: StandardsConfig;
  region: string;
  country: string;
  requirements: IntakeRequirements;
  ciscoCalls: CiscoCallLog[];
}

interface ToolResult {
  data: unknown;
  bomLines?: BomLine[];
  estimateId?: string;
  ccwUrl?: string;
  summary?: AgentSummary;
  quoteAdvisory?: QuoteAdvisory;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  switch (name) {
    case "catalog_lookup":
      return handleCatalogLookup(input, context);
    case "mapped_services":
      return handleMappedServices(input, context);
    case "search_customer":
      return handleSearchCustomer(input, context);
    case "validate_bom":
      return handleValidateBom(input, context);
    case "create_estimate":
      return handleCreateEstimate(input, context);
    case "submit_bom":
      return handleSubmitBom(input, context);
    default:
      return { data: { error: `Unknown tool: ${name}` } };
  }
}

async function handleCatalogLookup(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const skus = input.skus as string[];
  const result = await getItems(skus, {
    tenantId: context.tenantId,
    priceListId: context.priceListId,
    credentials: context.credentials,
  });

  context.ciscoCalls.push({
    api: "catalog",
    method: "getItems",
    skuCount: skus.length,
    durationMs: result.durationMs,
    statusCode: result.success ? 200 : 0,
    cached: result.cached,
    timestamp: new Date(),
  });

  if (!result.success) {
    return { data: { error: result.error } };
  }

  return {
    data: {
      items: result.data?.items.map((item) => ({
        sku: item.sku,
        description: item.description,
        list_price: item.listPrice,
        available: item.available,
        region_availability: item.regionAvailability,
        eox: item.eoxInfo,
        lead_time_days: item.leadTimeDays,
        smart_account_mandatory: item.smartAccountMandatory,
        product_family: item.productFamily,
        category: item.productCategory,
        specs: item.specs,
      })),
      errors: result.data?.errors,
    },
  };
}

async function handleMappedServices(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const hardwareSku = input.hardware_sku as string;
  const result = await getMappedServices(hardwareSku, {
    tenantId: context.tenantId,
    priceListId: context.priceListId,
    credentials: context.credentials,
  });

  context.ciscoCalls.push({
    api: "catalog",
    method: "getMappedServices",
    skuCount: 1,
    durationMs: result.durationMs,
    statusCode: result.success ? 200 : 0,
    cached: result.cached,
    timestamp: new Date(),
  });

  if (!result.success) {
    return { data: { error: result.error } };
  }

  return { data: result.data };
}

async function handleSearchCustomer(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const result = await searchCustomer(
    {
      companyName: input.company_name as string,
      country: input.country as string | undefined,
    },
    {
      tenantId: context.tenantId,
      credentials: context.credentials,
    }
  );

  context.ciscoCalls.push({
    api: "customer_registry",
    method: "searchCustomer",
    durationMs: result.durationMs,
    statusCode: result.success ? 200 : 0,
    cached: result.cached,
    timestamp: new Date(),
  });

  if (!result.success) {
    return { data: { error: result.error } };
  }

  return { data: result.data };
}

async function handleValidateBom(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const inputLines = input.lines as Array<Record<string, unknown>>;

  // Build BomLine objects
  const lines: BomLine[] = inputLines.map((l, i) => ({
    id: uuid(),
    lineNumber: i + 1,
    sku: l.sku as string,
    description: (l.description as string) ?? "",
    quantity: l.quantity as number,
    unitListPrice: (l.unit_list_price as number) ?? 0,
    unitNetPrice: (l.unit_list_price as number) ?? 0,
    discountPercent: 0,
    extendedNetPrice: ((l.unit_list_price as number) ?? 0) * (l.quantity as number),
    category: (l.category as BomLine["category"]) ?? "other",
    smartAccountMandatory: false,
    validationFlags: [],
    decision: "pending",
    catalogVerified: true,
  }));

  // Build catalog data map from recent lookups
  const catalogData = new Map<string, CatalogItemForValidation>();
  // We'd normally pull this from cache; for now build from the lines
  for (const line of lines) {
    if (!catalogData.has(line.sku)) {
      catalogData.set(line.sku, {
        sku: line.sku,
        exists: true,
        eoxStatus: { isEox: false },
        regionAvailability: ["EMEAR", "APJC", "AMER", "MEA"],
        category: line.category,
        productFamily: "",
      });
    }
  }

  const validationContext: ValidationContext = {
    lines,
    requirements: context.requirements,
    region: context.region,
    country: context.country,
    tenantStandards: {
      requireRedundantPsu: context.standards.requireRedundantPsu,
      preferredLicenseTier: context.standards.preferredLicenseTier,
      preferredDnaTier: context.standards.preferredDnaTier,
      defaultSupportLevel: context.standards.defaultSupportLevel,
      approvedProductFamilies: context.standards.approvedProductFamilies,
      regionRestrictions: context.standards.regionRestrictions,
    },
    catalogData,
  };

  const results = runValidation(validationContext);
  const summary = summarizeResults(results);

  return {
    data: {
      results: results.map((r) => ({
        rule: r.ruleId,
        status: r.passed ? "pass" : r.severity,
        message: r.message,
        affected_lines: r.affectedLineIds,
      })),
      summary,
    },
  };
}

async function handleCreateEstimate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const lineItems = (input.line_items as Array<{ sku: string; quantity: number }>);

  const result = await createEstimate(
    {
      estimateName: input.estimate_name as string,
      priceListId: context.priceListId,
      lineItems: lineItems.map((l) => ({
        sku: l.sku,
        quantity: l.quantity,
      })),
    },
    {
      tenantId: context.tenantId,
      credentials: context.credentials,
    }
  );

  context.ciscoCalls.push({
    api: "estimate",
    method: "createEstimate",
    durationMs: result.durationMs,
    statusCode: result.success ? 200 : 0,
    cached: result.cached,
    timestamp: new Date(),
  });

  if (!result.success) {
    return { data: { error: result.error } };
  }

  return {
    data: {
      estimate_id: result.data?.estimateId,
      ccw_url: result.data?.ccwUrl,
      status: result.data?.status,
    },
    estimateId: result.data?.estimateId,
    ccwUrl: result.data?.ccwUrl,
  };
}

async function handleSubmitBom(
  input: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const inputLines = input.lines as Array<Record<string, unknown>>;
  const inputSummary = input.summary as Record<string, unknown> | undefined;
  const inputQuote = input.quote_advisory as Record<string, unknown> | undefined;

  const bomLines: BomLine[] = inputLines.map((l, i) => ({
    id: uuid(),
    lineNumber: i + 1,
    sku: l.sku as string,
    description: (l.description as string) ?? "",
    quantity: l.quantity as number,
    unitListPrice: (l.unit_list_price as number) ?? 0,
    unitNetPrice: (l.unit_list_price as number) ?? 0,
    discountPercent: 0,
    extendedNetPrice: ((l.unit_list_price as number) ?? 0) * (l.quantity as number),
    category: (l.category as BomLine["category"]) ?? "other",
    serviceDurationMonths: l.service_duration_months as number | undefined,
    leadTimeDays: l.lead_time_days as number | undefined,
    smartAccountMandatory: (l.smart_account_mandatory as boolean) ?? false,
    validationFlags: [],
    decision: "pending",
    catalogVerified: true,
  }));

  const summary: AgentSummary = {
    assumptions: (inputSummary?.assumptions as string[]) ?? [],
    exclusions: (inputSummary?.exclusions as string[]) ?? [],
    openQuestions: (inputSummary?.open_questions as string[]) ?? [],
    validationWarnings: [],
    totalListPrice: bomLines.reduce((s, l) => s + l.unitListPrice * l.quantity, 0),
    productTotal: bomLines.filter((l) => ["hardware", "accessory", "software"].includes(l.category)).reduce((s, l) => s + l.extendedNetPrice, 0),
    serviceTotal: bomLines.filter((l) => l.category === "service").reduce((s, l) => s + l.extendedNetPrice, 0),
    subscriptionTotal: bomLines.filter((l) => l.category === "subscription").reduce((s, l) => s + l.extendedNetPrice, 0),
  };

  const quoteAdvisory: QuoteAdvisory = {
    detected: (inputQuote?.detected as boolean) ?? false,
    signals: (inputQuote?.signals as string[]) ?? [],
    recommendation: (inputQuote?.recommendation as string) ?? "",
    ccwQuoteSteps: [],
  };

  return {
    data: { status: "submitted", line_count: bomLines.length },
    bomLines,
    summary,
    quoteAdvisory,
  };
}
