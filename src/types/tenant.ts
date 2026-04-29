/** Tenant and credential types for multi-tenant isolation */

export type OnboardingState =
  | "LEAD"
  | "CISCO_ADMIN_IDENTIFIED"
  | "CCO_ID_VERIFIED"
  | "SAMT_ENTITLEMENT_GRANTED"
  | "APP_REGISTERED"
  | "HELLO_API_PASSED"
  | "API_ACCESS_REQUESTED"
  | "API_ACCESS_GRANTED"
  | "CREDS_LOADED"
  | "STAGING_VALIDATED"
  | "LIVE";

export type UserRole = "engineer" | "tenant_admin" | "super_admin";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  region: string;
  priceListId: string;
  brandingConfig: BrandingConfig;
  standardsConfig: StandardsConfig;
  onboardingState: OnboardingState;
  locale: string;
  timezone: string;
  createdAt: Date;
}

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor: string;
  companyName: string;
  legalEntity?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  subdomain?: string;
}

export interface StandardsConfig {
  approvedProductFamilies: string[];
  preferredLicenseTier: "essentials" | "advantage";
  preferredDnaTier: "essentials" | "advantage";
  defaultSupportTerm: string;
  defaultSupportLevel: string;
  regionRestrictions: string[];
  approvedAlternates: Record<string, string>;
  engineeringRules: EngineeringRule[];
  defaultPowerCableType: string;
  requireRedundantPsu: boolean;
}

export interface EngineeringRule {
  id: string;
  description: string;
  condition: string;
  action: string;
}

export interface TenantCredentials {
  id: string;
  tenantId: string;
  ccoUsernameEnc: string;
  ccoPasswordEnc: string;
  clientIdEnc: string;
  clientSecretEnc: string;
  updatedAt: Date;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export interface OnboardingEvent {
  id: string;
  tenantId: string;
  fromState: OnboardingState;
  toState: OnboardingState;
  notes?: string;
  createdAt: Date;
}

export const DEFAULT_STANDARDS: StandardsConfig = {
  approvedProductFamilies: [
    "catalyst-9200",
    "catalyst-9300",
    "catalyst-9400",
    "catalyst-9500",
    "catalyst-9800",
    "catalyst-9100",
    "catalyst-9120",
    "catalyst-9130",
    "catalyst-9136",
    "catalyst-9162",
    "catalyst-9164",
    "catalyst-9166",
  ],
  preferredLicenseTier: "advantage",
  preferredDnaTier: "advantage",
  defaultSupportTerm: "CON-SNT",
  defaultSupportLevel: "8x5xNBD",
  regionRestrictions: [],
  approvedAlternates: {},
  engineeringRules: [],
  defaultPowerCableType: "CAB-TA-NA",
  requireRedundantPsu: true,
};
