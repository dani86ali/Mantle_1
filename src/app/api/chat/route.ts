/**
 * Chat API route — multi-turn conversation with the BOMatic agent.
 *
 * Supports Anthropic (Claude) and Google (Gemini) via LLM_PROVIDER env var.
 * Both use the same tool-use loop with identical tool definitions.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeTool, type ToolContext } from "@/lib/agent/steps/tool-executor";
import { DEFAULT_STANDARDS } from "@/types/tenant";
import {
  getProvider,
  AnthropicLlm,
  GeminiLlm,
  type ToolResult,
} from "@/lib/llm/provider";

const SYSTEM_PROMPT = `You are BOMatic, an AI-powered Cisco presales engineer assistant. You help engineers build, validate, and export Bills of Materials (BoMs) for Cisco networking equipment.

Your capabilities:
- Design BoMs from requirements (Access Switching: Catalyst 9200/9300/9400/9500, Wireless: Catalyst 9800 controllers, 9100/9120/9130 APs)
- Validate uploaded BoMs against Cisco catalog data
- Look up SKU pricing, availability, EoX status via catalog_lookup
- Find required licenses, services, accessories via mapped_services
- Run validation rules (SKU existence, EoX, region, PoE, optics, PSU, license, stacking, support)
- Create CCW Estimates via create_estimate
- Search customers via search_customer

Key domain rules:
- Redundant PSU = primary + secondary SKUs (e.g., PWR-C1-1100WAC-P and PWR-C1-1100WAC-P/2)
- Stacking = kit + modules (2 per switch) + cables
- External antenna APs (C9120AXE) need 4 antennas each
- Fan modules: 3 per C9300L switch
- DNA opt-out is valid for APs (not a missing license)
- SmartNet is optional for APs (not an error)
- Always verify SKUs via catalog_lookup before including them
- Never invent SKUs — every SKU must come from a catalog lookup

When you produce a BoM, format it as a JSON block with this structure:
\`\`\`bom
[{"sku": "...", "description": "...", "quantity": 1, "unitListPrice": 0, "category": "hardware|license|subscription|service|accessory|software", "serviceDurationMonths": null, "leadTimeDays": null}]
\`\`\`

When the user asks to modify the BoM, adjust the relevant lines and output the full updated BoM in the same format.

Be concise and specific. Use the tools to verify everything.`;

const messageSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  fileContent: z.string().optional(),
  fileName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof messageSchema>;
  try {
    const raw = await request.json();
    body = messageSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const toolContext: ToolContext = {
    tenantId: "chat-session",
    priceListId: "Global Price List Emerging (USD)",
    credentials: {
      clientId: "mock",
      clientSecret: "mock",
      username: "mock",
      password: "mock",
    },
    standards: DEFAULT_STANDARDS,
    region: "EMEAR",
    country: "SA",
    requirements: {},
    ciscoCalls: [],
  };

  // Prepend file content to last user message if present
  if (body.fileContent && body.messages.length > 0) {
    const last = body.messages[body.messages.length - 1];
    if (last.role === "user") {
      last.content = `[Uploaded file: ${body.fileName}]\n\n${body.fileContent}\n\n${last.content}`;
    }
  }

  const provider = getProvider();

  try {
    if (provider === "gemini") {
      return await handleGemini(body.messages, toolContext);
    } else {
      return await handleAnthropic(body.messages, toolContext);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Agent error (${provider}): ${message}` },
      { status: 500 }
    );
  }
}

// ─── Anthropic handler ──────────────────────────────────────────────────

async function handleAnthropic(
  chatMessages: { role: "user" | "assistant"; content: string }[],
  toolContext: ToolContext
) {
  const llm = new AnthropicLlm();
  const messages = llm.buildMessages(chatMessages);

  let finalText = "";
  const MAX_ITERATIONS = 12;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llm.chat(SYSTEM_PROMPT, messages);
    finalText += response.text;

    if (response.done) break;

    // Execute tools
    llm.appendAssistantWithToolUse(messages, response);
    const results: ToolResult[] = [];
    for (const tc of response.toolCalls) {
      const result = await executeTool(tc.name, tc.input, toolContext);
      results.push({
        toolCallId: tc.id,
        name: tc.name,
        result: JSON.stringify(result.data),
      });
    }
    llm.appendToolResults(messages, results);
  }

  return NextResponse.json({
    response: finalText,
    provider: "anthropic",
    ciscoCalls: toolContext.ciscoCalls.length,
  });
}

// ─── Gemini handler ─────────────────────────────────────────────────────

async function handleGemini(
  chatMessages: { role: "user" | "assistant"; content: string }[],
  toolContext: ToolContext
) {
  const llm = new GeminiLlm();
  const contents = llm.buildContents(chatMessages);

  let finalText = "";
  const MAX_ITERATIONS = 12;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llm.chat(SYSTEM_PROMPT, contents);
    finalText += response.text;

    if (response.done) break;

    // Execute tools
    llm.appendAssistantWithToolUse(contents, response);
    const results: ToolResult[] = [];
    for (const tc of response.toolCalls) {
      const result = await executeTool(tc.name, tc.input, toolContext);
      results.push({
        toolCallId: tc.id,
        name: tc.name,
        result: JSON.stringify(result.data),
      });
    }
    llm.appendToolResults(contents, results);
  }

  return NextResponse.json({
    response: finalText,
    provider: "gemini",
    ciscoCalls: toolContext.ciscoCalls.length,
  });
}
