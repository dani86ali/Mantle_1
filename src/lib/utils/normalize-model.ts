// Strips trailing license-tier suffixes (-A, -E, -P) from Cisco model strings.
// FortiGate / FG- models pass through unchanged. The suffix is only stripped
// when the segment after the final dash is a single A/E/P character — so
// genuine model letters like "48P" or "601F" are preserved.
export function normalizeModel(model: string): string {
  if (!model) return model;
  if (model.startsWith("FortiGate") || model.startsWith("FG-")) return model;

  const lastDash = model.lastIndexOf("-");
  if (lastDash <= 0) return model;

  const suffix = model.slice(lastDash + 1);
  if (suffix.length !== 1) return model;
  if (!/[AEPaep]/.test(suffix)) return model;

  return model.slice(0, lastDash);
}
