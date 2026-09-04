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

type Session = { personaId: string | null; profileId?: string; userId: string; name?: string };

type Rec = {
  id: string;
  title: string;
  benefit: string;
  amountMaxKrw: number; // 절약액 계산 불가 유형은 0
  region: string;
  target: string; // 지원대상 요약
  content: string; // 지원내용 요약
  method: string; // 신청방법
  url: string; // 공식 링크
};

type Verdict = {
  score: number;
  eligibility: "LIKELY" | "NEEDS_CHECK" | "UNLIKELY";
  reasons: string[];
  missing_information: string[];
  evidence_todo: string[];
};

const ELIG_LABEL: Record<Verdict["eligibility"], { text: string; cls: string }> = {
  LIKELY: { text: "신청 가능성 높음", cls: "bg-[#2fbf5f] text-white" },
  NEEDS_CHECK: { text: "추가 확인 필요", cls: "bg-[#f6e05e] text-ink" },
  UNLIKELY: { text: "요건 미충족 가능성", cls: "bg-line text-ink" },
};

/** 데모용 추천 정책 — AI 매칭 엔진이 붙기 전까지의 자리 (페르소나별 기대 매칭과 동일) */
const RECS: Record<string, Rec[]> = {
  minji: [
    { id: "jungnang-exam", title: "중랑구 미취업청년 자격증 응시료 지원", benefit: "응시료 최대 10만 원", amountMaxKrw: 100000, region: "서울 중랑구", target: "중랑구 거주 미취업 청년 (만 19~39세)", content: "어학·자격증 시험 응시료를 연 최대 10만 원까지 실비 지원. 예산 소진 시 조기 마감될 수 있음", method: "중랑구청 홈페이지 온라인 신청 + 응시확인 증빙 제출", url: "https://www.jungnang.go.kr" },
    { id: "seoul-allowance", title: "서울 청년수당", benefit: "월 50만 원 × 최대 6개월", amountMaxKrw: 500000, region: "서울", target: "서울 거주 만 19~34세 졸업 후 미취업 청년, 중위소득 150% 이하", content: "구직활동 지원금 월 50만 원을 최대 6개월 지급 (클린카드)", method: "청년몽땅정보통에서 모집 기간 내 온라인 신청", url: "https://youth.seoul.go.kr" },
    { id: "seoul-suit", title: "취업날개 면접정장 무료대여", benefit: "회당 정장 대여 무료", amountMaxKrw: 40000, region: "서울", target: "서울 거주 만 18~39세 구직 청년", content: "면접용 정장·구두·넥타이 등 무료 대여 (연 10회)", method: "온라인 예약 후 대여점 방문", url: "https://job.seoul.go.kr" },
  ],
  junho: [
    { id: "gg-interview", title: "경기도 청년 면접수당", benefit: "면접 회당 5만 원", amountMaxKrw: 50000, region: "경기", target: "경기도 거주 만 18~39세 구직 청년", content: "면접 참여 시 회당 5만 원, 연 최대 50만 원 지역화폐 지급", method: "잡아바 온라인 신청 + 면접확인서 제출", url: "https://www.jobaba.net" },
    { id: "kua-allowance", title: "국민취업지원제도 구직촉진수당", benefit: "월 50만 원+ × 6개월", amountMaxKrw: 500000, region: "전국", target: "15~69세 구직자 중 중위소득 60% 이하 + 가구 재산 요건 (청년은 특례 완화)", content: "구직촉진수당 월 50만 원(부양가족 가산 시 최대 90만) × 6개월 + 취업지원 서비스", method: "고용24 온라인 신청 또는 고용센터 방문", url: "https://www.work24.go.kr" },
    { id: "wide-jobhunt", title: "광역 구직활동비", benefit: "장거리 면접 교통·숙박", amountMaxKrw: 70000, region: "전국", target: "거주지에서 25km 이상 떨어진 면접 참여 구직급여 수급자 등", content: "장거리 면접 시 교통비·숙박비 실비 지원", method: "고용센터 신청 + 면접확인서 제출", url: "https://www.work24.go.kr" },
  ],
  seoyeon: [
    { id: "nbcard", title: "국민내일배움카드 + 훈련장려금", benefit: "훈련비 지원 + 월 장려금", amountMaxKrw: 116000, region: "전국", target: "구직자·재직자 대부분 발급 가능 (실업 상태는 구직등록 필요)", content: "5년간 300~500만 원 훈련비 + 출석 요건 충족 시 월 훈련장려금", method: "고용24(HRD-Net)에서 카드 발급 후 훈련과정 수강신청", url: "https://www.work24.go.kr" },
    { id: "youth-rent", title: "청년월세 특별지원", benefit: "월세 월 20만 원 × 12개월", amountMaxKrw: 200000, region: "전국", target: "만 19~34세 무주택 1인 가구, 본인·원가구 소득 및 보증금·월세 상한 요건", content: "월 최대 20만 원 월세를 12개월 지원", method: "복지로 온라인 신청 또는 주민센터", url: "https://www.bokjiro.go.kr" },
    { id: "kua-link", title: "국민취업지원제도 (수급 종료 후 연계)", benefit: "구직급여 종료 대비", amountMaxKrw: 500000, region: "전국", target: "구직급여 수급 종료 후 미취업 상태인 구직자 (수급 중에는 중복 불가)", content: "수급 종료 후 국취제 연계로 구직촉진수당·취업지원 서비스 연결", method: "구직급여 종료 시점에 맞춰 고용24에서 신청", url: "https://www.work24.go.kr" },
  ],
  _default: [
    { id: "kua", title: "국민취업지원제도", benefit: "구직촉진수당 + 취업지원", amountMaxKrw: 500000, region: "전국", target: "15~69세 구직자, 소득·재산 요건 (청년 특례 완화)", content: "구직촉진수당 월 50만 원 × 6개월 + 맞춤 취업지원", method: "고용24 온라인 신청 또는 고용센터 방문", url: "https://www.work24.go.kr" },
    { id: "nbcard", title: "국민내일배움카드", benefit: "훈련비 최대 지원", amountMaxKrw: 300000, region: "전국", target: "구직자·재직자 대부분 발급 가능 (실업 상태는 구직등록 필요)", content: "5년간 300~500만 원 훈련비 지원", method: "고용24(HRD-Net)에서 카드 발급 후 수강신청", url: "https://www.work24.go.kr" },
    { id: "sunshine", title: "햇살론유스", benefit: "저금리 생활자금", amountMaxKrw: 0, region: "전국", target: "만 19~34세, 연소득 3,500만 원 이하 (무소득 취준생 가능)", content: "생활·학업 자금 저금리 보증부 대출 (한도 1,200만 원)", method: "서민금융진흥원 앱 보증 신청 후 은행 대출", url: "https://www.kinfa.or.kr" },
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

  // 정책 상세 모달 + AI 판정
  const [detail, setDetail] = useState<Rec | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);

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

  const openDetail = (r: Rec) => {
    setDetail(r);
    setVerdict(null);
    setJudgeError(null);
  };

  const judge = async () => {
    if (!detail || !session || judging) return;
    setJudging(true);
    setJudgeError(null);
    try {
      const res = await fetch("/api/relevance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: session.personaId,
          profileId: session.profileId ?? null,
          policy: {
            title: detail.title,
            benefit: detail.benefit,
            target: detail.target,
            content: detail.content,
            region: detail.region,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "판정 실패");
      setVerdict(json.verdict);
    } catch (e) {
      setJudgeError(e instanceof Error ? e.message : String(e));
    } finally {
      setJudging(false);
    }
  };

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
                        <span className="flex gap-2">
                          <button onClick={() => openDetail(r)} className="text-[11.5px] font-bold text-leaf-deep underline">자세히보기</button>
                          <button onClick={() => removeFromMy(r.id)} className="text-[11.5px] font-bold text-mute underline">빼기</button>
                        </span>
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
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => addToMy(r.id)}
                          className="rounded-full bg-leaf px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#333333]"
                        >
                          + 담기
                        </button>
                        <button onClick={() => openDetail(r)} className="text-[11.5px] font-bold text-leaf-deep underline">자세히보기</button>
                      </div>
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

      {/* ── 정책 상세 모달 ─────────────────────── */}
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-card p-6 shadow-lift"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold leading-snug">{detail.title}</h3>
              <button onClick={() => setDetail(null)} className="text-xl leading-none text-mute" aria-label="닫기">×</button>
            </div>
            <p className="mt-1 text-[13px] font-bold text-leaf-deep">{detail.benefit} · {detail.region}</p>

            <dl className="mt-4 flex flex-col gap-3 text-[13.5px]">
              <div>
                <dt className="font-bold text-mute">지원대상</dt>
                <dd className="mt-0.5">{detail.target}</dd>
              </div>
              <div>
                <dt className="font-bold text-mute">지원내용</dt>
                <dd className="mt-0.5">{detail.content}</dd>
              </div>
              <div>
                <dt className="font-bold text-mute">신청방법</dt>
                <dd className="mt-0.5">{detail.method}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={judge}
                disabled={judging}
                className="rounded-full bg-leaf px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#333333] disabled:opacity-60"
              >
                {judging ? "AI가 판정 중…" : "🤖 나랑 맞는지 AI 판정"}
              </button>
              {!savedIds.includes(detail.id) && (
                <button onClick={() => addToMy(detail.id)} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold transition hover:border-ink">
                  + 마이티끌에 담기
                </button>
              )}
              <a href={detail.url} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-leaf-deep underline">
                공식 페이지 ↗
              </a>
            </div>

            {judgeError && <p className="mt-3 rounded-[10px] bg-mint px-3 py-2 text-[12.5px] font-bold text-[#d33]">⚠ {judgeError}</p>}

            {verdict && (
              <div className="mt-4 rounded-[14px] border border-line bg-mint-soft/70 p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${ELIG_LABEL[verdict.eligibility].cls}`}>
                    {ELIG_LABEL[verdict.eligibility].text}
                  </span>
                  <span className="text-[13px] font-bold">관련도 {verdict.score}점</span>
                </div>
                {verdict.reasons.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1 text-[13px]">
                    {verdict.reasons.map((r) => <li key={r}>· {r}</li>)}
                  </ul>
                )}
                {verdict.missing_information.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[12px] font-bold text-mute">확인이 필요해요</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                      {verdict.missing_information.map((m) => <li key={m}>❓ {m}</li>)}
                    </ul>
                  </div>
                )}
                {verdict.evidence_todo.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[12px] font-bold text-mute">미리 챙겨두세요</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                      {verdict.evidence_todo.map((m) => <li key={m}>📎 {m}</li>)}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-mute">AI의 1차 판정입니다 — 최종 자격은 공식 기관에서 확인하세요.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
