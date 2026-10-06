/** 채팅 메시지 타입 — API(/api/chat)와 에이전트(src/agents)가 공유. */

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };
