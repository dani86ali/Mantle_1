"use client";

import Link from "next/link";
import { ChevronLeft, Download, FileEdit, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROPOSAL_SECTIONS } from "@/engines/e3/types";

export interface ProposalHeaderProps {
  estimateId: string;
  customerName: string;
  projectName: string;
  createdAt: string;
  validityDays: number;
}

export function ProposalHeader({ estimateId, customerName, projectName, createdAt, validityDays }: ProposalHeaderProps) {
  const dateLabel = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  return (
    <header className="border-b border-[var(--border)] bg-bg-card px-4 py-4 sm:px-6">
      <Link href={`/estimates/${estimateId}`} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary">
        <ChevronLeft size={14} /> Back to estimate
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Proposal Review</h1>
        <p className="text-sm text-text-secondary">
          {customerName} · {projectName} · {dateLabel} · valid {validityDays} days
        </p>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-card border border-blue/20 bg-blue-muted p-3 text-sm text-text-secondary">
        <Info size={16} className="mt-0.5 shrink-0 text-blue" />
        <p>Review each section and make quick edits. When ready, download the Word document for final formatting.</p>
      </div>
    </header>
  );
}

export interface ProposalActionBarProps {
  reviewedCount: number;
  pipelineId: string | null;
  approving: boolean;
  requesting: boolean;
  onApprove: () => void;
  onRequestRevision: () => void;
}

export function ProposalActionBar({
  reviewedCount, pipelineId, approving, requesting, onApprove, onRequestRevision,
}: ProposalActionBarProps) {
  const total = PROPOSAL_SECTIONS.length;
  const unreviewed = total - reviewedCount;
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{reviewedCount} of {total}</span> reviewed
          {unreviewed > 0 && <span className="ml-2 text-warning">· {unreviewed} not yet reviewed</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRequestRevision}
            disabled={requesting || approving || !pipelineId}
            className="flex items-center gap-1.5 rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
          >
            <FileEdit size={14} />
            {requesting ? "Sending…" : "Request Revision"}
          </button>
          <button
            onClick={onApprove}
            disabled={approving || requesting || !pipelineId}
            className={cn("flex items-center gap-1.5 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50")}
          >
            <Download size={14} />
            {approving ? "Approving…" : "Approve & Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProposalSkeleton({ id }: { id: string }) {
  return (
    <div className="flex h-full">
      <div className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-bg-card md:block" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] bg-bg-card px-6 py-4">
          <Link href={`/estimates/${id}`} className="flex items-center gap-1 text-xs text-text-tertiary">
            <ChevronLeft size={14} /> Back to estimate
          </Link>
          <div className="skeleton mt-2 h-6 w-56" />
          <div className="skeleton mt-3 h-12 w-full" />
        </header>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 shrink-0 border-r border-[var(--border)] bg-bg-card p-3">
            <div className="skeleton h-8 w-full" />
          </div>
          <div className="flex-1 p-6">
            <div className="skeleton h-96 w-full rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
