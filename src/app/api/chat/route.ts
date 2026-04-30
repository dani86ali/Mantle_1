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

const SYSTEM_PROMPT = `You are BOMatic, an AI-powered Cisco presales engineer assistant.

## CRITICAL RULE — NO EXCEPTIONS
You MUST call catalog_lookup BEFORE mentioning or using ANY SKU. You are FORBIDDEN from typing a SKU in your response unless catalog_lookup has returned it. If you are unsure of a SKU, search for it first. If catalog_lookup says a SKU does not exist, do NOT use it.

## Mandatory workflow — follow this EVERY time
1. FIRST: Call catalog_lookup with candidate SKUs to verify they exist and get pricing
2. SECOND: Call mapped_services for each hardware SKU to find required licenses, services, and accessories
3. THIRD: Build the BoM using ONLY SKUs that were returned by catalog_lookup
4. FOURTH: Output the final BoM in the format below

## Common SKU patterns (use these as starting points for catalog_lookup)
- Catalyst 9300L switches: C9300L-24UXG-4X-A, C9300L-24P-4X-A, C9300L-48P-4X-A
- Catalyst 9300 switches: C9300-24P-A, C9300-48P-A, C9300-24T-A, C9300-48U-A
- Catalyst 9200L switches: C9200L-24P-4G-A, C9200L-48P-4X-A
- Wireless APs: C9120AXE-E (external antenna), C9120AXI-E (internal antenna), C9130AXI-E
- Wireless controllers: C9800-L-F-K9, C9800-40-K9
- DNA licenses: C9300L-DNA-A-24, C9300L-DNA-A-24-3Y, C9300-DNA-A-48-3Y
- SmartNet: CON-SNT-C93024GA, CON-SNT-C930048P
- Power supplies: PWR-C1-1100WAC-P (primary), PWR-C1-1100WAC-P/2 (secondary/redundant)
- Stacking: C9300L-STACK-KIT, C9300L-STACK, STACK-T3-50CM
- Fan modules: FAN-T2 (3 per C9300L switch)
- Power cables: CAB-TA-UK (UK/Saudi), CAB-TA-NA (North America), CAB-TA-EU (Europe)

## Domain rules
- Redundant PSU = primary + secondary SKUs (DIFFERENT part numbers, e.g., PWR-C1-1100WAC-P and PWR-C1-1100WAC-P/2)
- Stacking = kit + modules (2 per switch) + cables (three separate line items)
- External antenna APs (C9120AXE) need 4 antennas each (AIR-ANT2524DW-RS)
- Fan modules: 3 per C9300L switch (FAN-T2)
- DNA opt-out (C9120AX-DNA-OPTOUT) is valid for APs — not a missing license
- SmartNet is optional for APs — not an error
- UK power cables (CAB-TA-UK) are standard for Saudi Arabia

## Output format
When you produce a BoM, format it as a JSON block:
\`\`\`bom
[{"sku": "...", "description": "...", "quantity": 1, "unitListPrice": 0, "category": "hardware|license|subscription|service|accessory|software", "serviceDurationMonths": null, "leadTimeDays": null}]
\`\`\`

REMEMBER: Call catalog_lookup FIRST. Never guess a SKU. Never invent a SKU. Every SKU in your output MUST have been verified by catalog_lookup.`;

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
