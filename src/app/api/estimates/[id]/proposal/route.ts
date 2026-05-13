/**
 * GET /api/estimates/[id]/proposal — return the E3 proposal artifacts for an
 * estimate: section bodies, three pricing tiers, margin analysis, and the
 * on-disk paths of the generated docx + financial xlsx files.
 *
 * With ?download=docx or ?download=financial, streams the file instead of
 * the JSON payload. If the file was never written (or has been cleaned up
 * from tmpdir) the docx/xlsx is regenerated on-the-fly from the cached E3
 * artifacts and the new path is persisted.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { readFile, access, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { db } from "@/lib/db/index";
import { bomDrafts, intakes } from "@/lib/db/schema";
import { loadArtifacts, saveE3Artifacts } from "@/lib/db/pipeline-store";
import { generateProposalDocx } from "@/engines/e3/docx-generator";
import {
  writeFinancialProposal,
  type FinancialCostStack,
} from "@/engines/e3/financial-proposal-writer";
import type { E3Output } from "@/engines/e3/orchestrator";
import type { ProposalMetadata } from "@/engines/e3/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface Resolved {
  intakeId: string;
  customerName: string;
  country: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resolved = await resolveIntake(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const { e3 } = await loadArtifacts(resolved.intakeId);
  if (!e3) {
    return NextResponse.json(
      { error: "Proposal not generated for this estimate" },
      { status: 400 }
    );
  }

  const download = new URL(request.url).searchParams.get("download");
  if (download === "docx") return await downloadDocx(resolved, e3);
  if (download === "financial") return await downloadFinancial(resolved, e3);

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

async function downloadDocx(meta: Resolved, e3: E3Output): Promise<NextResponse> {
  let path = e3.proposalPath;
  if (!path || !(await fileExists(path))) {
    if (!e3.sections || e3.sections.length === 0) {
      return NextResponse.json(
        { error: "Cannot regenerate proposal: sections unavailable" },
        { status: 400 }
      );
    }
    const dir = await ensureOutputDir(meta.intakeId);
    path = await generateProposalDocx(
      e3.sections,
      buildProposalMetadata(meta),
      join(dir, `${slug(meta.customerName)}-proposal.docx`)
    );
    await saveE3Artifacts(meta.intakeId, { ...e3, proposalPath: path });
  }
  return streamFile(path, DOCX_MIME, `Proposal_${slug(meta.customerName)}.docx`);
}

async function downloadFinancial(meta: Resolved, e3: E3Output): Promise<NextResponse> {
  let path = e3.financialPath;
  if (!path || !(await fileExists(path))) {
    if (!e3.tiers || !e3.margin) {
      return NextResponse.json(
        { error: "Cannot regenerate financial proposal: tiers/margin unavailable" },
        { status: 400 }
      );
    }
    const dir = await ensureOutputDir(meta.intakeId);
    path = await writeFinancialProposal(
      {
        metadata: buildFinancialMetadata(meta),
        tiers: e3.tiers,
        margin: e3.margin,
        costStack: deriveCostStack(e3),
      },
      join(dir, `${slug(meta.customerName)}-financial.xlsx`)
    );
    await saveE3Artifacts(meta.intakeId, { ...e3, financialPath: path });
  }
  return streamFile(path, XLSX_MIME, `Financial_${slug(meta.customerName)}.xlsx`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureOutputDir(intakeId: string): Promise<string> {
  const dir = join(tmpdir(), "bomatic-e3", intakeId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function streamFile(
  path: string,
  mime: string,
  filename: string
): Promise<NextResponse> {
  const buf = await readFile(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}

function buildProposalMetadata(meta: Resolved): ProposalMetadata {
  return {
    customerName: meta.customerName,
    projectName: `${meta.customerName} Network Solution`,
    estimateId: meta.intakeId,
    date: new Date().toISOString().slice(0, 10),
    validityDays: 30,
    country: meta.country,
    currency: deriveCurrency(meta.country),
    tenantName: "MantelTech",
  };
}

function buildFinancialMetadata(meta: Resolved) {
  return {
    customerName: meta.customerName,
    projectName: `${meta.customerName} Network Solution`,
    date: new Date().toISOString().slice(0, 10),
    currency: deriveCurrency(meta.country),
    validityDays: 30,
    country: meta.country,
  };
}

function deriveCurrency(country: string): string {
  const c = country.toUpperCase();
  if (c === "SA" || c === "KSA" || c === "SAU") return "SAR";
  if (c === "AE" || c === "UAE" || c === "ARE") return "AED";
  if (c === "EG" || c === "EGY") return "EGP";
  return "USD";
}

/** Reverse-engineer per-category cost from margin pcts + "better" tier sells.
 *  Only used on regeneration when the original E3Input costStack is no longer
 *  in scope. Hardware/services costs come from their margin pcts; whatever
 *  total-cost remainder is left lands in software. Subscription is zeroed —
 *  tier totals don't carry a subscription breakdown.
 */
function deriveCostStack(e3: E3Output): FinancialCostStack {
  const better = e3.tiers.tiers.find((t) => t.name === "better") ?? e3.tiers.tiers[0];
  const hwSell = better?.totals.hardwareTotal ?? 0;
  const svcSell = better?.totals.serviceTotal ?? 0;
  const hwCost = hwSell * (1 - (e3.margin.hardwareMarginPct ?? 0) / 100);
  const svcCost = svcSell * (1 - (e3.margin.servicesMarginPct ?? 0) / 100);
  const swCost = Math.max(0, e3.margin.totalCost - hwCost - svcCost);
  return {
    hardwareCost: hwCost,
    softwareCost: swCost,
    servicesCost: svcCost,
    subscriptionCost: 0,
    travelCost: 0,
    trainingCost: 0,
    contingency: 0,
    totalCost: hwCost + swCost + svcCost,
  };
}

function slug(s: string): string {
  return (s || "estimate").replace(/[^\w-]+/g, "_");
}

async function resolveIntake(id: string): Promise<Resolved | null> {
  const [draft] = await db
    .select({
      intakeId: bomDrafts.intakeId,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(bomDrafts)
    .innerJoin(intakes, eq(bomDrafts.intakeId, intakes.id))
    .where(eq(bomDrafts.id, id))
    .limit(1);
  if (draft?.intakeId) {
    return {
      intakeId: draft.intakeId,
      customerName: draft.customerName ?? "estimate",
      country: draft.country ?? "KSA",
    };
  }
  const [intake] = await db
    .select({
      id: intakes.id,
      customerName: intakes.customerName,
      country: intakes.country,
    })
    .from(intakes)
    .where(eq(intakes.id, id))
    .limit(1);
  if (intake) {
    return {
      intakeId: intake.id,
      customerName: intake.customerName ?? "estimate",
      country: intake.country ?? "KSA",
    };
  }
  return null;
}
