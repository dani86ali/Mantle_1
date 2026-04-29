/**
 * BOMatic AI Agent Runtime.
 *
 * Direct Anthropic SDK tool-use loop. No LangChain, no agent framework.
 * Orchestrates: parse → suggest → validate → fix → assemble → summarize → detect-quote
 */

import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuid } from "uuid";
import { AGENT_TOOLS } from "./tools";
import {
  SYSTEM_PROMPT_SUGGEST_PATH_A,
  SYSTEM_PROMPT_SUGGEST_PATH_B,
  SYSTEM_PROMPT_PARSE,
  SYSTEM_PROMPT_SUMMARIZE,
  SYSTEM_PROMPT_QUOTE_DETECT,
} from "./prompts";
import { executeTool } from "./steps/tool-executor";
import type { Intake, IntakeRequirements } from "@/types/intake";
import type { BomLine, AgentSummary, QuoteAdvisory, AgentStep, LlmCallLog, CiscoCallLog } from "@/types/bom";
import type { StandardsConfig } from "@/types/tenant";

const MAX_AGENT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_INPUT_TOKENS = 50_000;
const MAX_OUTPUT_TOKENS = 15_000;
const MAX_FIX_ITERATIONS = 3;

export interface AgentInput {
  intake: Intake;
  tenantId: string;
  priceListId: string;
  standards: StandardsConfig;
  credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
}

export interface AgentOutput {
  lines: BomLine[];
  summary: AgentSummary;
  quoteAdvisory: QuoteAdvisory;
  estimateId?: string;
  ccwUrl?: string;
  llmCalls: LlmCallLog[];
  ciscoCalls: CiscoCallLog[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();
  const llmCalls: LlmCallLog[] = [];
  const ciscoCalls: CiscoCallLog[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const client = new Anthropic();

  const toolContext = {
    tenantId: input.tenantId,
    priceListId: input.priceListId,
    credentials: input.credentials,
    standards: input.standards,
    region: input.intake.region,
    country: input.intake.country ?? input.intake.region,
    requirements: input.intake.requirements,
    ciscoCalls,
  };

  // ── Step A: Parse intake ──────────────────────────────────────────────
  checkTimeout(startTime);

  // ── Step B: Suggest SKUs ──────────────────────────────────────────────
  checkTimeout(startTime);
  const isPathA = input.intake.path === "path_a";
  const systemPrompt = isPathA
    ? SYSTEM_PROMPT_SUGGEST_PATH_A
    : SYSTEM_PROMPT_SUGGEST_PATH_B;
  const model = isPathA ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5-20241022";

  const userMessage = buildSuggestPrompt(input.intake, input.standards);

  const suggestResult = await toolUseLoop({
    client,
    model,
    systemPrompt,
    userMessage,
    tools: AGENT_TOOLS,
    toolContext,
    maxIterations: 15,
    startTime,
    llmCalls,
    step: "suggest",
  });

  totalInputTokens += suggestResult.inputTokens;
  totalOutputTokens += suggestResult.outputTokens;

  // Extract the submitted BoM from the tool call results
  let lines: BomLine[] = suggestResult.bomLines ?? [];
  let estimateId: string | undefined;
  let ccwUrl: string | undefined;

  if (suggestResult.estimateId) {
    estimateId = suggestResult.estimateId;
    ccwUrl = suggestResult.ccwUrl;
  }

  // ── Step E: Summary generation ────────────────────────────────────────
  checkTimeout(startTime);
  const summaryResult = await toolUseLoop({
    client,
    model: "claude-sonnet-4-5-20241022",
    systemPrompt: SYSTEM_PROMPT_SUMMARIZE,
    userMessage: `Generate a summary for this BoM:\n\nLines: ${JSON.stringify(lines.slice(0, 50).map((l) => ({ sku: l.sku, qty: l.quantity, desc: l.description })))}\n\nIntake requirements: ${JSON.stringify(input.intake.requirements)}`,
    tools: [],
    toolContext,
    maxIterations: 1,
    startTime,
    llmCalls,
    step: "summarize",
  });

  totalInputTokens += summaryResult.inputTokens;
  totalOutputTokens += summaryResult.outputTokens;

  const summary: AgentSummary = summaryResult.summary ?? {
    assumptions: [],
    exclusions: [],
    openQuestions: [],
    validationWarnings: [],
    totalListPrice: lines.reduce((s, l) => s + l.unitListPrice * l.quantity, 0),
    productTotal: lines.filter((l) => l.category === "hardware" || l.category === "accessory").reduce((s, l) => s + l.extendedNetPrice, 0),
    serviceTotal: lines.filter((l) => l.category === "service").reduce((s, l) => s + l.extendedNetPrice, 0),
    subscriptionTotal: lines.filter((l) => l.category === "subscription").reduce((s, l) => s + l.extendedNetPrice, 0),
  };

  // ── Step F: Quote-path detection ──────────────────────────────────────
  checkTimeout(startTime);
  const quoteResult = await toolUseLoop({
    client,
    model: "claude-haiku-4-5-20251001",
    systemPrompt: SYSTEM_PROMPT_QUOTE_DETECT,
    userMessage: `Scan for quote-path signals:\n\n${JSON.stringify(input.intake.requirements)}`,
    tools: [],
    toolContext,
    maxIterations: 1,
    startTime,
    llmCalls,
    step: "detect_quote",
  });

  totalInputTokens += quoteResult.inputTokens;
  totalOutputTokens += quoteResult.outputTokens;

  const quoteAdvisory: QuoteAdvisory = quoteResult.quoteAdvisory ?? {
    detected: false,
    signals: [],
    recommendation: "",
    ccwQuoteSteps: [],
  };

  return {
    lines,
    summary,
    quoteAdvisory,
    estimateId,
    ccwUrl,
    llmCalls,
    ciscoCalls,
    totalInputTokens,
    totalOutputTokens,
  };
}

// ─── Tool-use loop ──────────────────────────────────────────────────────

interface ToolUseLoopParams {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools: Anthropic.Tool[];
  toolContext: Record<string, unknown>;
  maxIterations: number;
  startTime: number;
  llmCalls: LlmCallLog[];
  step: AgentStep;
}

interface ToolUseLoopResult {
  textResponse: string;
  inputTokens: number;
  outputTokens: number;
  bomLines?: BomLine[];
  estimateId?: string;
  ccwUrl?: string;
  summary?: AgentSummary;
  quoteAdvisory?: QuoteAdvisory;
}

async function toolUseLoop(
  params: ToolUseLoopParams
): Promise<ToolUseLoopResult> {
  const { client, model, systemPrompt, tools, toolContext, maxIterations, startTime, llmCalls, step } = params;
  let { userMessage } = params;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let textResponse = "";
  let bomLines: BomLine[] | undefined;
  let estimateId: string | undefined;
  let ccwUrl: string | undefined;
  let summary: AgentSummary | undefined;
  let quoteAdvisory: QuoteAdvisory | undefined;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    checkTimeout(startTime);
    checkTokenBudget(totalInputTokens, totalOutputTokens);

    const callStart = Date.now();
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    });

