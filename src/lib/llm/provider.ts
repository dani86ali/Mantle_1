/**
 * LLM provider abstraction.
 *
 * Supports Anthropic (Claude) and Google (Gemini) via LLM_PROVIDER env var.
 * Both use the same tool-use loop structure with identical tool definitions.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  GoogleGenerativeAI,
  type Content,
  type Part,
  SchemaType,
} from "@google/generative-ai";
import { AGENT_TOOLS } from "@/lib/agent/tools";

export type LlmProvider = "anthropic" | "gemini";

export function getProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER || "anthropic";
  if (provider !== "anthropic" && provider !== "gemini") {
    throw new Error(`Unknown LLM_PROVIDER: ${provider}. Use "anthropic" or "gemini".`);
  }
  return provider;
}

// ─── Unified message types ──────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  toolCalls: ToolCall[];
  done: boolean; // true if model finished (no more tool calls)
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
}

// ─── Anthropic implementation ───────────────────────────────────────────

export class AnthropicLlm {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async chat(
    systemPrompt: string,
    messages: Anthropic.MessageParam[]
  ): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-5-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    });

    let text = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const done =
      toolCalls.length === 0 || response.stop_reason === "end_turn";

    return { text, toolCalls, done };
  }

  buildMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
    return history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  appendAssistantWithToolUse(
    messages: Anthropic.MessageParam[],
    response: LlmResponse
  ): void {
    const content: Anthropic.ContentBlockParam[] = [];
    if (response.text) {
      content.push({ type: "text", text: response.text });
    }
    for (const tc of response.toolCalls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
    messages.push({ role: "assistant", content });
  }

  appendToolResults(
    messages: Anthropic.MessageParam[],
    results: ToolResult[]
  ): void {
    messages.push({
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.toolCallId,
        content: r.result,
      })),
    });
  }
}

// ─── Gemini implementation ──────────────────────────────────────────────

export class GeminiLlm {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(
    systemPrompt: string,
    contents: Content[]
  ): Promise<LlmResponse> {
    const model = this.genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash-lite",
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: convertToolsToGemini() as never }],
    });

    const result = await model.generateContent({ contents });
    const response = result.response;

    let text = "";
    const toolCalls: ToolCall[] = [];

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) {
          text += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    const done = toolCalls.length === 0;

    return { text, toolCalls, done };
  }

  buildContents(history: ChatMessage[]): Content[] {
    return history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  }

  appendAssistantWithToolUse(
    contents: Content[],
    response: LlmResponse
  ): void {
    const parts: Part[] = [];
    if (response.text) {
      parts.push({ text: response.text });
    }
    for (const tc of response.toolCalls) {
      parts.push({
        functionCall: {
          name: tc.name,
          args: tc.input,
        },
      });
    }
    contents.push({ role: "model", parts });
  }

  appendToolResults(
    contents: Content[],
    results: ToolResult[]
  ): void {
    const parts: Part[] = results.map((r) => ({
      functionResponse: {
        name: r.name,
        response: JSON.parse(r.result),
      },
    }));
    contents.push({ role: "user", parts });
  }
}

// ─── Tool conversion: Anthropic → Gemini ────────────────────────────────

function convertToolsToGemini() {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    parameters: convertSchema(tool.input_schema) as {
      type: SchemaType;
      properties: Record<string, unknown>;
    },
  }));
}

function convertSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (schema.type === "object") {
    result.type = SchemaType.OBJECT;
    if (schema.properties) {
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        schema.properties as Record<string, Record<string, unknown>>
      )) {
        props[key] = convertSchema(val);
      }
      result.properties = props;
    }
    if (schema.required) {
      result.required = schema.required;
    }
  } else if (schema.type === "array") {
    result.type = SchemaType.ARRAY;
    if (schema.items) {
      result.items = convertSchema(schema.items as Record<string, unknown>);
    }
  } else if (schema.type === "string") {
    result.type = SchemaType.STRING;
    if (schema.description) result.description = schema.description;
  } else if (schema.type === "number") {
    result.type = SchemaType.NUMBER;
    if (schema.description) result.description = schema.description;
  } else if (schema.type === "boolean") {
    result.type = SchemaType.BOOLEAN;
    if (schema.description) result.description = schema.description;
  }

  if (schema.description && !result.description) {
    result.description = schema.description;
  }

  return result;
}
