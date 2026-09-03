"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPersona, type Persona } from "@/data/personas";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { formatKrw } from "@/lib/derive";

type CalendarEvent = {
  event_id: string;
  title: string;
  start_at: string;
  location: string | null;
  event_type: string | null;
  source: string;
};

type Session = { personaId: string | null; userId: string; name?: string };

type Rec = {
  id: string;
  title: string;
  benefit: string;
  amountMaxKrw: number; // 절약액 계산 불가 유형은 0
  region: string;
};

/** 데모용 추천 정책 — AI 매칭 엔진이 붙기 전까지의 자리 (페르소나별 기대 매칭과 동일) */
const RECS: Record<string, Rec[]> = {
  minji: [
    { id: "jungnang-exam", title: "중랑구 미취업청년 자격증 응시료 지원", benefit: "응시료 최대 10만 원", amountMaxKrw: 100000, region: "서울 중랑구" },
    { id: "seoul-allowance", title: "서울 청년수당", benefit: "월 50만 원 × 최대 6개월", amountMaxKrw: 500000, region: "서울" },
    { id: "seoul-suit", title: "취업날개 면접정장 무료대여", benefit: "회당 정장 대여 무료", amountMaxKrw: 40000, region: "서울" },
  ],
  junho: [
    { id: "gg-interview", title: "경기도 청년 면접수당", benefit: "면접 회당 5만 원", amountMaxKrw: 50000, region: "경기" },
    { id: "kua-allowance", title: "국민취업지원제도 구직촉진수당", benefit: "월 50만 원+ × 6개월", amountMaxKrw: 500000, region: "전국" },
    { id: "wide-jobhunt", title: "광역 구직활동비", benefit: "장거리 면접 교통·숙박", amountMaxKrw: 70000, region: "전국" },
  ],
  seoyeon: [
    { id: "nbcard", title: "국민내일배움카드 + 훈련장려금", benefit: "훈련비 지원 + 월 장려금", amountMaxKrw: 116000, region: "전국" },
    { id: "youth-rent", title: "청년월세 특별지원", benefit: "월세 월 20만 원 × 12개월", amountMaxKrw: 200000, region: "전국" },
    { id: "kua-link", title: "국민취업지원제도 (수급 종료 후 연계)", benefit: "구직급여 종료 대비", amountMaxKrw: 500000, region: "전국" },
  ],
  _default: [
    { id: "kua", title: "국민취업지원제도", benefit: "구직촉진수당 + 취업지원", amountMaxKrw: 500000, region: "전국" },
    { id: "nbcard", title: "국민내일배움카드", benefit: "훈련비 최대 지원", amountMaxKrw: 300000, region: "전국" },
    { id: "sunshine", title: "햇살론유스", benefit: "저금리 생활자금", amountMaxKrw: 0, region: "전국" },
  ],
};

