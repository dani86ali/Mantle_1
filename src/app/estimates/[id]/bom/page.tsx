"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import { TotalsCards } from "./sections";
import {
  ValidationSection,
  AnomaliesSection,
  SimilarDealsCard,
} from "./review-cards";
import { BomTable, type Phase } from "./bom-table";
import {
  BomHeader,
  PhaseTabs,
  ComparisonBanner,
  BomActionBar,
  BomSkeleton,
} from "./bom-chrome";
import { toPageData, type PageData } from "./mappers";

export default function BomReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("sku");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<"approve" | "revise" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load estimate (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        const next = toPageData(json, id);
        setData(next);
        if (next.skuPhaseStatus === "approved") setPhase("pricing");
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

  function patchQty(lineId: string, qty: number) {
    setEdits((e) => ({ ...e, [lineId]: qty }));
  }

  function saveEdits() {
    if (Object.keys(edits).length === 0) return;
    setSaving(true);
    setEdits({});
    setSaving(false);
  }

  function exportXlsx() {
    window.location.href = `/api/estimates/${id}/download?artifact=bom`;
  }

  async function decide(kind: "approve" | "revise") {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    let notes: string | undefined;
    if (kind === "revise") {
      const entered = window.prompt("What changes are required?");
      if (entered === null) return;
      notes = entered;
    }
    const checkpointId = phase === "sku" ? "e2-sku-confirmation" : "e2-pricing-review";
    const status = kind === "approve" ? "approved" : "revision_requested";
    setSubmitting(kind);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId, status, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Action failed (${res.status})`);
      }
      if (kind === "approve" && phase === "sku") {
        setData((d) => (d ? { ...d, skuPhaseStatus: "approved" } : d));
        setPhase("pricing");
        setSubmitting(null);
        return;
      }
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setSubmitting(null);
    }
  }

  if (loading) return <BomSkeleton id={id} />;
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

  const dirty = Object.keys(edits).length > 0;
  const pricingLocked = data.skuPhaseStatus !== "approved";

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/bom`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <BomHeader estimateId={id} customerName={data.hub.customerName} />
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-7xl space-y-4">
            {data.previousTotals && (
              <ComparisonBanner previous={data.previousTotals} current={data.totals} />
            )}
            <PhaseTabs
              phase={phase}
              onChange={setPhase}
              skuStatus={data.skuPhaseStatus}
              pricingStatus={data.pricingPhaseStatus}
              pricingLocked={pricingLocked}
            />
            {phase === "pricing" && <TotalsCards totals={data.totals} />}
            {data.bom.length === 0 ? (
              <div className="rounded-card border border-[var(--border)] bg-bg-card p-8 text-center text-sm text-text-tertiary">
                No BoM lines have been generated yet.
              </div>
            ) : (
              <BomTable
                lines={data.bom}
                phase={phase}
                edits={edits}
                onQtyChange={patchQty}
              />
            )}
            <ValidationSection results={data.validationResults} />
            <AnomaliesSection data={data.anomalies} />
            {phase === "pricing" && <SimilarDealsCard deals={data.similarDeals} />}
          </div>
        </main>
        <BomActionBar
          phase={phase}
          dirty={dirty}
          saving={saving}
          submitting={submitting}
          canApprove={!!data.pipelineId && (phase === "sku" || !pricingLocked)}
          onSave={saveEdits}
          onExport={exportXlsx}
          onRevise={() => decide("revise")}
          onApprove={() => decide("approve")}
        />
      </div>
    </div>
  );
}
