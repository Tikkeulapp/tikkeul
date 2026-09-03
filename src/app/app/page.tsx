"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getPersona, type Persona } from "@/data/personas";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";

type CalendarEvent = {
  event_id: string;
  title: string;
  start_at: string;
  location: string | null;
  event_type: string | null;
  source: string;
};

type Session = { personaId: string | null; userId: string; name?: string };

/**
 * 앱 메인 — 일정이 DB(user_calendar)에서 오고, 직접 입력한 일정이 DB에 저장된다.
 * 다음 단계: 이 위에 월 캘린더 뷰 + AI 정책 매칭이 올라간다.
 */
export default function AppPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 입력 폼 상태
  const [date, setDate] = useState("2026-09-18");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");

  const loadEvents = useCallback(async (userId: string) => {
    const res = await fetch(`/api/events?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (res.ok) setEvents(json.events);
    // 캘린더 테이블 미구축 단계에서는 에러를 띄우지 않는다 (다음 단계에서 연결)
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("tikkeul.session");
        if (raw) {
          const s = JSON.parse(raw) as Session;
          if (s.userId) {
            setSession(s);
            setPersona(s.personaId ? (getPersona(s.personaId) ?? null) : null);
            await loadEvents(s.userId);
          }
        }
      } catch {
        // 세션 없음 — 아래에서 시작 화면으로 안내
      }
      setLoaded(true);
    })();
  }, [loadEvents]);

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, date, title, location }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setTitle("");
      setLocation("");
      await loadEvents(session.userId); // DB에서 다시 읽어 화면 갱신
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="text-lg font-bold">프로필이 선택되지 않았어요</p>
          <Link
            href="/app/start"
            className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white"
          >
            프로필 선택하러 가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-4xl items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto text-[13px] text-mute">
          {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${session.name ?? "회원"}`}님 ·{" "}
          <Link href="/app/start" className="underline">
            프로필 변경
          </Link>
        </span>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 pb-24 pt-8">
        <h1 className="text-2xl font-semibold">{(persona?.name ?? session.name ?? "회원")}님의 머니캘린더</h1>
        <p className="mt-1 text-[13.5px] text-mute">
          일정은 클라우드 DB에 저장됩니다 · 세션 {session.userId.slice(0, 8)}…
        </p>

        {/* ── 직접 입력 폼 ─────────────────────── */}
        <form
          onSubmit={addEvent}
          className="mt-6 flex flex-wrap items-center gap-2 rounded-[16px] border border-line bg-card p-3"
        >
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded-[8px] border border-line px-3 py-2.5 text-[14px]"
            aria-label="날짜"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정을 적어보세요 — 예: SKT 면접"
            required
            className="min-w-0 flex-1 rounded-[8px] border border-line px-3 py-2.5 text-[14px]"
            aria-label="일정 내용"
          />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="장소 (선택)"
            className="w-28 rounded-[8px] border border-line px-3 py-2.5 text-[14px]"
            aria-label="장소"
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-full bg-leaf px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-50"
          >
            {saving ? "저장 중…" : "+ 추가"}
          </button>
        </form>
        {error && <p className="mt-2 text-[13px] font-bold text-[#d33]">⚠ {error}</p>}

        {/* ── 일정 목록 (DB에서 조회) ─────────────── */}
        <div className="mt-6 flex flex-col gap-2">
          {events.length === 0 && (
            <p className="rounded-[12px] bg-mint-soft px-4 py-3 text-[13.5px] text-mute">
              아직 일정이 없어요. 위에 첫 일정을 적어보세요.
            </p>
          )}
          {events.map((ev) => (
            <div
              key={ev.event_id}
              className="flex items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-[14.5px]"
            >
              <span className="rounded-[6px] bg-mint px-2 py-0.5 text-[12px] font-bold text-leaf-deep">
                {ev.start_at.slice(5).replace("-", "/")}
              </span>
              <span className="font-semibold">{ev.title}</span>
              {ev.location && <span className="text-[12.5px] text-mute">{ev.location}</span>}
              <span className="ml-auto text-[11px] font-semibold text-mute">
                {ev.source === "seed" ? "기본 일정" : "내가 적음"}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 rounded-[12px] bg-mint-soft px-4 py-3 text-[13.5px] text-mute">
          🚧 다음 단계: 일정을 적으면 <b className="text-ink">AI가 의미를 읽고 받을 수 있는
          혜택(절약액)</b>을 붙여줍니다.
        </p>
      </section>
    </main>
  );
}
