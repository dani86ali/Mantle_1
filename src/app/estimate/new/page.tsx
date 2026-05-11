"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  FileText,
  Upload,
  Send,
  Paperclip,
  X,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "chat" | "form";
type IntakePath = "path_a" | "path_b";
type Domain = "access_switching" | "wireless" | "access_switching_wireless";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileName?: string;
  bom?: BomLineData[];
  timestamp: Date;
}

interface BomLineData {
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  category: string;
}

export default function NewEstimatePage() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <div className="flex h-full flex-col">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-bg-card px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            New Estimate
          </h1>
          <p className="text-xs text-text-tertiary">
            Create a new Cisco presales estimate
          </p>
        </div>
        <div className="flex rounded-button border border-[var(--border)] bg-bg-primary p-0.5">
          <button
            onClick={() => setMode("chat")}
            className={cn(
              "flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "chat"
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <MessageSquare size={14} /> Chat
          </button>
          <button
            onClick={() => setMode("form")}
            className={cn(
              "flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "form"
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <FileText size={14} /> Form
          </button>
        </div>
      </div>

      {mode === "chat" ? <ChatMode /> : <FormMode />}
    </div>
  );
}

// ─── Chat Mode ──────────────────────────────────────────────────────────

function ChatMode() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  function handleFileSelect(file: File) {
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

  async function handleSend() {
    const text = input.trim();
    if (!text && !uploadedFile) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || `Uploaded: ${uploadedFile?.name}`,
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
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          bom: bom ?? undefined,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
      setFileContent(null);
    }
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-muted">
            <MessageSquare size={24} className="text-accent" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            What would you like to build?
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Describe your requirements or upload an existing BoM
          </p>
          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              "2x Catalyst 9300L 24-port switches with DNA Advantage, stacking, redundant PSU, Saudi Arabia",
              "8x C9120AX external antenna APs, ceiling mount, no DNA subscription",
              "10x 48-port PoE+ switches for campus refresh with SmartNet",
              "Validate my uploaded BoM against Cisco catalog",
            ].map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInput(prompt)}
                className="rounded-card border border-[var(--border)] bg-bg-card px-4 py-3 text-left text-xs text-text-secondary transition-colors hover:border-[var(--border-hover)] hover:text-text-primary"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input area */}
        <ChatInput
          input={input}
          setInput={setInput}
          sending={sending}
          uploadedFile={uploadedFile}
          setUploadedFile={setUploadedFile}
          setFileContent={setFileContent}
          fileInputRef={fileInputRef}
          textareaRef={textareaRef}
          onSend={handleSend}
          onFileSelect={handleFileSelect}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {sending && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-text-primary">
                B
              </div>
              <div className="rounded-card bg-bg-card px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  Processing...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        sending={sending}
        uploadedFile={uploadedFile}
        setUploadedFile={setUploadedFile}
        setFileContent={setFileContent}
        fileInputRef={fileInputRef}
        textareaRef={textareaRef}
        onSend={handleSend}
        onFileSelect={handleFileSelect}
      />
    </div>
  );
}

function ChatInput({
  input, setInput, sending, uploadedFile, setUploadedFile, setFileContent,
  fileInputRef, textareaRef, onSend, onFileSelect,
}: {
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  uploadedFile: File | null;
  setUploadedFile: (f: File | null) => void;
  setFileContent: (c: string | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onSend: () => void;
  onFileSelect: (f: File) => void;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-bg-card px-6 py-3">
      <div className="mx-auto max-w-3xl">
        {uploadedFile && (
          <div className="mb-2 flex items-center gap-2 rounded-input bg-bg-primary px-3 py-1.5 text-sm">
            <FileSpreadsheet size={14} className="text-accent" />
            <span className="truncate text-text-secondary">{uploadedFile.name}</span>
            <button
              onClick={() => { setUploadedFile(null); setFileContent(null); }}
              className="ml-auto text-text-tertiary hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-button border border-[var(--border)] text-text-tertiary hover:border-[var(--border-hover)] hover:text-text-secondary"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!sending) onSend();
              }
            }}
            placeholder="Describe requirements or paste a BoM..."
            className="max-h-40 min-h-[36px] flex-1 resize-none rounded-button border border-[var(--border)] bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            rows={1}
            disabled={sending}
          />
          <button
            onClick={onSend}
            disabled={sending || (!input.trim() && !uploadedFile)}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-accent text-text-primary hover:bg-accent-hover disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const displayContent = message.content.replace(/```bom\n[\s\S]*?```/g, "").trim();

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isUser ? "bg-blue text-white" : "bg-accent text-text-primary"
        )}
      >
        {isUser ? "You" : "B"}
      </div>
      <div className={cn("max-w-2xl space-y-3", isUser && "text-right")}>
        {message.fileName && (
          <span className="inline-flex items-center gap-1.5 rounded-input bg-bg-elevated px-2.5 py-1 text-xs text-text-secondary">
            <FileSpreadsheet size={12} /> {message.fileName}
          </span>
        )}
        {displayContent && (
          <div
            className={cn(
              "rounded-card px-4 py-3 text-sm leading-relaxed",
              isUser ? "bg-blue text-white" : "bg-bg-card text-text-primary"
            )}
          >
            {displayContent.split("\n").map((line, i) => (
              <p key={i} className={line.trim() === "" ? "h-2" : ""}>
                {line}
              </p>
            ))}
          </div>
        )}
        {message.bom && message.bom.length > 0 && (
          <InlineBomTable lines={message.bom} />
        )}
      </div>
    </div>
  );
}

