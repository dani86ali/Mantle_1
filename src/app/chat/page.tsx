"use client";

import { useState, useRef, useEffect } from "react";

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
  serviceDurationMonths?: number | null;
  leadTimeDays?: number | null;
}

export default function ChatPage() {
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  function handleFileSelect(file: File) {
    const allowed = /\.(csv|xlsx|xls|pdf)$/i;
    if (!allowed.test(file.name)) {
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      return;
    }

    setUploadedFile(file);

    // Read file content as text for CSV, or note for binary
    if (file.name.endsWith(".csv") || file.type === "text/csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileContent(e.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      setFileContent(`[Binary file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && !uploadedFile) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || `Uploaded file: ${uploadedFile?.name}`,
      fileName: uploadedFile?.name,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setUploadedFile(null);
    setSending(true);

    // Build conversation history for the API
    const history = [...messages, userMessage].map((m) => ({
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
          fileName: userMessage.fileName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      // Parse BoM from response if present
      const bom = extractBom(data.response);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        bom: bom ?? undefined,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">BOMatic Chat</h1>
        <p className="text-xs text-gray-500">
          Describe what you need or upload a BoM — the agent will build,
          validate, and export it.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <EmptyState />
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {sending && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                B
              </div>
              <div className="rounded-lg bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-primary" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto max-w-3xl">
          {/* File chip */}
          {uploadedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm">
              <FileIcon />
              <span className="truncate">{uploadedFile.name}</span>
              <span className="text-xs text-gray-400">
                ({(uploadedFile.size / 1024).toFixed(0)} KB)
              </span>
              <button
                onClick={() => {
                  setUploadedFile(null);
                  setFileContent(null);
                }}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                x
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              title="Upload CSV, XLSX, or PDF"
            >
              <UploadIcon />
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

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you need, paste a BoM, or upload a file..."
              className="max-h-40 min-h-[36px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              rows={1}
              disabled={sending}
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending || (!input.trim() && !uploadedFile)}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-primary text-white hover:opacity-90 disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10">
        <span className="text-2xl font-bold text-brand-primary">B</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-gray-900">
        BOMatic Agent
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        Describe your Cisco networking requirements and I'll design a
        validated BoM. You can also upload an existing BoM for validation.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {[
          "2x Catalyst 9300L 24-port switches with DNA Advantage, stacking, redundant PSU",
          "8x Cisco 9120AX external antenna APs, ceiling mount, no DNA",
          "10x 48-port PoE+ switches for campus refresh with SmartNet",
          "Validate my BoM — I'll upload the CSV",
        ].map((prompt, i) => (
          <button
            key={i}
            className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition hover:border-brand-primary hover:bg-brand-primary/5"
            onClick={() => {
              const input = document.querySelector("textarea");
              if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set;
                nativeInputValueSetter?.call(input, prompt);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.focus();
              }
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  // Clean the response text (remove the bom JSON block for display)
  const displayContent = message.content
    .replace(/```bom\n[\s\S]*?```/g, "")
    .trim();

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          isUser ? "bg-gray-700" : "bg-brand-primary"
        }`}
      >
        {isUser ? "You" : "B"}
      </div>

      {/* Content */}
      <div className={`max-w-2xl space-y-3 ${isUser ? "text-right" : ""}`}>
        {/* File attachment indicator */}
        {message.fileName && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-600 ${
              isUser ? "ml-auto" : ""
            }`}
          >
            <FileIcon />
            {message.fileName}
          </div>
        )}

        {/* Text */}
        {displayContent && (
          <div
            className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-brand-primary text-white"
                : "bg-white shadow-sm"
            }`}
          >
            <FormattedText text={displayContent} />
          </div>
        )}

        {/* Inline BoM table */}
        {message.bom && message.bom.length > 0 && (
          <BomTable lines={message.bom} />
        )}
      </div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  // Simple markdown-like formatting: bold, bullet points, line breaks
  const lines = text.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        // Bold
        let formatted = line.replace(
          /\*\*(.*?)\*\*/g,
          '<strong>$1</strong>'
        );

        // Bullet points
        if (line.match(/^[-*]\s/)) {
          formatted = "  " + formatted.replace(/^[-*]\s/, "- ");
        }

        return (
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      })}
    </div>
  );
}

function BomTable({ lines }: { lines: BomLineData[] }) {
  const total = lines.reduce(
    (sum, l) => sum + l.unitListPrice * l.quantity,
    0
  );

  // Build a blob URL for CSV download
  function downloadCsv() {
    const headers = "Part Number,Description,Qty,Unit List Price,Extended Price,Category\n";
    const rows = lines
      .map(
        (l) =>
          `${l.sku},"${l.description}",${l.quantity},${l.unitListPrice.toFixed(2)},${(l.unitListPrice * l.quantity).toFixed(2)},${l.category}`
      )
      .join("\n");
    const csv = "\uFEFF" + headers + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOMatic_Estimate_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="text-xs font-medium text-gray-500">
          Bill of Materials — {lines.length} line items
        </span>
        <div className="flex gap-1">
          <button
            onClick={downloadCsv}
            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Cat</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">
                Unit Price
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Extended
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-1.5 font-mono font-medium">
                  {line.sku}
                </td>
                <td className="max-w-xs truncate px-3 py-1.5 text-gray-600">
                  {line.description}
                </td>
                <td className="px-3 py-1.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {line.category}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">{line.quantity}</td>
                <td className="px-3 py-1.5 text-right">
                  {formatCurrency(line.unitListPrice)}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  {formatCurrency(line.unitListPrice * line.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-medium">
              <td colSpan={5} className="px-3 py-2 text-right">
                Total List Price:
              </td>
              <td className="px-3 py-2 text-right">
                {formatCurrency(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
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
  } catch {
    // Not valid JSON
  }
  return null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

// ─── Icons ──────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
