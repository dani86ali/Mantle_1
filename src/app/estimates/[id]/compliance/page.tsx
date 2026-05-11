"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Download, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatsBar,
  MatrixTable,
  GapAnalysis,
  type EditableRow,
  type Stats,
  type Status,
} from "./sections";
import { toPageData, type PageData } from "./mappers";

type Edit = { status: Status; notes: string };

export default function CompliancePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<PageData | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
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

  const dirty = Object.keys(edits).length > 0;

  const mergedRows = useMemo<EditableRow[]>(() => {
    if (!data) return [];
    return data.rows.map((r) => (edits[r.key] ? { ...r, ...edits[r.key] } : r));
  }, [data, edits]);

  const stats: Stats = useMemo(() => {
    const s: Stats = { compliant: 0, partial: 0, nonCompliant: 0, alternative: 0 };
    for (const r of mergedRows) {
      if (r.status === "Compliant") s.compliant++;
      else if (r.status === "Partially Compliant") s.partial++;
      else if (r.status === "Non-Compliant") s.nonCompliant++;
      else if (r.status === "Alternative Proposed") s.alternative++;
    }
    return s;
  }, [mergedRows]);

  function patchRow(key: string, patch: Partial<Edit>) {
    setEdits((prev) => {
      const orig = data?.rows.find((r) => r.key === key);
      if (!orig) return prev;
      const current = prev[key] ?? { status: orig.status, notes: orig.notes };
      const next: Edit = { ...current, ...patch };
      if (next.status === orig.status && next.notes === orig.notes) {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}/compliance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setData((d) =>
        d ? { ...d, rows: d.rows.map((r) => (edits[r.key] ? { ...r, ...edits[r.key] } : r)) } : d
      );
      setEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function exportXlsx() {
    window.location.href = `/api/estimates/${id}/compliance/export`;
  }

  async function approveAndContinue() {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    setApproving(true);
    setError(null);
    try {
      if (dirty) {
        const res = await fetch(`/api/estimates/${id}/compliance`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edits }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setEdits({});
      }
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Approve failed (${res.status})`);
      }
      router.push(`/estimates/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
      setApproving(false);
    }
  }

  if (loading) return <Skeleton id={id} />;
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

  const dirtyKeys = new Set(Object.keys(edits));

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
            Compliance Matrix Review
          </span>
          <span className="text-sm text-text-secondary">— {data.customerName}</span>
        </div>
        <div className="mt-3">
          <StatsBar stats={stats} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
        {error && (
          <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="mx-auto max-w-7xl space-y-6">
          <MatrixTable rows={mergedRows} onChange={patchRow} dirtyKeys={dirtyKeys} />
          <div className="rounded-card border border-[var(--border)] bg-bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Gap Analysis</h3>
            <GapAnalysis
              coverageGaps={data.gaps.coverageGaps}
              orphans={data.gaps.orphans}
            />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="relative flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Changes"}
            {dirty && (
              <span className="absolute -top-1 -right-1 inline-block h-2.5 w-2.5 rounded-full bg-warning" />
            )}
          </button>
          <button
            onClick={exportXlsx}
            className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary"
          >
            <Download size={14} />
            Export to Excel
          </button>
          <button
            onClick={approveAndContinue}
            disabled={approving || !data.pipelineId}
            className={cn(
              "rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
            )}
          >
            {approving ? "Approving…" : "Approve & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ id }: { id: string }) {
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
      </header>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-96 w-full" />
        </div>
      </main>
    </div>
  );
}

