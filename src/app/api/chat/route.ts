/**
 * Chat API route — multi-turn conversation with the BOMatic agent.
 *
 * Accepts messages + conversation history, calls Anthropic with tool-use,
 * executes tools (catalog lookup, mapped services, validation, estimate),
 * returns the assistant's response with any tool results.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { executeTool, type ToolContext } from "@/lib/agent/steps/tool-executor";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { DEFAULT_STANDARDS } from "@/types/tenant";

const client = new Anthropic();

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

  // Build the message list for Anthropic
  const anthropicMessages: Anthropic.MessageParam[] = body.messages.map(
    (m) => ({
      role: m.role,
      content: m.content,
    })
  );

  // If there's file content, prepend it to the last user message
  if (body.fileContent && anthropicMessages.length > 0) {
    const lastMsg = anthropicMessages[anthropicMessages.length - 1];
    if (lastMsg.role === "user" && typeof lastMsg.content === "string") {
      lastMsg.content = `[Uploaded file: ${body.fileName}]\n\n${body.fileContent}\n\n${lastMsg.content}`;
    }
  }

  try {
    // Tool-use loop — run until the model stops calling tools
    let finalText = "";
    let iterations = 0;
    const MAX_ITERATIONS = 12;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: "claude-sonnet-4-5-20241022",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: AGENT_TOOLS,
        messages: anthropicMessages,
      });

      // Collect text and tool uses from response
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          finalText += block.text;
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
        }
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
        break;
      }

      // Execute tools and add results to conversation
      anthropicMessages.push({
        role: "assistant",
        content: response.content,
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolContext
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result.data),
        });
      }

      anthropicMessages.push({
        role: "user",
        content: toolResults,
      });
    }

    return NextResponse.json({
      response: finalText,
      ciscoCalls: toolContext.ciscoCalls.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Agent error: ${message}` },
      { status: 500 }
    );
  }
}
