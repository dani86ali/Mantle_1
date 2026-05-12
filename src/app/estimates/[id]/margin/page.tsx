"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, toHubData, type ApiResponse, type HubData } from "../hub-mappers";
import type { MarginAnalysis, PricingTier } from "@/engines/e3/types";
import { MarginGauges } from "./margin-gauges";
import {
  ActionBar,
  ApprovalBanner,
  FlagsList,
  StrategicJustification,
  TierComparison,
} from "./margin-components";

interface PageData {
  hub: HubData;
  margin: MarginAnalysis | null;
  tiers: PricingTier[];
}

function toPageData(json: ApiResponse, fallbackId: string): PageData {
  const hub = toHubData(json, fallbackId);
  const e3 = json.e3 as Record<string, unknown> | null;
  const margin = (e3?.margin as MarginAnalysis | undefined) ?? null;
  const tiersRaw = e3?.tiers as { tiers?: PricingTier[] } | PricingTier[] | undefined;
  const tiers = Array.isArray(tiersRaw) ? tiersRaw : (tiersRaw?.tiers ?? []);
  return { hub, margin, tiers };
}

export default function MarginReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setPage(toPageData(json, id));
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

  const effectiveStatus = approved ? "APPROVED" : page?.hub.status ?? "DRAFT";
  const navItems = useMemo(
    () => (page ? buildNavItems(id, page.hub.pipeline, page.hub.mode, effectiveStatus) : []),
    [page, id, effectiveStatus],
  );

  async function handleApprove() {
    if (!page?.margin) return;
    if (page.margin.requiresStrategicJustification && !justification.trim()) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "APPROVED",
          strategicJustification: justification.trim() || undefined,
        }),
      });
      if (!res.ok && res.status !== 404 && res.status !== 405) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Approve failed (${res.status})`);
      }
      setApproved(true);
      setToast("Deal approved — export center is now available in the sub-nav.");
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  function handleReject() {
    router.push(`/estimates/${id}/pricing`);
  }

  if (loading) return <MarginSkeleton id={id} />;
  if (error && !page)
    return (
      <div className="p-6">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  if (!page) return null;

  const m = page.margin;

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/margin`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Margin Review &amp; Deal Approval</h1>
          <div className="mt-3 flex items-start gap-2 rounded-card border border-blue/20 bg-blue-muted p-3 text-sm text-text-secondary">
            <Info size={16} className="mt-0.5 shrink-0 text-blue" />
            <p>
              Commercial gate before export. Confirm margins against the benchmarks, check who must sign off,
              and approve the deal to unlock the export center.
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>
          )}
          {toast && (
            <div className="mb-4 rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">{toast}</div>
          )}
          <div className="mx-auto max-w-5xl space-y-4">
            {m ? (
              <>
                <MarginGauges margin={m} />
                <ApprovalBanner level={m.approvalLevel} />
                <FlagsList flags={m.flags} />
                {m.requiresStrategicJustification && (
                  <StrategicJustification value={justification} onChange={setJustification} disabled={approved} />
                )}
                <TierComparison tiers={page.tiers} totalCost={m.totalCost} recommended="better" />
              </>
            ) : (
              <div className="rounded-card border border-warning/30 bg-warning-muted p-4 text-sm text-warning">
                Margin analysis is not available yet — run the proposal engine first.
              </div>
            )}
          </div>
        </main>

        <ActionBar
          approving={approving}
          approved={approved}
          justificationRequired={!!m?.requiresStrategicJustification}
          hasJustification={!!justification.trim()}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </div>
    </div>
  );
}

function MarginSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-56" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="skeleton h-32 w-full rounded-card" />
            <div className="skeleton h-32 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
