/** Pure helpers for pulling structured data out of the LLM's free-text reply.
 *  Used by ChatPanel.tsx after each /api/chat response. */

import type { BomLineData } from "./types";

export function fmtUSD(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export function extractQuickReplies(text: string): string[] {
  const match = text.match(/\[quick-replies:\s*(.*?)\]/);
  if (!match) return [];
  try {
    const items = match[1].match(/"([^"]+)"/g);
    return items ? items.map((s) => s.replace(/"/g, "")) : [];
  } catch { return []; }
}

export function extractCustomerName(text: string): string {
  const patterns = [
    /\bfor\s+([A-Z][A-Za-z\s&'-]+(?:Bank|Corp|Inc|Ltd|LLC|Group|Machines|Data|Tech|Enterprise|Services|Solutions))/i,
    /\bcustomer[:\s]+([A-Z][A-Za-z\s&'-]+)/i,
    /\bclient[:\s]+([A-Z][A-Za-z\s&'-]+)/i,
    /([A-Z][A-Za-z\s&'-]+(?:Bank|Corp|Inc|Ltd|LLC|Group|Machines|Data|Tech|Enterprise|Services|Solutions))/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[1].trim();
  }
  return "Customer";
}

export function extractBom(text: string): BomLineData[] | null {
  // Try ```bom block first (our preferred format)
  const bomMatch = text.match(/```bom\n([\s\S]*?)```/);
  if (bomMatch) {
    try {
      const parsed = JSON.parse(bomMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try ```json block (Gemini often uses this)
  const jsonMatch = text.match(/```json\n([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try any ``` code block containing JSON array with SKUs
  const codeMatch = text.match(/```\n?([\s\S]*?)```/);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  // Try bare JSON array in the text (no code fence)
  const bareMatch = text.match(/\[\s*\{[^]*"sku"\s*:[^]*\}\s*\]/);
  if (bareMatch) {
    try {
      const parsed = JSON.parse(bareMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sku) return parsed;
    } catch { /* not JSON */ }
  }

  return extractBomFromMarkdownTable(text);
}

/** Fallback when the LLM returns a markdown table instead of structured JSON.
 *  Only triggers when the reply contains a completion keyword — otherwise we
 *  risk parsing random tables in the conversation. */
function extractBomFromMarkdownTable(text: string): BomLineData[] | null {
  const TRIGGER_KEYWORDS = ["Estimate Saved", "BoM Submitted", "Total List Price", "CCW Estimate ID", "MOCK-"];
  if (!TRIGGER_KEYWORDS.some((kw) => text.includes(kw))) return null;

  const lines: BomLineData[] = [];
  const SKU_PATTERN = /^[A-Z][A-Z0-9]+-[A-Z0-9/._-]+$/;
  const tableRows = text.match(/\|.*\|/g);
  if (!tableRows) return null;

  for (const row of tableRows) {
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;

    const skuIdx = cells.findIndex((c) => SKU_PATTERN.test(c));
    if (skuIdx === -1) continue;

    const sku = cells[skuIdx];
    if (sku.includes("---") || sku.toLowerCase() === "sku" || sku.toLowerCase() === "part number") continue;

    let quantity = 1;
    let unitListPrice = 0;
    let description = "";
    let category: string = "hardware";

    for (let i = 0; i < cells.length; i++) {
      if (i === skuIdx) continue;
      const cell = cells[i];

      if (/^\d+$/.test(cell) && parseInt(cell) > 0 && parseInt(cell) <= 9999) {
        quantity = parseInt(cell);
        continue;
      }

      const priceMatch = cell.match(/^\$?([\d,]+(?:\.\d{1,2})?)$/);
      if (priceMatch) {
        const val = parseFloat(priceMatch[1].replace(/,/g, ""));
        if (val >= 0) {
          unitListPrice = val;
          continue;
        }
      }

      const lower = cell.toLowerCase();
      if (["hardware", "license", "subscription", "service", "accessory", "software"].includes(lower)) {
        category = lower;
        continue;
      }

      if (cell.length > description.length && !cell.match(/^\d/) && cell.length > 3) {
        description = cell;
      }
    }

    const existing = lines.find((l) => l.sku === sku);
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.push({
        sku, description, quantity, unitListPrice, category,
        serviceDurationMonths: null, leadTimeDays: null,
      });
    }
  }

  return lines.length > 0 ? lines : null;
}
