/**
 * Co-located mock data for the Cisco Estimate adapter.
 * See _catalog-mock-data.ts for rationale.
 */

import type {
  CiscoEstimateResponse,
  CiscoEstimateError,
} from "@/types/cisco";
import estimateJson from "./_mock-data/estimate-responses.json";

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

export function getEstimateMock(): EstimateMockData {
  return estimateJson as unknown as EstimateMockData;
}
