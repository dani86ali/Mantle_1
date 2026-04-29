/**
 * Tool definitions for the BOMatic AI agent.
 * These are passed to Anthropic's tool-use API.
 */

import type Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "catalog_lookup",
    description:
      "Look up Cisco SKUs in the Catalog API. Returns pricing, availability, EoX status, region availability, and hardware specs. Maximum 50 SKUs per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        skus: {
          type: "array",
          items: { type: "string" },
          description: "Array of Cisco SKUs to look up",
          maxItems: 50,
        },
      },
      required: ["skus"],
    },
  },
  {
    name: "mapped_services",
    description:
      "Get mapped services, licenses, and accessories for a hardware SKU. Returns the required and optional attachments (SmartNet, licenses, PSU, fans, stacking, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        hardware_sku: {
          type: "string",
          description: "The hardware SKU to get mapped services for",
        },
      },
      required: ["hardware_sku"],
    },
  },
  {
    name: "search_customer",
    description:
      "Search for a customer in Cisco's Customer Registry. Returns matching customer records.",
    input_schema: {
      type: "object" as const,
      properties: {
        company_name: {
          type: "string",
          description: "Company name to search for",
        },
        country: {
          type: "string",
          description: "Country code (e.g., SA, US, GB)",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "validate_bom",
    description:
      "Run the deterministic validation engine against a proposed BoM. Returns per-rule pass/fail/warning results.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sku: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              category: { type: "string" },
              unit_list_price: { type: "number" },
            },
            required: ["sku", "quantity"],
          },
          description: "BoM line items to validate",
        },
      },
      required: ["lines"],
    },
  },
  {
    name: "create_estimate",
    description:
      "Create a CCW Estimate via the Estimate API. Returns an Estimate ID and CCW URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        estimate_name: {
          type: "string",
          description: "Name for the estimate",
        },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sku: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["sku", "quantity"],
          },
          description: "Line items for the estimate",
        },
      },
      required: ["estimate_name", "line_items"],
    },
  },
  {
    name: "submit_bom",
    description:
      "Submit the final BoM draft with all line items, validation report, and summary. This completes the agent's work.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sku: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_list_price: { type: "number" },
              category: { type: "string" },
              service_duration_months: { type: "number" },
              lead_time_days: { type: "number" },
              smart_account_mandatory: { type: "boolean" },
              parent_sku: { type: "string" },
            },
            required: ["sku", "description", "quantity", "unit_list_price", "category"],
          },
        },
        summary: {
          type: "object",
          properties: {
            assumptions: { type: "array", items: { type: "string" } },
            exclusions: { type: "array", items: { type: "string" } },
            open_questions: { type: "array", items: { type: "string" } },
          },
        },
        quote_advisory: {
          type: "object",
          properties: {
            detected: { type: "boolean" },
            signals: { type: "array", items: { type: "string" } },
            recommendation: { type: "string" },
          },
        },
      },
      required: ["lines", "summary"],
    },
  },
];
