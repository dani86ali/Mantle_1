/**
 * Read-only FINAL HLD document authority DOWNLOAD service (Stage 6H-0I-D / G3).
 *
 * Serves the approved final draw.io XML body as a downloadable attachment ONLY once
 * {@link selectRfpHldFinalAuthority} reports `status: "ok"` - i.e. the selected
 * approved `hld_document` (an SE-approved generated output or an SE manual upload)
 * re-proves against its persisted payload and source chain. This is authority
 * CONSUMPTION only: it generates, regenerates, approves,
 * closes, or exports nothing; creates no artifact/approval; calls no provider/AI;
 * reads no raw source file; and makes no pricing/SKU/catalog/configuration decision.
 *
 * The full validated payload never leaves this module: only the exact validated
 * `payload.drawioXml` bytes plus stable, server-derived download metadata are
 * returned. The download filename is canonical and header-safe
 * (`BOMATIC-HLD-<safe-label>-v<version>.<drawio|xml>`); it is NEVER the raw uploaded
 * filename - only the extension is derived from the validated upload. Non-ok selector
 * statuses are mapped through without weakening them, and no draw.io XML is ever
 * attached to a blocked result.
 *
 * This service imports only the final-authority selector/types and the standard
 * `TextEncoder`. It imports no store, approval service, filesystem, route, AI/provider,
 * catalog, pricing, configuration, or raw-parser module, and mutates nothing.
 */
import {
  selectRfpHldFinalAuthority,
  type RfpHldFinalAuthorityProjectSummary,
  type RfpHldFinalAuthorityArtifactSummary,
  type RfpHldFinalAuthorityPayloadSummary,
  type RfpHldFinalAuthorityNotFinalizedCode,
  type RfpHldFinalAuthorityStaleCode,
  type RfpHldFinalAuthorityStatus,
} from "@/lib/projects/project-rfp-hld-document-final-authority";

/** Stable draw.io / mxfile MIME for the served final-HLD XML body. */
export const RFP_HLD_DOCUMENT_MIME = "application/vnd.jgraph.mxfile" as const;

/** Maximum length of the sanitized customer/project label inside the download filename. */
const MAX_LABEL_LENGTH = 48;

export interface LoadProjectRfpHldDocumentDownloadInput {
  tenantId: string;
  projectId: string;
}

/** Lean, sanitized final-authority summary served alongside the bytes. Never the payload. */
export interface RfpHldDocumentDownloadAuthoritySummary {
  artifact: RfpHldFinalAuthorityArtifactSummary;
  payloadSummary: RfpHldFinalAuthorityPayloadSummary;
  finalAuthorityStatus: RfpHldFinalAuthorityStatus;
}

export type LoadProjectRfpHldDocumentDownloadResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldFinalAuthorityProjectSummary }
  | {
      status: "not_finalized";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityNotFinalizedCode;
      latestArtifact?: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "stale_final_authority";
      project: RfpHldFinalAuthorityProjectSummary;
      blockerCode: RfpHldFinalAuthorityStaleCode;
      artifact: RfpHldFinalAuthorityArtifactSummary;
    }
  | {
      status: "ok";
      /** The exact validated draw.io XML bytes; no other markup source. */
      bytes: Uint8Array;
      mimeType: typeof RFP_HLD_DOCUMENT_MIME;
      /** Canonical, header-safe filename; never the raw uploaded filename. */
      filename: string;
      contentLength: number;
      /** Sanitized authority summary; NEVER the full payload / drawio body. */
      finalAuthority: RfpHldDocumentDownloadAuthoritySummary;
    };

/**
 * Sanitize a customer/project label into a short, professional, ASCII-safe filename
 * token: trim, replace every non-alphanumeric run with a single "-", collapse duplicate
 * "-", trim leading/trailing "-", cap at {@link MAX_LABEL_LENGTH}, and fall back to
 * "Project" when empty. Deterministic and derived only from server-side Project metadata.
 */
function sanitizeLabel(value: string): string {
  const collapsed = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const capped = collapsed.slice(0, MAX_LABEL_LENGTH).replace(/-+$/g, "");
  return capped === "" ? "Project" : capped;
}

/**
 * Derive only the file extension from the validated uploaded draw.io filename. The
 * payload validator already pinned it to `.drawio` or `.xml`; anything else falls back
 * to `drawio`. The raw filename itself is NEVER used as the served header value.
 */
function deriveExtension(uploadedFileName: string): "drawio" | "xml" {
  return /\.xml$/i.test(uploadedFileName) ? "xml" : "drawio";
}

/**
 * Build a canonical, header-safe download filename from server-derived identity only:
 * `BOMATIC-HLD-<safe-label>-v<version>.<ext>`, where `<safe-label>` is the sanitized
 * customer name (falling back to the project name, then "Project"), `<version>` is the
 * approved artifact version, and `<ext>` is derived from the validated upload. It never
 * echoes the raw uploaded filename, the artifact id, or any payload body.
 */
function buildDownloadFilename(
  project: RfpHldFinalAuthorityProjectSummary,
  version: number,
  uploadedFileName: string
): string {
  const label = sanitizeLabel(project.customerName ?? project.name ?? "Project");
  const ext = deriveExtension(uploadedFileName);
  return `BOMATIC-HLD-${label}-v${version}.${ext}`;
}

/**
 * Load the FINAL HLD authority download for an RFP project, tenant scoped. Delegates
 * all gating to {@link selectRfpHldFinalAuthority} (project existence, rfp mode, final
 * approval, payload/source-chain re-proof) and maps every non-ok status through
 * verbatim, never attaching draw.io XML to a blocked result. On `ok` it encodes the
 * exact validated `payload.drawioXml` to bytes and returns them with a stable MIME, a
 * canonical server-derived filename, the byte length, and the sanitized authority
 * summary. It never returns the full payload, mutates nothing, and is read-only.
 */
export async function loadProjectRfpHldDocumentDownload(
  input: LoadProjectRfpHldDocumentDownloadInput
): Promise<LoadProjectRfpHldDocumentDownloadResult> {
  const { tenantId, projectId } = input;

  const result = await selectRfpHldFinalAuthority({ tenantId, projectId });

  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "wrong_mode") {
    return { status: "wrong_mode", project: result.project };
  }
  if (result.status === "not_finalized") {
    return {
      status: "not_finalized",
      project: result.project,
      blockerCode: result.blockerCode,
      ...(result.latestArtifact !== undefined
        ? { latestArtifact: result.latestArtifact }
        : {}),
    };
  }
  if (result.status === "stale_final_authority") {
    return {
      status: "stale_final_authority",
      project: result.project,
      blockerCode: result.blockerCode,
      artifact: result.artifact,
    };
  }

  const bytes = new TextEncoder().encode(result.payload.drawioXml);
  return {
    status: "ok",
    bytes,
    mimeType: RFP_HLD_DOCUMENT_MIME,
    filename: buildDownloadFilename(
      result.project,
      result.authority.artifact.version,
      result.authority.payloadSummary.uploadedFileName
    ),
    contentLength: bytes.byteLength,
    finalAuthority: result.authority,
  };
}