function InlineBomTable({ lines }: { lines: BomLineData[] }) {
  const total = lines.reduce((s, l) => s + l.unitListPrice * l.quantity, 0);
  return (
    <div className="rounded-card border border-[var(--border)] bg-bg-card">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">
          Bill of Materials — {lines.length} items
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-text-tertiary">
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Extended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-bg-elevated">
                <td className="whitespace-nowrap px-3 py-1.5 font-mono font-medium text-text-primary">
                  {l.sku}
                </td>
                <td className="max-w-xs truncate px-3 py-1.5 text-text-secondary">
                  {l.description}
                </td>
                <td className="px-3 py-1.5 text-right text-text-primary">{l.quantity}</td>
                <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                  {fmtUSD(l.unitListPrice)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-medium text-text-primary">
                  {fmtUSD(l.unitListPrice * l.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)] font-medium">
              <td colSpan={4} className="px-3 py-2 text-right text-text-secondary">
                Total:
              </td>
              <td className="px-3 py-2 text-right font-mono text-accent">
                {fmtUSD(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Form Mode ──────────────────────────────────────────────────────────

function FormMode() {
  const [path, setPath] = useState<IntakePath | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [region, setRegion] = useState("EMEAR");
  const [country, setCountry] = useState("SA");
  const [domain, setDomain] = useState<Domain>("access_switching");
  const [keyNeeds, setKeyNeeds] = useState("");
  const [poeRequired, setPoeRequired] = useState(false);
  const [redundancyRequired, setRedundancyRequired] = useState(true);
  const [stackingRequired, setStackingRequired] = useState(false);
  const [licenseTier, setLicenseTier] = useState<"essentials" | "advantage">("advantage");
  const [pastedBom, setPastedBom] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path, customerName, region, country, domain, keyNeeds,
          poeRequired, redundancyRequired, stackingRequired, licenseTier,
          uploadedBomLines: pastedBom ? parseBomText(pastedBom) : undefined,
        }),
      });
      if (res.ok) setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-muted">
            <FileText size={24} className="text-success" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text-primary">Request Submitted</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Your estimate is being processed by the AI agent.
          </p>
          <button
            onClick={() => { setSubmitted(false); setPath(null); }}
            className="mt-6 rounded-button bg-accent px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-hover"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <h2 className="text-center text-lg font-semibold text-text-primary">
            Choose your path
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => setPath("path_a")}
              className="rounded-card border border-[var(--border)] bg-bg-card p-6 text-left transition-colors hover:border-accent"
            >
              <Upload size={20} className="text-accent" />
              <h3 className="mt-3 font-medium text-text-primary">I have a BoM</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Upload or paste an existing BoM for validation
              </p>
            </button>
            <button
              onClick={() => setPath("path_b")}
              className="rounded-card border border-[var(--border)] bg-bg-card p-6 text-left transition-colors hover:border-accent"
            >
              <FileText size={20} className="text-blue" />
              <h3 className="mt-3 font-medium text-text-primary">I need a configuration</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Describe requirements and the AI designs the BoM
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl">
        <button onClick={() => setPath(null)} className="mb-4 text-sm text-text-tertiary hover:text-text-secondary">
          &larr; Back
        </button>
        <h2 className="text-lg font-semibold text-text-primary">
          {path === "path_a" ? "Validate Existing BoM" : "Design New BoM"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Customer Name" required>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required className="form-input" />
            </FormField>
            <FormField label="Domain">
              <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="form-input">
                <option value="access_switching">Access Switching</option>
                <option value="wireless">Wireless</option>
                <option value="access_switching_wireless">Both</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Region">
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="form-input">
                <option value="EMEAR">EMEAR</option>
                <option value="AMER">AMER</option>
                <option value="APJC">APJC</option>
              </select>
            </FormField>
            <FormField label="Country">
              <input value={country} onChange={(e) => setCountry(e.target.value)} className="form-input" />
            </FormField>
          </div>

          {path === "path_a" && (
            <FormField label="Paste BoM lines">
              <textarea
                value={pastedBom}
                onChange={(e) => setPastedBom(e.target.value)}
                placeholder="C9300L-24UXG-4X-A, 2&#10;C9300L-DNA-A-24-3Y, 2"
                className="form-input font-mono"
                rows={6}
              />
            </FormField>
          )}

          {path === "path_b" && (
            <FormField label="Key Needs" required>
              <textarea
                value={keyNeeds}
                onChange={(e) => setKeyNeeds(e.target.value)}
                placeholder="e.g., 48-port PoE+ switches for 3 floors..."
                className="form-input"
                rows={4}
                required
              />
            </FormField>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={poeRequired} onChange={(e) => setPoeRequired(e.target.checked)} className="accent-accent" /> PoE
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={redundancyRequired} onChange={(e) => setRedundancyRequired(e.target.checked)} className="accent-accent" /> Redundant PSU
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={stackingRequired} onChange={(e) => setStackingRequired(e.target.checked)} className="accent-accent" /> Stacking
            </label>
          </div>

          <FormField label="License Tier">
            <select value={licenseTier} onChange={(e) => setLicenseTier(e.target.value as "essentials" | "advantage")} className="form-input w-48">
              <option value="advantage">Network Advantage</option>
              <option value="essentials">Network Essentials</option>
            </select>
          </FormField>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-button bg-accent py-2.5 text-sm font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-secondary">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractBom(text: string): BomLineData[] | null {
  const match = text.match(/```bom\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON */ }
  return null;
}

function fmtUSD(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function parseBomText(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[,\t]+/).map((p) => p.trim());
    return { sku: parts[0] ?? "", quantity: parseInt(parts[1] ?? "1", 10) || 1 };
  }).filter((i) => i.sku.length > 0);
}
