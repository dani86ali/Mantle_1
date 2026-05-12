"use client";

import { useRef, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, type WizardState } from "../types";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.msg,.dwg";
const MAX_FILES = 50;

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

export default function FileUpload({ state, update }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    const merged = [...state.files, ...list].slice(0, MAX_FILES);
    update({ files: merged });
  }

  function removeFile(idx: number) {
    update({ files: state.files.filter((_, i) => i !== idx) });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary">
        Upload RFP package
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Drop the full set of documents — PDF, Word, Excel, MSG, DWG. Up to{" "}
        {MAX_FILES} files.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent-muted"
            : "border-[var(--border)] bg-bg-card hover:border-[var(--border-hover)]"
        )}
      >
        <Upload size={28} className="text-accent" />
        <p className="mt-3 text-sm font-medium text-text-primary">
          Drop files here, or click to browse
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          PDF · DOCX · XLSX · XLS · MSG · DWG
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0)
              addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {state.files.length > 0 && (
        <div className="mt-6 rounded-card border border-[var(--border)] bg-bg-primary">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-sm font-medium text-text-primary">
              {state.files.length}{" "}
              {state.files.length === 1 ? "file" : "files"} selected
            </span>
            <button
              type="button"
              onClick={() => update({ files: [] })}
              className="text-xs text-text-tertiary hover:text-destructive"
            >
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {state.files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <FileTypeIcon name={f.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{f.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {formatBytes(f.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-text-tertiary hover:text-destructive"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv"].includes(ext))
    return <FileSpreadsheet size={18} className="text-success" />;
  if (["docx", "doc"].includes(ext))
    return <FileText size={18} className="text-blue" />;
  if (ext === "pdf")
    return <FileText size={18} className="text-destructive" />;
  return <FileIcon size={18} className="text-text-tertiary" />;
}
