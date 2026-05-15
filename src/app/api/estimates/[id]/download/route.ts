/**
 * GET /api/estimates/[id]/download?artifact=<kind>
 * Streams a generated artifact back to the browser.
 *
 *   bom            — regenerated XLSX from E2 priced lines
 *   compliance     — regenerated XLSX from E1 compliance matrix
 *   proposal       — DOCX from E3 (path stored)
 *   financial      — XLSX from E3 (path stored)
 *   hld            — DOCX from E5 design state
 *   lld            — DOCX from E5 design state
 *   diagram        — draw.io XML from E5 design state
 *   filled_boq     — XLSX from E2 (client BoQ refilled with prices)
 *   component_list — JSON from E5 design state
 */

import { NextRequest, NextResponse } from "next/server";
import { loadArtifacts } from "@/lib/db/pipeline-store";
import { loadE5State } from "@/app/api/estimates/[id]/_e5-state";
import { requireAuth } from "@/lib/middleware/auth";
import {
  DOCX_MIME,
  XLSX_MIME,
  downloadBom,
  downloadCompliance,
  resolveIntake,
  streamFile,
  streamString,
} from "./_helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  const artifact = new URL(request.url).searchParams.get("artifact");
  if (!artifact) {
    return NextResponse.json(
      { error: "Missing ?artifact parameter" },
      { status: 400 },
    );
  }
  const resolved = await resolveIntake(params.id, session.tenantId);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  try {
    const { e1, e2, e3 } = await loadArtifacts(resolved.intakeId);
    if (artifact === "bom") return await downloadBom(resolved, e2);
    if (artifact === "compliance") return await downloadCompliance(resolved, e1);
    if (artifact === "proposal") return await streamFile(e3?.proposalPath, DOCX_MIME);
    if (artifact === "financial") return await streamFile(e3?.financialPath, XLSX_MIME);
    if (artifact === "filled_boq")
      return await streamFile(e2?.filledClientBoqPath, XLSX_MIME);
    if (
      artifact === "hld" ||
      artifact === "lld" ||
      artifact === "diagram" ||
      artifact === "component_list"
    ) {
      const state = await loadE5State(resolved.intakeId);
      if (!state) {
        return NextResponse.json(
          { error: "Design not generated for this estimate" },
          { status: 400 },
        );
      }
      if (artifact === "hld") return await streamFile(state.hldDocxPath, DOCX_MIME);
      if (artifact === "lld") return await streamFile(state.lldDocxPath, DOCX_MIME);
      if (artifact === "diagram")
        return streamString(state.diagramXml, "application/xml", "diagram.drawio.xml");
      return streamString(
        state.componentList,
        "application/json",
        "component-list.json",
      );
    }
    return NextResponse.json(
      { error: `Unknown artifact: ${artifact}` },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
