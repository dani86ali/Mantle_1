"use client";

/**
 * Read-model-driven Project Quick BoM workspace page (Prompt 80, Prompt 96, Prompt 113, Prompt 123).
 *
 * GETs the read-only workspace from /api/projects/[id]/quick-bom and renders the
 * project summary, readiness, stages, latest spine artifacts, and approvals. It
 * never renders or depends on artifact payloads (the read model carries none).
 *
 * Prompt 96 wires the Quick BoM workflow actions on top of that read model. Every
 * action is a thin POST to a dedicated server route - the UI never prices, looks up
 * a catalog, resolves/replaces SKUs, decides configuration or rule packs, generates
 * a workbook, or approves silently. Actions:
 *   - upload+normalize: POST one "file" FormData to /files, then POST no body to
 *     /files/[fileId]/normalize, then reload the workspace.
 *   - create sku_resolution/configuration_expansion/priced_boq/export_package: POST
 *     no body to the matching /artifacts/[sourceId]/<segment> route, then reload.
 *     The default Quick BoM approved catalog is always used for sku_resolution; there
 *     is no catalog profile selector and no action sends a body.
 *   - priced_boq review: POST { decision, note? } to .../priced-boq/review.
 *   - export_package review: POST { artifactId, decision, note? } to /approvals.
 *   - sku_resolution / configuration_expansion while `needs_review` are NOT approved
 *     here - they require line-level review (the SKU panel and, Prompt 128, the
 *     configuration-expansion panel that POSTs one complete accept/reject batch to
 *     .../configuration-expansion/review). Once a line review mints a `generated`
 *     sku/config version, it is approved/rejected through the same generic /approvals
 *     route as export_package so the workflow can advance.
 *   - download: a plain anchor to the export-package/download route (no fetch).
 * Types come from the read-model module via `import type`, erased at compile time,
 * so no server/DB code reaches the client.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  ArtifactAuthorityProvenance,
  ProjectArtifactSummary,
  ProjectQuickBomWorkspace,
  QuickBomSpineArtifacts,
} from "@/lib/projects/project-quick-bom-workspace";
import type {
  QuickBomSkuResolutionReviewLine,
  QuickBomSkuResolutionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import type {
  QuickBomConfigExpansionReviewLine,
  QuickBomConfigExpansionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";
import type { QuickBomPricedBoqReviewWorkspace } from "@/lib/projects/project-quick-bom-pricing-review-workspace";

type Decision = "approved" | "rejected";

/** Quick BoM spine artifact slots, rendered in workflow order (section 11/11A). */
const SPINE_ORDER: Array<keyof QuickBomSpineArtifacts> = [
  "normalized_boq",
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "export_package",
];

/** Spine types whose generated/needs_review versions are approve/reject gated. */
const APPROVAL_GATED_TYPES: readonly string[] = [
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "export_package",
];

/** Artifact statuses an engineer may approve or reject. */
const REVIEWABLE_STATUSES: readonly string[] = ["generated", "needs_review"];

const LOAD_ERROR = "Unable to load this Quick BoM workspace.";
const APPROVAL_ERROR = "Unable to record this approval decision.";
const WORKFLOW_ERROR = "Unable to complete this workflow action.";
const MISSING_FILE_ERROR = "Select a BoQ file to upload first.";
const SKU_REVIEW_ERROR = "Unable to load or update the SKU line review.";
const CONFIG_REVIEW_ERROR =
  "Unable to load or submit the configuration expansion line review.";
const PRICED_REVIEW_ERROR = "Unable to load the priced BoQ review.";

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-success-muted text-success",
  needs_review: "bg-accent-muted text-accent",
  generated: "bg-blue-muted text-blue",
  rejected: "bg-destructive-muted text-destructive",
  stale: "bg-warning-muted text-warning",
  failed: "bg-destructive-muted text-destructive",
};

/** normalized_boq is intentionally excluded: it is never approval-gated here. */
function isReviewable(artifact: ProjectArtifactSummary): boolean {
  return (
    APPROVAL_GATED_TYPES.includes(artifact.type) &&
    REVIEWABLE_STATUSES.includes(artifact.status)
  );
}

function isConfigurationExpansionDraft(artifact: ProjectArtifactSummary): boolean {
  return (
    artifact.type === "configuration_expansion" &&
    artifact.status === "needs_review" &&
    artifact.sourceArtifactIds[2] === undefined
  );
}

