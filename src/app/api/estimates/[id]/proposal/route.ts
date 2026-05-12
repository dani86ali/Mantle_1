/**
 * GET /api/estimates/[id]/proposal — return the E3 proposal artifacts for an
 * estimate: section bodies, three pricing tiers, margin analysis, and the
 * on-disk paths of the generated docx + financial xlsx files.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { loadArtifacts } from "@/lib/db/pipeline-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const intakeId = await resolveIntakeId(params.id);
  if (!intakeId) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const { e3 } = await loadArtifacts(intakeId);
  if (!e3) {
    return NextResponse.json(
      { error: "Proposal not generated for this estimate" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    sections: e3.sections,
    tiers: e3.tiers,
    margin: e3.margin,
    downloads: {
      proposalDocx: e3.proposalPath ?? null,
      financialXlsx: e3.financialPath ?? null,
    },
  });
}

async function resolveIntakeId(id: string): Promise<string | null> {
  const [draft] = await db
    .select({ intakeId: bomDrafts.intakeId })
    .from(bomDrafts)
    .where(eq(bomDrafts.id, id))
    .limit(1);
  if (draft?.intakeId) return draft.intakeId;

  const [intake] = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(eq(intakes.id, id))
    .limit(1);
  return intake?.id ?? null;
}
