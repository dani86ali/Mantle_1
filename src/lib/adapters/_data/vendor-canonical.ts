// Canonical vendor name mappings. Pure data — no logic.
// `null` value = explicit non-vendor (caller substitutes "Unknown").
// Vendors not in the table pass through; the long-tail demote in
// scripts/polish-catalog-tier1.ts handles unmapped strings.
// Update THIS file (not catalog-polish.ts) when adding new vendor variants.

export const VENDOR_CANONICAL: Record<string, string | null> = {
  // ── Non-vendor noise (demoted to Unknown) ──
  Blank: null,
  blank: null,
  Giza: null,
  Edwards: null,
  STC: null,
  // Pass #2 additions: STCS is STC's internal code; Others/Local/0 are
  // BoQ template placeholders, not real vendors.
  Others: null,
  STCS: null,
  STCs: null,
  "STCS-UPL": null,
  Local: null,
  "0": null,

  // ── Canonical vendor mappings ──
  CISCO: "Cisco",
  cisco: "Cisco",
  HPE: "HPE",
  hpe: "HPE",
  FIREEYE: "FireEye",
  fireeye: "FireEye",
  FORTINET: "Fortinet",
  fortinet: "Fortinet",
  Microsoft: "Microsoft",
  MICROSOFT: "Microsoft",
  PaloAlto: "Palo Alto Networks",
  "Palo Alto": "Palo Alto Networks",
  "PALO ALTO": "Palo Alto Networks",
  PaloAltoNetworks: "Palo Alto Networks",
  "Palo Alto Networks": "Palo Alto Networks",

  // Pass #2: case collapses (variants observed in the post-pass-#1 catalog).
  XFUSION: "xFusion",
  Xfusion: "xFusion",
  xfusion: "xFusion",
  POLY: "Poly",
  Polycom: "Poly",
  polycom: "Poly",
  SYSTIMAX: "Systimax",
  HIKVISION: "Hikvision",
  LENSEC: "Lensec",
  MOBOTIX: "Mobotix",
  AXIS: "Axis",
  ATTIVO: "Attivo",
  GAMMA: "Gamma",
  ADVANTECH: "Advantech",

  // Pass #2: multi-word / spelling normalizations.
  Comscope: "CommScope",
  CRAY: "Cray",
  RIBBON: "Ribbon",
  NTTdata: "NTT Data",
  "Symantec Corporation": "Symantec",
  CONTEG: "Conteg",
};
