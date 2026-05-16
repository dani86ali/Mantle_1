/**
 * Co-located mock data for the Cisco Customer Registry adapter.
 * See _catalog-mock-data.ts for rationale.
 */

import type {
  CiscoCustomerSearchResponse,
  CiscoCustomerValidateResponse,
} from "@/types/cisco";
import customerJson from "./_mock-data/customer-responses.json";

interface CustomerMockData {
  searchCustomer: Record<string, CiscoCustomerSearchResponse>;
  validateCustomer: Record<string, CiscoCustomerValidateResponse>;
}

export function getCustomerMock(): CustomerMockData {
  return customerJson as unknown as CustomerMockData;
}
