/**
 * Co-located mock data for the Cisco Catalog adapter.
 *
 * Used only when isMockMode() is true. Static JSON imports are bundled
 * by Next.js at build time, so production builds do not need filesystem
 * access to the JSON files at runtime.
 */

import type {
  CiscoCatalogItem,
  CiscoCatalogError,
  CiscoMappedServicesResponse,
} from "@/types/cisco";
import catalogJson from "./_mock-data/catalog-responses.json";
import mappedServicesJson from "./_mock-data/mapped-services-responses.json";

interface CatalogMockData {
  items: Record<string, CiscoCatalogItem>;
  errors: Record<string, CiscoCatalogError>;
}

export function getCatalogMock(): CatalogMockData {
  return catalogJson as unknown as CatalogMockData;
}

export function getMappedServicesMock(): Record<
  string,
  CiscoMappedServicesResponse
> {
  return mappedServicesJson as unknown as Record<
    string,
    CiscoMappedServicesResponse
  >;
}
