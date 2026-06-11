/**
 * POST /api/projects/[id]/rfp/requirements-baseline - create one reviewable
 * requirements_baseline draft artifact from explicit candidate requirements
 * that cite persisted RFP extraction evidence rows by id.
 *
 * POST only. Authenticated via requireAuth; session.tenantId is the only
 * tenant authority, the route param is the only project id, and
 * session.userId is the only createdBy authority. The request body supplies
 * ONLY { candidates }; per candidate ONLY text, category, priority,
 * evidenceIds, title, and notes are read - any body tenant/project/createdBy/
 * status/source/artifact/approval/stage/payload/pricing/SKU/raw-content field
 * is stripped and never reaches the service. The candidate gate mirrors the
 * service's deterministic candidate validation (via its exported category and
 * priority lists) so malformed input maps to 400
 * invalid_rfp_requirements_baseline_request before any service call: the body
 * must be an object whose candidates is a non-empty array of objects, each
 * with nonblank string text, an evidenceIds array holding at least one
 * nonblank string id, and a valid category/priority when one is present (null
 * is treated as absent, matching the service's defaulting). Non-string
 * title/notes and non-string evidence-id entries are dropped rather than
 * rejected (the service drops them too).
 *
 * The service result maps to HTTP: not_found -> 404 project_not_found,
 * wrong_mode -> 409 wrong_project_mode (with the lean project summary),
 * evidence_not_found -> 409 rfp_requirements_baseline_evidence_not_found
 * (with missingEvidenceIds), evidence_not_rfp_extraction -> 409
 * rfp_requirements_baseline_evidence_not_rfp_extraction (with lean evidence
 * summaries), evidence_missing_input_package -> 409
 * rfp_requirements_baseline_evidence_missing_input_package (with lean
 * evidence summaries), input_package_artifact_not_found -> 409
 * rfp_requirements_baseline_input_package_not_found (with
 * missingArtifactIds), artifact_not_input_package -> 409
 * rfp_requirements_baseline_artifact_not_input_package (with lean artifact
 * summaries), input_package_not_approved -> 409
 * rfp_requirements_baseline_input_package_not_approved (with lean artifact
 * summaries), ok -> 201 with { artifact, payloadSummary }. An unexpected
 * service error maps to a controlled 500 (rfp_requirements_baseline_failed)
 * that never exposes the thrown error.
 *
 * This route is a transport adapter only: it never touches the DB or any
 * store, parses no files, reads no raw text or storage path, creates no
 * approval, prices nothing, resolves no SKU or configuration, exports
 * nothing, and calls no AI or catalog. Imports only Next.js server
 * primitives, requireAuth, and the requirements-baseline service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth";
import {
  createRfpRequirementsBaselineDraft,
  RFP_REQUIREMENT_CATEGORIES,
  RFP_REQUIREMENT_PRIORITIES,
  type RfpRequirementCategory,
  type RfpRequirementPriority,
  type RfpRequirementsBaselineCandidateInput,
} from "@/lib/projects/project-rfp-requirements-baseline";

function invalidRequest(): NextResponse {
  return NextResponse.json(
    {
      code: "invalid_rfp_requirements_baseline_request",
      error:
        "candidates must be a non-empty array; each candidate needs nonblank text, at least one nonblank evidence id, and a valid category/priority when provided.",
    },
    { status: 400 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True when the value is one of the service's reviewable categories. */
function isRequirementCategory(
  value: unknown
): value is RfpRequirementCategory {
  return (
    typeof value === "string" &&
    (RFP_REQUIREMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/** True when the value is one of the service's reviewable priorities. */
function isRequirementPriority(
  value: unknown
): value is RfpRequirementPriority {
  return (
    typeof value === "string" &&
    (RFP_REQUIREMENT_PRIORITIES as readonly string[]).includes(value)
  );
}

/**
 * Validate ONE body candidate to the whitelisted six-field shape, or null
 * when invalid. Mirrors the service's deterministic candidate validation so
 * a body that passes here can never trip a service validation throw; every
 * other candidate field is stripped. Trimming, deduplication, and defaulting
 * stay in the service.
 */
function parseCandidate(
  value: unknown
): RfpRequirementsBaselineCandidateInput | null {
  if (!isRecord(value)) return null;
  const { text, category, priority, evidenceIds, title, notes } = value;
  if (typeof text !== "string" || text.trim() === "") return null;
  if (!Array.isArray(evidenceIds)) return null;
  const ids = evidenceIds.filter((id): id is string => typeof id === "string");
  if (!ids.some((id) => id.trim() !== "")) return null;

  const candidate: RfpRequirementsBaselineCandidateInput = {
    text,
    evidenceIds: ids,
  };
  if (category !== undefined && category !== null) {
    if (!isRequirementCategory(category)) return null;
    candidate.category = category;
  }
  if (priority !== undefined && priority !== null) {
    if (!isRequirementPriority(priority)) return null;
    candidate.priority = priority;
  }
  if (typeof title === "string") candidate.title = title;
  if (typeof notes === "string") candidate.notes = notes;
  return candidate;
}

/**
 * Validate the request body to { candidates: [...] }, or null when invalid.
 * candidates is the ONLY body field read.
 */
function parseCandidates(
  body: unknown
): RfpRequirementsBaselineCandidateInput[] | null {
  if (!isRecord(body)) return null;
  const raw = body.candidates;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const candidates: RfpRequirementsBaselineCandidateInput[] = [];
  for (const entry of raw) {
    const candidate = parseCandidate(entry);
    if (candidate === null) return null;
    candidates.push(candidate);
  }
  return candidates;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = requireAuth(request);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest();
  }
  const candidates = parseCandidates(body);
  if (candidates === null) return invalidRequest();

  try {
    const result = await createRfpRequirementsBaselineDraft({
      tenantId: session.tenantId,
      projectId: params.id,
      createdBy: session.userId,
      candidates,
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
    if (result.status === "evidence_not_found") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_evidence_not_found",
          error: "One or more cited evidence items were not found.",
          missingEvidenceIds: result.missingEvidenceIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "evidence_not_rfp_extraction") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_evidence_not_rfp_extraction",
          error:
            "One or more cited evidence items are not RFP extraction evidence.",
          evidence: result.evidence,
        },
        { status: 409 }
      );
    }
    if (result.status === "evidence_missing_input_package") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_evidence_missing_input_package",
          error:
            "One or more cited evidence items do not name their input package artifact.",
          evidence: result.evidence,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_artifact_not_found") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_input_package_not_found",
          error: "One or more cited input package artifacts were not found.",
          missingArtifactIds: result.missingArtifactIds,
        },
        { status: 409 }
      );
    }
    if (result.status === "artifact_not_input_package") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_artifact_not_input_package",
          error: "One or more cited artifacts are not input package artifacts.",
          artifacts: result.artifacts,
        },
        { status: 409 }
      );
    }
    if (result.status === "input_package_not_approved") {
      return NextResponse.json(
        {
          code: "rfp_requirements_baseline_input_package_not_approved",
          error: "One or more cited input package artifacts are not approved.",
          artifacts: result.artifacts,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { artifact: result.artifact, payloadSummary: result.payloadSummary },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        code: "rfp_requirements_baseline_failed",
        error: "Unable to create RFP requirements baseline draft.",
      },
      { status: 500 }
    );
  }
}
