/** Validation engine types */

import type { BomLine } from "./bom";
import type { IntakeRequirements } from "./intake";

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationRuleId =
  | "sku-exists"
  | "eox"
  | "region"
  | "poe"
  | "poe-budget"
  | "optics"
  | "psu"
  | "psu-redundancy"
  | "license"
  | "stacking"
  | "support"
  | "antenna-count"
  | "fan-count";

export interface ValidationResult {
  ruleId: ValidationRuleId;
  ruleName: string;
  severity: ValidationSeverity;
  passed: boolean;
  message: string;
  affectedLineIds: string[];
  details?: Record<string, unknown>;
}

export interface ValidationContext {
  lines: BomLine[];
  requirements: IntakeRequirements;
  region: string;
  country: string;
  tenantStandards: TenantValidationStandards;
  catalogData: Map<string, CatalogItemForValidation>;
}

export interface TenantValidationStandards {
  requireRedundantPsu: boolean;
  preferredLicenseTier: "essentials" | "advantage";
  preferredDnaTier: "essentials" | "advantage";
  defaultSupportLevel: string;
  approvedProductFamilies: string[];
  regionRestrictions: string[];
}

export interface CatalogItemForValidation {
  sku: string;
  exists: boolean;
  eoxStatus: EoxStatus;
  regionAvailability: string[];
  poeData?: PoeData;
  opticsData?: OpticsData;
  psuData?: PsuData;
  stackingData?: StackingData;
  category: string;
  productFamily?: string;
}

export interface EoxStatus {
  isEox: boolean;
  endOfSaleDate?: string;
  endOfLifeDate?: string;
  migrationSku?: string;
}

export interface PoeData {
  poeBudgetWatts: number;
  poePortCount: number;
  poeClass?: string;
}

export interface OpticsData {
  sfpSlots: number;
  qsfpSlots: number;
  totalTransceiverSlots: number;
}

export interface PsuData {
  psuSlots: number;
  psuWatts: number;
  isPrimary: boolean;
  isRedundant: boolean;
}

export interface StackingData {
  stackable: boolean;
  maxStackSize: number;
  requiresStackKit: boolean;
  modulesPerSwitch: number;
}

export interface ValidationRule {
  id: ValidationRuleId;
  name: string;
  description: string;
  run(context: ValidationContext): ValidationResult[];
}
