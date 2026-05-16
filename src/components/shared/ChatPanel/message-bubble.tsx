import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineBom } from "./inline-bom";
import type { ChatMessage } from "./types";

export function MessageBubble({
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-text-primary">
          B
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {message.fileName && (
          <span className="inline-flex items-center gap-1 rounded bg-bg-elevated px-2 py-0.5 text-[11px] text-text-secondary">
            <FileSpreadsheet size={10} /> {message.fileName}
          </span>
        )}

        {message.content && (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
              isUser
                ? "rounded-tr-sm bg-accent text-text-primary"
                : "rounded-tl-sm bg-bg-card text-text-primary",
            )}
          >
            {message.content.split("\n").map((line, i) => (
              <p key={i} className={line.trim() === "" ? "h-1.5" : ""}>
                {line}
              </p>
            ))}
          </div>
        )}

        {message.bom && message.bom.length > 0 && (
          <InlineBom lines={message.bom} bomDraftId={message.bomDraftId} />
        )}

        {message.quickReplies && message.quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.quickReplies.map((reply, i) => (
              <button
                key={i}
                onClick={() => onQuickReply(reply)}
                className="rounded-full border border-accent/30 bg-accent-muted px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-text-primary"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        <p className={cn("text-[10px] text-text-tertiary", isUser && "text-right")}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