export default function AppPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 검색바
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // 사이드바: 아코디언 (하나만 열림)
  const [openTab, setOpenTab] = useState<"my" | "rec">("rec");
  const [savedIds, setSavedIds] = useState<string[]>([]);

  // 일정 등록 폼
  const [date, setDate] = useState("2026-09-18");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [calNotice, setCalNotice] = useState<string | null>(null);

  const recs = useMemo(
    () => RECS[session?.personaId ?? "_default"] ?? RECS._default,
    [session?.personaId],
  );
  const savedKey = session ? `tikkeul.mypolicies.${session.userId}` : null;

  const loadEvents = useCallback(async (userId: string) => {
    const res = await fetch(`/api/events?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (res.ok) setEvents(json.events);
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
            const saved = localStorage.getItem(`tikkeul.mypolicies.${s.userId}`);
            if (saved) {
              const ids = JSON.parse(saved) as string[];
              setSavedIds(ids);
              if (ids.length > 0) setOpenTab("my");
            }
            await loadEvents(s.userId);
          }
        }
      } catch {
        // 세션 없음
      }
      setLoaded(true);
    })();
  }, [loadEvents]);

  const persistSaved = (ids: string[]) => {
    setSavedIds(ids);
    if (savedKey) localStorage.setItem(savedKey, JSON.stringify(ids));
  };
  const addToMy = (id: string) => persistSaved([...new Set([...savedIds, id])]);
  const removeFromMy = (id: string) => persistSaved(savedIds.filter((x) => x !== id));

  const savedRecs = recs.filter((r) => savedIds.includes(r.id));
  const unsavedRecs = recs.filter((r) => !savedIds.includes(r.id));
  const monthlySaving = savedRecs.reduce((s, r) => s + r.amountMaxKrw, 0);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setNotice(`"${query.trim()}" — AI 검색·채팅은 다음 단계에서 연결됩니다.`);
    setQuery("");
    setTimeout(() => setNotice(null), 4000);
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !title.trim() || saving) return;
    setSaving(true);
    setCalNotice(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, date, title }),
      });
      if (!res.ok) throw new Error();
      setTitle("");
      await loadEvents(session.userId);
    } catch {
      setCalNotice("일정 저장(DB)은 다음 단계에서 연결됩니다.");
      setTimeout(() => setCalNotice(null), 4000);
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
          <Link href="/app/start" className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white">
            프로필 선택하러 가기
          </Link>
        </div>
      </main>
    );
  }

  const displayName = persona?.name ?? session.name ?? "회원";

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-6xl items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto text-[13px] text-mute">
          {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 ·{" "}
          <Link href="/app/start" className="underline">프로필 변경</Link>
        </span>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 pb-16">
        {/* ── 상단 검색바: 모르는 거 물어보기 ───────────── */}
        <form onSubmit={search} className="flex items-center gap-2 rounded-[16px] border border-line bg-leaf-deep p-2 pl-4">
          <span className="text-[15px]">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="모르는 거 물어보기 — 예: 국민취업지원제도가 뭐야?"
            className="min-w-0 flex-1 bg-transparent py-2 text-[14.5px] text-white placeholder-white/60 outline-none"
            aria-label="AI에게 질문"
          />
          <button type="submit" className="rounded-[10px] bg-white px-4 py-2 text-[13.5px] font-bold text-ink transition hover:bg-mint">
            물어보기
          </button>
        </form>
        {notice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[13px] font-bold text-leaf-deep">💬 {notice}</p>}

        {/* ── 본문 3단: 사이드바 / 일정 등록 / 위젯 ────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr_170px]">
          {/* 좌측: 마이티끌 / 추천 아코디언 */}
          <aside className="flex flex-col gap-2">
            {/* 마이티끌 */}
            <section className="overflow-hidden rounded-[18px] border border-line bg-card">
              <button
                onClick={() => setOpenTab("my")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14.5px] font-bold ${openTab === "my" ? "bg-leaf-deep text-white" : ""}`}
              >
                마이티끌
                <span className="text-[12px]">{savedRecs.length}건 {openTab === "my" ? "▾" : "▸"}</span>
              </button>
              {openTab === "my" && (
                <div className="flex flex-col gap-2 p-3">
                  {savedRecs.length === 0 && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[12.5px] text-mute">
                      아직 담은 정책이 없어요. [추천]에서 담아보세요.
                    </p>
                  )}
                  {savedRecs.map((r) => (
                    <div key={r.id} className="rounded-[12px] border border-line bg-mint-soft/60 p-3">
                      <p className="text-[13.5px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[12px] text-mute">{r.benefit}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-leaf-deep">진행중</span>
                        <button onClick={() => removeFromMy(r.id)} className="text-[11.5px] font-bold text-mute underline">빼기</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 추천 */}
            <section className="overflow-hidden rounded-[18px] border border-line bg-card">
              <button
                onClick={() => setOpenTab("rec")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14.5px] font-bold ${openTab === "rec" ? "bg-leaf-deep text-white" : ""}`}
              >
                추천
                <span className="text-[12px]">{unsavedRecs.length}건 {openTab === "rec" ? "▾" : "▸"}</span>
              </button>
              {openTab === "rec" && (
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-[11.5px] font-semibold text-mute">데모 추천 — AI 자동 매칭은 다음 단계</p>
                  {unsavedRecs.length === 0 && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[12.5px] text-mute">전부 담았어요 👍</p>
                  )}
                  {unsavedRecs.map((r) => (
                    <div key={r.id} className="rounded-[12px] border border-line p-3">
                      <p className="text-[13.5px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[12px] text-mute">{r.benefit} · {r.region}</p>
                      <button
                        onClick={() => addToMy(r.id)}
                        className="mt-2 rounded-full bg-leaf px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#333333]"
                      >
                        + 마이티끌에 담기
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>

          {/* 중앙: 일정 등록 */}
          <section className="rounded-[18px] border border-line bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">일정 등록</h2>
              <span className="text-[12px] text-mute">{displayName}님의 머니캘린더</span>
            </div>
            <form onSubmit={addEvent} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="rounded-[8px] border border-line px-3 py-2.5 text-[14px]" aria-label="날짜" />
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="일정을 적어보세요 — 예: SKT 면접" required
                className="min-w-0 flex-1 rounded-[8px] border border-line px-3 py-2.5 text-[14px]" aria-label="일정 내용" />
              <button type="submit" disabled={saving || !title.trim()}
                className="rounded-full bg-leaf px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-50">
                {saving ? "저장 중…" : "+ 등록"}
              </button>
            </form>
            {calNotice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[12.5px] font-bold text-leaf-deep">🚧 {calNotice}</p>}

            <div className="mt-4 flex flex-col gap-2">
              {events.length === 0 && (
                <p className="rounded-[12px] bg-mint-soft px-4 py-6 text-center text-[13.5px] text-mute">
                  일정을 등록하면 여기 쌓입니다.<br />다음 단계: 일정에 AI가 혜택(절약액)을 붙여줍니다.
                </p>
              )}
              {events.map((ev) => (
                <div key={ev.event_id} className="flex items-center gap-3 rounded-[12px] border border-line px-4 py-3 text-[14px]">
                  <span className="rounded-[6px] bg-mint px-2 py-0.5 text-[12px] font-bold text-leaf-deep">
                    {ev.start_at.slice(5).replace("-", "/")}
                  </span>
                  <span className="font-semibold">{ev.title}</span>
                  {ev.location && <span className="text-[12px] text-mute">{ev.location}</span>}
                  <span className="ml-auto text-[11px] font-semibold text-mute">
                    {ev.source === "seed" ? "기본 일정" : "내가 적음"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 우측: 요약 위젯 (원 2개) */}
          <aside className="flex flex-row gap-4 lg:flex-col">
            <div className="grid aspect-square w-full max-w-[170px] place-items-center rounded-full bg-[#2fbf5f] p-4 text-center text-white shadow-lift">
              <div>
                <p className="text-[11.5px] font-bold leading-tight opacity-90">이번 달<br />아낄 티끌</p>
                <p className="mt-1 text-[17px] font-bold leading-tight">{monthlySaving > 0 ? formatKrw(monthlySaving) : "0원"}</p>
                <p className="mt-0.5 text-[10px] opacity-75">담은 정책 예상액</p>
              </div>
            </div>
            <div className="grid aspect-square w-full max-w-[170px] place-items-center rounded-full bg-[#7ddf9a] p-4 text-center text-leaf-deep shadow-lift">
              <div>
                <p className="text-[11.5px] font-bold leading-tight">이번 달<br />담은 혜택</p>
                <p className="mt-1 text-[22px] font-bold leading-none">{savedRecs.length}건</p>
                <p className="mt-0.5 text-[10px] opacity-75">마이티끌 기준</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
