/**
 * localStorage("tikkeul.session")에 저장된 세션 읽기 (StartClient가 기록).
 * useSyncExternalStore로 읽어 effect 안 setState를 피한다. 서버 렌더·하이드레이션 중엔 undefined.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { SimSession } from "@/components/app/SimulateView";

const SESSION_KEY = "tikkeul.session";

export function parseSession(raw: string | null): SimSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SimSession) : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** undefined = 아직 모름(서버/하이드레이션), null = 세션 없음 */
export function useStoredSession(): SimSession | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parseSession(raw)), [raw]);
}
