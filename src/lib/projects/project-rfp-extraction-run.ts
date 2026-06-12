/**
 * RFP input-package extraction run service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Runs the deterministic prompt-177 extraction boundary over every source
 * file referenced by ONE approved input_package artifact version, then
 * applies a deterministic extraction quality gate (pure arithmetic on the
 * extraction metrics; no business interpretation). The artifact's
 * sourceFileIds list is the only extraction authority: caller-supplied file
 * lists and the Project aggregate's files are never trusted, and every
 * referenced file is loaded by exact id, tenant scoped, before any
 * extraction starts. This module never reads file bytes or storage paths
 * itself - the extraction module is the only byte-level boundary - and it
 * persists nothing: no artifact versions, no approvals, no evidence rows
 * (later prompts persist evidence and expose inspection). No OCR, no AI, no
 * requirement interpretation or compliance classification, and no
 * SKU/catalog/pricing/configuration logic. Returned summaries are lean and
 * serializable: ISO dates, copied arrays, no payload, no tenantId, never a
 * storagePath. The quality report also carries structured warning and
 * blocking-issue details derived from the raw warning strings and failure
 * reasons by pure string matching; warnings (merged cells included) never
 * fail a file. Inputs, loaded rows, and extractor results are never mutated.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { getProjectFileById } from "@/lib/db/project-file-store";
import {
  extractRfpDocumentFile,
  type ExtractRfpDocumentFileResult,
  type RfpExtractedDocument,
} from "@/lib/projects/rfp-document-extraction";
import type {
  Project,
  ProjectArtifact,
  ProjectFile,
  ProjectFileRole,
} from "@/types/project";

/** The only artifact type / stage this extraction run accepts as its input. */
const RFP_INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const RFP_INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/** Input for {@link runRfpInputPackageExtraction}. */
export interface RunRfpInputPackageExtractionInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version; identity is this id only. */
  inputPackageArtifactId: string;
  /** Per-file extractor override for tests; defaults to the prompt-177 module. */
  extractor?: (file: ProjectFile) => Promise<ExtractRfpDocumentFileResult>;
}

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpExtractionRunProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpExtractionRunArtifactSummary {
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

/** Why one source file failed the deterministic extraction quality gate. */
export type RfpExtractionFileFailureReason =
  | "unsupported_extension"
  | "extractor_failed"
  | "no_extractable_text_or_tables";

/** Copied prompt-177 metrics; all zero when no document was extracted. */
export type RfpExtractionFileMetrics = RfpExtractedDocument["metrics"];

interface RfpExtractionFileQualityBase {
  fileId: string;
  fileName: string;
  fileRole: ProjectFileRole;
  metrics: RfpExtractionFileMetrics;
  /** This file's extractor warnings, unprefixed; empty when none extracted. */
  warnings: string[];
}

/** Per-file quality verdict; never carries a storagePath. */
export type RfpExtractionFileQualitySummary =
  | (RfpExtractionFileQualityBase & { quality: "passed" })
  | (RfpExtractionFileQualityBase & {
      quality: "failed";
      reason: RfpExtractionFileFailureReason;
    });

/** Severity of a structured warning detail; warnings never fail a file. */
export type RfpExtractionWarningSeverity = "warning";

/** Deterministic category derived from the raw warning string alone. */
export type RfpExtractionWarningCategory =
  | "merged_cells"
  | "table_extraction_failed"
  | "parser_warning"
  | "extractor_warning";

/**
 * One structured warning review aid: file identity, the raw warning string,
 * and its deterministic category, plus the sheet/range location parsed from
 * an xlsx merged-cells warning. Lean and JSON-serializable: never table
 * rows, payloads, stacks, or storage paths.
 */
export interface RfpExtractionWarningDetail {
  fileId: string;
  fileName: string;
  fileRole: ProjectFileRole;
  /** The raw per-file extractor warning string, unprefixed. */
  warning: string;
  category: RfpExtractionWarningCategory;
  severity: RfpExtractionWarningSeverity;
  /** Workbook sheet parsed from an xlsx_merged_cells warning. */
  sheetName?: string;
  /** A1-style cell range parsed from an xlsx_merged_cells warning. */
  range?: string;
}

/**
 * One structured blocking issue per quality-failed file: a review aid beside
 * the per-file `quality`/`reason` contract, never a replacement for it.
 */
export interface RfpExtractionBlockingIssue {
  fileId: string;
  fileName: string;
  fileRole: ProjectFileRole;
  reason: RfpExtractionFileFailureReason;
  severity: "blocking";
  /** Short stable engineer-facing message; never a thrown error or path. */
  message: string;
}

/** Deterministic aggregate quality gate over the whole extraction run. */
export interface RfpExtractionQualityReport {
  /** "passed" only when EVERY source file passed its per-file gate. */
  status: "passed" | "failed";
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  totalTextChars: number;
  totalNonWhitespaceTextChars: number;
  totalTables: number;
  totalTableRows: number;
  /** Stable `<fileId>:<warning>` strings, in source file order. */
  warnings: string[];
  /** Structured warning details, file order then warning order in the file. */
  warningDetails: RfpExtractionWarningDetail[];
  /** One issue per quality-failed file, in source file order. */
  blockingIssues: RfpExtractionBlockingIssue[];
}

/** Discriminated result of {@link runRfpInputPackageExtraction}. */
export type RunRfpInputPackageExtractionResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpExtractionRunProjectSummary }
  | { status: "input_package_not_found" }
  | {
      status: "artifact_not_input_package";
      artifact: RfpExtractionRunArtifactSummary;
    }
  | {
      status: "input_package_not_approved";
      artifact: RfpExtractionRunArtifactSummary;
    }
  | {
      status: "input_package_has_no_source_files";
      artifact: RfpExtractionRunArtifactSummary;
    }
  | { status: "source_file_not_found"; missingFileId: string }
  | {
      status: "ok";
      artifact: RfpExtractionRunArtifactSummary;
      /** One verdict per artifact source file, in sourceFileIds order. */
      files: RfpExtractionFileQualitySummary[];
      /**
       * One document per file the extractor returned `extracted` for (even a
       * quality-failed empty one), in the same order. The extraction boundary
       * guarantees documents never include storagePath.
       */
      documents: RfpExtractedDocument[];
      quality: RfpExtractionQualityReport;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpExtractionRunProjectSummary {
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

/** Project the loaded artifact to a serializable summary; arrays are copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpExtractionRunArtifactSummary {
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

/** Failed verdict for a file the extractor produced no document for. */
function toFailedFileQuality(
  file: ProjectFile,
  reason: RfpExtractionFileFailureReason
): RfpExtractionFileQualitySummary {
  return {
    fileId: file.id,
    fileName: file.fileName,
    fileRole: file.fileRole,
    quality: "failed",
    reason,
    metrics: {
      textCharCount: 0,
      nonWhitespaceTextCharCount: 0,
      tableCount: 0,
      tableRowCount: 0,
    },
    warnings: [],
  };
}

/** Gate one extracted document: any nonwhitespace text OR any table row passes. */
function toExtractedFileQuality(
  file: ProjectFile,
  document: RfpExtractedDocument
): RfpExtractionFileQualitySummary {
  const base: RfpExtractionFileQualityBase = {
    fileId: file.id,
    fileName: file.fileName,
    fileRole: file.fileRole,
    metrics: { ...document.metrics },
    warnings: document.warnings.slice(),
  };
  if (
    document.metrics.nonWhitespaceTextCharCount > 0 ||
    document.metrics.tableRowCount > 0
  ) {
    return { ...base, quality: "passed" };
  }
  return { ...base, quality: "failed", reason: "no_extractable_text_or_tables" };
}

/** xlsx merged-range warning prefix; the rest is `<sheetName>:<A1Range>`. */
const XLSX_MERGED_CELLS_WARNING_PREFIX = "xlsx_merged_cells:";

/** Exact warnings meaning a format's table pass failed but its text was kept. */
const TABLE_EXTRACTION_FAILED_WARNINGS: readonly string[] = [
  "pdf_table_extraction_failed",
  "docx_table_extraction_failed",
];

/** Prefixes of warnings the underlying document parsers emit. */
const PARSER_WARNING_PREFIXES: readonly string[] = [
  "docx_parser_warning:",
  "csv_parser_warning:",
];

/** Stable engineer-facing message per per-file failure reason. */
const BLOCKING_ISSUE_MESSAGES: Record<RfpExtractionFileFailureReason, string> = {
  unsupported_extension: "File extension is not supported for extraction.",
  extractor_failed: "File could not be parsed by the extractor.",
  no_extractable_text_or_tables: "File has no extractable text or table rows.",
};

/**
 * Categorize one raw warning by pure string matching. Excel forbids ":" in
 * sheet names, so the first ":" after the merged-cells prefix splits sheet
 * from range; both location fields are omitted unless both are nonempty.
 */
function toWarningDetail(
  file: RfpExtractionFileQualitySummary,
  warning: string
): RfpExtractionWarningDetail {
  const detail: RfpExtractionWarningDetail = {
    fileId: file.fileId,
    fileName: file.fileName,
    fileRole: file.fileRole,
    warning,
    category: "extractor_warning",
    severity: "warning",
  };
  if (warning.startsWith(XLSX_MERGED_CELLS_WARNING_PREFIX)) {
    detail.category = "merged_cells";
    const location = warning.slice(XLSX_MERGED_CELLS_WARNING_PREFIX.length);
    const split = location.indexOf(":");
    if (split > 0 && split < location.length - 1) {
      detail.sheetName = location.slice(0, split);
      detail.range = location.slice(split + 1);
    }
  } else if (TABLE_EXTRACTION_FAILED_WARNINGS.includes(warning)) {
    detail.category = "table_extraction_failed";
  } else if (PARSER_WARNING_PREFIXES.some((p) => warning.startsWith(p))) {
    detail.category = "parser_warning";
  }
  return detail;
}

/** Blocking review aid for one failed file; quality/reason stay authoritative. */
function toBlockingIssue(
  file: Extract<RfpExtractionFileQualitySummary, { quality: "failed" }>
): RfpExtractionBlockingIssue {
  return {
    fileId: file.fileId,
    fileName: file.fileName,
    fileRole: file.fileRole,
    reason: file.reason,
    severity: "blocking",
    message: BLOCKING_ISSUE_MESSAGES[file.reason],
  };
}

/** Pure arithmetic aggregate over the per-file verdicts, in file order. */
function buildQualityReport(
  files: readonly RfpExtractionFileQualitySummary[]
): RfpExtractionQualityReport {
  const report: RfpExtractionQualityReport = {
    status: "passed",
    totalFiles: files.length,
    passedFiles: 0,
    failedFiles: 0,
    totalTextChars: 0,
    totalNonWhitespaceTextChars: 0,
    totalTables: 0,
    totalTableRows: 0,
    warnings: [],
    warningDetails: [],
    blockingIssues: [],
  };
  for (const file of files) {
    if (file.quality === "passed") {
      report.passedFiles += 1;
    } else {
      report.failedFiles += 1;
      report.blockingIssues.push(toBlockingIssue(file));
    }
    report.totalTextChars += file.metrics.textCharCount;
    report.totalNonWhitespaceTextChars += file.metrics.nonWhitespaceTextCharCount;
    report.totalTables += file.metrics.tableCount;
    report.totalTableRows += file.metrics.tableRowCount;
    for (const warning of file.warnings) {
      report.warnings.push(`${file.fileId}:${warning}`);
      report.warningDetails.push(toWarningDetail(file, warning));
    }
  }
  if (report.failedFiles > 0) report.status = "failed";
  return report;
}

/**
 * Run deterministic extraction over every source file referenced by ONE
 * EXACT approved input_package artifact version, tenant scoped on every
 * store call. Validates a nonblank inputPackageArtifactId before any store
 * call (deterministic programmer error). Gates in order: project existence,
 * rfp mode, exact artifact existence, input_package type within the
 * intake_package_review stage, approved status, nonempty sourceFileIds.
 * Every referenced file is then loaded by exact id; the first dangling
 * reference aborts the run before ANY extraction. Files are extracted in
 * artifact sourceFileIds order; an unsupported extension or an extractor
 * exception becomes a stable failed per-file verdict (never a thrown stack
 * or a storagePath) instead of failing the run. Unexpected store errors
 * bubble to the caller.
 */
export async function runRfpInputPackageExtraction(
  input: RunRfpInputPackageExtractionInput
): Promise<RunRfpInputPackageExtractionResult> {
  if (
    !input.inputPackageArtifactId ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }

  const { tenantId, projectId, inputPackageArtifactId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(
    tenantId,
    projectId,
    inputPackageArtifactId
  );
  if (artifact === null) return { status: "input_package_not_found" };
  if (
    artifact.type !== RFP_INPUT_PACKAGE_ARTIFACT_TYPE ||
    artifact.stageId !== RFP_INPUT_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_input_package",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (artifact.status !== "approved") {
    return {
      status: "input_package_not_approved",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (artifact.sourceFileIds.length === 0) {
    return {
      status: "input_package_has_no_source_files",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Load EVERY referenced file before any extraction so one dangling
  // reference aborts the run with zero partial extraction work.
  const sourceFiles: ProjectFile[] = [];
  for (const fileId of artifact.sourceFileIds) {
    const file = await getProjectFileById(tenantId, projectId, fileId);
    if (file === null) {
      return { status: "source_file_not_found", missingFileId: fileId };
    }
    sourceFiles.push(file);
  }

  const extractor =
    input.extractor ?? ((file: ProjectFile) => extractRfpDocumentFile({ file }));
  const files: RfpExtractionFileQualitySummary[] = [];
  const documents: RfpExtractedDocument[] = [];
  for (const file of sourceFiles) {
    let extracted: ExtractRfpDocumentFileResult;
    try {
      extracted = await extractor(file);
    } catch {
      // Corrupt file / parser error: a stable verdict, never the thrown
      // error, which could carry a stack trace or the storage path.
      files.push(toFailedFileQuality(file, "extractor_failed"));
      continue;
    }
    if (extracted.status === "unsupported_extension") {
      files.push(toFailedFileQuality(file, "unsupported_extension"));
      continue;
    }
    documents.push(extracted.document);
    files.push(toExtractedFileQuality(file, extracted.document));
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    files,
    documents,
    quality: buildQualityReport(files),
  };
}
