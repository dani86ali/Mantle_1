import type { SlotFileMap } from "@/components/intake/document-slots";

export type WizardMode = "rfp" | "quick_bom" | "rfi";

export type Domain =
  | "access_switching"
  | "wireless"
  | "access_switching_wireless";

export type LicenseTier = "essentials" | "advantage";
export type DnaTier = "essentials" | "advantage" | "opt_out";
export type SupportTerm = "3yr" | "5yr";
export type ProfitMode = "margin" | "markup";
export type Vendor = "cisco" | "fortinet";

export interface ParsedBomLine {
  sku: string;
  quantity: number;
}

export interface WizardState {
  mode: WizardMode | null;
  rfpSlots: SlotFileMap;
  rfpSlotsValid: boolean;
  bomFile: File | null;
  bomText: string;
  customerName: string;
  country: string;
  region: string;
  domain: Domain;
  keyNeeds: string;
  vendorPreferences: string;
  constraints: string;
  licenseTier: LicenseTier;
  dnaTier: DnaTier;
  supportTerm: SupportTerm;
  poeRequired: boolean;
  redundantPSU: boolean;
  stacking: boolean;
  fxRate: number;
  partnerDiscountPct: number;
  dealRegDiscountPct: number;
  profitMode: ProfitMode;
  profitPct: number;
  vatRate: number;
  vendor: Vendor;
  projectType: string;
  siteCount: number;
  buildingCount: number;
  portCount: number;
  userCount: number;
  bandwidthGbps: number;
  isGreenfield: boolean;
  hasOT: boolean;
  hasHPC: boolean;
  hasGPON: boolean;
  hasWireless: boolean;
  hasVoice: boolean;
  hasDC: boolean;
  vrfEnabled: boolean;
}

export const initialState: WizardState = {
  mode: null,
  rfpSlots: {},
  rfpSlotsValid: false,
  bomFile: null,
  bomText: "",
  customerName: "",
  country: "SA",
  region: "EMEAR",
  domain: "access_switching",
  keyNeeds: "",
  vendorPreferences: "",
  constraints: "",
  licenseTier: "advantage",
  dnaTier: "advantage",
  supportTerm: "5yr",
  poeRequired: false,
  redundantPSU: true,
  stacking: false,
  fxRate: 3.75,
  partnerDiscountPct: 35,
  dealRegDiscountPct: 8,
  profitMode: "margin",
  profitPct: 18,
  vatRate: 15,
  vendor: "cisco",
  projectType: "",
  siteCount: 1,
  buildingCount: 1,
  portCount: 48,
  userCount: 50,
  bandwidthGbps: 1,
  isGreenfield: false,
  hasOT: false,
  hasHPC: false,
  hasGPON: false,
  hasWireless: false,
  hasVoice: false,
  hasDC: false,
  vrfEnabled: false,
};

export function parseBomText(text: string): ParsedBomLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      const qty = parseInt(parts[1] ?? "1", 10);
      return {
        sku: parts[0] ?? "",
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      };
    })
    .filter((l) => l.sku.length > 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
