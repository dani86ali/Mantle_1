const FILLER_TOKENS = new Set([
  'cisco',
  'fortinet',
  'switch',
  'series',
  'and',
  'the',
  'with',
  'for',
  'of',
  'a',
  'an',
]);

const MAX_EDIT_DISTANCE_LEN = 100;

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !FILLER_TOKENS.has(t));
}

export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersect = 0;
  setA.forEach((t) => {
    if (setB.has(t)) intersect += 1;
  });
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

export function editDistance(a: string, b: string): number {
  if (a.length > MAX_EDIT_DISTANCE_LEN || b.length > MAX_EDIT_DISTANCE_LEN) {
    return Infinity;
  }
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function normalizedEditDistance(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const d = editDistance(a, b);
  if (!isFinite(d)) return 0;
  return 1 - d / maxLen;
}
