"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight, ExternalLink, FileSpreadsheet, Loader2, MessageSquare, Minus, Paperclip, Send, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./ChatPanel/empty-state";
import { MessageBubble } from "./ChatPanel/message-bubble";
import { extractBom, extractCustomerName, extractQuickReplies } from "./ChatPanel/extractors";
import { usePersistentMessages } from "./ChatPanel/use-persistent-messages";
import type { ChatMessage } from "./ChatPanel/types";

type PanelSize = "compact" | "expanded" | "full";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const { messages, setMessages, clearMessages } = usePersistentMessages();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panelSize, setPanelSize] = useState<PanelSize>("compact");

  useEffect(() => {
    const saved = sessionStorage.getItem("bomatic-chat-size") as PanelSize;
    if (saved && ["compact", "expanded", "full"].includes(saved)) setPanelSize(saved);
  }, []);

  function cycleSize() {
    const next = panelSize === "compact" ? "expanded" : panelSize === "expanded" ? "full" : "compact";
    setPanelSize(next);
    sessionStorage.setItem("bomatic-chat-size", next);
  }

  const panelWidth = panelSize === "full" ? "100vw" : panelSize === "expanded" ? "700px" : "400px";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
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

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

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
      let cleanContent = data.response
        .replace(/```(?:bom|json)?\n[\s\S]*?```/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\[\s*\{[^]*?"sku"\s*:[^]*?\}\s*\]/g, "")
        .replace(/\[quick-replies:.*?\]/g, "")
        .trim();
      cleanContent = cleanContent.replace(/\n{3,}/g, "\n\n").trim();

      let bomDraftId: string | undefined;
      if (bom && bom.length > 0) {
        try {
          const allText = [...messages, userMsg].map((m) => m.content).join(" ");
          const customerName = extractCustomerName(allText);
          const saveRes = await fetch("/api/chat/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerName,
              requirements: userMsg.content,
              lines: bom,
            }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            bomDraftId = saveData.bomDraftId;
          }
        } catch { /* save failed silently — BoM still shows in chat */ }
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

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMinimized(false); }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/20 text-text-primary transition-transform hover:scale-105 active:scale-95"
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

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-[var(--border)] bg-bg-card px-4 py-2 shadow-lg">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-text-primary">B</div>
        <span className="text-sm font-medium text-text-primary">BOMatic AI</span>
        <button onClick={() => setMinimized(false)} className="ml-2 text-text-tertiary hover:text-text-primary">
          <ChevronRight size={16} className="rotate-[-90deg]" />
        </button>
        <button onClick={() => setOpen(false)} className="text-text-tertiary hover:text-text-primary">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-[var(--border)] bg-bg-primary shadow-2xl shadow-black/50 transition-all duration-200"
      style={{ width: panelWidth }}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-bg-card px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-text-primary">B</div>
          <div>
            <p className="text-sm font-semibold text-text-primary">BOMatic AI</p>
            <p className="text-[11px] text-text-tertiary">Cisco presales assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="flex h-7 items-center gap-1 rounded px-1.5 text-[10px] text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
              title="Clear chat"
            >Clear</button>
          )}
          <button
            onClick={cycleSize}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
            title={panelSize === "compact" ? "Expand" : panelSize === "expanded" ? "Full screen" : "Compact"}
          >
            {panelSize === "full" ? <Minus size={14} /> : <ExternalLink size={14} />}
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
          ><Minus size={14} /></button>
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
          ><X size={14} /></button>
        </div>
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-3 transition-colors",
          dragOver && "bg-accent/5 ring-2 ring-inset ring-accent/30",
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
              <MessageBubble key={msg.id} message={msg} onQuickReply={(text) => handleSend(text)} />
            ))}

            {sending && (
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-text-primary">B</div>
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

      <div className="border-t border-[var(--border)] bg-bg-card px-3 py-2.5">
        {uploadedFile && (
          <div className="mb-2 flex items-center gap-2 rounded bg-bg-primary px-2.5 py-1.5 text-xs">
            <FileSpreadsheet size={12} className="text-accent" />
            <span className="truncate text-text-secondary">{uploadedFile.name}</span>
            <button
              onClick={() => { setUploadedFile(null); setFileContent(null); }}
              className="ml-auto text-text-tertiary hover:text-text-primary"
            ><X size={12} /></button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-[var(--bg-elevated)] hover:text-text-secondary"
            title="Attach CSV, XLSX, or PDF"
          ><Paperclip size={15} /></button>
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
            className="max-h-[120px] min-h-[32px] flex-1 resize-none rounded border border-[var(--border)] bg-bg-primary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            rows={1}
            disabled={sending}
          />
          <button
            onClick={() => handleSend()}
            disabled={sending || (!input.trim() && !uploadedFile)}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent text-text-primary hover:bg-accent-hover disabled:opacity-30"
          ><Send size={14} /></button>
        </div>
      </div>
    </div>
  );
}
