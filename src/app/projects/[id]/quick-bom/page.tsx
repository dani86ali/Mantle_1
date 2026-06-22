"use client";

/**
 * Read-model-driven Project Quick BoM workspace page (Prompt 80, Prompt 96, Prompt 113, Prompt 123, Prompt 153).
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
 *   - SKU line review (Prompt 153): besides per-line accept/reject and the same-SKU
 *     batch accept, lines carrying a read-model reject/defer recommendation are
 *     excluded from the same-SKU batch and can be rejected together via an explicit
 *     reject/defer batch (sanitized { decision: "reject", sourceFileId,
 *     sourceRowNumber, note? } actions). The recommendation is advisory and the
 *     engineer must click - nothing is auto-rejected, replaced, or substituted.
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
import type { QuickBomPricedBoqReviewWorkspace } from "@/lib/projects/project-quick-bom-pricing-review-workspace";
import type {
  QuickBomReadinessReport,
  QuickBomReadinessStepId,
} from "@/lib/projects/quick-bom-readiness";
import type { ProjectStageId } from "@/types/project";
import {
  APPROVE_BTN,
  REJECT_BTN,
  Card,
  StatusBadge,
  humanize,
  bodyMessage,
  promptNote,
} from "./_components/quick-bom-review-ui";
import { SkuResolutionReviewPanel } from "./_components/sku-resolution-review-panel";
import { ConfigurationExpansionReviewPanel } from "./_components/configuration-expansion-review-panel";

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
const PRICED_REVIEW_ERROR = "Unable to load the priced BoQ review.";

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

// A reviewed (non-draft) configuration_expansion artifact carries its source draft id
// as the third source artifact. Its recorded accept/reject decisions stay readable in a
// read-only viewer at every status (needs_review after review, then approved/rejected).
function isConfigurationExpansionReviewed(artifact: ProjectArtifactSummary): boolean {
  return (
    artifact.type === "configuration_expansion" &&
    artifact.sourceArtifactIds[2] !== undefined
  );
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
          <dd>Profile: {pricing.profileId}</dd>
          <dd>Scope: {pricing.scope}</dd>
          <dd>Currency: {pricing.currency} | Priced SKUs: {pricing.pricedSkuCount} | Missing: {pricing.missingPriceSkuCount}</dd>
          {pricing.sources.map((source, index) => (
            <dd
              key={`${source.profileId}:${source.activeSourceFixtureId}`}
              data-testid={`authority-pricing-source-${artifactType}-${index}`}
            >
              Source {index + 1}: {source.profileId} | {source.scope} |{" "}
              {source.activeSource} / {source.activeSourceFixtureId} ({source.activeSourceStatus}) |{" "}
              approval {source.approvalRecordId} | {source.currency} | priced{" "}
              {source.pricedSkuCount} | missing {source.missingPriceSkuCount}
            </dd>
          ))}
          <dd>
            Deterministic fixture: {pricing.boundary.demoFixtureAuthority ? "yes" : "no"} |
            Scoped Cisco: {pricing.boundary.scopedCiscoPricingAuthority ? "yes" : "no"} |
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

/**
 * Quick BoM stages that map 1:1 to a readiness spine step. The raw `project_stages`
 * row can lag the artifact reality (QBM-LOG-002: a `normalized_boq` artifact exists
 * and is non-stale, yet the `boq_format_validation` row is still `not_started`). For
 * display only, when the raw row understates progress we surface the readiness step's
 * derived status instead, so the panel never shows a stale `not started`.
 */
const STAGE_TO_READINESS_STEP: Partial<Record<ProjectStageId, QuickBomReadinessStepId>> = {
  boq_format_validation: "normalized_boq",
  sku_resolution: "sku_resolution",
  configuration_expansion_review: "configuration_expansion",
  boq_pricing_review: "priced_boq",
  export_approval: "export_package",
};

/**
 * Effective display status for one stage row. Read-only/display only: it never
 * mutates a stage. The override fires solely when the raw row reads `not_started`
 * while the matching readiness step (derived from real artifact state) shows the
 * artifact present, so we can only upgrade a stale `not_started`, never downgrade a
 * stage or imply a persisted approval that the readiness step did not already report.
 */
function effectiveStageStatus(
  stage: { stageId: ProjectStageId; status: string },
  readiness: QuickBomReadinessReport
): string {
  if (stage.status !== "not_started") return stage.status;
  const stepId = STAGE_TO_READINESS_STEP[stage.stageId];
  if (stepId === undefined) return stage.status;
  const step = readiness.steps.find((s) => s.stepId === stepId);
  if (step === undefined) return stage.status;
  if (step.status === "not_started" || step.status === "blocked") return stage.status;
  return step.status;
}

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
  // Prompts 127/128: the SKU resolution and configuration-expansion line-review panels
  // are extracted into self-contained client components (see ./_components). Each owns
  // its own on-demand load/submit state so the main workspace read model stays
  // payload-free; the page only passes the project id, the artifact id, and a
  // workspace-refresh callback.
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
    // Archived Projects expose no approve/reject or line-review-required controls.
    if (workspace?.project.archivedAt) return null;
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
  // Archived Projects are read-only (QBM-LOG-006): every mutation control is hidden
  // while artifact rows, approvals, and the approved export download stay visible.
  const archived = Boolean(project.archivedAt);
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

      {archived && (
        <div
          data-testid="archived-notice"
          className="rounded-card border border-warning/30 bg-warning-muted p-3 text-sm text-warning"
        >
          This Project is archived and shown read-only. Workflow, upload, and
          approval controls are hidden until it is restored.
        </div>
      )}

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
              <StatusBadge status={effectiveStageStatus(stage, readiness)} />
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

      {skuResolution &&
        // `needs_review` is the editable line-review state, hidden when archived.
        // `generated`/`approved` are read-only in the panel, so they stay visible.
        ((!archived && skuResolution.status === "needs_review") ||
          skuResolution.status === "generated" ||
          skuResolution.status === "approved") && (
          <SkuResolutionReviewPanel
            projectId={id}
            artifactId={skuResolution.id}
            onReviewSubmitted={loadWorkspace}
          />
        )}

      {!archived && configExpansion && isConfigurationExpansionDraft(configExpansion) && (
        <ConfigurationExpansionReviewPanel
          projectId={id}
          artifactId={configExpansion.id}
          mode="draft"
          onReviewSubmitted={loadWorkspace}
        />
      )}

      {configExpansion && isConfigurationExpansionReviewed(configExpansion) && (
        <ConfigurationExpansionReviewPanel
          projectId={id}
          artifactId={configExpansion.id}
          mode="reviewed"
        />
      )}

      {pricedBoq && pricedBoq.status === "needs_review" && (
        <Card title="Priced BoQ review">
          <p className="mt-2 text-xs text-text-secondary">
            {archived
              ? "Inspect priced BoQ lines, SAR totals, and pricing warnings. This Project is archived and read-only; approval controls are hidden until it is restored."
              : "Inspect priced BoQ lines, SAR totals, and pricing warnings before approval. This is a read-only view - use the Approve / Reject controls above to record the decision."}
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

        {!archived && (
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
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!archived && CREATE_ACTIONS.map((action) => {
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
