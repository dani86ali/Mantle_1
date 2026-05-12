"use client";

export type CheckpointAction = "approved" | "revision_requested" | "rejected";

export function CheckpointActionBar({
  submitting,
  hasPipeline,
  onAct,
}: {
  submitting: CheckpointAction | null;
  hasPipeline: boolean;
  onAct: (action: CheckpointAction) => void;
}) {
  return (
    <div className="fixed bottom-0 right-0 left-0 z-10 border-t border-[var(--border)] bg-bg-primary/95 px-4 py-3 backdrop-blur sm:left-56 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
        <button
          onClick={() => onAct("rejected")}
          disabled={submitting !== null}
          className="rounded-button px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive-muted disabled:opacity-50"
        >
          {submitting === "rejected" ? "Rejecting…" : "Reject"}
        </button>
        <button
          onClick={() => onAct("revision_requested")}
          disabled={submitting !== null}
          className="rounded-button border border-[var(--border)] px-4 py-2 text-sm font-medium text-text-secondary hover:border-[var(--border-hover)] hover:text-text-primary disabled:opacity-50"
        >
          {submitting === "revision_requested" ? "Submitting…" : "Request Revision"}
        </button>
        <button
          onClick={() => onAct("approved")}
          disabled={submitting !== null || !hasPipeline}
          className="rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting === "approved" ? "Approving…" : "Approve & Continue"}
        </button>
      </div>
    </div>
  );
}
