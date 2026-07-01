/**
 * Pure, deterministic RFP HLD intake-question DRAFTING PROMPT serializer
 * (Stage 6H-0D).
 *
 * Serializes a transient {@link RfpHldIntakeQuestionnaireDraftingInput} into a
 * provider-neutral prompt/input payload ({ system, user }) for a LATER drafting
 * executor. It is pure and contract-only: NO provider/AI/network call, NO DB/file
 * read, NO env access, NO persistence, NO route/UI work. It wires NO provider.
 *
 * The system instruction restricts the model to proposing CANDIDATE HLD intake
 * questions only and to emitting strict JSON shaped exactly { "questions": [...] }.
 * The user payload is a strict WHITELIST of drafting-input fields, including the
 * approved design-knowledge content blocks mirrored field-by-field with their
 * source-chain proof. It carries no answers, no design/topology decision, no
 * pricing/SKU/catalog/configuration decision, no raw text, no file/storage handle,
 * no tenant identity, no provider data, and no smuggled extra field.
 *
 * Imports EXACTLY the drafting-input contract - the DKP content-block shape is
 * derived from the bundle type, not imported.
 */
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
  type RfpHldIntakeQuestionnaireDraftingInput,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";

/**
 * Fixed system instruction for the later provider adapter. Frames every drafting
 * run as candidate-only, source-bound, strict-JSON, and gated by deterministic
 * validation plus human engineer review.
 */
export const RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT: string = [
  "You draft CANDIDATE HLD intake questions only. Output is candidate-only and",
  "unapproved.",
  "Work ONLY from the supplied drafting input. Never invent source ids, domains,",
  "provenance, guidance, or authority.",
  'Respond with strict JSON only, shaped EXACTLY as { "questions": [ ... ] }: no',
  "markdown, no code fences, no prose wrapper, and no other top-level key.",
  "Each questions entry asks ONE design-intake question the engineer will later",
  "answer; it is never an answer itself.",
  "Never output engineer answers, validation, approvals, artifact metadata or",
  "status, HLD designs, diagrams, or documents.",
  "Never output technical-proposal, proposal, or export deliverable content.",
  "Never output pricing, SKU, catalog, or configuration decisions.",
  "Never output provider, request, or model details.",
  "Never claim Cisco, CVD, BOMATIC, or AI certified or final authority.",
  "Deterministic validation and human engineer review remain the hard gates.",
].join("\n");

/** One approved design-knowledge content block carried in the drafting input. */
type RfpHldIntakeQuestionnaireDraftingKnowledgeContent =
  RfpHldIntakeQuestionnaireDraftingInput["designKnowledgePackContents"][number];

/** One provenance source reference carried in the drafting input. */
type RfpHldIntakeQuestionnaireDraftingSourceRefField =
  RfpHldIntakeQuestionnaireDraftingInput["sourceRefs"][number];

/** One bounded approved-artifact context block carried in the drafting input. */
type RfpHldIntakeQuestionnaireDraftingApprovedSourceContextField =
  RfpHldIntakeQuestionnaireDraftingInput["approvedSourceContexts"][number];

/**
 * The whitelisted user payload, built with explicit, stable key ordering. Mirrors
 * only fields already present on the drafting-input bundle; any field smuggled
 * onto the bundle (or onto a nested block) is structurally excluded.
 */
export interface RfpHldIntakeQuestionnaireDraftingUserPayload {
  payloadKind: RfpHldIntakeQuestionnaireDraftingInput["payloadKind"];
  createdBy: RfpHldIntakeQuestionnaireDraftingInput["createdBy"];
  createdAt: RfpHldIntakeQuestionnaireDraftingInput["createdAt"];
  sourceArtifactIds: RfpHldIntakeQuestionnaireDraftingInput["sourceArtifactIds"];
  sourceRefs: RfpHldIntakeQuestionnaireDraftingSourceRefField[];
  approvedSourceContexts: RfpHldIntakeQuestionnaireDraftingApprovedSourceContextField[];
  designKnowledgePackContents: RfpHldIntakeQuestionnaireDraftingKnowledgeContent[];
  instructions: RfpHldIntakeQuestionnaireDraftingInput["instructions"];
}

