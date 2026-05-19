/**
 * Where to send the operator after the E1-compliance approval POST.
 *
 * The /api/pipeline/[id]/checkpoint route returns `{ advancing: boolean }`.
 * When advancing=true, the backend has kicked off the next engine (E5 in
 * RFP mode). If there are still critical/important clarifications the
 * presales engineer needs to answer, the clarifications page is the most
 * useful next stop. Otherwise the Overview page is honest — it will show
 * the next engine as "processing".
 */

type Priority = "critical" | "important" | "nice_to_have" | string | undefined;
interface Question { priority?: Priority }
interface EstimateApiShape { e1?: { clarifications?: { questions?: Question[] } } | null }

const CRITICAL_OR_IMPORTANT = new Set(["critical", "important"]);

export function hasBlockingClarifications(json: EstimateApiShape): boolean {
  const questions = json.e1?.clarifications?.questions ?? [];
  return questions.some((q) => q.priority && CRITICAL_OR_IMPORTANT.has(q.priority));
}

export async function pickNextRoute(
  estimateId: string,
  advancing: boolean,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!advancing) return `/estimates/${estimateId}`;
  try {
    const res = await fetcher(`/api/estimates/${estimateId}`);
    if (!res.ok) return `/estimates/${estimateId}`;
    const json = (await res.json()) as EstimateApiShape;
    if (hasBlockingClarifications(json)) {
      return `/estimates/${estimateId}/clarifications`;
    }
  } catch {
    // Network error fetching clarifications — fall back to Overview.
  }
  return `/estimates/${estimateId}`;
}
