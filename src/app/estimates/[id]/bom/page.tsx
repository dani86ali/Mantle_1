"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import {
  TotalsCards,
  BomTable,
  ValidationSection,
  AnomaliesSection,
} from "./sections";
import { toPageData, type PageData } from "./mappers";

type Decision = "approved" | "revision_requested";

export default function BomReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Decision | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load estimate (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setData(toPageData(json));
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

  async function decide(status: Decision) {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    let notes: string | undefined;
    if (status === "revision_requested") {
      const entered = window.prompt("What changes are required?");
      if (entered === null) return;
      notes = entered;
    }
    setSubmitting(status);
    try {
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Action failed (${res.status})`);
      }
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setSubmitting(null);
    }
  }

  function exportXlsx() {
    window.location.href = `/api/export?bomDraftId=${id}&format=xlsx`;
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

  return (
    <div className="flex h-full flex-col">
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
            Bill of Materials Review
          </span>
          <span className="text-sm text-text-secondary">— {data.customerName}</span>
        </div>
        <div className="mt-4">
          <TotalsCards totals={data.totals} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
        {error && (
          <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="mx-auto max-w-7xl space-y-4">
          {data.bom.length === 0 ? (
            <div className="rounded-card border border-[var(--border)] bg-bg-card p-8 text-center text-sm text-text-tertiary">
              No BoM lines have been generated yet.
            </div>
          ) : (
            <BomTable lines={data.bom} />
          )}
          <ValidationSection results={data.validationResults} />
          <AnomaliesSection data={data.anomalies} />
        </div>
      </main>

      <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          <button
            onClick={exportXlsx}
            className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
          >
            <Download size={14} />
            Export to Excel
          </button>
          <button
            onClick={() => decide("revision_requested")}
            disabled={submitting !== null}
            className="rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            {submitting === "revision_requested" ? "Submitting…" : "Request Changes"}
          </button>
          <button
            onClick={() => decide("approved")}
            disabled={submitting !== null || !data.pipelineId}
            className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting === "approved" ? "Approving…" : "Approve Estimate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BomSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
        <Link
          href={`/estimates/${id}`}
          className="flex items-center gap-1 text-xs text-text-tertiary"
        >
          <ChevronLeft size={14} /> Back to estimate
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-5 w-40 rounded-full" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-card" />
          ))}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="skeleton h-96 w-full rounded-card" />
          <div className="skeleton h-32 w-full rounded-card" />
        </div>
      </main>
    </div>
  );
}
