/**
 * Cisco Estimate v1.0 adapter (SOAP/XML).
 *
 * Uses fast-xml-parser for XML construction and parsing instead of WSDL-based
 * SOAP libraries (soap/strong-soap) due to Cisco's complex OAGIS BOD schemas.
 * See architecture.md SOAP adapter strategy section.
 */

import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { isMockMode, getMockError } from "@/lib/env";
import { getAccessToken } from "./auth";
import { appendAuditLog } from "@/lib/db/queries";
import type {
  CiscoEstimateCreateRequest,
  CiscoEstimateResponse,
  CiscoApiCallResult,
} from "@/types/cisco";

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: true,
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

interface EstimateAdapterOptions {
  tenantId: string;
  credentials: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
}

export async function createEstimate(
  request: CiscoEstimateCreateRequest,
  options: EstimateAdapterOptions
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockCreateEstimate(request, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const soapEnvelope = buildCreateEstimateSoap(request, token);

    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/estimate/v1/createEstimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction: "createEstimate",
          Authorization: `Bearer ${token}`,
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(30_000),
      }
    );

    const xmlBody = await response.text();

    if (!response.ok) {
      await logEstimateCall(options.tenantId, "createEstimate", response.status, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: xmlBody,
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const parsed = parseEstimateResponse(xmlBody);
    await logEstimateCall(options.tenantId, "createEstimate", 200, Date.now() - start);

    return {
      success: true,
      data: parsed,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SOAP_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

export async function updateEstimate(
  estimateId: string,
  request: CiscoEstimateCreateRequest,
  options: EstimateAdapterOptions
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockUpdateEstimate(estimateId, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const soapEnvelope = buildUpdateEstimateSoap(estimateId, request, token);

    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/estimate/v1/updateEstimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction: "updateEstimate",
          Authorization: `Bearer ${token}`,
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(30_000),
      }
    );

    const xmlBody = await response.text();

    if (!response.ok) {
      await logEstimateCall(options.tenantId, "updateEstimate", response.status, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: xmlBody,
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const parsed = parseEstimateResponse(xmlBody);
    await logEstimateCall(options.tenantId, "updateEstimate", 200, Date.now() - start);

    return {
      success: true,
      data: parsed,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SOAP_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

export async function acquireEstimate(
  estimateId: string,
  options: EstimateAdapterOptions
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  const start = Date.now();

  if (isMockMode()) {
    return getMockAcquireEstimate(estimateId, options, start);
  }

  try {
    const token = await getAccessToken(options.tenantId, options.credentials);
    const soapEnvelope = buildAcquireEstimateSoap(estimateId, token);

    const baseUrl =
      process.env.CISCO_API_BASE_URL || "https://apix.cisco.com";

    const response = await fetch(
      `${baseUrl}/commerce/estimate/v1/acquireEstimate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=UTF-8",
          SOAPAction: "acquireEstimate",
          Authorization: `Bearer ${token}`,
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(30_000),
      }
    );

    const xmlBody = await response.text();

    if (!response.ok) {
      await logEstimateCall(options.tenantId, "acquireEstimate", response.status, Date.now() - start);
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: xmlBody,
          httpStatus: response.status,
        },
        cached: false,
        durationMs: Date.now() - start,
      };
    }

    const parsed = parseEstimateResponse(xmlBody);
    await logEstimateCall(options.tenantId, "acquireEstimate", 200, Date.now() - start);

    return {
      success: true,
      data: parsed,
      cached: false,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "SOAP_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}

// ─── SOAP envelope builders ──────────────────────────────────────────────

function buildCreateEstimateSoap(
  request: CiscoEstimateCreateRequest,
  _token: string
): string {
  const lineItemsXml = request.lineItems
    .map(
      (item, i) => `
      <LineItem>
        <LineNumber>${i + 1}</LineNumber>
        <ProductId>${escapeXml(item.sku)}</ProductId>
        <Quantity>${item.quantity}</Quantity>
        ${item.parentLineNumber ? `<ParentLineNumber>${item.parentLineNumber}</ParentLineNumber>` : ""}
      </LineItem>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:est="http://cisco.com/commerce/estimate/v1">
  <soapenv:Header/>
  <soapenv:Body>
    <est:CreateEstimateRequest>
      <EstimateName>${escapeXml(request.estimateName)}</EstimateName>
      <PriceListId>${escapeXml(request.priceListId)}</PriceListId>
      ${request.customerId ? `<CustomerId>${escapeXml(request.customerId)}</CustomerId>` : ""}
      <LineItems>${lineItemsXml}
      </LineItems>
    </est:CreateEstimateRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildUpdateEstimateSoap(
  estimateId: string,
  request: CiscoEstimateCreateRequest,
  _token: string
): string {
  const lineItemsXml = request.lineItems
    .map(
      (item, i) => `
      <LineItem>
        <LineNumber>${i + 1}</LineNumber>
        <ProductId>${escapeXml(item.sku)}</ProductId>
        <Quantity>${item.quantity}</Quantity>
      </LineItem>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:est="http://cisco.com/commerce/estimate/v1">
  <soapenv:Header/>
  <soapenv:Body>
    <est:UpdateEstimateRequest>
      <EstimateId>${escapeXml(estimateId)}</EstimateId>
      <PriceListId>${escapeXml(request.priceListId)}</PriceListId>
      <LineItems>${lineItemsXml}
      </LineItems>
    </est:UpdateEstimateRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildAcquireEstimateSoap(
  estimateId: string,
  _token: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:est="http://cisco.com/commerce/estimate/v1">
  <soapenv:Header/>
  <soapenv:Body>
    <est:AcquireEstimateRequest>
      <EstimateId>${escapeXml(estimateId)}</EstimateId>
    </est:AcquireEstimateRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function parseEstimateResponse(xml: string): CiscoEstimateResponse {
  const parsed = xmlParser.parse(xml);
  // Navigate SOAP envelope to find the response body
  const body =
    parsed?.Envelope?.Body ??
    parsed?.["soapenv:Envelope"]?.["soapenv:Body"] ??
    parsed;

  const resp =
    body?.CreateEstimateResponse ??
    body?.UpdateEstimateResponse ??
    body?.AcquireEstimateResponse ??
    body;

  return {
    estimateId: resp?.EstimateId ?? "",
    ccwUrl: resp?.CcwUrl ?? "",
    status: resp?.Status ?? "DRAFT",
    lineItems: [],
    totalListPrice: Number(resp?.TotalListPrice ?? 0),
    totalNetPrice: Number(resp?.TotalNetPrice ?? 0),
    createdAt: resp?.CreatedAt ?? new Date().toISOString(),
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Mock implementations ────────────────────────────────────────────────

async function getMockCreateEstimate(
  _request: CiscoEstimateCreateRequest,
  options: EstimateAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  const mockError = getMockError();
  if (mockError === "auth_failure") {
    return {
      success: false,
      error: { code: "AUTH_FAILURE", message: "Mock auth failure" },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
  if (mockError === "rate_limit") {
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "429 Too Many Requests", httpStatus: 429 },
      cached: false,
      durationMs: Date.now() - start,
    };
  }

  await new Promise((r) => setTimeout(r, 50));

  const { getEstimateMock } = await import("../../../tests/mocks/index");
  const mockData = getEstimateMock();

  // Generate a unique mock estimate ID
  const estimateId = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  const response: CiscoEstimateResponse = {
    ...mockData.createEstimate.success,
    estimateId,
    ccwUrl: `https://apps.cisco.com/ccw/cpc/est/${estimateId}`,
  };

  await logEstimateCall(options.tenantId, "createEstimate", 200, Date.now() - start);

  return {
    success: true,
    data: response,
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function getMockUpdateEstimate(
  estimateId: string,
  options: EstimateAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  await new Promise((r) => setTimeout(r, 50));

  const { getEstimateMock } = await import("../../../tests/mocks/index");
  const mockData = getEstimateMock();

  const response: CiscoEstimateResponse = {
    ...mockData.updateEstimate.success,
    estimateId,
  };

  await logEstimateCall(options.tenantId, "updateEstimate", 200, Date.now() - start);

  return {
    success: true,
    data: response,
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function getMockAcquireEstimate(
  estimateId: string,
  options: EstimateAdapterOptions,
  start: number
): Promise<CiscoApiCallResult<CiscoEstimateResponse>> {
  await new Promise((r) => setTimeout(r, 50));

  const { getEstimateMock } = await import("../../../tests/mocks/index");
  const mockData = getEstimateMock();

  const response: CiscoEstimateResponse = {
    ...mockData.acquireEstimate.success,
    estimateId,
  };

  await logEstimateCall(options.tenantId, "acquireEstimate", 200, Date.now() - start);

  return {
    success: true,
    data: response,
    cached: false,
    durationMs: Date.now() - start,
  };
}

async function logEstimateCall(
  tenantId: string,
  method: string,
  statusCode: number,
  durationMs: number
): Promise<void> {
  try {
    await appendAuditLog(tenantId, "cisco_api_call", null, {
      api: "estimate",
      method,
      statusCode,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Audit failure should not block adapter
  }
}
