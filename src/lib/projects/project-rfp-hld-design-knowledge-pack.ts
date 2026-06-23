/**
 * Deterministic RFP HLD design knowledge-pack creation service (Stage 6A.1a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Persists ONE reviewable `design_knowledge_pack` artifact (status `needs_review`)
 * on the existing `hld_design_delta_review` stage from human-authored design
 * knowledge for a single design domain. This is HLD readiness FOUNDATION, not HLD
 * generation: the pack is curated guidance an engineer types, captured against a
 * fixed local section catalog so HLD work later consumes structured guidance.
 *
 * AUTHORITY BOUNDARY: the content is human-authored, so the created artifact carries
 * EMPTY sourceFileIds/sourceArtifactIds and a payload `source` of manual_operator_entry
 * - it is derived from no raw file and no upstream artifact payload. This service runs
 * no AI and makes no SKU/pricing/catalog/validation/configuration/design decision: it
 * only trims, validates against the local domain + section catalog, and writes. It
 * imports exactly the project store, the artifact store, the domain-readiness contract,
 * and canonical project types - no file/evidence store, no fs/path, no pricing/SKU/
 * catalog/config authority, no AI/provider, no route or UI module.
 */
import { getProjectById } from "@/lib/db/project-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import {
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  type RfpHldDesignDomain,
} from "@/lib/projects/project-rfp-hld-domain-readiness";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/**
 * Re-export the canonical payload-kind literal from this knowledge-pack contract.
 * The single source of truth stays project-rfp-hld-domain-readiness; the inspection
 * and approval services (and their purity tests) consume it from here so they need
 * not import the domain-readiness module directly.
 */
export { RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND };

/** The only `source` value a human-authored design knowledge pack may carry. */
export const RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE =
  "manual_operator_entry" as const;

/** Stable list-section ids; the order here is the canonical persisted order. */
export type RfpHldDesignKnowledgePackSectionId =
  | "designPrinciples"
  | "topologyGuidance"
  | "constraints"
  | "assumptions"
  | "exclusions"
  | "validationNotes";

/** A catalog section: its stable id and the canonical label persisted with it. */
export interface RfpHldDesignKnowledgePackSection {
  sectionId: RfpHldDesignKnowledgePackSectionId;
  label: string;
}

/** The fixed local section catalog; the order here is the canonical order. */
export const RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS: readonly RfpHldDesignKnowledgePackSection[] =
  [
    { sectionId: "designPrinciples", label: "Design principles" },
    { sectionId: "topologyGuidance", label: "Topology guidance" },
    { sectionId: "constraints", label: "Constraints" },
    { sectionId: "assumptions", label: "Assumptions" },
    { sectionId: "exclusions", label: "Exclusions" },
    { sectionId: "validationNotes", label: "Validation notes" },
  ];

const SECTION_IDS: readonly RfpHldDesignKnowledgePackSectionId[] =
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS.map((s) => s.sectionId);

const KNOWN_DOMAINS: ReadonlySet<string> = new Set(
  RFP_HLD_DESIGN_DOMAIN_DEFINITIONS.map((d) => d.domain)
);

/** Per-section entry tally carried on the payload and the result summary. */
export type RfpHldDesignKnowledgePackSectionCounts = Record<
  RfpHldDesignKnowledgePackSectionId,
  number
>;

/**
 * The persisted `design_knowledge_pack` payload (full content lives here, not in
 * the result). Exported for type-only consumers (inspection/approval); it is an
 * object type alias so it stays assignable to Record<string, unknown>.
 */
export type RfpHldDesignKnowledgePackPayload = {
  payloadKind: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND;
  source: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE;
  createdBy: string;
  createdAt: string;
  domain: RfpHldDesignDomain;
  title: string;
  designPrinciples: string[];
  topologyGuidance: string[];
  constraints: string[];
  assumptions: string[];
  exclusions: string[];
  validationNotes: string[];
  entryCount: number;
  sectionCounts: RfpHldDesignKnowledgePackSectionCounts;
};

/** Caller-supplied content for one knowledge pack. */
export interface CreateRfpHldDesignKnowledgePackInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  domain: string;
  title: string;
  designPrinciples?: unknown;
  topologyGuidance?: unknown;
  constraints?: unknown;
  assumptions?: unknown;
  exclusions?: unknown;
  validationNotes?: unknown;
  /** Optional fixed timestamp for deterministic tests; defaults to now. */
  createdAt?: Date;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
export interface RfpHldDesignKnowledgePackProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied (empty) source arrays, no payload. */
export interface RfpHldDesignKnowledgePackArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance and counts only, never the content strings. */
export interface RfpHldDesignKnowledgePackPayloadSummary {
  payloadKind: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND;
  source: typeof RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE;
  createdBy: string;
  createdAt: string;
  domain: RfpHldDesignDomain;
  title: string;
  entryCount: number;
  sectionCounts: RfpHldDesignKnowledgePackSectionCounts;
}

/** Discriminated result of {@link createRfpHldDesignKnowledgePack}. */
export type CreateRfpHldDesignKnowledgePackResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignKnowledgePackProjectSummary }
  | {
      status: "ok";
      artifact: RfpHldDesignKnowledgePackArtifactSummary;
      payloadSummary: RfpHldDesignKnowledgePackPayloadSummary;
    };

