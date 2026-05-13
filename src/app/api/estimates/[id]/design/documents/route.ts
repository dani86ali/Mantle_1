/**
 * /api/estimates/[id]/design/documents — return generated E5 artifact paths.
 * GET ?type=hld|lld|diagram → { type, path }. 404 if not generated.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadE5State,
  resolveIntake,
} from "@/app/api/estimates/[id]/_e5-state";

const ALLOWED_TYPES = ["hld", "lld", "diagram"] as const;
type DocumentType = (typeof ALLOWED_TYPES)[number];

function isDocumentType(s: string | null): s is DocumentType {
  return s !== null && (ALLOWED_TYPES as readonly string[]).includes(s);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const type = new URL(request.url).searchParams.get("type");
  if (!isDocumentType(type)) {
    return NextResponse.json(
      { error: `Invalid 'type' query param. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const resolved = await resolveIntake(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  const state = await loadE5State(resolved.intakeId);
  if (!state) {
    return NextResponse.json(
      { error: "Design not generated for this estimate" },
      { status: 404 },
    );
  }

  const path =
    type === "hld"
      ? state.hldDocxPath
      : type === "lld"
        ? state.lldDocxPath
        : state.diagramXml;
  if (!path) {
    return NextResponse.json(
      { error: `Document '${type}' not generated yet` },
      { status: 404 },
    );
  }
  return NextResponse.json({ type, path });
}
