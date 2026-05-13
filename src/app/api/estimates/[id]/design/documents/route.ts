/**
 * /api/estimates/[id]/design/documents — stream generated E5 artifacts.
 * GET ?type=hld|lld → DOCX bytes (application/vnd.openxmlformats-...).
 * GET ?type=diagram → XML bytes (application/xml).
 * 404 if the document was not yet generated or its file is missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { basename } from "path";
import {
  loadE5State,
  resolveIntake,
} from "@/app/api/estimates/[id]/_e5-state";
import { requireAuth } from "@/lib/middleware/auth";

const ALLOWED_TYPES = ["hld", "lld", "diagram"] as const;
type DocumentType = (typeof ALLOWED_TYPES)[number];

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocumentType(s: string | null): s is DocumentType {
  return s !== null && (ALLOWED_TYPES as readonly string[]).includes(s);
}

async function streamDocx(
  path: string,
  filename: string,
): Promise<NextResponse> {
  try {
    await stat(path);
  } catch {
    return NextResponse.json(
      { error: `Document file not found on disk: ${filename}` },
      { status: 404 },
    );
  }
  const buf = await readFile(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function streamDiagram(xml: string): NextResponse {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="diagram.drawio.xml"`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const type = new URL(request.url).searchParams.get("type");
  if (!isDocumentType(type)) {
    return NextResponse.json(
      { error: `Invalid 'type' query param. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const resolved = await resolveIntake(params.id, session.tenantId);
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

  if (type === "diagram") {
    if (!state.diagramXml) {
      return NextResponse.json(
        { error: "Document 'diagram' not generated yet" },
        { status: 404 },
      );
    }
    return streamDiagram(state.diagramXml);
  }

  const docPath = type === "hld" ? state.hldDocxPath : state.lldDocxPath;
  if (!docPath) {
    return NextResponse.json(
      { error: `Document '${type}' not generated yet` },
      { status: 404 },
    );
  }
  return await streamDocx(docPath, basename(docPath));
}