/** Controlled error/code string from a parsed API body, else null. No stacks. */
function bodyMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error !== "") return record.error;
  if (typeof record.code === "string" && record.code !== "") return record.code;
  return null;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function ProvenanceBlock({
  artifactType,
  provenance,
}: {
  artifactType: string;
  provenance: ArtifactAuthorityProvenance;
}) {
  const { configurationAuthority: cfg, pricingAuthority: pricing } = provenance;
  if (!cfg && !pricing) return null;
  return (
    <div
      data-testid={`authority-provenance-${artifactType}`}
      className="mt-2 space-y-2 rounded border border-[var(--border)] bg-bg-card px-3 py-2 text-xs text-text-secondary"
    >
      {cfg && (
        <dl
          data-testid={`authority-config-${artifactType}`}
          className="space-y-0.5"
        >
          <dt className="font-semibold text-text-primary">Configuration authority</dt>
          <dd>Pack: {cfg.rulePackId} v{cfg.rulePackVersion} ({cfg.rulePackStatus})</dd>
          <dd>Scope: {cfg.scope} / pack source: {cfg.rulePackSourceScope}</dd>
          <dd>Approval: {cfg.approvalRecordId}</dd>
          <dd>
            Dispositions: {cfg.dispositionSummary.expandByApprovedRulePackCount} expanded,{" "}
            {cfg.dispositionSummary.preserveKnownRulePackChildCount} preserved (child),{" "}
            {cfg.dispositionSummary.preserveStandaloneCustomerLineCount} preserved (standalone),{" "}
            {cfg.dispositionSummary.deferUnknownRelationshipCount} deferred (unknown)
          </dd>
          <dd>
            Runtime AI: {cfg.runtimeAi ? "on" : "off"} | Replacement: {cfg.replacementAuthority ? "on" : "off"} |
            Substitution: {cfg.skuSubstitutionAuthority ? "on" : "off"} |
            Unknown deferred: {cfg.unknownRelationshipsDeferred ? "yes" : "no"} |
            Optics auto-attached: {cfg.attachesOpticsUnderSwitches ? "yes" : "no"}
          </dd>
        </dl>
      )}
      {pricing && (
        <dl
          data-testid={`authority-pricing-${artifactType}`}
          className="space-y-0.5"
        >
          <dt className="font-semibold text-text-primary">Pricing authority</dt>
          <dd>Profile: {pricing.profileId} | Source: {pricing.activeSource}</dd>
          <dd>Fixture: {pricing.activeSourceFixtureId} ({pricing.activeSourceStatus})</dd>
          <dd>Approval: {pricing.approvalRecordId}</dd>
          <dd>Currency: {pricing.currency} | Priced SKUs: {pricing.pricedSkuCount} | Missing: {pricing.missingPriceSkuCount}</dd>
          <dd>
            Deterministic fixture: {pricing.boundary.demoFixtureAuthority ? "yes" : "no"} |
            External GPL read: {pricing.boundary.activeRuntimeSourceReadsExternalGplCsv ? "yes" : "no"} |
            Production authority: {pricing.boundary.productionCiscoPricingAuthority ? "yes" : "no"} |
            Broad authority: {pricing.boundary.broadCiscoGeneralPricingAuthority ? "yes" : "no"} |
            Runtime AI: {pricing.boundary.runtimeAiPricing ? "on" : "off"} |
            Runtime catalog: {pricing.boundary.runtimeCatalogLookup ? "on" : "off"} |
            Config authority: {pricing.boundary.configurationAuthority ? "yes" : "no"} |
            Replacement: {pricing.boundary.replacementAuthority ? "yes" : "no"} |
            Substitution: {pricing.boundary.skuSubstitutionAuthority ? "yes" : "no"} |
            Missing reported: {pricing.boundary.missingPricesReported ? "yes" : "no"}
          </dd>
        </dl>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? "bg-[var(--border)] text-text-tertiary";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {humanize(status)}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-[var(--border)] bg-bg-card p-5">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

/** Spine create actions: each POSTs (no body) to its source artifact's route. */
interface CreateActionSpec {
  type: keyof QuickBomSpineArtifacts;
  source: keyof QuickBomSpineArtifacts;
  segment: string;
  requireApprovedSource: boolean;
}

const CREATE_ACTIONS: readonly CreateActionSpec[] = [
  { type: "sku_resolution", source: "normalized_boq", segment: "sku-resolution", requireApprovedSource: false },
  { type: "configuration_expansion", source: "sku_resolution", segment: "configuration-expansion", requireApprovedSource: true },
  { type: "priced_boq", source: "configuration_expansion", segment: "priced-boq", requireApprovedSource: true },
  { type: "export_package", source: "priced_boq", segment: "export-package", requireApprovedSource: true },
];

const APPROVE_BTN =
  "rounded-button bg-accent px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50";
const REJECT_BTN =
  "rounded-button border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50";

export default function ProjectQuickBomPage() {
  const params = useParams();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<ProjectQuickBomWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  // Prompt 127: minimal SKU line-review panel. Loaded on demand from the read-only
  // review route; null until the engineer clicks load (the main workspace stays
  // payload-free). Cleared after every successful review POST.
  const [skuReview, setSkuReview] = useState<QuickBomSkuResolutionReviewWorkspace | null>(null);
  const [skuReviewError, setSkuReviewError] = useState<string | null>(null);
  const [skuReviewBusy, setSkuReviewBusy] = useState(false);
  // Prompt 128: minimal configuration-expansion line-review panel. Loaded on demand
  // from the read-only review route (the main workspace stays payload-free). The
  // engineer marks every expansion line accept/reject; `configDecisions` tracks those
  // local choices keyed by lineId and the complete batch is POSTed on submit. Both are
  // cleared after a successful review POST.
  const [configReview, setConfigReview] = useState<QuickBomConfigExpansionReviewWorkspace | null>(null);
  const [configReviewError, setConfigReviewError] = useState<string | null>(null);
  const [configReviewBusy, setConfigReviewBusy] = useState(false);
  const [configDecisions, setConfigDecisions] = useState<
    Record<string, { action: "accept" | "reject"; note?: string }>
  >({});
  // Prompt 129: minimal read-only priced BoQ review panel. Loaded on demand from the
  // read-only review route (the main workspace stays payload-free). This panel never
  // POSTs - approval still happens only through the existing priced-BoQ approve/reject
  // buttons on the spine artifact.
  const [pricedReview, setPricedReview] = useState<QuickBomPricedBoqReviewWorkspace | null>(null);
  const [pricedReviewError, setPricedReviewError] = useState<string | null>(null);
  const [pricedReviewBusy, setPricedReviewBusy] = useState(false);

  // Memoized so the load effect and post-action reload share one stable reference;
  // dropping the useCallback would re-fire the effect every render (GET loop).
  const loadWorkspace = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/projects/${id}/quick-bom`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setWorkspace(null);
        setLoadError(bodyMessage(body) ?? LOAD_ERROR);
        return;
      }
      const next = (body as { workspace?: ProjectQuickBomWorkspace } | null)?.workspace;
      if (!next) {
        setWorkspace(null);
        setLoadError(LOAD_ERROR);
        return;
      }
      setWorkspace(next);
    } catch {
      setWorkspace(null);
      setLoadError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // Record one approve/reject decision against `url` with `payload`, then refresh.
  // Both the generic approvals route and the priced-boq review route return the
  // same { workspace: ProjectQuickBomWorkspaceResult } shape, so the refresh path
  // is shared: prefer the returned ok workspace, else re-GET.
  const submitDecision = useCallback(
    async (artifactId: string, url: string, payload: Record<string, unknown>): Promise<void> => {
      setApprovalError(null);
      setBusyArtifactId(artifactId);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setApprovalError(bodyMessage(body) ?? APPROVAL_ERROR);
          return;
        }
        const result = (body as { workspace?: unknown } | null)?.workspace;
        if (
          typeof result === "object" &&
          result !== null &&
          (result as { status?: unknown }).status === "ok" &&
          (result as { workspace?: unknown }).workspace
        ) {
          setWorkspace((result as { workspace: ProjectQuickBomWorkspace }).workspace);
        } else {
          await loadWorkspace();
        }
      } catch {
        setApprovalError(APPROVAL_ERROR);
      } finally {
        setBusyArtifactId(null);
      }
    },
    [loadWorkspace]
  );

  // Create one spine artifact from its source artifact id. The create routes take
  // no request body and return an artifact summary (not a workspace), so reload.
  const runCreate = useCallback(
    async (
      sourceArtifactId: string,
      segment: string,
      label: string
    ): Promise<void> => {
      setWorkflowError(null);
      setWorkflowStatus(`Creating ${label}...`);
      setWorkflowBusy(true);
      try {
        // Every create action posts no body; the default Quick BoM catalog is used.
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${sourceArtifactId}/${segment}`,
          { method: "POST" }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setWorkflowStatus(null);
          setWorkflowError(bodyMessage(body) ?? WORKFLOW_ERROR);
          return;
        }
        setWorkflowStatus(`${label} created.`);
        await loadWorkspace();
      } catch {
        setWorkflowStatus(null);
        setWorkflowError(WORKFLOW_ERROR);
      } finally {
        setWorkflowBusy(false);
      }
    },
    [id, loadWorkspace]
  );

  // Upload the selected BoQ file (one "file" FormData field), then normalize the
  // returned file id (no body), then reload. No file selected = no POST at all.
  const onUploadNormalize = useCallback(async (): Promise<void> => {
    if (!selectedFile) {
      setWorkflowStatus(null);
      setWorkflowError(MISSING_FILE_ERROR);
      return;
    }
    setWorkflowError(null);
    setWorkflowStatus("Uploading BoQ file...");
    setWorkflowBusy(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const uploadRes = await fetch(`/api/projects/${id}/quick-bom/files`, {
        method: "POST",
        body: form,
      });
      const uploadBody = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok) {
        setWorkflowStatus(null);
        setWorkflowError(bodyMessage(uploadBody) ?? WORKFLOW_ERROR);
        return;
      }
      const fileId = (uploadBody as { file?: { id?: unknown } } | null)?.file?.id;
      if (typeof fileId !== "string" || fileId === "") {
        setWorkflowStatus(null);
        setWorkflowError(WORKFLOW_ERROR);
        return;
      }
      setWorkflowStatus("Normalizing BoQ file...");
      const normRes = await fetch(
        `/api/projects/${id}/quick-bom/files/${fileId}/normalize`,
        { method: "POST" }
      );
      const normBody = await normRes.json().catch(() => null);
      if (!normRes.ok) {
        setWorkflowStatus(null);
        setWorkflowError(bodyMessage(normBody) ?? WORKFLOW_ERROR);
        return;
      }
      setWorkflowStatus("Normalized BoQ created.");
      await loadWorkspace();
    } catch {
      setWorkflowStatus(null);
      setWorkflowError(WORKFLOW_ERROR);
    } finally {
      setWorkflowBusy(false);
    }
  }, [id, selectedFile, loadWorkspace]);

  // GET the read-only SKU line-review projection for one sku_resolution artifact.
  // This is the only place the page fetches review lines; the main workspace read
  // model never carries them. Controlled errors only, never a stack.
  const loadSkuReview = useCallback(
    async (artifactId: string): Promise<void> => {
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${artifactId}/sku-resolution/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReview(null);
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomSkuResolutionReviewWorkspace } | null)
          ?.review;
        if (!review) {
          setSkuReview(null);
          setSkuReviewError(SKU_REVIEW_ERROR);
          return;
        }
        setSkuReview(review);
      } catch {
        setSkuReview(null);
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [id]
  );

  // POST exactly one explicit accept/reject action to the existing review route.
  // A successful POST mints a NEW sku_resolution version (new artifact id), so we
  // clear the panel and refresh the main workspace; the engineer re-loads to review
  // the fresh version. This is line review, not stage approval - nothing is approved
  // here. The body carries only { actions: [oneSanitizedAction] }; no tenant/project/
  // artifact/decidedBy/decidedAt/pricing/authority field is ever sent.
  const submitSkuReviewAction = useCallback(
    async (artifactId: string, action: Record<string, unknown>): Promise<void> => {
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${artifactId}/sku-resolution/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions: [action] }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        setSkuReview(null);
        await loadWorkspace();
      } catch {
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [id, loadWorkspace]
  );

  // GET the read-only configuration-expansion line-review projection for one draft
  // artifact. Resets any in-progress local decisions so a fresh load starts clean.
  // Controlled errors only, never a stack.
  const loadConfigReview = useCallback(
    async (artifactId: string): Promise<void> => {
      setConfigReviewError(null);
      setConfigReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${artifactId}/configuration-expansion/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setConfigReview(null);
          setConfigReviewError(bodyMessage(body) ?? CONFIG_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomConfigExpansionReviewWorkspace } | null)
          ?.review;
        if (!review) {
          setConfigReview(null);
          setConfigReviewError(CONFIG_REVIEW_ERROR);
          return;
        }
        setConfigDecisions({});
        setConfigReview(review);
      } catch {
        setConfigReview(null);
        setConfigReviewError(CONFIG_REVIEW_ERROR);
      } finally {
        setConfigReviewBusy(false);
      }
    },
    [id]
  );

  // POST one complete configuration-expansion review batch: exactly one explicit
  // decision per expansion line, in draft order, and none for customer lines. The
  // batch is built from the loaded lines (origin === "expansion") so a customer line
  // can never receive a decision; the body carries only { decisions: [...] } with each
  // decision sanitized to lineId/action/note. A successful POST mints a NEW reviewed
  // (non-draft) artifact, so we clear the panel and refresh the main workspace; the
  // artifact is never marked approved client-side. Nothing posts until every expansion
  // line has an explicit decision.
  const submitConfigReview = useCallback(
    async (artifactId: string): Promise<void> => {
      if (configReview === null) return;
      const expansionLines = configReview.lines.filter(
        (line) => line.origin === "expansion"
      );
      if (!expansionLines.every((line) => configDecisions[line.lineId] !== undefined)) {
        return;
      }
      const decisions = expansionLines.map((line) => {
        const decision = configDecisions[line.lineId];
        return {
          lineId: line.lineId,
          action: decision.action,
          ...(decision.note !== undefined ? { note: decision.note } : {}),
        };
      });
      setConfigReviewError(null);
      setConfigReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${artifactId}/configuration-expansion/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decisions }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setConfigReviewError(bodyMessage(body) ?? CONFIG_REVIEW_ERROR);
          return;
        }
        setConfigReview(null);
        setConfigDecisions({});
        await loadWorkspace();
      } catch {
        setConfigReviewError(CONFIG_REVIEW_ERROR);
      } finally {
        setConfigReviewBusy(false);
      }
    },
    [id, configReview, configDecisions, loadWorkspace]
  );

  // GET the read-only priced BoQ review projection for one priced_boq artifact. This
  // panel is read-only: it never POSTs. Priced-BoQ approval stays on the existing
  // approve/reject buttons (the per-artifact priced-boq review route). Controlled
  // errors only, never a stack.
  const loadPricedReview = useCallback(
    async (artifactId: string): Promise<void> => {
      setPricedReviewError(null);
      setPricedReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/quick-bom/artifacts/${artifactId}/priced-boq/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setPricedReview(null);
          setPricedReviewError(bodyMessage(body) ?? PRICED_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomPricedBoqReviewWorkspace } | null)?.review;
        if (!review) {
          setPricedReview(null);
          setPricedReviewError(PRICED_REVIEW_ERROR);
          return;
        }
        setPricedReview(review);
      } catch {
        setPricedReview(null);
        setPricedReviewError(PRICED_REVIEW_ERROR);
      } finally {
        setPricedReviewBusy(false);
      }
    },
    [id]
  );

  function promptNote(): string | undefined {
    const entered = window.prompt("Add an optional note for this rejection:");
    const trimmed = entered === null ? "" : entered.trim();
    return trimmed === "" ? undefined : trimmed;
  }

  // Accept one line by choosing exactly one of its existing suggestions. No SKU is
  // invented here - acceptedSku is always one the server already suggested.
  function onAcceptSkuLine(
    artifactId: string,
    line: QuickBomSkuResolutionReviewLine,
    acceptedSku: string
  ): void {
    void submitSkuReviewAction(artifactId, {
      decision: "accept",
      sourceFileId: line.sourceFileId,
      sourceRowNumber: line.sourceRowNumber,
      acceptedSku,
    });
  }

  // Reject one line; optionally attach a note. Never carries an acceptedSku.
  function onRejectSkuLine(
    artifactId: string,
    line: QuickBomSkuResolutionReviewLine
  ): void {
    const note = promptNote();
    void submitSkuReviewAction(artifactId, {
      decision: "reject",
      sourceFileId: line.sourceFileId,
      sourceRowNumber: line.sourceRowNumber,
      ...(note !== undefined ? { note } : {}),
    });
  }

  // Record an explicit accept for one expansion line locally. No POST happens here -
  // the complete batch is submitted only when every expansion line has been decided.
  function onAcceptConfigLine(line: QuickBomConfigExpansionReviewLine): void {
    setConfigDecisions((prev) => ({ ...prev, [line.lineId]: { action: "accept" } }));
  }

  // Record an explicit reject for one expansion line locally; optionally attach a note.
  function onRejectConfigLine(line: QuickBomConfigExpansionReviewLine): void {
    const note = promptNote();
    setConfigDecisions((prev) => ({
      ...prev,
      [line.lineId]: { action: "reject", ...(note !== undefined ? { note } : {}) },
    }));
  }

  function decisionPayload(artifactId: string, decision: Decision, note?: string) {
    // The generic /approvals route needs the artifactId in the body; it serves
    // export_package and the `generated` (reviewed) sku_resolution/configuration_expansion
    // versions. priced_boq uses its per-artifact route (id is in the URL).
    return { artifactId, decision, ...(note !== undefined ? { note } : {}) };
  }

  function onApproveGeneric(artifactId: string): void {
    void submitDecision(
      artifactId,
      `/api/projects/${id}/quick-bom/approvals`,
      decisionPayload(artifactId, "approved")
    );
  }

  function onRejectGeneric(artifactId: string): void {
    void submitDecision(
      artifactId,
      `/api/projects/${id}/quick-bom/approvals`,
      decisionPayload(artifactId, "rejected", promptNote())
    );
  }

  function onApprovePriced(artifactId: string): void {
    void submitDecision(
      artifactId,
      `/api/projects/${id}/quick-bom/artifacts/${artifactId}/priced-boq/review`,
      { decision: "approved" }
    );
  }

  function onRejectPriced(artifactId: string): void {
    const note = promptNote();
    void submitDecision(
      artifactId,
      `/api/projects/${id}/quick-bom/artifacts/${artifactId}/priced-boq/review`,
      { decision: "rejected", ...(note !== undefined ? { note } : {}) }
    );
  }

  // Per-artifact review control for the spine list. A `needs_review`
  // configuration_expansion draft is line-review-only. After the line review mints
  // a reviewed non-draft artifact, the reviewed artifact still awaits explicit
  // stage approval through the generic /approvals route.
  function reviewControls(artifact: ProjectArtifactSummary) {
    if (!isReviewable(artifact)) return null;
    const t = artifact.type;
    if (t === "sku_resolution" && artifact.status === "needs_review") {
      return (
        <span
          data-testid={`line-review-required-${t}`}
          className="text-xs text-text-secondary"
        >
          Line-level review required before approval.
        </span>
      );
    }
    if (isConfigurationExpansionDraft(artifact)) {
      return (
        <span
          data-testid={`line-review-required-${t}`}
          className="text-xs text-text-secondary"
        >
          Line-level review required before approval.
        </span>
      );
    }
    const usePriced = t === "priced_boq";
    return (
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`approve-${t}`}
          disabled={busyArtifactId === artifact.id}
          onClick={() => (usePriced ? onApprovePriced(artifact.id) : onApproveGeneric(artifact.id))}
          className={APPROVE_BTN}
        >
          Approve
        </button>
        <button
          type="button"
          data-testid={`reject-${t}`}
          disabled={busyArtifactId === artifact.id}
          onClick={() => (usePriced ? onRejectPriced(artifact.id) : onRejectGeneric(artifact.id))}
          className={REJECT_BTN}
        >
          Reject
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl space-y-3 p-6">
        <div className="skeleton h-8 w-72 rounded-card" />
        <div className="skeleton h-40 w-full rounded-card" />
        <div className="skeleton h-40 w-full rounded-card" />
      </main>
    );
  }

  if (loadError && !workspace) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div
          data-testid="load-error"
          className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive"
        >
          {loadError}
        </div>
      </main>
    );
  }

  if (!workspace) return null;

  const { project, readiness, stages, spineArtifacts, approvals } = workspace;
  const exportPkg = spineArtifacts.export_package;
  const skuResolution = spineArtifacts.sku_resolution;
  const configExpansion = spineArtifacts.configuration_expansion;
  const pricedBoq = spineArtifacts.priced_boq;
  const canCreate: Record<keyof QuickBomSpineArtifacts, boolean> = {
    normalized_boq: false,
    sku_resolution: readiness.canCreateSkuResolution,
    configuration_expansion: readiness.canCreateConfigurationExpansion,
    priced_boq: readiness.canCreatePricedBoq,
    export_package: readiness.canCreateExportPackage,
  };
  // Submit is blocked until every expansion line has an explicit accept/reject; an
  // empty array (vacuously true) is enabled only when the draft has no expansion lines.
  const configExpansionLines = configReview
    ? configReview.lines.filter((line) => line.origin === "expansion")
    : [];
  const allConfigExpansionDecided = configExpansionLines.every(
    (line) => configDecisions[line.lineId] !== undefined
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Quick BoM workspace
        </p>
        <h1 data-testid="project-name" className="text-lg font-semibold text-text-primary">
          {project.name}
        </h1>
        {project.customerName && (
          <p data-testid="customer-name" className="mt-1 text-sm text-text-secondary">
            Customer: {project.customerName}
          </p>
        )}
      </header>

      {approvalError && (
        <div
          data-testid="approval-error"
          className="rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
        >
          {approvalError}
        </div>
      )}

      <Card title="Project">
        <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-text-tertiary">Project ID</dt>
            <dd data-testid="project-id" className="font-mono text-text-secondary">
              {project.id}
            </dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Tenant</dt>
            <dd data-testid="project-tenant" className="font-mono text-text-secondary">
              {project.tenantId}
            </dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Mode</dt>
            <dd data-testid="project-mode" className="text-text-secondary">
              {humanize(project.mode)}
            </dd>
          </div>
          {project.pricingConfig && (
            <div>
              <dt className="text-text-tertiary">Pricing</dt>
              <dd data-testid="pricing-config" className="text-text-secondary">
                {project.pricingConfig.currency} {humanize(project.pricingConfig.mode)}{" "}
                {project.pricingConfig.ratePercent}% / VAT{" "}
                {project.pricingConfig.vatRatePercent}% / {project.pricingConfig.roundingDecimals} dp
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Readiness">
        <div data-testid="readiness-messages" className="mt-2 space-y-1">
          {readiness.messages.map((message, index) => (
            <p key={index} className="text-sm text-text-secondary">
              {message}
            </p>
          ))}
        </div>
        <ol className="mt-3 space-y-2">
          {readiness.steps.map((step) => (
            <li
              key={step.stepId}
              data-testid="readiness-step"
              className="rounded-button border border-[var(--border)] p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {humanize(step.stepId)}
                </span>
                <StatusBadge status={step.status} />
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">{step.message}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Stages">
        <ol className="mt-2 space-y-1">
          {stages.map((stage) => (
            <li
              key={stage.id}
              data-testid="stage-row"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-text-primary">{humanize(stage.stageId)}</span>
              <StatusBadge status={stage.status} />
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Quick BoM artifacts">
        <ol className="mt-2 space-y-2">
          {SPINE_ORDER.map((type) => {
            const artifact = spineArtifacts[type];
            return (
              <li
                key={type}
                data-testid={`spine-${type}`}
                className="rounded-button border border-[var(--border)] p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary">{humanize(type)}</span>
                  {artifact ? (
                    <StatusBadge status={artifact.status} />
                  ) : (
                    <span className="text-xs text-text-tertiary">not created</span>
                  )}
                </div>
                {artifact && (
                  <>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-text-secondary">version {artifact.version}</span>
                      {reviewControls(artifact)}
                    </div>
                    {artifact.authorityProvenance && (
                      <ProvenanceBlock
                        artifactType={artifact.type}
                        provenance={artifact.authorityProvenance}
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {skuResolution && skuResolution.status === "needs_review" && (
        <Card title="SKU line review">
          <p className="mt-2 text-xs text-text-secondary">
            Accept one suggested SKU per line or reject the line. Every decision is an
            explicit, server-recorded action - nothing is auto-accepted or auto-rejected.
          </p>
          <button
            type="button"
            data-testid="sku-review-load"
            disabled={skuReviewBusy}
            onClick={() => void loadSkuReview(skuResolution.id)}
            className={`mt-3 ${APPROVE_BTN}`}
          >
            Load SKU review lines
          </button>
          {skuReviewError && (
            <div
              data-testid="sku-review-error"
              className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
            >
              {skuReviewError}
            </div>
          )}
          {skuReview && (
            <div className="mt-3 space-y-3">
              <p
                data-testid="sku-review-summary"
                className="text-xs text-text-secondary"
              >
                {skuReview.reviewSummary.totalLineCount} lines:{" "}
                {skuReview.reviewSummary.needsReviewCount} need review,{" "}
                {skuReview.reviewSummary.acceptedCount} accepted,{" "}
                {skuReview.reviewSummary.rejectedCount} rejected,{" "}
                {skuReview.reviewSummary.unresolvedCount} unresolved
              </p>
              <ol className="space-y-2">
                {skuReview.lines.map((line) => (
                  <li
                    key={`${line.sourceFileId}::${line.sourceRowNumber}`}
                    data-testid="sku-review-line"
                    className="rounded-button border border-[var(--border)] p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {line.originalSku}
                      </span>
                      <StatusBadge status={line.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      Source row {line.sourceRowNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Suggestions:{" "}
                      {line.suggestions.length === 0
                        ? "none"
                        : line.suggestions.map((s) => s.suggestedSku).join(", ")}
                    </p>
                    {line.status === "needs_review" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {line.suggestions.map((suggestion) => (
                          <button
                            key={suggestion.suggestedSku}
                            type="button"
                            data-testid="sku-review-accept"
                            disabled={skuReviewBusy}
                            onClick={() =>
                              onAcceptSkuLine(
                                skuResolution.id,
                                line,
                                suggestion.suggestedSku
                              )
                            }
                            className={APPROVE_BTN}
                          >
                            Accept {suggestion.suggestedSku}
                          </button>
                        ))}
                        <button
                          type="button"
                          data-testid="sku-review-reject"
                          disabled={skuReviewBusy}
                          onClick={() => onRejectSkuLine(skuResolution.id, line)}
                          className={REJECT_BTN}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {configExpansion && isConfigurationExpansionDraft(configExpansion) && (
        <Card title="Configuration expansion line review">
          <p className="mt-2 text-xs text-text-secondary">
            Accept or reject every expansion line. Customer lines are read-only. All
            expansion lines must be decided before the batch can be submitted.
          </p>
          <button
            type="button"
            data-testid="config-review-load"
            disabled={configReviewBusy}
            onClick={() => void loadConfigReview(configExpansion.id)}
            className={`mt-3 ${APPROVE_BTN}`}
          >
            Load configuration expansion review lines
          </button>
          {configReviewError && (
            <div
              data-testid="config-review-error"
              className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
            >
              {configReviewError}
            </div>
          )}
          {configReview && (
            <div className="mt-3 space-y-3">
              <p
                data-testid="config-review-summary"
                className="text-xs text-text-secondary"
              >
                {configReview.reviewSummary.totalLineCount} lines:{" "}
                {configReview.reviewSummary.customerLineCount} customer,{" "}
                {configReview.reviewSummary.expansionLineCount} expansion,{" "}
                {configReview.reviewSummary.requiresDecisionCount} require decision,{" "}
                {configReview.reviewSummary.includedItemCount} included items
              </p>
              <ol className="space-y-2">
                {configReview.lines.map((line) => {
                  const decision = configDecisions[line.lineId];
                  return (
                    <li
                      key={line.lineId}
                      data-testid="config-review-line"
                      className="rounded-button border border-[var(--border)] p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {line.sku}
                        </span>
                        <span className="text-xs text-text-tertiary capitalize">
                          {line.origin}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-secondary">{line.description}</p>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        Qty: {line.quantity}
                        {line.relationshipType ? ` | ${humanize(line.relationshipType)}` : ""}
                        {line.sourceRuleId ? ` | rule: ${line.sourceRuleId}` : ""}
                        {line.evidenceCount > 0
                          ? ` | evidence: ${line.evidenceCount} (${line.evidenceSourceTypes.join(", ")})`
                          : ""}
                      </p>
                      {line.origin === "expansion" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="config-review-accept"
                            disabled={configReviewBusy}
                            onClick={() => onAcceptConfigLine(line)}
                            className={`${APPROVE_BTN}${decision?.action === "accept" ? " ring-2 ring-accent" : ""}`}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            data-testid="config-review-reject"
                            disabled={configReviewBusy}
                            onClick={() => onRejectConfigLine(line)}
                            className={`${REJECT_BTN}${decision?.action === "reject" ? " ring-2 ring-destructive/50" : ""}`}
                          >
                            Reject
                          </button>
                          {decision && (
                            <span className="text-xs text-text-secondary">
                              {decision.action}
                              {decision.note ? `: ${decision.note}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                data-testid="config-review-submit"
                disabled={configReviewBusy || !allConfigExpansionDecided}
                onClick={() => void submitConfigReview(configExpansion.id)}
                className={`${APPROVE_BTN}`}
              >
                Submit configuration expansion review
              </button>
            </div>
          )}
        </Card>
      )}

      {pricedBoq && pricedBoq.status === "needs_review" && (
        <Card title="Priced BoQ review">
          <p className="mt-2 text-xs text-text-secondary">
            Inspect priced BoQ lines, SAR totals, and pricing warnings before approval.
            This is a read-only view - use the Approve / Reject controls above to record
            the decision.
          </p>
          <button
            type="button"
            data-testid="priced-review-load"
            disabled={pricedReviewBusy}
            onClick={() => void loadPricedReview(pricedBoq.id)}
            className={`mt-3 ${APPROVE_BTN}`}
          >
            Load priced BoQ review
          </button>
          {pricedReviewError && (
            <div
              data-testid="priced-review-error"
              className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
            >
              {pricedReviewError}
            </div>
          )}
          {pricedReview && (
            <div className="mt-3 space-y-3">
              <p
                data-testid="priced-review-summary"
                className="text-xs text-text-secondary"
              >
                {pricedReview.reviewSummary.totalLineCount} lines:{" "}
                {pricedReview.reviewSummary.pricedLineCount} priced,{" "}
                {pricedReview.reviewSummary.unpricedLineCount} unpriced,{" "}
                {pricedReview.reviewSummary.missingPriceCount} missing price,{" "}
                {pricedReview.reviewSummary.warningCount} warnings | Totals:{" "}
                {pricedReview.payloadSummary.pricingSummary.totals.currency}{" "}
                {pricedReview.payloadSummary.pricingSummary.totals.subtotalSellPriceSar} sell +{" "}
                {pricedReview.payloadSummary.pricingSummary.totals.vatAmountSar} VAT ={" "}
                {pricedReview.payloadSummary.pricingSummary.totals.totalIncVatSar} inc VAT
              </p>
              <ol className="space-y-2">
                {pricedReview.lines.map((line, index) => (
                  <li
                    key={`${line.sourceFileId}::${line.sourceRowNumber}::${index}`}
                    data-testid="priced-review-line"
                    className="rounded-button border border-[var(--border)] p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {line.acceptedSku ?? line.originalSku}
                      </span>
                      <StatusBadge status={line.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary">{line.description}</p>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      SKU: {line.originalSku}
                      {line.acceptedSku ? ` -> ${line.acceptedSku}` : ""} | Qty:{" "}
                      {line.quantity}
                    </p>
                    {line.amounts && (
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {line.amounts.currency} {line.amounts.unitSellPriceSar} unit sell x{" "}
                        {line.amounts.quantity} = {line.amounts.extendedSellPriceSar} +{" "}
                        {line.amounts.vatAmountSar} VAT = {line.amounts.totalIncVatSar} inc
                        VAT
                      </p>
                    )}
                    {line.warning && (
                      <p className="mt-0.5 text-xs text-warning">{line.warning}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      <Card title="Workflow actions">
        {workflowError && (
          <div
            data-testid="workflow-error"
            className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
          >
            {workflowError}
          </div>
        )}
        {workflowStatus && (
          <div
            data-testid="workflow-status"
            className="mt-3 rounded-card border border-[var(--border)] p-3 text-sm text-text-secondary"
          >
            {workflowStatus}
          </div>
        )}

        <div className="mt-3 space-y-2">
          <label className="text-xs font-medium text-text-tertiary" htmlFor="workflow-upload-file">
            Upload a BoQ file (.xlsx or .csv)
          </label>
          <input
            id="workflow-upload-file"
            type="file"
            data-testid="workflow-upload-file"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-text-secondary"
          />
          <button
            type="button"
            data-testid="workflow-upload-normalize"
            disabled={workflowBusy}
            onClick={() => void onUploadNormalize()}
            className={APPROVE_BTN}
          >
            Upload and normalize BoQ
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {CREATE_ACTIONS.map((action) => {
            const source = spineArtifacts[action.source];
            if (source === null || !canCreate[action.type]) return null;
            if (action.requireApprovedSource && source.status !== "approved") return null;
            const label = humanize(action.type);
            return (
              <button
                key={action.type}
                type="button"
                data-testid={`workflow-create-${action.type}`}
                disabled={workflowBusy}
                onClick={() => void runCreate(source.id, action.segment, label)}
                className={APPROVE_BTN}
              >
                Create {label}
              </button>
            );
          })}
        </div>

        {exportPkg && exportPkg.status === "approved" && (
          <div className="mt-4">
            <a
              data-testid="download-export_package"
              href={`/api/projects/${id}/quick-bom/artifacts/${exportPkg.id}/export-package/download`}
              className="inline-block rounded-button bg-accent px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-hover"
            >
              Download export package
            </a>
          </div>
        )}
      </Card>

      <Card title="Approvals">
        {approvals.length === 0 ? (
          <p className="mt-2 text-sm text-text-tertiary">No approval decisions recorded.</p>
        ) : (
          <ol className="mt-2 space-y-1">
            {approvals.map((approval) => (
              <li
                key={approval.id}
                data-testid="approval-row"
                className="text-sm text-text-secondary"
              >
                <span className="font-medium text-text-primary">
                  {humanize(approval.decision)}
                </span>{" "}
                on {approval.artifactId} (version {approval.artifactVersion}) by{" "}
                {approval.decidedBy}
                {approval.note ? ` - ${approval.note}` : ""}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </main>
  );
}
