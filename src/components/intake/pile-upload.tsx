"use client";

import { useCallback, useRef, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  AlertTriangle,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/types/document-type";
import {
  DOCUMENT_TAGS,
  MAX_FILE_SIZE_BYTES,
  UPLOAD_ALLOWED_EXTENSIONS,
  extOf,
  isExtensionAllowed,
  shouldWarnTagExtMismatch,
  type PileFile,
} from "./document-slots";

interface Props {
  value: PileFile[];
  onChange: (next: PileFile[]) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

function makeId(): string {
  return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PileUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const accepted: PileFile[] = [];
      const bad: string[] = [];
      for (const f of incoming) {
        if (!isExtensionAllowed(f.name)) {
          bad.push(`${f.name} (extension not allowed)`);
          continue;
        }
        accepted.push({ id: makeId(), file: f, documentType: null });
      }
      setRejected(bad);
      if (accepted.length > 0) onChange([...value, ...accepted]);
    },
    [value, onChange],
  );

  const updateTag = useCallback(
    (id: string, documentType: DocumentType | null) => {
      onChange(value.map((p) => (p.id === id ? { ...p, documentType } : p)));
    },
    [value, onChange],
  );

  const removeFile = useCallback(
    (id: string) => {
      onChange(value.filter((p) => p.id !== id));
    },
    [value, onChange],
  );

  return (
    <div>
      <div
        data-testid="pile-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0)
            addFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-3 py-8 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent-muted"
            : "border-[var(--border)] bg-bg-primary hover:border-[var(--border-hover)]",
        )}
      >
        <Upload size={24} className="text-accent" />
        <p className="mt-2 text-sm font-medium text-text-primary">
          Drop files or click to browse
        </p>
        <p className="mt-1 text-[11px] text-text-tertiary">
          Tag each file after upload. Max 500 MB per file. Accepted:{" "}
          {UPLOAD_ALLOWED_EXTENSIONS.join(" · ")}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0)
              addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {rejected.length > 0 && (
        <p
          role="alert"
          className="mt-2 rounded-card border border-destructive/30 bg-destructive-muted px-2 py-1 text-[11px] text-destructive"
        >
          Rejected: {rejected.join(", ")}
        </p>
      )}

      {value.length > 0 && (
        <ul
          data-testid="pile-list"
          className="mt-4 divide-y divide-[var(--border)] rounded-card border border-[var(--border)] bg-bg-card"
        >
          {value.map((pf) => {
            const tooLarge = pf.file.size > MAX_FILE_SIZE_BYTES;
            const mismatch =
              pf.documentType != null &&
              shouldWarnTagExtMismatch(pf.file.name, pf.documentType);
            return (
              <li
                key={pf.id}
                data-testid={`pile-row-${pf.id}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <FileTypeIcon name={pf.file.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">
                    {pf.file.name}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    {formatBytes(pf.file.size)}
                  </p>
                  {tooLarge && (
                    <p
                      role="alert"
                      className="mt-0.5 text-[11px] text-destructive"
                    >
                      File exceeds 500 MB limit — remove before continuing
                    </p>
                  )}
                  {mismatch && !tooLarge && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-warning">
                      <AlertTriangle size={11} />
                      {pf.documentType === "boq"
                        ? "BoQ usually .xlsx / .xls / .csv — continue?"
                        : pf.documentType === "rfp"
                          ? "RFP usually .pdf / .docx / .doc — continue?"
                          : `${pf.documentType?.toUpperCase()} extension looks unusual — continue?`}
                    </p>
                  )}
                </div>
                <select
                  aria-label={`Tag for ${pf.file.name}`}
                  data-testid={`tag-select-${pf.id}`}
                  value={pf.documentType ?? ""}
                  onChange={(e) =>
                    updateTag(
                      pf.id,
                      e.target.value === ""
                        ? null
                        : (e.target.value as DocumentType),
                    )
                  }
                  className={cn(
                    "rounded-card border bg-bg-primary px-2 py-1 text-xs text-text-primary",
                    pf.documentType == null
                      ? "border-destructive/40"
                      : "border-[var(--border)]",
                  )}
                >
                  <option value="">— select tag —</option>
                  {DOCUMENT_TAGS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${pf.file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(pf.id);
                  }}
                  className="text-text-tertiary hover:text-destructive"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface PileValidation {
  canSubmit: boolean;
  blockingReason?: string;
  warnings: string[];
}

export function pileIsValid(pile: PileFile[]): PileValidation {
  if (pile.length === 0) {
    return {
      canSubmit: false,
      blockingReason: "Add at least one file to continue",
      warnings: [],
    };
  }
  const oversized = pile.filter((p) => p.file.size > MAX_FILE_SIZE_BYTES);
  if (oversized.length > 0) {
    return {
      canSubmit: false,
      blockingReason: `${oversized.length} file(s) exceed 500 MB — remove before continuing`,
      warnings: [],
    };
  }
  const untagged = pile.filter((p) => p.documentType == null);
  if (untagged.length > 0) {
    return {
      canSubmit: false,
      blockingReason: `${untagged.length} file(s) need a tag before continuing`,
      warnings: [],
    };
  }
  const warnings: string[] = [];
  if (!pile.some((p) => p.documentType === "boq"))
    warnings.push("No BoQ — pricing may produce $0 lines");
  if (!pile.some((p) => p.documentType === "rfp"))
    warnings.push("No RFP — requirements extraction will be limited");
  return { canSubmit: true, warnings };
}

export function submittablePile(
  pile: PileFile[],
): { file: File; documentType: DocumentType }[] {
  return pile
    .filter((p) => p.file.size <= MAX_FILE_SIZE_BYTES && p.documentType != null)
    .map((p) => ({ file: p.file, documentType: p.documentType as DocumentType }));
}
