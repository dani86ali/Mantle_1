"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/types/document-type";
import {
  DOCUMENT_SLOTS,
  REQUIRED_SLOT_IDS,
  type DocumentSlot,
  type SlotFileMap,
} from "./document-slots";

interface Props {
  value: SlotFileMap;
  onChange: (next: SlotFileMap) => void;
  onValidityChange?: (allRequiredPopulated: boolean) => void;
}

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = extOf(name).slice(1);
  if (["xlsx", "xls", "csv"].includes(ext))
    return <FileSpreadsheet size={16} className="text-success" />;
  if (["docx", "doc"].includes(ext))
    return <FileText size={16} className="text-blue" />;
  if (ext === "pdf") return <FileText size={16} className="text-destructive" />;
  return <FileIcon size={16} className="text-text-tertiary" />;
}

function isValid(map: SlotFileMap): boolean {
  return REQUIRED_SLOT_IDS.every((id) => (map[id]?.length ?? 0) > 0);
}

export default function TypedSlotUpload({
  value,
  onChange,
  onValidityChange,
}: Props) {
  const valid = useMemo(() => isValid(value), [value]);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  const addFilesToSlot = useCallback(
    (slot: DocumentSlot, incoming: File[]) => {
      const accepted: File[] = [];
      const rejected: File[] = [];
      for (const f of incoming) {
        if (slot.accept.includes(extOf(f.name))) accepted.push(f);
        else rejected.push(f);
      }
      const prev = value[slot.id] ?? [];
      const merged = slot.multi
        ? [...prev, ...accepted]
        : accepted.length > 0
          ? [accepted[accepted.length - 1]]
          : prev;
      onChange({ ...value, [slot.id]: merged });
      return rejected;
    },
    [value, onChange],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DOCUMENT_SLOTS.map((slot) => (
        <SlotDropzone
          key={slot.id}
          slot={slot}
          files={value[slot.id] ?? []}
          onAdd={(files) => addFilesToSlot(slot, files)}
          onRemove={(idx) => {
            const next = (value[slot.id] ?? []).filter((_, i) => i !== idx);
            onChange({ ...value, [slot.id]: next });
          }}
        />
      ))}
    </div>
  );
}

interface SlotDropzoneProps {
  slot: DocumentSlot;
  files: File[];
  onAdd: (files: File[]) => File[];
  onRemove: (idx: number) => void;
}

function SlotDropzone({ slot, files, onAdd, onRemove }: SlotDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const empty = files.length === 0;
  const showRequiredError = slot.required && empty;

  const handleAdd = (incoming: File[]) => {
    const rejected = onAdd(incoming);
    if (rejected.length > 0) {
      setError(
        `Unsupported file${rejected.length > 1 ? "s" : ""}: ${rejected
          .map((f) => f.name)
          .join(", ")}. Allowed: ${slot.accept.join(", ")}`,
      );
    } else {
      setError(null);
    }
  };

  return (
    <div
      data-testid={`slot-${slot.id}`}
      className={cn(
        "rounded-card border bg-bg-card p-3 transition-colors",
        showRequiredError
          ? "border-destructive/60"
          : "border-[var(--border)]",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label
          htmlFor={`slot-input-${slot.id}`}
          className="text-sm font-medium text-text-primary"
        >
          {slot.label}
          {slot.required && (
            <span className="ml-1 text-destructive" aria-label="required">
              *
            </span>
          )}
        </label>
        <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
          {slot.accept.join(" · ")}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            handleAdd(Array.from(e.dataTransfer.files));
          }
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-3 py-5 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent-muted"
            : showRequiredError
              ? "border-destructive/40 bg-bg-card hover:border-destructive/70"
              : "border-[var(--border)] bg-bg-primary hover:border-[var(--border-hover)]",
        )}
      >
        <Upload size={20} className="text-accent" />
        <p className="mt-2 text-xs font-medium text-text-primary">
          {slot.multi ? "Drop files or click to browse" : "Drop file or click to browse"}
        </p>
        <p className="mt-0.5 text-[10px] text-text-tertiary">
          {slot.multi ? "Multiple files allowed" : "Single file (replaces on re-upload)"}
        </p>
        <input
          id={`slot-input-${slot.id}`}
          ref={inputRef}
          type="file"
          accept={slot.accept.join(",")}
          multiple={slot.multi}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0)
              handleAdd(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-card border border-destructive/30 bg-destructive-muted px-2 py-1 text-[11px] text-destructive"
        >
          {error}
        </p>
      )}

      {showRequiredError && !error && (
        <p className="mt-2 text-[11px] text-destructive">Required</p>
      )}

      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)] rounded-card border border-[var(--border)] bg-bg-primary">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <FileTypeIcon name={f.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-text-primary">{f.name}</p>
                <p className="text-[10px] text-text-tertiary">
                  {formatBytes(f.size)}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="text-text-tertiary hover:text-destructive"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
