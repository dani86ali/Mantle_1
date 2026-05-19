"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import { toCheckpointData, type CheckpointData } from "./mappers";
import { CheckpointSkeleton } from "./checkpoint-skeleton";
import { CheckpointActionBar, type CheckpointAction } from "./action-bar";
import { Card } from "./sections/common";
import { FileClassificationsSection } from "./sections/file-classifications";
import { RequirementsSection } from "./sections/requirements";
import { EvalCriteriaSection } from "./sections/eval-criteria";
import { VendorPreferencesSection } from "./sections/vendor-preferences";
import { SectorDetectionSection } from "./sections/sector-detection";
import { RiskFlagsSection } from "./sections/risk-flags";
import { DeadlinesSection } from "./sections/deadlines";
import { MissingDocsSection } from "./sections/missing-docs";
import type { Classification, FileType } from "./sections/types";

export default function CheckpointPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<CheckpointData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<CheckpointAction | null>(null);
  const [fileOverrides, setFileOverrides] = useState<Record<string, FileType>>({});
  const [reqOverrides, setReqOverrides] = useState<Record<string, Classification>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load estimate (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(toCheckpointData(json, id));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const navItems = useMemo(
    () => (data ? buildNavItems(id, data.hub.pipeline, data.hub.mode, data.hub.status) : []),
    [data, id],
  );

  async function decide(status: CheckpointAction) {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    let notes: string | undefined;
    if (status === "revision_requested") {
      const entered = window.prompt("What revisions are required?");
      if (entered === null) return;
      notes = entered;
    } else if (status === "rejected") {
      const entered = window.prompt("Reason for rejection (optional):");
      if (entered === null) return;
      notes = entered || undefined;
    }
    setSubmitting(status);
    try {
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: "e1-requirements", status, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setSubmitting(null);
    }
  }

  if (loading) return <CheckpointSkeleton id={id} />;
  if (error && !data) {
    return (
      <div className="p-6">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/checkpoint`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link
            href={`/estimates/${id}`}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-lg font-semibold text-text-primary">
              {id.slice(0, 12).toUpperCase()}
            </h1>
            <span className="rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent">
              Requirements Review
            </span>
            <span className="text-sm text-text-secondary">— {data.hub.customerName}</span>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            E1 checkpoint: review parsed RFP artifacts before BoM generation.
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-5xl space-y-4">
            <Card title="File Classifications" subtitle={`${data.files.length} files`}>
              <FileClassificationsSection
                files={data.files}
                overrides={fileOverrides}
                onOverride={(path, value) =>
                  setFileOverrides((p) => ({ ...p, [path]: value }))
                }
              />
            </Card>
            <Card
              title="Requirements"
              subtitle={`${data.requirementStats.total} extracted · ${data.requirementStats.mandatory} mandatory`}
            >
              <RequirementsSection
                requirements={data.requirements}
                stats={data.requirementStats}
                overrides={reqOverrides}
                onOverride={(rid, value) =>
                  setReqOverrides((p) => ({ ...p, [rid]: value }))
                }
              />
            </Card>
            {data.evalCriteria && (
              <Card
                title="Evaluation Criteria"
                subtitle={data.evalCriteria.methodology.replace(/_/g, " ")}
                defaultOpen={false}
              >
                <EvalCriteriaSection data={data.evalCriteria} />
              </Card>
            )}
            <Card
              title="Vendor Preferences"
              subtitle={`${data.vendorPreferences.length} entries`}
              defaultOpen={false}
            >
              <VendorPreferencesSection vendors={data.vendorPreferences} />
            </Card>
            {data.sector && (
              <Card title="Sector Detection" subtitle={data.sector.sector.replace(/_/g, " ")}>
                <SectorDetectionSection data={data.sector} />
              </Card>
            )}
            <Card title="Risk Flags" subtitle={`${data.riskFlags.length} flagged`}>
              <RiskFlagsSection flags={data.riskFlags} />
            </Card>
            <Card title="Deadlines" subtitle={`${data.deadlines.length} dates`}>
              <DeadlinesSection deadlines={data.deadlines} />
            </Card>
            <Card title="Missing Documents" subtitle={`${data.missingDocs.length} flagged`}>
              <MissingDocsSection docs={data.missingDocs} estimateId={id} />
            </Card>
          </div>
        </main>

        <CheckpointActionBar
          submitting={submitting}
          hasPipeline={!!data.pipelineId}
          onAct={decide}
        />
      </div>
    </div>
  );
}
