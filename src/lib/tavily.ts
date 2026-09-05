/**
 * Tavily 웹검색 공용 헬퍼. src/app/api/cron/discover/route.ts(주기적 발견)와
 * src/agents/policyTools.ts(검색바 실시간 폴백)가 공유한다.
 * TAVILY_API_KEY가 없으면 빈 배열을 반환 — 호출부가 "웹검색 생략"으로 자연스럽게 처리하게 함.
 */
export type TavilyResult = { title: string; url: string; content: string };

export async function tavilySearch(
  query: string,
  opts?: { maxResults?: number; includeDomains?: string[] },
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: opts?.maxResults ?? 5,
        include_domains: opts?.includeDomains ?? ["go.kr", "or.kr"],
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return ((json.results ?? []) as Record<string, unknown>[]).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      content: String(r.content ?? ""),
    }));
  } catch {
    return [];
  }
}
