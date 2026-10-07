/**
 * LLM 제공자 스위치 (서버 전용).
 * 기본은 Groq(무료)이고, 환경변수만 바꾸면 Anthropic Claude로 전환된다:
 *   LLM_PROVIDER=anthropic
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ANTHROPIC_MODEL=claude-opus-5-5   (기본값; claude-haiku-4-5 등으로 교체 가능)
 * 역할은 기존과 동일 — "숫자는 코드가, 해설은 AI가". 어느 제공자든 금액·판정 계산에는 쓰지 않는다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ChatGroq } from "@langchain/groq";
import { ChatAnthropic } from "@langchain/anthropic";
import { groqJson } from "@/services/groq";

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export type LlmPurpose = "chat" | "task";
/** 용도별 제공자 — 대화(챗봇·에이전트)는 LLM_CHAT_PROVIDER(없으면 LLM_PROVIDER), 그 외 작업(공고 정규화·추천 선별·판정 해설 등)은
 *  LLM_TASK_PROVIDER(없으면 groq). 즉 Vercel에 LLM_PROVIDER=anthropic만 있으면 "채팅은 Claude, 나머지는 Groq"가 된다. */
export const llmProvider = (purpose: LlmPurpose = "task") =>
  (purpose === "chat"
    ? (process.env.LLM_CHAT_PROVIDER ?? process.env.LLM_PROVIDER ?? "groq")
    : (process.env.LLM_TASK_PROVIDER ?? "groq")).toLowerCase();

/** 응답 텍스트에서 JSON만 추출 — 모델이 ```json 펜스를 둘러도 파싱되게 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

async function anthropicJson<T>(system: string, user: string, maxTokens: number): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 필요합니다 (LLM_PROVIDER=anthropic)");
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey });

  const call = async (tokens: number) => {
    // effort low: groq 쪽 reasoning_effort=low와 같은 취지 — 챗 응답 지연을 짧게.
    // fallbacks "default": 안전 분류기가 거부하면 서버가 대체 모델로 같은 요청을 재실행.
    const res = await client.beta.messages.create({
      model,
      max_tokens: Math.max(tokens, 1024),
      system: `${system}\n\n반드시 유효한 JSON 객체 하나만 출력할 것 (설명·코드펜스 금지).`,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") {
      throw new Error(`Anthropic 안전 거부: ${res.stop_details?.explanation ?? "사유 미제공"}`);
    }
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) throw new Error("Anthropic 응답이 비어 있습니다");
    return JSON.parse(extractJson(text)) as T;
  };

  try {
    return await call(maxTokens);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/JSON|비어 있습니다/.test(msg)) return await call(maxTokens * 2 + 1000);
    throw e;
  }
}

/** JSON 모드 LLM 호출 — 제공자(Groq/Anthropic)를 환경변수로 선택. 시그니처는 기존 groqJson과 동일. */
export async function llmJson<T>(system: string, user: string, maxTokens = 1500, opts: { purpose?: LlmPurpose } = {}): Promise<T> {
  if (llmProvider(opts.purpose ?? "task") === "anthropic") return anthropicJson<T>(system, user, maxTokens);
  return groqJson<T>(system, user, maxTokens);
}

/** LangChain 채팅 모델 — 에이전트(orchestrator·policy·profile)용.
 *  temperature는 Groq에만 적용한다 — Claude Opus 5.5 계열은 temperature 변경 요청을 400으로 거부. */
export function chatModel(temperature = 0) {
  if (llmProvider("chat") === "anthropic") {
    return new ChatAnthropic({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      maxTokens: 4096,
    });
  }
  return new ChatGroq({ model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b", temperature });
}
