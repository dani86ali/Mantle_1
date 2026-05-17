/** Cisco Commerce API types — request/response shapes */

// ─── OAuth ────────────────────────────────────────────────────────────────

export interface CiscoTokenRequest {
  grant_type: "password" | "refresh_token";
  client_id: string;
  client_secret: string;
  username?: string;
  password?: string;
  refresh_token?: string;
}

export interface CiscoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface CiscoTokenError {
  error: string;
  error_description: string;
}

// ─── Catalog v2.0 (REST/JSON) ────────────────────────────────────────────

export interface CiscoCatalogRequest {
  skus: string[];
  priceListId: string;
}

export interface CiscoCatalogResponse {
  items: CiscoCatalogItem[];
  errors?: CiscoCatalogError[];
}

export interface CiscoCatalogItem {
  sku: string;
  description: string;
  listPrice: number;
  currency: string;
  priceListId: string;
  available: boolean;
  regionAvailability: string[];
  eoxInfo: CiscoEoxInfo;
  leadTimeDays: number;
  smartAccountMandatory: boolean;
  productFamily: string;
  productCategory: string;
  serviceDurationMonths?: number | null;
  specs?: CiscoCatalogSpecs;
  // ─── Tier-1 catalog extraction extensions (optional) ────────────────
  vendor?: string;
  unit?: string;
  supplier?: string | null;
  supplierDiscountPercent?: number | null;
  marginTargetPercent?: number | null;
  otcMrc?: string | null;
  leadTimeHint?: string | null;
  l1Code?: string | null;
  l2Code?: string | null;
  l3Code?: string | null;
  bidFrequency?: number;
  priceObservations?: CiscoPriceObservation[];
  priceDrift?: CiscoPriceDriftStats;
  source?: string;
}

export interface CiscoPriceObservation {
  opportunityId: string;
  listPrice: number;
  observedAt: string;
  source: string;
}

export interface CiscoPriceDriftStats {
  min: number;
  median: number;
  max: number;
  stdev: number;
  suspectedFxBug?: boolean;
}

export interface CiscoCatalogSpecs {
  portCount?: number;
  poeBudgetWatts?: number;
  poePortCount?: number;
  sfpSlots?: number;
  qsfpSlots?: number;
  psuSlots?: number;
  psuWatts?: number;
  stackable?: boolean;
  maxStackSize?: number;
  stackModulesPerSwitch?: number;
  fanModulesRequired?: number;
  antennasPerUnit?: number;
}

export interface CiscoEoxInfo {
  isEox: boolean;
  endOfSaleDate?: string;
  endOfLifeDate?: string;
  endOfSwMaintenanceDate?: string;
  migrationProductId?: string;
  migrationProductName?: string;
}

export interface CiscoCatalogError {
  sku: string;
  errorCode: string;
  message: string;
}

/** getMappedServices response */
export interface CiscoMappedServicesResponse {
  hardwareSku: string;
  services: CiscoMappedService[];
  licenses: CiscoMappedLicense[];
  accessories: CiscoMappedAccessory[];
}

export interface CiscoMappedService {
  sku: string;
  description: string;
  serviceLevel: string;
  listPrice: number;
  durationMonths: number;
  required: boolean;
}

export interface CiscoMappedLicense {
  sku: string;
  description: string;
  tier: string;
  listPrice: number;
  termMonths?: number;
  required: boolean;
}

export interface CiscoMappedAccessory {
  sku: string;
  description: string;
  listPrice: number;
  category: string;
  quantity: number;
  required: boolean;
}

// ─── Estimate v1.0 (SOAP/XML) ────────────────────────────────────────────

export interface CiscoEstimateCreateRequest {
  estimateName: string;
  priceListId: string;
  customerId?: string;
  lineItems: CiscoEstimateLineItem[];
}

export interface CiscoEstimateLineItem {
  sku: string;
  quantity: number;
  parentLineNumber?: number;
}

export interface CiscoEstimateResponse {
  estimateId: string;
  ccwUrl: string;
  status: string;
  lineItems: CiscoEstimateResponseLine[];
  totalListPrice: number;
  totalNetPrice: number;
  createdAt: string;
}

export interface CiscoEstimateResponseLine {
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unitListPrice: number;
  unitNetPrice: number;
  discountPercent: number;
  extendedNetPrice: number;
  serviceDurationMonths?: number;
  leadTimeDays?: number;
  smartAccountMandatory: boolean;
}

export interface CiscoEstimateError {
  errorCode: string;
  message: string;
  details?: string;
}

// ─── Customer Registry v2.0 (REST/JSON) ──────────────────────────────────

export interface CiscoCustomerSearchRequest {
  companyName: string;
  country?: string;
  city?: string;
}

export interface CiscoCustomerSearchResponse {
  customers: CiscoCustomer[];
  totalResults: number;
}

export interface CiscoCustomer {
  customerId: string;
  companyName: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  phone?: string;
  website?: string;
}

export interface CiscoCustomerValidateResponse {
  valid: boolean;
  customerId: string;
  companyName: string;
  issues?: string[];
}

// ─── Shared Adapter Types ────────────────────────────────────────────────

export interface CiscoAdapterConfig {
  tenantId: string;
  mode: "mock" | "live";
  baseUrl: string;
  tokenEndpoint: string;
}

export interface CiscoApiCallResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    httpStatus?: number;
  };
  cached: boolean;
  durationMs: number;
}
