"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PipelineStepper,
  CheckpointCards,
  SummaryCards,
  EstimateSubNav,
  HubHeader,
  HubSkeleton,
} from "./hub-components";
import {
  buildStages,
  buildCheckpoints,
  buildNavItems,
  toHubData,
  anyStageProcessing,
  type ApiResponse,
  type HubData,
} from "./hub-mappers";

export default function EstimateHubPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        const next = toHubData(json, id);
        setData(next);
        if (interval && !anyStageProcessing(next)) {
          clearInterval(interval);
          interval = null;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("Permanently delete this estimate? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/estimates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      router.push("/estimates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  const stages = useMemo(
    () => (data ? buildStages(data.pipeline, data.mode) : []),
    [data]
  );
  const checkpoints = useMemo(
    () => (data ? buildCheckpoints(data.pipeline, data.mode, id) : []),
    [data, id]
  );
  const navItems = useMemo(
    () => (data ? buildNavItems(id, data.pipeline, data.mode, data.status) : []),
    [data, id]
  );

  if (loading && !data) return <HubSkeleton />;

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
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HubHeader
          estimateId={data.estimateId}
          customerName={data.customerName}
          status={data.status}
          createdAt={data.createdAt}
          mode={data.mode}
          onDelete={handleDelete}
          deleting={deleting}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="mx-auto max-w-6xl space-y-6">
            <PipelineStepper stages={stages} />
            <section>
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Checkpoints</h2>
              <CheckpointCards checkpoints={checkpoints} />
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Summary</h2>
              <SummaryCards summary={data.summary} />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
