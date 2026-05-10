import { z } from "zod";

// --- Schema & Types ---

export const SelectedFrameworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(["sector_mapping", "explicitly_referenced"]),
  priority: z.enum(["primary", "secondary"]),
});
export type SelectedFramework = z.infer<typeof SelectedFrameworkSchema>;

// --- Framework Catalogue ---

const F = {
  NCA_ECC:  { id: "NCA_ECC",  name: "NCA ECC-2:2024" },
  ISO_27001: { id: "ISO_27001", name: "ISO 27001:2022"  },
  SAMA_CSF:  { id: "SAMA_CSF",  name: "SAMA CSF"        },
  SACS_002:  { id: "SACS_002",  name: "SACS-002"        },
  ADHICS:    { id: "ADHICS",    name: "ADHICS"           },
  NESA:      { id: "NESA",      name: "NESA"             },
  NIST_CSF:  { id: "NIST_CSF",  name: "NIST CSF"        },
} as const;

type FrameworkEntry = { id: string; name: string; priority: "primary" | "secondary" };

// --- Lookup Tables ---

// Sector+country specific mappings (KSA)
const SECTOR_COUNTRY_MAP: Record<string, Record<string, FrameworkEntry[]>> = {
  government: {
    KSA: [
      { ...F.NCA_ECC,  priority: "primary"   },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
  banking: {
    KSA: [
      { ...F.SAMA_CSF,  priority: "primary"   },
      { ...F.NCA_ECC,   priority: "secondary" },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
  oil_and_gas: {
    KSA: [
      { ...F.NCA_ECC,   priority: "primary"   },
      { ...F.SACS_002,  priority: "primary"   },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
  healthcare: {
    KSA: [
      { ...F.NCA_ECC, priority: "primary"   },
      { ...F.ADHICS,  priority: "secondary" },
    ],
  },
  telecom: {
    KSA: [
      { ...F.NCA_ECC,   priority: "primary"   },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
  hospitality: {
    KSA: [
      { ...F.NCA_ECC,   priority: "primary"   },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
  petrochemical: {
    KSA: [
      { ...F.NCA_ECC,   priority: "primary"   },
      { ...F.ISO_27001, priority: "secondary" },
    ],
  },
};

// Country-level defaults when no sector-specific mapping exists
const COUNTRY_DEFAULTS: Record<string, FrameworkEntry[]> = {
  UAE: [
    { ...F.ISO_27001, priority: "primary"   },
    { ...F.NESA,      priority: "secondary" },
  ],
  International: [
    { ...F.ISO_27001, priority: "primary"   },
    { ...F.NIST_CSF,  priority: "secondary" },
  ],
};

// Safe fallback: NCA ECC + ISO 27001 for any unmapped sector in KSA (or unknown country)
const DEFAULT_FRAMEWORKS: FrameworkEntry[] = [
  { ...F.NCA_ECC,   priority: "primary"   },
  { ...F.ISO_27001, priority: "secondary" },
];

// --- Public Function ---

export function selectFrameworks(
  sector: string,
  country: string,
  explicitlyReferencedStandards: string[]
): SelectedFramework[] {
  const base: FrameworkEntry[] =
    SECTOR_COUNTRY_MAP[sector]?.[country] ??
    COUNTRY_DEFAULTS[country] ??
    DEFAULT_FRAMEWORKS;

  const result: SelectedFramework[] = base.map((f) =>
    SelectedFrameworkSchema.parse({ ...f, source: "sector_mapping" })
  );

  const seen = new Set(result.map((f) => f.id));

  for (const std of explicitlyReferencedStandards) {
    if (seen.has(std)) continue;
    result.push(
      SelectedFrameworkSchema.parse({
        id: std,
        name: std,
        source: "explicitly_referenced",
        priority: "secondary",
      })
    );
    seen.add(std);
  }

  return result;
}
