"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { EstimateSubNav } from "../hub-components";
import { buildNavItems, toHubData, type ApiResponse, type HubData } from "../hub-mappers";
import type { ClarificationQuestion } from "@/engines/e1/clarification-generator";
import {
  StatsBar,
  FilterBar,
  SelectionActions,
  filterQuestions,
  DEFAULT_FILTERS,
  type Filters,
} from "./clarifications-components";
import { QuestionTable } from "./clarifications-table";

interface PageData {
  hub: HubData;
  questions: ClarificationQuestion[];
}

function toPageData(json: ApiResponse, fallbackId: string): PageData {
  const hub = toHubData(json, fallbackId);
  const e1 = json.e1 as { clarifications?: { questions?: ClarificationQuestion[] } } | null;
  const questions = e1?.clarifications?.questions ?? [];
  return { hub, questions };
}

export default function ClarificationsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/estimates/${id}`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setPage(toPageData(json, id));
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
    () => (page ? buildNavItems(id, page.hub.pipeline, page.hub.mode, page.hub.status) : []),
    [page, id],
  );
  const filtered = useMemo(
    () => (page ? filterQuestions(page.questions, filters) : []),
    [page, filters],
  );

  function toggleSelect(qid: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid); else next.add(qid);
      return next;
    });
  }

  async function handleCopy() {
    if (!page || selectedIds.size === 0) return;
    const sel = page.questions.filter((q) => selectedIds.has(q.id));
    const text = sel.map((q, i) => `${i + 1}. ${edits[q.id] ?? q.question}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Copied ${sel.length} question${sel.length === 1 ? "" : "s"} to clipboard.`);
    } catch {
      setError("Clipboard access denied.");
    }
  }

  function handleSelectCritical() {
    if (!page) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      page.questions.filter((q) => q.priority === "critical").forEach((q) => next.add(q.id));
      return next;
    });
  }

  if (loading) return <ClarificationsSkeleton id={id} />;
  if (error && !page) {
    return (
      <div className="p-6">
        <div className="rounded-card border border-destructive/30 bg-destructive-muted p-4 text-sm text-destructive">{error}</div>
      </div>
    );
  }
  if (!page) return null;

  return (
    <div className="flex h-full">
      <EstimateSubNav items={navItems} activeHref={`/estimates/${id}/clarifications`} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-text-primary">Clarification Questions</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Review and select questions to send to the customer. This does not block the pipeline.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-card border border-blue/20 bg-blue-muted p-3 text-sm text-text-secondary">
            <Info size={16} className="mt-0.5 shrink-0 text-blue" />
            <p>Edits are kept locally and not persisted to the server. Use Copy or Export to send to the customer.</p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28">
          {error && (
            <div className="mb-4 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive">{error}</div>
          )}
          {notice && (
            <div className="mb-4 rounded-card border border-success/30 bg-success-muted p-3 text-sm text-success">{notice}</div>
          )}
          <div className="mx-auto max-w-6xl space-y-4">
            <StatsBar qs={page.questions} />
            <FilterBar filters={filters} onChange={setFilters} />
            <QuestionTable
              questions={filtered}
              estimateId={id}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              expandedId={expandedId}
              onExpand={setExpandedId}
              editingId={editingId}
              onEditStart={setEditingId}
              onEditEnd={() => setEditingId(null)}
              edits={edits}
              onEditChange={(qid, text) => setEdits((p) => ({ ...p, [qid]: text }))}
            />
          </div>
        </main>
        <SelectionActions
          selectedCount={selectedIds.size}
          totalCount={page.questions.length}
          onCopy={handleCopy}
          onSelectCritical={handleSelectCritical}
          onDeselectAll={() => setSelectedIds(new Set())}
          onBackToOverview={() => router.push(`/estimates/${id}`)}
        />
      </div>
    </div>
  );
}

function ClarificationsSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-64" />
          <div className="skeleton mt-2 h-4 w-96" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="skeleton h-20 w-full rounded-card" />
            <div className="skeleton h-12 w-full rounded-card" />
            <div className="skeleton h-64 w-full rounded-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
