"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, X, Minus, Send, Paperclip, FileSpreadsheet,
  Loader2, ExternalLink, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileName?: string;
  bom?: BomLineData[];
  bomDraftId?: string;
  quickReplies?: string[];
  timestamp: Date;
}

interface BomLineData {
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  category: string;
  serviceDurationMonths?: number | null;
  leadTimeDays?: number | null;
}

// ─── Main export: FAB + Panel ───────────────────────────────────────────

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  function handleFileSelect(file: File) {
    if (!/\.(csv|xlsx|xls|pdf)$/i.test(file.name)) return;
    if (file.size > 10 * 1024 * 1024) return;
    setUploadedFile(file);
    if (file.name.endsWith(".csv") || file.type === "text/csv") {
      const reader = new FileReader();
      reader.onload = (e) => setFileContent(e.target?.result as string);
      reader.readAsText(file);
    } else {
      setFileContent(`[File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`);
    }
  }

  async function handleSend(text?: string) {
    const msg = text ?? input.trim();
    if (!msg && !uploadedFile) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg || `Uploaded: ${uploadedFile?.name}`,
      fileName: uploadedFile?.name,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setUploadedFile(null);
    setSending(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          fileContent: fileContent ?? undefined,
          fileName: userMsg.fileName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      const bom = extractBom(data.response);
      const quickReplies = extractQuickReplies(data.response);
      const cleanContent = data.response
        .replace(/```bom\n[\s\S]*?```/g, "")
        .replace(/\[quick-replies:.*?\]/g, "")
        .trim();

      // Auto-save BoM to database if one was produced
      let bomDraftId: string | undefined;
      if (bom && bom.length > 0) {
        try {
          const saveRes = await fetch("/api/chat/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requirements: userMsg.content,
              lines: bom,
            }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            bomDraftId = saveData.bomDraftId;
          }
        } catch {
          // Save failed silently — BoM still shows in chat
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: cleanContent,
          bom: bom ?? undefined,
          bomDraftId,
          quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}. Check your Anthropic API key in .env.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
      setFileContent(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleSend();
    }
  }

  // ─── Floating Action Button ─────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMinimized(false); }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/20 text-bg-primary transition-transform hover:scale-105 active:scale-95"
      >
        <MessageSquare size={22} />
        {messages.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {messages.filter((m) => m.role === "assistant").length}
          </span>
        )}
      </button>
    );
  }

  // ─── Minimized bar ──────────────────────────────────────────────────

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-[#1e1e2a] bg-bg-card px-4 py-2 shadow-lg">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg-primary">
          B
        </div>
        <span className="text-sm font-medium text-text-primary">BOMatic AI</span>
        <button
          onClick={() => setMinimized(false)}
          className="ml-2 text-text-tertiary hover:text-text-primary"
        >
          <ChevronRight size={16} className="rotate-[-90deg]" />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-text-tertiary hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // ─── Full Panel ─────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-0 right-0 top-0 z-50 flex w-[400px] flex-col border-l border-[#1e1e2a] bg-bg-primary shadow-2xl shadow-black/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e2a] bg-bg-card px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-bg-primary">
            B
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">BOMatic AI</p>
            <p className="text-[11px] text-text-tertiary">Cisco presales assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[#1a1a22] hover:text-text-secondary"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[#1a1a22] hover:text-text-secondary"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages area with drop zone */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-3 transition-colors",
          dragOver && "bg-accent/5 ring-2 ring-inset ring-accent/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFileSelect(file);
        }}
      >
        {messages.length === 0 ? (
          <EmptyState onSelect={(p) => { setInput(p); textareaRef.current?.focus(); }} />
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onQuickReply={(text) => handleSend(text)}
              />
            ))}

            {sending && (
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg-primary">
                  B
                </div>
                <div className="rounded-lg rounded-tl-sm bg-bg-card px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Loader2 size={12} className="animate-spin text-accent" />
                    <span>Thinking</span>
                    <span className="animate-pulse">...</span>
                  </div>
                </div>
              </div>
            )}

            {dragOver && (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 py-6">
                <p className="text-sm text-accent">Drop file here</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[#1e1e2a] bg-bg-card px-3 py-2.5">
        {/* File chip */}
        {uploadedFile && (
          <div className="mb-2 flex items-center gap-2 rounded bg-bg-primary px-2.5 py-1.5 text-xs">
            <FileSpreadsheet size={12} className="text-accent" />
            <span className="truncate text-text-secondary">{uploadedFile.name}</span>
            <button
              onClick={() => { setUploadedFile(null); setFileContent(null); }}
              className="ml-auto text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-[#1a1a22] hover:text-text-secondary"
            title="Attach CSV, XLSX, or PDF"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = "";
            }}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask BOMatic anything..."
            className="max-h-[120px] min-h-[32px] flex-1 resize-none rounded border border-[#1e1e2a] bg-bg-primary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            rows={1}
            disabled={sending}
          />

          <button
            onClick={() => handleSend()}
            disabled={sending || (!input.trim() && !uploadedFile)}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent text-bg-primary hover:bg-accent-hover disabled:opacity-30"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (p: string) => void }) {
  const starters = [
    "2x C9300L-24UXG switches, DNA Advantage, stacking, Saudi Arabia",
    "8x C9120AX external antenna APs, no DNA",
    "Look up SKU C9300-48P-A",
    "Validate my BoM (I'll upload a CSV)",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-muted">
        <MessageSquare size={20} className="text-accent" />
      </div>
      <p className="mt-3 text-sm font-medium text-text-primary">
        How can I help?
      </p>
      <p className="mt-1 text-xs text-text-tertiary">
        Describe requirements, upload a BoM, or ask about any Cisco SKU
      </p>
      <div className="mt-5 w-full space-y-1.5">
        {starters.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="w-full rounded-lg border border-[#1e1e2a] bg-bg-card px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:border-[#2a2a3a] hover:text-text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onQuickReply,
}: {
  message: ChatMessage;
  onQuickReply: (text: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg-primary">
          B
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {/* File indicator */}
        {message.fileName && (
          <span className="inline-flex items-center gap-1 rounded bg-bg-elevated px-2 py-0.5 text-[11px] text-text-secondary">
            <FileSpreadsheet size={10} /> {message.fileName}
          </span>
        )}

        {/* Text bubble */}
        {message.content && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
              isUser
                ? "rounded-tr-sm bg-accent text-bg-primary"
                : "rounded-tl-sm bg-bg-card text-text-primary"
            )}
          >
            {message.content.split("\n").map((line, i) => (
              <p key={i} className={line.trim() === "" ? "h-1.5" : ""}>
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Inline BoM table */}
        {message.bom && message.bom.length > 0 && (
          <InlineBom lines={message.bom} bomDraftId={message.bomDraftId} />
        )}

        {/* Quick reply buttons */}
        {message.quickReplies && message.quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.quickReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => onQuickReply(reply)}
                className="rounded-full border border-accent/30 bg-accent-muted px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-bg-primary"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className={cn("text-[10px] text-text-tertiary", isUser && "text-right")}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function InlineBom({ lines, bomDraftId }: { lines: BomLineData[]; bomDraftId?: string }) {
  const total = lines.reduce((s, l) => s + l.unitListPrice * l.quantity, 0);

  function downloadCsv() {
    const header = "Part Number,Description,Qty,Unit List Price,Extended Price,Category\n";
    const rows = lines
      .map((l) =>
        `${l.sku},"${(l.description ?? "").replace(/"/g, '""')}",${l.quantity},${l.unitListPrice.toFixed(2)},${(l.unitListPrice * l.quantity).toFixed(2)},${l.category}`
      )
      .join("\n");
    const csv = "\uFEFF" + header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `BOMatic_Estimate_${bomDraftId ?? Date.now()}.csv`);
  }

  function downloadXlsx() {
    // Build a simple XLSX via the export API if we have a saved ID
    if (bomDraftId) {
      window.open(`/api/export?bomDraftId=${bomDraftId}&format=xlsx`, "_blank");
      return;
    }
    // Fallback: download as CSV if not saved
    downloadCsv();
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-[#1e1e2a] bg-bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e2a] px-3 py-1.5">
        <span className="text-[11px] font-medium text-text-secondary">
          BoM — {lines.length} items
        </span>
        {bomDraftId && (
          <span className="rounded bg-success-muted px-1.5 py-0.5 text-[10px] text-success">
            Saved
          </span>
        )}
      </div>

      {/* Table */}
      <div className="max-h-48 overflow-y-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#1e1e2a] text-text-tertiary">
              <th className="px-2 py-1.5 text-left font-medium">SKU</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2a]/50">
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-bg-elevated">
                <td className="px-2 py-1 font-mono text-text-primary">{l.sku}</td>
                <td className="px-2 py-1 text-right text-text-secondary">{l.quantity}</td>
                <td className="px-2 py-1 text-right font-mono text-text-secondary">
                  {l.unitListPrice > 0 ? fmtUSD(l.unitListPrice) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-[#1e1e2a] px-3 py-1.5">
        <span className="text-[11px] text-text-tertiary">Total</span>
        <span className="font-mono text-xs font-medium text-accent">{fmtUSD(total)}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 border-t border-[#1e1e2a] px-3 py-2">
        {bomDraftId && (
          <a
            href={`/estimates/${bomDraftId}`}
            className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-bg-primary hover:bg-accent-hover"
          >
            <ExternalLink size={10} /> Review Console
          </a>
        )}
        <button
          onClick={downloadCsv}
          className="rounded border border-[#1e1e2a] px-2.5 py-1 text-[11px] text-text-secondary hover:border-[#2a2a3a] hover:text-text-primary"
        >
          CSV
        </button>
        <button
          onClick={downloadXlsx}
          className="rounded border border-[#1e1e2a] px-2.5 py-1 text-[11px] text-text-secondary hover:border-[#2a2a3a] hover:text-text-primary"
        >
          XLSX
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractBom(text: string): BomLineData[] | null {
  // Try ```bom block first (our preferred format)
  const bomMatch = text.match(/```bom\n([\s\S]*?)```/);
  if (bomMatch) {
    try {
      const parsed = JSON.parse(bomMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try ```json block (Gemini often uses this)
  const jsonMatch = text.match(/```json\n([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try any ``` code block containing JSON array with SKUs
  const codeMatch = text.match(/```\n?([\s\S]*?)```/);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try bare JSON array in the text (no code fence)
  const bareMatch = text.match(/\[\s*\{[^]*"sku"\s*:[^]*\}\s*\]/);
  if (bareMatch) {
    try {
      const parsed = JSON.parse(bareMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  return null;
}

function extractQuickReplies(text: string): string[] {
  // Look for [quick-replies: "opt1", "opt2", "opt3"] in the response
  const match = text.match(/\[quick-replies:\s*(.*?)\]/);
  if (!match) return [];
  try {
    const items = match[1].match(/"([^"]+)"/g);
    return items ? items.map((s) => s.replace(/"/g, "")) : [];
  } catch { return []; }
}

function fmtUSD(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
