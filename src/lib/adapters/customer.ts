/**
 * Cisco Customer Registry v2.0 adapter (REST/JSON).
 *
 * searchCustomer: find customers by name/country/city
 * validateCustomer: check if a customer ID is valid
 */

import { isMockMode, getMockError } from "@/lib/env";
import { getAccessToken } from "./auth";
import { appendAuditLog } from "@/lib/db/queries";
import type {
  CiscoCustomerSearchRequest,
  CiscoCustomerSearchResponse,
  CiscoCustomerValidateResponse,
  CiscoApiCallResult,
} from "@/types/cisco";

interface CustomerAdapterOptions {
  tenantId: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
}

export async function searchCustomer(
  request: CiscoCustomerSearchRequest,
  options: CustomerAdapterOptions
): Promise<CiscoApiCallResult<CiscoCustomerSearchResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockSearchCustomer(request, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const params = new URLSearchParams({
      companyName: request.companyName,
    });
    if (request.country) params.set("country", request.country);
    if (request.city) params.set("city", request.city);

    const response = await fetch(
      `${baseUrl}/commerce/customer/v2/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      await logCustomerCall(options.tenantId, "searchCustomer", response.status, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: await response.text(),
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as CiscoCustomerSearchResponse;
    await logCustomerCall(options.tenantId, "searchCustomer", 200, Date.now() - start);

    return {
      success: true,
      data,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

export async function validateCustomer(
  customerId: string,
  options: CustomerAdapterOptions
): Promise<CiscoApiCallResult<CiscoCustomerValidateResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockValidateCustomer(customerId, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/customer/v2/validate/${encodeURIComponent(customerId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      await logCustomerCall(options.tenantId, "validateCustomer", response.status, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: await response.text(),
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const data = (await response.json()) as CiscoCustomerValidateResponse;
    await logCustomerCall(options.tenantId, "validateCustomer", 200, Date.now() - start);

    return {
      success: true,
      data,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Mock implementations ────────────────────────────────────────────────

async function getMockSearchCustomer(
  request: CiscoCustomerSearchRequest,
  options: CustomerAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoCustomerSearchResponse>> {
  const mockError = getMockError();
  if (mockError === "auth_failure") {
    return {
      success: false,
      error: { code: "AUTH_FAILURE", message: "Mock auth failure" },
      cached: false,
      durationMs: Date.now() - start,
    };
  }

  await new Promise((r) => setTimeout(r, 50));

  const { getCustomerMock } = await import("./_customer-mock-data");
  const mockData = getCustomerMock();

  const searchTerm = request.companyName.toLowerCase();

  // Match against known mock customers
  let result = mockData.searchCustomer.no_results;
  if (searchTerm.includes("ntt")) {
    result = mockData.searchCustomer.ntt_data;
  } else if (searchTerm.includes("dimension")) {
    result = mockData.searchCustomer.dimension_data;
  } else if (searchTerm.includes("cdw")) {
    result = mockData.searchCustomer.cdw;
  } else if (searchTerm.includes("presidio")) {
    result = mockData.searchCustomer.presidio;
  } else if (searchTerm.includes("gbm") || searchTerm.includes("gulf")) {
    result = mockData.searchCustomer.gbm;
  }

  await logCustomerCall(options.tenantId, "searchCustomer", 200, Date.now() - start);

  return {
    success: true,
    data: result,
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function getMockValidateCustomer(
  customerId: string,
  options: CustomerAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoCustomerValidateResponse>> {
  await new Promise((r) => setTimeout(r, 50));

  const { getCustomerMock } = await import("./_customer-mock-data");
  const mockData = getCustomerMock();

  const isKnown = customerId.startsWith("CUST-");
  const result = isKnown
    ? mockData.validateCustomer.valid
    : mockData.validateCustomer.invalid;

  await logCustomerCall(options.tenantId, "validateCustomer", 200, Date.now() - start);

  return {
    success: true,
    data: { ...result, customerId },
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function logCustomerCall(
  tenantId: string,
  method: string,
  statusCode: number,
  durationMs: number
): Promise<void> {
  try {
    await appendAuditLog(tenantId, "cisco_api_call", null, {
      api: "customer_registry",
      method,
      statusCode,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Audit failure should not block adapter
  }
}
