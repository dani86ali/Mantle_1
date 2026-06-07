"use client";

/**
 * Read-model-driven Project Quick BoM workspace page (Prompt 80, Prompt 96).
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
 *   - priced_boq review: POST { decision, note? } to .../priced-boq/review.
 *   - export_package review: POST { artifactId, decision, note? } to /approvals.
 *   - sku_resolution / configuration_expansion are NOT approved here - they require
 *     line-level review elsewhere, so the page only flags that.
 *   - download: a plain anchor to the export-package/download route (no fetch).
 * Types come from the read-model module via `import type`, erased at compile time,
 * so no server/DB code reaches the client.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  ProjectArtifactSummary,
  ProjectQuickBomWorkspace,
  QuickBomSpineArtifacts,
} from "@/lib/projects/project-quick-bom-workspace";

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
    async (sourceArtifactId: string, segment: string, label: string): Promise<void> => {
      setWorkflowError(null);
      setWorkflowStatus(`Creating ${label}...`);
      setWorkflowBusy(true);
      try {
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

  function promptNote(): string | undefined {
    const entered = window.prompt("Add an optional note for this rejection:");
    const trimmed = entered === null ? "" : entered.trim();
    return trimmed === "" ? undefined : trimmed;
  }

  function decisionPayload(artifactId: string, decision: Decision, note?: string) {
    // export_package uses the generic approvals route, which needs the artifactId
    // in the body; priced_boq uses the per-artifact route (id is in the URL).
    return { artifactId, decision, ...(note !== undefined ? { note } : {}) };
  }

  function onApproveExport(artifactId: string): void {
    void submitDecision(
      artifactId,
      `/api/projects/${id}/quick-bom/approvals`,
      decisionPayload(artifactId, "approved")
    );
  }

  function onRejectExport(artifactId: string): void {
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

  // Per-artifact review control for the spine list. sku_resolution and
  // configuration_expansion are not approved from this page (line-level review);
  // priced_boq and export_package each route their approve/reject to their own
  // server route. normalized_boq is never reviewable.
  function reviewControls(artifact: ProjectArtifactSummary) {
    if (!isReviewable(artifact)) return null;
    const t = artifact.type;
    if (t === "sku_resolution" || t === "configuration_expansion") {
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
          onClick={() => (usePriced ? onApprovePriced(artifact.id) : onApproveExport(artifact.id))}
          className={APPROVE_BTN}
        >
          Approve
        </button>
        <button
          type="button"
          data-testid={`reject-${t}`}
          disabled={busyArtifactId === artifact.id}
          onClick={() => (usePriced ? onRejectPriced(artifact.id) : onRejectExport(artifact.id))}
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
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-secondary">version {artifact.version}</span>
                    {reviewControls(artifact)}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

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
