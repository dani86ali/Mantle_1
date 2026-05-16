import { useEffect, useState } from "react";
import type { ChatMessage } from "./types";

/** Persist chat messages to sessionStorage. Hydration-safe: the initial render
 *  uses an empty array, then a useEffect lifts the saved array in after mount
 *  to avoid SSR/CSR markup mismatch. */
export function usePersistentMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bomatic-chat");
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: ChatMessage) => ({ ...m, timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem("bomatic-chat", JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages, loaded]);

  const clearMessages = () => {
    setMessages([]);
    sessionStorage.removeItem("bomatic-chat");
  };

  return { messages, setMessages, clearMessages };
}
