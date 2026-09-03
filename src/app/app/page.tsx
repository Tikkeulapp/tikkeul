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

const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 해당 월의 달력 칸 배열 — 앞뒤 빈칸은 null */
function monthCells(y: number, m: number): (string | null)[] {
  const offset = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad2(m + 1)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
const prevMonth = ({ y, m }: { y: number; m: number }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
const nextMonth = ({ y, m }: { y: number; m: number }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });

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

  // 일정 등록 (달력)
  const [ym, setYm] = useState({ y: 2026, m: 8 }); // 2026년 9월 (m: 0-11)
  const [date, setDate] = useState("2026-09-18"); // 선택된 날짜
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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) map.set(ev.start_at, [...(map.get(ev.start_at) ?? []), ev]);
    return map;
  }, [events]);

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

          {/* 중앙: 일정 등록 — 노션식 월 달력 */}
          <section className="rounded-[18px] border border-line bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">일정 등록</h2>
              <div className="flex items-center gap-2 text-[14px] font-bold">
                <button onClick={() => setYm(prevMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="이전 달">‹</button>
                <span className="min-w-[110px] text-center">{ym.y}년 {ym.m + 1}월</span>
                <button onClick={() => setYm(nextMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="다음 달">›</button>
              </div>
            </div>

            {/* 요일 헤더 */}
            <div className="mt-4 grid grid-cols-7 text-center text-[11.5px] font-bold text-mute">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <span key={d} className="py-1">{d}</span>
              ))}
            </div>

            {/* 날짜 그리드 — 칸을 클릭해 선택 */}
            <div className="grid grid-cols-7 gap-1">
              {monthCells(ym.y, ym.m).map((cell, i) =>
                cell === null ? (
                  <div key={`empty-${i}`} className="min-h-[76px] rounded-[10px]" />
                ) : (
                  <button
                    key={cell}
                    onClick={() => setDate(cell)}
                    className={`min-h-[76px] rounded-[10px] border p-1.5 text-left align-top transition ${
                      date === cell
                        ? "border-leaf-deep bg-mint"
                        : cell === TODAY
                          ? "border-leaf-deep/40 bg-mint-soft"
                          : "border-line hover:border-ink"
                    }`}
                  >
                    <span className={`text-[12px] font-bold ${cell === TODAY ? "text-leaf-deep" : ""}`}>
                      {Number(cell.slice(8))}
                      {cell === TODAY && <em className="ml-1 text-[9px] not-italic text-mute">오늘</em>}
                    </span>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {(eventsByDate.get(cell) ?? []).slice(0, 2).map((ev) => (
                        <span key={ev.event_id} className="truncate rounded-[4px] bg-leaf-deep px-1 py-0.5 text-[10px] font-semibold text-white">
                          {ev.title}
                        </span>
                      ))}
                      {(eventsByDate.get(cell)?.length ?? 0) > 2 && (
                        <span className="text-[10px] font-bold text-mute">+{(eventsByDate.get(cell)?.length ?? 0) - 2}</span>
                      )}
                    </div>
                  </button>
                ),
              )}
            </div>

            {/* 선택된 날짜 패널: 그 날 일정 + 추가 */}
            <div className="mt-4 rounded-[14px] bg-mint-soft/70 p-4">
              <p className="text-[13.5px] font-bold">
                {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일 ({WEEKDAY[new Date(date + "T00:00:00").getDay()]})
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {(eventsByDate.get(date) ?? []).map((ev) => (
                  <div key={ev.event_id} className="flex items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-[13.5px]">
                    <span className="font-semibold">{ev.title}</span>
                    {ev.location && <span className="text-[12px] text-mute">{ev.location}</span>}
                    <span className="ml-auto text-[10.5px] font-semibold text-mute">
                      {ev.source === "seed" ? "기본 일정" : "내가 적음"}
                    </span>
                  </div>
                ))}
                {(eventsByDate.get(date) ?? []).length === 0 && (
                  <p className="text-[12.5px] text-mute">이 날짜에 일정이 없어요.</p>
                )}
              </div>
              <form onSubmit={addEvent} className="mt-2.5 flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="이 날짜에 일정 추가 — 예: SKT 면접"
                  required
                  className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-3 py-2.5 text-[14px]"
                  aria-label="일정 내용"
                />
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="rounded-full bg-leaf px-5 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "+ 등록"}
                </button>
              </form>
              {calNotice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[12.5px] font-bold text-leaf-deep">🚧 {calNotice}</p>}
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