/** Provider-neutral prompt/input payload for a later drafting executor. */
export interface RfpHldIntakeQuestionnaireDraftingRequest {
  system: string;
  user: string;
}

/** Deep, fresh, JSON-safe copy; never aliases the input. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Serialize a transient drafting-input bundle into a provider-neutral
 * { system, user } request. The `user` string is JSON.stringify of an explicitly
 * key-ordered whitelist of bundle fields - nothing else; the approved
 * design-knowledge content blocks and the provenance source refs are mirrored
 * field-by-field with their source-chain proof. Pure: no provider/AI/network/DB/
 * file/env work; persists nothing. Throws only on programmer misuse (wrong
 * payloadKind on the supplied bundle).
 */
export function buildRfpHldIntakeQuestionnaireDraftingRequest(
  bundle: RfpHldIntakeQuestionnaireDraftingInput
): RfpHldIntakeQuestionnaireDraftingRequest {
  if (
    bundle === null ||
    typeof bundle !== "object" ||
    bundle.payloadKind !== RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND
  ) {
    throw new Error(
      "bundle must be an rfp_hld_intake_questionnaire_drafting_input bundle."
    );
  }

  // Explicit construction = stable key ordering and a hard whitelist. Any field
  // smuggled onto the bundle is structurally excluded.
  const payload: RfpHldIntakeQuestionnaireDraftingUserPayload = {
    payloadKind: bundle.payloadKind,
    createdBy: bundle.createdBy,
    createdAt: bundle.createdAt,
    sourceArtifactIds: cloneJson(bundle.sourceArtifactIds),
    // Explicit per-field mirror: a field smuggled onto a source ref is excluded.
    sourceRefs: (bundle.sourceRefs ?? []).map(
      (ref): RfpHldIntakeQuestionnaireDraftingSourceRefField => ({
        refId: ref.refId,
        artifactId: ref.artifactId,
        artifactType: ref.artifactType,
        stageId: ref.stageId,
        status: ref.status,
        version: ref.version,
        payloadKind: ref.payloadKind,
        label: ref.label,
      })
    ),
    // Explicit per-field mirror: any field smuggled onto a context block is
    // structurally excluded, and each block keeps its source-chain proof plus its
    // bounded summary/excerpts (never a raw dump, path, handle, or authority field).
    approvedSourceContexts: (bundle.approvedSourceContexts ?? []).map(
      (context): RfpHldIntakeQuestionnaireDraftingApprovedSourceContextField => ({
        contextKind: context.contextKind,
        sourceRefId: context.sourceRefId,
        artifactId: context.artifactId,
        artifactType: context.artifactType,
        stageId: context.stageId,
        status: context.status,
        version: context.version,
        ...(context.payloadKind !== undefined
          ? { payloadKind: context.payloadKind }
          : {}),
        label: context.label,
        summary: context.summary,
        excerpts: context.excerpts.slice(),
      })
    ),
    // Explicit per-field mirror (not a wholesale clone): any field smuggled onto a
    // content block is structurally excluded, and each block keeps its source
    // chain proof (artifactId + version + payloadKind + domain).
    designKnowledgePackContents: (bundle.designKnowledgePackContents ?? []).map(
      (content): RfpHldIntakeQuestionnaireDraftingKnowledgeContent => ({
        contentKind: content.contentKind,
        artifactId: content.artifactId,
        artifactType: content.artifactType,
        stageId: content.stageId,
        status: content.status,
        version: content.version,
        payloadKind: content.payloadKind,
        domain: content.domain,
        title: content.title,
        source: content.source,
        designPrinciples: content.designPrinciples.slice(),
        topologyGuidance: content.topologyGuidance.slice(),
        constraints: content.constraints.slice(),
        assumptions: content.assumptions.slice(),
        exclusions: content.exclusions.slice(),
        validationNotes: content.validationNotes.slice(),
        entryCount: content.entryCount,
        sectionCounts: { ...content.sectionCounts },
      })
    ),
    instructions: {
      candidateOnly: bundle.instructions.candidateOnly,
      targetPayloadKind: bundle.instructions.targetPayloadKind,
      forbidden: bundle.instructions.forbidden.slice(),
    },
  };

  return {
    system: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}
