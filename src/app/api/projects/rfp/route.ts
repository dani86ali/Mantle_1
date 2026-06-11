/**
 * POST /api/projects/rfp - create an RFP Project shell.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority. The request body never supplies tenantId, mode,
 * pricingConfig, createdBy, or decidedBy - those are ignored. Parses
 * { name, customerName? } only; there is no pricing selection at RFP creation.
 * Invalid JSON or an invalid body maps to 400 invalid_rfp_project_create_request.
 * The service result maps to HTTP: invalid_input -> 400 (service code + error),
 * ok -> 201 with { project, stages }. An unexpected service error maps to a
 * controlled 500 that never exposes the thrown error. Imports only Next.js
 * server primitives, requireAuth, and the creation service (no DB, pricing,
 * export, runner, AI, catalog, engine, coordinator, or adapter modules).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createRfpProject } from "@/lib/projects/project-rfp-creation";

interface ParsedCreateBody {
  name: string;
  customerName?: string;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_project_create_request",
      error: "name is required.",
    },
    { status: 400 }
  );
}

/**
 * Validate the request body to the minimal create shape, or null when invalid.
 * Only name and customerName are read; any other field (tenantId, mode,
 * pricingConfig, createdBy, decidedBy, ...) is ignored. Blank-after-trim
 * names are NOT rejected here; the creation service owns that rule.
 */
function parseCreateBody(body: unknown): ParsedCreateBody | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const { name, customerName } = record;
  if (typeof name !== "string") return null;
  if (customerName !== undefined && typeof customerName !== "string") return null;

  return {
    name,
    ...(customerName !== undefined ? { customerName } : {}),
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
    const result = await createRfpProject({
      tenantId: session.tenantId,
      name: parsed.name,
      ...(parsed.customerName !== undefined
        ? { customerName: parsed.customerName }
        : {}),
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
        code: "rfp_project_create_failed",
        error: "Unable to create RFP project.",
      },
      { status: 500 }
    );
  }
}
