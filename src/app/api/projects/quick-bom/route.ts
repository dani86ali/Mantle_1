/**
 * POST /api/projects/quick-bom - create a Quick BoM Project shell.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority. The request body never supplies tenantId, mode, createdBy, or
 * decidedBy - those are ignored. Parses { name, customerName?, pricingConfig },
 * where pricingConfig is { mode, ratePercent, vatRatePercent?, roundingDecimals? }.
 * Invalid JSON or an invalid body maps to 400 invalid_quick_bom_project_create_request.
 * The service result maps to HTTP: invalid_input -> 400 (service code + error),
 * ok -> 201 with { project, stages }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js server
 * primitives, requireAuth, and the creation service (no DB, pricing execution,
 * export, runner, AI, catalog, engine, coordinator, or adapter modules).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createQuickBomProject } from "@/lib/projects/project-quick-bom-creation";

interface ParsedCreateBody {
  name: string;
  customerName?: string;
  pricingConfig: {
    mode: "margin" | "markup";
    ratePercent: number;
    vatRatePercent?: number;
    roundingDecimals?: number;
  };
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_quick_bom_project_create_request",
      error: "name and pricingConfig (mode, ratePercent) are required.",
    },
    { status: 400 }
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate the request body to the minimal create shape, or null when invalid.
 * Only name, customerName, and pricingConfig are read; any other field (tenantId,
 * mode, createdBy, decidedBy, ...) is ignored. Value ranges are NOT checked here;
 * the pricing helper inside the service owns margin/markup/VAT/rounding validation.
 */
function parseCreateBody(body: unknown): ParsedCreateBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const { name, customerName, pricingConfig } = record;
  if (typeof name !== "string") return null;
  if (customerName !== undefined && typeof customerName !== "string") return null;
  if (typeof pricingConfig !== "object" || pricingConfig === null) return null;

  const pc = pricingConfig as Record<string, unknown>;
  if (pc.mode !== "margin" && pc.mode !== "markup") return null;
  if (!isFiniteNumber(pc.ratePercent)) return null;
  if (pc.vatRatePercent !== undefined && !isFiniteNumber(pc.vatRatePercent)) {
    return null;
  }
  if (pc.roundingDecimals !== undefined && !isFiniteNumber(pc.roundingDecimals)) {
    return null;
  }

  return {
    name,
    ...(customerName !== undefined ? { customerName } : {}),
    pricingConfig: {
      mode: pc.mode,
      ratePercent: pc.ratePercent,
      ...(pc.vatRatePercent !== undefined
        ? { vatRatePercent: pc.vatRatePercent }
        : {}),
      ...(pc.roundingDecimals !== undefined
        ? { roundingDecimals: pc.roundingDecimals }
        : {}),
    },
  };
}

export async function POST(request: NextRequest) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const parsed = parseCreateBody(body);
  if (parsed === null) return invalidRequest();

  try {
    const result = await createQuickBomProject({
      tenantId: session.tenantId,
      name: parsed.name,
      ...(parsed.customerName !== undefined
        ? { customerName: parsed.customerName }
        : {}),
      pricingConfig: parsed.pricingConfig,
    });

    if (result.status === "invalid_input") {
      return NextResponse.json(
        { code: result.code, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { project: result.project, stages: result.stages },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "quick_bom_project_create_failed",
        error: "Unable to create Quick BoM project.",
      },
      { status: 500 }
    );
  }
}
