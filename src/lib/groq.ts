/**
 * Groq LLM 호출 (서버 전용).
 * JSON 모드로 호출해 구조화된 판정을 받는다.
 * gpt-oss 계열은 숨은 추론 토큰이 max_tokens를 소진할 수 있어 reasoning_effort=low + 실패 시 1회 재시도.
 */
export async function groqJson<T>(
  system: string,
  user: string,
  maxTokens = 1500,
): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY 환경변수가 필요합니다");
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

  const call = async (tokens: number) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: tokens,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Groq API ${res.status}: ${detail}`);
    }
    const payload = await res.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq 응답이 비어 있습니다");
    return JSON.parse(content) as T;
  };

  try {
    return await call(maxTokens);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 추론 토큰 소진으로 JSON이 비면 한도를 늘려 1회 재시도
    if (/json_validate_failed|비어 있습니다|JSON/.test(msg)) {
      return await call(maxTokens * 2 + 1000);
    }
    throw e;
  }
}
