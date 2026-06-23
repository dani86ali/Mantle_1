/**
 * RFP HLD design knowledge-pack inspection read model (Stage 6A.1a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Read-only engineer inspection over `design_knowledge_pack` artifact versions. The
 * list returns lean artifact summaries plus identifier/count payload summaries
 * (never the content strings). The detail returns one exact artifact version with
 * whitelisted, sanitized content - the human-authored guidance MAY be shown because
 * it is a reviewable artifact, not raw document text. It writes nothing, approves
 * nothing, reads no file/evidence stores, runs no AI, makes no SKU/pricing/catalog/
 * config/design decision, and never surfaces tenant ids, file/source/storage paths,
 * evidence bodies, or arbitrary payload keys.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS,
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE,
  type RfpHldDesignKnowledgePackSectionCounts,
  type RfpHldDesignKnowledgePackSectionId,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack";

const KNOWLEDGE_PACK_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "design_knowledge_pack";
const KNOWLEDGE_PACK_STAGE_ID: ProjectArtifact["stageId"] =
  "hld_design_delta_review";

const SECTION_IDS: readonly RfpHldDesignKnowledgePackSectionId[] =
  RFP_HLD_DESIGN_KNOWLEDGE_PACK_SECTIONS.map((s) => s.sectionId);

export interface RfpHldDesignKnowledgePackInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignKnowledgePackInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary: provenance and counts only, never the content strings. */
export interface RfpHldDesignKnowledgePackInspectionPayloadSummary {
  payloadKind: string;
  source: string;
  createdBy: string;
  createdAt: string;
  domain: string;
  title: string;
  entryCount: number;
  sectionCounts: RfpHldDesignKnowledgePackSectionCounts;
}

export interface RfpHldDesignKnowledgePackInspectionListItem
  extends RfpHldDesignKnowledgePackInspectionArtifactSummary {
  payloadSummary: RfpHldDesignKnowledgePackInspectionPayloadSummary;
}

export interface LoadRfpHldDesignKnowledgePackListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDesignKnowledgePackListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDesignKnowledgePackInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpHldDesignKnowledgePackInspectionProjectSummary;
      artifacts: RfpHldDesignKnowledgePackInspectionListItem[];
      artifactCount: number;
    };

/** Sanitized detail payload: only whitelisted fields, content trimmed/filtered. */
export interface RfpHldDesignKnowledgePackInspectionDetailPayload {
  payloadKind: string;
  source: string;
  createdBy: string;
  createdAt: string;
  domain: string;
  title: string;
  designPrinciples: string[];
  topologyGuidance: string[];
  constraints: string[];
  assumptions: string[];
  exclusions: string[];
  validationNotes: string[];
  entryCount: number;
  sectionCounts: RfpHldDesignKnowledgePackSectionCounts;
}

export interface LoadRfpHldDesignKnowledgePackDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDesignKnowledgePackDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpHldDesignKnowledgePackInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_design_knowledge_pack";
      artifact: RfpHldDesignKnowledgePackInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDesignKnowledgePackInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDesignKnowledgePackInspectionProjectSummary;
      artifact: RfpHldDesignKnowledgePackInspectionArtifactSummary;
      pack: RfpHldDesignKnowledgePackInspectionDetailPayload;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Sanitize one list section: keep only trimmed nonblank string entries. */
function sanitizeSection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed !== "") out.push(trimmed);
  }
  return out;
}

function emptySectionCounts(): RfpHldDesignKnowledgePackSectionCounts {
  return {
    designPrinciples: 0,
    topologyGuidance: 0,
    constraints: 0,
    assumptions: 0,
    exclusions: 0,
    validationNotes: 0,
  };
}

function toProjectSummary(
  project: Project
): RfpHldDesignKnowledgePackInspectionProjectSummary {
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

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDesignKnowledgePackInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Lean payload summary: counts only, never the content strings. */
function toPayloadSummary(
  payload: unknown
): RfpHldDesignKnowledgePackInspectionPayloadSummary {
  const record = toRecord(payload);
  const sectionCounts = emptySectionCounts();
  for (const sectionId of SECTION_IDS) {
    sectionCounts[sectionId] = sanitizeSection(record[sectionId]).length;
  }
  const entryCount = SECTION_IDS.reduce(
    (sum, id) => sum + sectionCounts[id],
    0
  );
  return {
    payloadKind: asString(record.payloadKind),
    source: asString(record.source),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    domain: asString(record.domain),
    title: asString(record.title),
    entryCount,
    sectionCounts,
  };
}

function toListItem(
  artifact: ProjectArtifact
): RfpHldDesignKnowledgePackInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

export async function loadRfpHldDesignKnowledgePackList(
  input: LoadRfpHldDesignKnowledgePackListInput
): Promise<LoadRfpHldDesignKnowledgePackListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(
    tenantId,
    projectId,
    KNOWLEDGE_PACK_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === KNOWLEDGE_PACK_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

export async function loadRfpHldDesignKnowledgePackDetail(
  input: LoadRfpHldDesignKnowledgePackDetailInput
): Promise<LoadRfpHldDesignKnowledgePackDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }

  const { tenantId, projectId, artifactId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== KNOWLEDGE_PACK_ARTIFACT_TYPE ||
    artifact.stageId !== KNOWLEDGE_PACK_STAGE_ID
  ) {
    return {
      status: "artifact_not_design_knowledge_pack",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  const title = asString(payload.title).trim();
  if (
    payload.payloadKind !== RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND ||
    title === ""
  ) {
    return {
      status: "invalid_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const sectionCounts = emptySectionCounts();
  const sections = {} as Record<RfpHldDesignKnowledgePackSectionId, string[]>;
  let entryCount = 0;
  for (const sectionId of SECTION_IDS) {
    const sanitized = sanitizeSection(payload[sectionId]);
    sections[sectionId] = sanitized;
    sectionCounts[sectionId] = sanitized.length;
    entryCount += sanitized.length;
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    pack: {
      payloadKind: RFP_HLD_DESIGN_KNOWLEDGE_PACK_PAYLOAD_KIND,
      // Whitelisted source: echo only the known literal, never an arbitrary value.
      source:
        payload.source === RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE
          ? RFP_HLD_DESIGN_KNOWLEDGE_PACK_SOURCE
          : asString(payload.source),
      createdBy: asString(payload.createdBy),
      createdAt: asString(payload.createdAt),
      domain: asString(payload.domain),
      title,
      designPrinciples: sections.designPrinciples,
      topologyGuidance: sections.topologyGuidance,
      constraints: sections.constraints,
      assumptions: sections.assumptions,
      exclusions: sections.exclusions,
      validationNotes: sections.validationNotes,
      entryCount,
      sectionCounts,
    },
  };
}
