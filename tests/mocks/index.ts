import { readFileSync } from "fs";
import { join } from "path";
import type {
  CiscoCatalogItem,
  CiscoCatalogError,
  CiscoMappedServicesResponse,
  CiscoEstimateResponse,
  CiscoEstimateError,
  CiscoCustomerSearchResponse,
  CiscoCustomerValidateResponse,
} from "@/types/cisco";

// Use process.cwd() instead of __dirname because Next.js compiles
// server code into .next/server/ where __dirname won't find test fixtures
const MOCKS_DIR = join(process.cwd(), "tests", "mocks");

function loadJson<T>(filename: string): T {
  const raw = readFileSync(join(MOCKS_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

interface CatalogMockData {
  items: Record<string, CiscoCatalogItem>;
  errors: Record<string, CiscoCatalogError>;
}

interface EstimateMockData {
  createEstimate: {
    success: CiscoEstimateResponse;
    error_invalid_config: CiscoEstimateError;
    error_auth: CiscoEstimateError;
    error_rate_limit: CiscoEstimateError;
  };
  updateEstimate: { success: CiscoEstimateResponse };
  acquireEstimate: { success: CiscoEstimateResponse };
}

interface CustomerMockData {
  searchCustomer: Record<string, CiscoCustomerSearchResponse>;
  validateCustomer: Record<string, CiscoCustomerValidateResponse>;
}

let _catalogData: CatalogMockData | null = null;
let _mappedServicesData: Record<string, CiscoMappedServicesResponse> | null = null;
let _estimateData: EstimateMockData | null = null;
let _customerData: CustomerMockData | null = null;

export function getCatalogMock(): CatalogMockData {
  if (!_catalogData) {
    _catalogData = loadJson<CatalogMockData>("catalog-responses.json");
  }
  return _catalogData;
}

export function getMappedServicesMock(): Record<string, CiscoMappedServicesResponse> {
  if (!_mappedServicesData) {
    _mappedServicesData = loadJson<Record<string, CiscoMappedServicesResponse>>(
      "mapped-services-responses.json"
    );
  }
  return _mappedServicesData;
}

export function getEstimateMock(): EstimateMockData {
  if (!_estimateData) {
    _estimateData = loadJson<EstimateMockData>("estimate-responses.json");
  }
  return _estimateData;
}

export function getCustomerMock(): CustomerMockData {
  if (!_customerData) {
    _customerData = loadJson<CustomerMockData>("customer-responses.json");
  }
  return _customerData;
}

/** Simulate realistic Cisco API latency (200-500ms) */
export function simulateLatency(): Promise<void> {
  const delay = 200 + Math.random() * 300;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Check if mock error injection is active */
export function getMockErrorMode(): string | undefined {
  return process.env.CISCO_MOCK_ERROR || undefined;
}
