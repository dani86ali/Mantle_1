/**
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/priced-boq
 * - create a `priced_boq` DRAFT (status needs_review) from one already-approved,
 * reviewed RFP configuration_expansion artifact, priced deterministically against the
 * Project-owned pricingConfig and the committed Honeywell MVP demo SAR price fixture.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only tenant
 * authority and the route params id/artifactId are the only project / source
 * configuration_expansion artifact authority. The request body is NEVER read - this
 * route accepts no body-supplied authority (no pricing map, pricingConfig, tenantId,
 * projectId, artifactId, or approver). The service result maps to HTTP: not_found ->
 * 404 project_not_found, wrong_mode -> 409 wrong_project_mode (with the lean project
 * summary), pricing_config_missing -> 409 project_pricing_config_missing,
 * configuration_expansion_not_found -> 404 configuration_expansion_artifact_not_found,
 * artifact_not_configuration_expansion -> 409, invalid_configuration_expansion_payload
 * -> 409, configuration_expansion_not_approved -> 409
 * configuration_expansion_artifact_not_approved, rule_pack_not_approved -> 409
 * configuration_expansion_rule_pack_not_approved, invalid_project_pricing_config ->
 * 409, invalid_demo_pricing_fixture -> 500 (a server-side fixture fault, distinct from
 * the catch-all), ok -> 200 with { artifact, payloadSummary, pricingSummary }. An
 * unexpected service error maps to a controlled 500 (rfp_boq_pricing_failed) that
 * never exposes the thrown error. Imports only Next.js server primitives, requireAuth,
 * and the RFP BoQ pricing wrapper service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import { createProjectRfpBoqPricedBoq } from "@/lib/projects/project-rfp-boq-pricing";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; artifactId: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await createProjectRfpBoqPricedBoq({
      tenantId: session.tenantId,
      projectId: params.id,
      configurationExpansionArtifactId: params.artifactId,
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        { code: "project_not_found", error: "Project not found." },
        { status: 404 }
      );
    }
    if (result.status === "wrong_mode") {
      return NextResponse.json(
        {
          code: "wrong_project_mode",
          error: "Project is not an RFP project.",
          project: result.project,
        },
        { status: 409 }
      );
    }
    if (result.status === "pricing_config_missing") {
      return NextResponse.json(
        {
          code: "project_pricing_config_missing",
          error: "Project has no pricing configuration.",
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_not_found") {
      return NextResponse.json(
        {
          code: "configuration_expansion_artifact_not_found",
          error: "Configuration expansion artifact not found.",
        },
        { status: 404 }
      );
    }
    if (result.status === "artifact_not_configuration_expansion") {
      return NextResponse.json(
        {
          code: "artifact_not_configuration_expansion",
          error: "Artifact is not a configuration_expansion artifact.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_configuration_expansion_payload") {
      return NextResponse.json(
        {
          code: "invalid_configuration_expansion_payload",
          error: "Configuration expansion artifact payload is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "configuration_expansion_not_approved") {
      return NextResponse.json(
        {
          code: "configuration_expansion_artifact_not_approved",
          error: "Configuration expansion artifact must be approved before pricing.",
        },
        { status: 409 }
      );
    }
    if (result.status === "rule_pack_not_approved") {
      return NextResponse.json(
        {
          code: "configuration_expansion_rule_pack_not_approved",
          error: "Configuration expansion artifact requires an approved rule pack.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_project_pricing_config") {
      return NextResponse.json(
        {
          code: "invalid_project_pricing_config",
          error: "Project pricing configuration is invalid.",
        },
        { status: 409 }
      );
    }
    if (result.status === "invalid_demo_pricing_fixture") {
      return NextResponse.json(
        {
          code: "invalid_demo_pricing_fixture",
          error: "Demo pricing fixture is invalid.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        artifact: result.artifact,
        payloadSummary: result.payloadSummary,
        pricingSummary: result.pricingSummary,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_boq_pricing_failed",
        error: "Unable to create RFP priced BoQ.",
      },
      { status: 500 }
    );
  }
}
