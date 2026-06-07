"use client";

/**
 * Read-model-driven Project Quick BoM workspace page (Prompt 80).
 *
 * GETs the read-only workspace from /api/projects/[id]/quick-bom and renders the
 * project summary, readiness, stages, latest spine artifacts, and approvals. The
 * ONLY mutation is an approve/reject POST to the Prompt 79 approvals route, and
 * only for the four approval-gated spine artifact types. It never renders or
 * depends on artifact payloads, and never normalizes, resolves SKUs, expands
 * configuration, prices, exports, runs the runner, or calls a catalog/AI - none
 * of that is a UI concern. Types come from the read-model module via `import
 * type`, which is erased at compile time, so no server/DB code reaches the client.
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

export default function ProjectQuickBomPage() {
  const params = useParams();
  const id = params.id as string;

  const [workspace, setWorkspace] = useState<ProjectQuickBomWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

  // Memoized so the load effect and post-POST reload share one stable reference;
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

  const submitDecision = useCallback(
    async (artifactId: string, decision: Decision, note?: string): Promise<void> => {
      setApprovalError(null);
      setBusyArtifactId(artifactId);
      try {
        const res = await fetch(`/api/projects/${id}/quick-bom/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactId,
            decision,
            ...(note !== undefined ? { note } : {}),
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setApprovalError(bodyMessage(body) ?? APPROVAL_ERROR);
          return;
        }
        // Prompt 79 returns { ..., workspace: ProjectQuickBomWorkspaceResult }.
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
    [id, loadWorkspace]
  );

  function onApprove(artifactId: string): void {
    void submitDecision(artifactId, "approved");
  }

  function onReject(artifactId: string): void {
    const entered = window.prompt("Add an optional note for this rejection:");
    const trimmed = entered === null ? "" : entered.trim();
    void submitDecision(artifactId, "rejected", trimmed === "" ? undefined : trimmed);
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
                    {isReviewable(artifact) && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid={`approve-${artifact.type}`}
                          disabled={busyArtifactId === artifact.id}
                          onClick={() => onApprove(artifact.id)}
                          className="rounded-button bg-accent px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          data-testid={`reject-${artifact.type}`}
                          disabled={busyArtifactId === artifact.id}
                          onClick={() => onReject(artifact.id)}
                          className="rounded-button border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
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
