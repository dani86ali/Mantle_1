"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, type ApiResponse } from "../hub-mappers";
import {
  StatsBar,
  FilterBar,
  MatrixTable,
  CollapsibleCard,
  CoverageGapsList,
  OrphanList,
} from "./sections";
import { toPageData, type PageData } from "./mappers";
import {
  ComplianceHeader,
  ComplianceActionBar,
  ComplianceSkeleton,
} from "./compliance-chrome";
import { useComplianceState } from "./use-compliance";

export default function CompliancePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const s = useComplianceState(data);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(toPageData(json, id));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const navItems = useMemo(
    () => (data ? buildNavItems(id, data.hub.pipeline, data.hub.mode, data.hub.status) : []),
    [data, id],
  );

  async function persistEdits(): Promise<void> {
    const res = await fetch(`/api/estimates/${id}/compliance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: s.edits }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Save failed (${res.status})`);
    }
  }

  async function save() {
    if (!s.dirty) return;
    setSaving(true);
    setError(null);
    try {
      await persistEdits();
      setData((d) =>
        d ? { ...d, rows: d.rows.map((r) => (s.edits[r.key] ? { ...r, ...s.edits[r.key] } : r)) } : d,
      );
      s.clearEdits();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function exportXlsx() {
    window.location.href = `/api/estimates/${id}/download?artifact=compliance`;
  }

  async function approveAndContinue() {
    if (!data?.pipelineId) {
      setError("No pipeline associated with this estimate.");
      return;
    }
    setApproving(true);
    setError(null);
    try {
      if (s.dirty) {
        await persistEdits();
        s.clearEdits();
      }
      const res = await fetch(`/api/pipeline/${data.pipelineId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: "e1-compliance", status: "approved" }),
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

  if (loading) return <ComplianceSkeleton id={id} />;
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
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/compliance`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ComplianceHeader estimateId={id} customerName={data.hub.customerName} />
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-7xl space-y-4">
            <StatsBar stats={s.stats} />
            <FilterBar
              filters={s.filters}
              onChange={s.setFilters}
              frameworkIds={data.frameworkIds}
            />
            <MatrixTable rows={s.filtered} onChange={s.patchRow} dirtyKeys={s.dirtyKeys} />
            <CollapsibleCard title="Coverage Gaps" count={data.gaps.coverageGaps.length}>
              <CoverageGapsList items={data.gaps.coverageGaps} />
            </CollapsibleCard>
            <CollapsibleCard title="Orphan Requirements" count={data.gaps.orphans.length}>
              <OrphanList items={data.gaps.orphans} />
            </CollapsibleCard>
          </div>
        </main>
        <ComplianceActionBar
          saving={saving}
          approving={approving}
          dirty={s.dirty}
          canApprove={!!data.pipelineId}
          onSave={save}
          onExport={exportXlsx}
          onApprove={approveAndContinue}
        />
      </div>
    </div>
  );
}
