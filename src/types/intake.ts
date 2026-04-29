/** Intake types — structured requirements from the portal */

export type IntakePath = "path_a" | "path_b";
export type IntakeSource = "ui_form" | "paste_email" | "email_monitor";
export type IntakeStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "AGENT_FAILED"
  | "AGENT_TIMEOUT"
  | "PARSE_ERROR"
  | "NEEDS_CLARIFICATION";

export type Domain =
  | "access_switching"
  | "wireless"
  | "access_switching_wireless";

export interface Intake {
  id: string;
  tenantId: string;
  path: IntakePath;
  source: IntakeSource;
  customerName: string;
  region: string;
  country: string;
  domain: Domain;
  requirements: IntakeRequirements;
  uploadedFileUrl?: string;
  rawEmailS3Url?: string;
  status: IntakeStatus;
  createdAt: Date;
}

export interface IntakeRequirements {
  keyNeeds?: string;
  quantities?: QuantitySpec[];
  poeRequired?: boolean;
  poeClass?: string;
  redundancyRequired?: boolean;
  stackingRequired?: boolean;
  licenseTier?: "essentials" | "advantage";
  dnaTier?: "essentials" | "advantage" | "opt_out";
  supportTerm?: string;
  supportLevel?: string;
  constraints?: string;
  uploadedBomLines?: UploadedBomLine[];
  pastedText?: string;
}

export interface QuantitySpec {
  description: string;
  quantity: number;
  portCount?: number;
  portType?: string;
}

export interface UploadedBomLine {
  sku: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

/** Zod-compatible intake form shape for validation */
export interface IntakeFormData {
  path: IntakePath;
  customerName: string;
  region: string;
  country: string;
  domain: Domain;
  keyNeeds: string;
  quantities: QuantitySpec[];
  poeRequired: boolean;
  poeClass?: string;
  redundancyRequired: boolean;
  stackingRequired: boolean;
  licenseTier?: "essentials" | "advantage";
  dnaTier?: "essentials" | "advantage" | "opt_out";
  supportTerm?: string;
  constraints?: string;
  pastedText?: string;
}
