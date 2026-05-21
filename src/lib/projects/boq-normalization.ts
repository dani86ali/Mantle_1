/**
 * Narrow Project-domain service: turn one recorded BoQ file into a versioned
 * `normalized_boq` artifact for the Quick BoM `boq_format_validation` stage.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 7, 13, 15).
 *
 * This module only COMPOSES three narrow primitives: the Project file
 * repository (read the recorded file), the locked BoQ file loader (normalize
 * its contents), and the artifact repository (persist one new version). It does
 * NO catalog/SKU lookup, pricing, approvals, evidence creation, staleness
 * propagation, or stage-status updates - those belong to later prompts. It does
 * not import engines, the catalog, or any API/UI code, and never mutates its
 * input, the loaded file object, or the loaded lines.
 */
import { getProjectFileById } from "@/lib/db/project-file-store";
import { createProjectArtifactVersion } from "@/lib/db/project-artifact-store";
import {
  loadProjectBoqFile,
  type LoadedProjectBoq,
} from "@/lib/projects/boq-file-loader";
import type {
  BoqInputFormat,
  CanonicalBoqLine,
  ProjectArtifact,
} from "@/types/project";

/** Thrown when the (tenant, project, file) triple resolves to no recorded file. */
const MISSING_FILE_MESSAGE = "Project BoQ file not found.";

/** Thrown when the recorded file's role is not `boq`. */
const NON_BOQ_ROLE_MESSAGE =
  "Project file is not recorded as a BoQ/BoM file.";

/**
 * JSONB payload stored on the `normalized_boq` artifact. Declared as a type
 * alias (not an interface) so it carries an implicit index signature and is
 * assignable to the repository's `Record<string, unknown>` payload. Mirrors the
 * loaded result minus any storage reference: the uploaded workbook stays the
 * legal source evidence (section 7), so no `storagePath` leaks into the artifact.
 */
export type NormalizedBoqArtifactPayload = {
  sourceFileId: string;
  sourceFileName: string;
  /** Set for `.xlsx` (the matched worksheet); omitted for `.csv`. */
  sourceSheetName?: string;
  lineCount: number;
  /** Unique source formats across the lines, in first-seen order. */
  sourceFormats: BoqInputFormat[];
  /** Canonical lines in original/customer order. */
  lines: CanonicalBoqLine[];
};

/** Input for {@link normalizeProjectBoqFile}. */
export interface NormalizeProjectBoqFileInput {
  tenantId: string;
  projectId: string;
  fileId: string;
}

/** The created artifact plus the exact payload it was created with. */
export interface NormalizeProjectBoqFileResult {
  artifact: ProjectArtifact;
  payload: NormalizedBoqArtifactPayload;
}

/** Collect unique `sourceFormat` values across lines, preserving first-seen order. */
function collectSourceFormats(
  lines: readonly CanonicalBoqLine[]
): BoqInputFormat[] {
  const seen = new Set<BoqInputFormat>();
  const formats: BoqInputFormat[] = [];
  for (const line of lines) {
    if (seen.has(line.sourceFormat)) continue;
    seen.add(line.sourceFormat);
    formats.push(line.sourceFormat);
  }
  return formats;
}

/**
 * Build the `normalized_boq` payload from a loaded BoQ. Pure: derives counts and
 * unique formats and shallow-copies the lines array (preserving order) so the
 * payload never aliases the loaded result; the loaded lines are not mutated.
 * `sourceSheetName` is included only when the loaded result carries one.
 */
export function buildNormalizedBoqArtifactPayload(
  loaded: LoadedProjectBoq
): NormalizedBoqArtifactPayload {
  return {
    sourceFileId: loaded.sourceFileId,
    sourceFileName: loaded.sourceFileName,
    ...(loaded.sourceSheetName !== undefined
      ? { sourceSheetName: loaded.sourceSheetName }
      : {}),
    lineCount: loaded.lines.length,
    sourceFormats: collectSourceFormats(loaded.lines),
    lines: [...loaded.lines],
  };
}

/**
 * Normalize one recorded Project BoQ file into a new `normalized_boq` artifact
 * version. Reads the recorded file (throwing the exact missing/role messages),
 * normalizes its contents with the locked loader (whose invalid-format error
 * bubbles unchanged), builds the payload, and creates exactly one artifact in
 * the `boq_format_validation` stage with `status: "generated"`, sourced from the
 * file only. Returns the created artifact and the payload. Does not mutate input.
 */
export async function normalizeProjectBoqFile(
  input: NormalizeProjectBoqFileInput
): Promise<NormalizeProjectBoqFileResult> {
  const { tenantId, projectId, fileId } = input;

  const file = await getProjectFileById(tenantId, projectId, fileId);
  if (!file) throw new Error(MISSING_FILE_MESSAGE);
  if (file.fileRole !== "boq") throw new Error(NON_BOQ_ROLE_MESSAGE);

  const loaded = loadProjectBoqFile({ file });
  const payload = buildNormalizedBoqArtifactPayload(loaded);

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "boq_format_validation",
    type: "normalized_boq",
    status: "generated",
    payload,
    sourceFileIds: [file.id],
    sourceArtifactIds: [],
  });

  return { artifact, payload };
}
