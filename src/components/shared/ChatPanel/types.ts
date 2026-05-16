/** Chat widget message + inline BoM shapes. Kept together because they cross
 *  several sub-components in the ChatPanel folder. */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileName?: string;
  bom?: BomLineData[];
  bomDraftId?: string;
  quickReplies?: string[];
  timestamp: Date;
}

export interface BomLineData {
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  category: string;
  serviceDurationMonths?: number | null;
  leadTimeDays?: number | null;
}