/**
 * A known request-derived validation failure. A later route maps this (and only
 * this) to HTTP 400; unexpected errors bubble. Use {@link isRfpHldDesignKnowledgePackValidationError}
 * to detect it without a cross-module instanceof hazard.
 */
export class RfpHldDesignKnowledgePackValidationError extends Error {
  readonly isRfpHldDesignKnowledgePackValidationError = true as const;
  constructor(message: string) {
    super(message);
    this.name = "RfpHldDesignKnowledgePackValidationError";
  }
}

/** Predicate for the request-derived validation error (instanceof-safe). */
export function isRfpHldDesignKnowledgePackValidationError(
  error: unknown
): error is RfpHldDesignKnowledgePackValidationError {
  return (
    error instanceof RfpHldDesignKnowledgePackValidationError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { isRfpHldDesignKnowledgePackValidationError?: unknown })
        .isRfpHldDesignKnowledgePackValidationError === true)
  );
}

function fail(message: string): never {
  throw new RfpHldDesignKnowledgePackValidationError(message);
}

/** Trim a value to a string, or "" when it is not a string. */
function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize one list section: require an array of strings, trim each entry, and
 * drop blank entries. Throws a validation error (before any store call) on a
 * non-array section or a non-string entry.
 */
function normalizeSection(
  section: RfpHldDesignKnowledgePackSection,
  raw: unknown
): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    fail(`Section ${section.sectionId} must be an array of strings.`);
  }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      fail(`Section ${section.sectionId} entries must be strings.`);
    }
    const trimmed = entry.trim();
    if (trimmed !== "") out.push(trimmed);
  }
  return out;
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpHldDesignKnowledgePackProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignKnowledgePackArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Project the payload to a lean summary: provenance and counts, never content. */
function toPayloadSummary(
  payload: RfpHldDesignKnowledgePackPayload
): RfpHldDesignKnowledgePackPayloadSummary {
  return {
    payloadKind: payload.payloadKind,
    source: payload.source,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    domain: payload.domain,
    title: payload.title,
    entryCount: payload.entryCount,
    sectionCounts: { ...payload.sectionCounts },
  };
}

/**
 * Create ONE `needs_review` `design_knowledge_pack` artifact on
 * `hld_design_delta_review` from human-authored design knowledge. Blank identifiers,
 * an unknown domain, a blank title, malformed list sections, or a pack with no
 * meaningful entry are rejected with a validation error BEFORE any store call. The
 * project is verified within its tenant (not_found / wrong_mode, lean summary that
 * never leaks tenantId) before the single write. The persisted payload is built
 * field by field from the local catalog so caller authority/path/body junk cannot
 * leak. Returns lean summaries only; the full content stays in the persisted payload.
 */
export async function createRfpHldDesignKnowledgePack(
  input: CreateRfpHldDesignKnowledgePackInput
): Promise<CreateRfpHldDesignKnowledgePackResult> {
  const projectId = asTrimmed(input.projectId);
  const createdBy = asTrimmed(input.createdBy);
  if (projectId === "") fail("A design knowledge pack requires a projectId.");
  if (createdBy === "") fail("A design knowledge pack requires a createdBy.");

  const domain = asTrimmed(input.domain);
  if (!KNOWN_DOMAINS.has(domain)) {
    fail(`Unknown design domain: ${domain === "" ? "(blank)" : domain}.`);
  }
  const title = asTrimmed(input.title);
  if (title === "") fail("A design knowledge pack requires a nonblank title.");

  // Build each list section field by field from the local catalog.
  const sections = {} as Record<RfpHldDesignKnowledgePackSectionId, string[]>;
  const sectionCounts = {} as RfpHldDesignKnowledgePackSectionCounts;
  let entryCount = 0;
  for (const section of RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS) {
    const normalized = normalizeSection(section, input[section.sectionId]);
    sections[section.sectionId] = normalized;
    sectionCounts[section.sectionId] = normalized.length;
    entryCount += normalized.length;
  }
  if (entryCount === 0) {
    fail("A design knowledge pack requires at least one nonblank entry.");
  }

  const project = await getProjectById(input.tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const createdAt = (input.createdAt ?? new Date()).toISOString();
  // Built field by field: nothing from the request leaks beyond these keys.
  const payload: RfpHldDesignKnowledgePackPayload = {
    payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
    source: RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE,
    createdBy,
    createdAt,
    domain: domain as RfpHldDesignDomain,
    title,
    designPrinciples: sections.designPrinciples,
    topologyGuidance: sections.topologyGuidance,
    constraints: sections.constraints,
    assumptions: sections.assumptions,
    exclusions: sections.exclusions,
    validationNotes: sections.validationNotes,
    entryCount,
    sectionCounts,
  };

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId: input.tenantId,
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "needs_review",
    payload,
    sourceFileIds: [],
    sourceArtifactIds: [],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}

/** The canonical section ids, in persisted order (read-only export). */
export const RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTION_IDS = SECTION_IDS;