    const callDuration = Date.now() - callStart;
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    llmCalls.push({
      model,
      step,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: callDuration,
      timestamp: new Date(),
    });

    // Process response content blocks
    const toolResults: Anthropic.MessageParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textResponse += block.text;

        // Try to parse structured data from text response
        if (step === "summarize") {
          summary = parseSummaryFromText(block.text);
        }
        if (step === "detect_quote") {
          quoteAdvisory = parseQuoteAdvisoryFromText(block.text);
        }
      } else if (block.type === "tool_use") {
        const toolResult = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          toolContext
        );

        // Capture BoM lines from submit_bom tool calls
        if (block.name === "submit_bom" && toolResult.bomLines) {
          bomLines = toolResult.bomLines;
          if (toolResult.summary) summary = toolResult.summary;
          if (toolResult.quoteAdvisory) quoteAdvisory = toolResult.quoteAdvisory;
        }
        if (block.name === "create_estimate" && toolResult.estimateId) {
          estimateId = toolResult.estimateId;
          ccwUrl = toolResult.ccwUrl;
        }

        toolResults.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(toolResult.data),
            },
          ],
        });
      }
    }

    // If no tool use, we're done
    if (response.stop_reason === "end_turn" || toolResults.length === 0) {
      break;
    }

    // Add assistant message and tool results for next iteration
    messages.push({ role: "assistant", content: response.content });
    for (const tr of toolResults) {
      messages.push(tr);
    }
  }

  return {
    textResponse,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    bomLines,
    estimateId,
    ccwUrl,
    summary,
    quoteAdvisory,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function buildSuggestPrompt(
  intake: Intake,
  standards: StandardsConfig
): string {
  const parts = [
    `Customer: ${intake.customerName}`,
    `Region: ${intake.region}`,
    `Country: ${intake.country ?? intake.region}`,
    `Domain: ${intake.domain}`,
    `Path: ${intake.path === "path_a" ? "BoM provided — normalize and validate" : "Design from requirements"}`,
  ];

  const req = intake.requirements;
  if (req.keyNeeds) parts.push(`Key needs: ${req.keyNeeds}`);
  if (req.quantities?.length) {
    parts.push(
      `Quantities: ${req.quantities.map((q) => `${q.quantity}× ${q.description}`).join(", ")}`
    );
  }
  if (req.poeRequired) parts.push(`PoE required: yes (class: ${req.poeClass ?? "class4"})`);
  if (req.redundancyRequired) parts.push("Redundant PSU required");
  if (req.stackingRequired) parts.push("Stacking required");
  if (req.licenseTier) parts.push(`License tier: ${req.licenseTier}`);
  if (req.dnaTier) parts.push(`DNA tier: ${req.dnaTier}`);
  if (req.supportTerm) parts.push(`Support: ${req.supportTerm}`);
  if (req.constraints) parts.push(`Constraints: ${req.constraints}`);

  // Include uploaded BoM lines for Path A
  if (req.uploadedBomLines?.length) {
    parts.push(
      "Uploaded BoM lines:",
      ...req.uploadedBomLines.map(
        (l) => `  ${l.sku} × ${l.quantity}${l.description ? ` — ${l.description}` : ""}`
      )
    );
  }

  // Include tenant standards
  parts.push(`\nTenant standards:`);
  parts.push(`  Default power cable: ${standards.defaultPowerCableType}`);
  parts.push(`  Preferred license: ${standards.preferredLicenseTier}`);
  parts.push(`  Preferred DNA: ${standards.preferredDnaTier}`);
  parts.push(`  Default support: ${standards.defaultSupportLevel}`);
  parts.push(`  Redundant PSU: ${standards.requireRedundantPsu ? "yes" : "no"}`);

  return parts.join("\n");
}

function checkTimeout(startTime: number): void {
  if (Date.now() - startTime > MAX_AGENT_DURATION_MS) {
    throw new AgentTimeoutError("Agent run exceeded 5-minute timeout");
  }
}

function checkTokenBudget(input: number, output: number): void {
  if (input > MAX_INPUT_TOKENS) {
    throw new AgentBudgetError(`Input token budget exceeded: ${input}/${MAX_INPUT_TOKENS}`);
  }
  if (output > MAX_OUTPUT_TOKENS) {
    throw new AgentBudgetError(`Output token budget exceeded: ${output}/${MAX_OUTPUT_TOKENS}`);
  }
}

function parseSummaryFromText(text: string): AgentSummary | undefined {
  try {
    // Attempt to find JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*"assumptions"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch { /* not JSON, parse manually */ }

  return {
    assumptions: extractBulletPoints(text, "assumption"),
    exclusions: extractBulletPoints(text, "exclu"),
    openQuestions: extractBulletPoints(text, "question"),
    validationWarnings: extractBulletPoints(text, "warning"),
    totalListPrice: 0,
    productTotal: 0,
    serviceTotal: 0,
    subscriptionTotal: 0,
  };
}

function parseQuoteAdvisoryFromText(text: string): QuoteAdvisory {
  const lower = text.toLowerCase();
  const detected =
    lower.includes("quote") ||
    lower.includes("rfp") ||
    lower.includes("rfq") ||
    lower.includes("special pricing");

  return {
    detected,
    signals: detected
      ? [text.slice(0, 500)]
      : [],
    recommendation: detected
      ? "This intake has quote-path signals. Consider creating a CCW Quick Quote."
      : "No quote-path signals detected. Standard estimate path is appropriate.",
    ccwQuoteSteps: detected
      ? [
          "1. Navigate to Deals & Quotes → Create Quote",
          "2. Import the estimate using Estimate ID",
          "3. Fill in deal details (description, category, expected close)",
          "4. Submit for Cisco AM discount application",
        ]
      : [],
  };
}

function extractBulletPoints(text: string, keyword: string): string[] {
  const lines = text.split("\n");
  const items: string[] = [];
  let capture = false;

  for (const line of lines) {
    if (line.toLowerCase().includes(keyword)) {
      capture = true;
      continue;
    }
    if (capture && (line.startsWith("-") || line.startsWith("•") || line.match(/^\d+\./))) {
      items.push(line.replace(/^[-•\d.]+\s*/, "").trim());
    } else if (capture && line.trim() === "") {
      capture = false;
    }
  }

  return items;
}

export class AgentTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentTimeoutError";
  }
}

export class AgentBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBudgetError";
  }
}
