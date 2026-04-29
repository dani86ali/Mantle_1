/** Bill of Materials types */

export type BomDraftStatus =
  | "AGENT_PROCESSING"
  | "READY_FOR_REVIEW"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_CLARIFICATION"
  | "AGENT_FAILED"
  | "AGENT_TIMEOUT";

export type LineDecision = "pending" | "accepted" | "edited" | "rejected";

export type LineCategory =
  | "hardware"
  | "license"
  | "subscription"
  | "service"
  | "accessory"
  | "software"
  | "other";

export interface BomDraft {
  id: string;
  tenantId: string;
  intakeId: string;
  agentRunId: string;
  version: number;
  assignedEngineerId?: string;
  lines: BomLine[];
  validationReport: ValidationReportSummary;
  summary: AgentSummary;
  estimateId?: string;
  ccwUrl?: string;
  quoteAdvisory?: QuoteAdvisory;
  status: BomDraftStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BomLine {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  unitNetPrice: number;
  discountPercent: number;
  extendedNetPrice: number;
  category: LineCategory;
  serviceDurationMonths?: number;
  leadTimeDays?: number;
  pricingTerm?: string;
  smartAccountMandatory: boolean;
  parentLineId?: string;
  validationFlags: LineValidationFlag[];
  decision: LineDecision;
  engineerComment?: string;
  originalSku?: string;
  catalogVerified: boolean;
}

export interface LineValidationFlag {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ValidationReportSummary {
  passed: number;
  warnings: number;
  errors: number;
  rules: RuleResult[];
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: "pass" | "warning" | "error";
  message: string;
  affectedLines: string[];
}

export interface AgentSummary {
  assumptions: string[];
  exclusions: string[];
  openQuestions: string[];
  validationWarnings: string[];
  totalListPrice: number;
  productTotal: number;
  serviceTotal: number;
  subscriptionTotal: number;
}

export interface QuoteAdvisory {
  detected: boolean;
  signals: string[];
  recommendation: string;
  ccwQuoteSteps: string[];
}

/** Agent run tracking */
export type AgentStep =
  | "parse"
  | "suggest"
  | "validate"
  | "fix"
  | "assemble"
  | "summarize"
  | "detect_quote";

export type AgentRunStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "TIMEOUT"
  | "PAUSED_AUTH_FAILURE"
  | "WAITING_FOR_LLM";

export interface AgentRun {
  id: string;
  tenantId: string;
  intakeId: string;
  step: AgentStep;
  status: AgentRunStatus;
  llmCalls: LlmCallLog[];
  ciscoCalls: CiscoCallLog[];
  tokenUsage: TokenUsage;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface LlmCallLog {
  model: string;
  step: AgentStep;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  timestamp: Date;
}

export interface CiscoCallLog {
  api: string;
  method: string;
  skuCount?: number;
  durationMs: number;
  statusCode: number;
  cached: boolean;
  timestamp: Date;
}

export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Review types */
export type ReviewDecision = "approved" | "approved_with_changes" | "rejected";

export interface Review {
  id: string;
  tenantId: string;
  bomDraftId: string;
  engineerId: string;
  decision: ReviewDecision;
  lineOverrides: LineOverride[];
  comments: ReviewComment[];
  createdAt: Date;
}

export interface LineOverride {
  lineId: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface ReviewComment {
  id: string;
  lineId?: string;
  text: string;
  authorId: string;
  createdAt: Date;
}

/** Export types */
export type ExportType = "csv" | "ccw" | "crm" | "email_to_customer";

export interface ExportRecord {
  id: string;
  tenantId: string;
  bomDraftId: string;
  type: ExportType;
  destination: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}
