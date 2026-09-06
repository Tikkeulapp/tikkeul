"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getPersona, type Persona } from "@/data/personas";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { formatKrw } from "@/lib/derive";
import { examFeeFor } from "@/data/exam_fees";
import { findExamSession } from "@/data/exam_schedules";

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
  target?: string; // 지원대상 요약
  content?: string; // 지원내용 요약
  method?: string; // 신청방법
  url: string | null; // 공식 링크
  /** demo = 페르소나별 데모 추천, db = 정책 DB에서 담은 실제 정책 */
  source?: "demo" | "db";
  provider?: string | null;
  endDate?: string | null;
  alwaysOpen?: boolean;
  /** AI 추천(정책 DB) 항목의 관련도·이유·금액 근거 */
  score?: number;
  reason?: string;
  amountBasis?: string | null;
  sourceName?: string;
};

/** 마이티끌에 담을 때 함께 기억하는 맥락 (연결 일정·시험비·혜택 요약) — 브라우저 저장 */
type SavedMeta = { linkedEvent?: { title: string; date: string }; examName?: string; examFeeKrw?: number | null; amountKrw?: number; benefit?: string };
type DbPolicyRow = { policy_id: string; source: string; title: string; provider: string | null; theme: string | null; region_sidos: string[] | null; is_national: boolean | null; end_date: string | null; always_open: boolean | null; apply_url: string | null; income_condition: string | null; search_text: string | null };
const fmtMD = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

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
    { id: "jungnang-exam", title: "중랑구 미취업청년 자격증 응시료 지원", benefit: "응시료 최대 10만 원", amountMaxKrw: 100000, region: "서울 중랑구", target: "중랑구 거주 미취업 청년 (만 19~39세)", content: "어학·자격증 시험 응시료를 연 최대 10만 원까지 실비 지원. 예산 소진 시 조기 마감될 수 있음", method: "중랑구청 홈페이지 온라인 신청 + 응시확인 증빙 제출", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/306000000224" },
    { id: "seoul-allowance", title: "서울 청년수당", benefit: "월 50만 원 × 최대 6개월", amountMaxKrw: 500000, region: "서울", target: "서울 거주 만 19~34세 졸업 후 미취업 청년, 중위소득 150% 이하", content: "구직활동 지원금 월 50만 원을 최대 6개월 지급 (클린카드)", method: "청년몽땅정보통에서 모집 기간 내 온라인 신청", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/611000000126" },
    { id: "seoul-suit", title: "취업날개 면접정장 무료대여", benefit: "회당 정장 대여 무료", amountMaxKrw: 40000, region: "서울", target: "서울 거주 만 18~39세 구직 청년", content: "면접용 정장·구두·넥타이 등 무료 대여 (연 10회)", method: "온라인 예약 후 대여점 방문", url: "https://youth.seoul.go.kr/content.do?key=2310100015" },
  ],
  junho: [
    { id: "gg-interview", title: "경기도 청년 면접수당", benefit: "면접 회당 5만 원", amountMaxKrw: 50000, region: "경기", target: "경기도 거주 만 18~39세 구직 청년", content: "면접 참여 시 회당 5만 원, 연 최대 50만 원 지역화폐 지급", method: "잡아바 온라인 신청 + 면접확인서 제출", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/641000000193" },
    { id: "kua-allowance", title: "국민취업지원제도 구직촉진수당", benefit: "월 50만 원+ × 6개월", amountMaxKrw: 500000, region: "전국", target: "15~69세 구직자 중 중위소득 60% 이하 + 가구 재산 요건 (청년은 특례 완화)", content: "구직촉진수당 월 50만 원(부양가족 가산 시 최대 90만) × 6개월 + 취업지원 서비스", method: "고용24 온라인 신청 또는 고용센터 방문", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200005007" },
    { id: "wide-jobhunt", title: "광역 구직활동비", benefit: "장거리 면접 교통·숙박", amountMaxKrw: 70000, region: "전국", target: "거주지에서 25km 이상 떨어진 면접 참여 구직급여 수급자 등", content: "장거리 면접 시 교통비·숙박비 실비 지원", method: "고용센터 신청 + 면접확인서 제출", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200005002" },
  ],
  seoyeon: [
    { id: "nbcard", title: "국민내일배움카드 + 훈련장려금", benefit: "훈련비 지원 + 월 장려금", amountMaxKrw: 116000, region: "전국", target: "구직자·재직자 대부분 발급 가능 (실업 상태는 구직등록 필요)", content: "5년간 300~500만 원 훈련비 + 출석 요건 충족 시 월 훈련장려금", method: "고용24(HRD-Net)에서 카드 발급 후 훈련과정 수강신청", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200000026" },
    { id: "youth-rent", title: "청년월세 특별지원", benefit: "월세 월 20만 원 × 12개월", amountMaxKrw: 200000, region: "전국", target: "만 19~34세 무주택 1인 가구, 본인·원가구 소득 및 보증금·월세 상한 요건", content: "월 최대 20만 원 월세를 12개월 지원", method: "복지로 온라인 신청 또는 주민센터", url: "https://www.bokjiro.go.kr" },
    { id: "kua-link", title: "국민취업지원제도 (수급 종료 후 연계)", benefit: "구직급여 종료 대비", amountMaxKrw: 500000, region: "전국", target: "구직급여 수급 종료 후 미취업 상태인 구직자 (수급 중에는 중복 불가)", content: "수급 종료 후 국취제 연계로 구직촉진수당·취업지원 서비스 연결", method: "구직급여 종료 시점에 맞춰 고용24에서 신청", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200005007" },
  ],
  _default: [
    { id: "kua", title: "국민취업지원제도", benefit: "구직촉진수당 + 취업지원", amountMaxKrw: 500000, region: "전국", target: "15~69세 구직자, 소득·재산 요건 (청년 특례 완화)", content: "구직촉진수당 월 50만 원 × 6개월 + 맞춤 취업지원", method: "고용24 온라인 신청 또는 고용센터 방문", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200005007" },
    { id: "nbcard", title: "국민내일배움카드", benefit: "훈련비 최대 지원", amountMaxKrw: 300000, region: "전국", target: "구직자·재직자 대부분 발급 가능 (실업 상태는 구직등록 필요)", content: "5년간 300~500만 원 훈련비 지원", method: "고용24(HRD-Net)에서 카드 발급 후 수강신청", url: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/149200000026" },
    { id: "sunshine", title: "햇살론유스", benefit: "저금리 생활자금", amountMaxKrw: 0, region: "전국", target: "만 19~34세, 연소득 3,500만 원 이하 (무소득 취준생 가능)", content: "생활·학업 자금 저금리 보증부 대출 (한도 1,200만 원)", method: "서민금융진흥원 앱 보증 신청 후 은행 대출", url: "https://www.kinfa.or.kr/financialProduct/hessalLoanYoos.do" },
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

  // 검색바 (AI 채팅 — /api/chat)
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  // 사이드바: 아코디언 (하나만 열림)
  const [openTab, setOpenTab] = useState<"my" | "rec">("rec");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [dbRecs, setDbRecs] = useState<Record<string, Rec>>({}); // 정책 DB에서 담은 항목의 기본정보
  const [aiRecs, setAiRecs] = useState<Rec[] | null>(null); // 추천 탭: 정책 DB에서 AI가 프로필 기준으로 고른 정책
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<Record<string, SavedMeta>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

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
  // 거주지 변경(이사) 감지 결과 + 적용 상태
  type DeltaItem = { policy_id: string; title: string; provider: string | null; region: string; apply_url: string | null; score?: number; reason: string };
  type RegionChange = { field: string; from: string | null; to: string; effectiveFrom: string; opening: DeltaItem[]; closing: DeltaItem[]; openingTotal: number };
  const [regionChange, setRegionChange] = useState<RegionChange | null>(null);
  const [applyingChange, setApplyingChange] = useState(false);
  const [appliedChange, setAppliedChange] = useState<string | null>(null); // "2026-09-25부터 대전광역시"
  const [profileNote, setProfileNote] = useState<string | null>(null); // 헤더 배지용 (기존 변경 이력)

  // 일정 → AI 정책 매칭 결과
  const [matching, setMatching] = useState(false);
  const [matchFor, setMatchFor] = useState<string | null>(null);
  const [matchRecs, setMatchRecs] = useState<
    { policy_id: string; title: string; provider: string | null; region: string; score: number; reason: string; benefit_summary: string; apply_url: string | null; end_date?: string | null; always_open?: boolean }[] | null
  >(null);

  const demoRecs = useMemo(
    () => RECS[session?.personaId ?? "_default"] ?? RECS._default,
    [session?.personaId],
  );
  const recs = aiRecs && aiRecs.length > 0 ? aiRecs : demoRecs;

  /** 추천 탭: /api/recommend (하루 1회 브라우저 캐시). force=true면 다시 계산 */
  const loadRecs = useCallback(async (s: Session, force = false) => {
    const key = `tikkeul.airecs.${s.userId}`;
    if (!force) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) { const c = JSON.parse(raw) as { date: string; recs: Rec[] }; if (c.date === TODAY && c.recs.length) { setAiRecs(c.recs); return; } }
      } catch { /* 캐시 없음 */ }
    }
    setRecLoading(true); setRecError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: s.userId, personaId: s.personaId, profileId: s.profileId ?? null }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "추천 실패");
      const list = (json.recommendations ?? []) as Rec[];
      if (json.aiError && !list.length) throw new Error(json.aiError);
      setAiRecs(list);
      try { localStorage.setItem(key, JSON.stringify({ date: TODAY, recs: list })); } catch { /* 무시 */ }
    } catch (e) {
      setRecError(e instanceof Error ? e.message : "추천 실패");
    } finally {
      setRecLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async (userId: string) => {
    const res = await fetch(`/api/events?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (res.ok) setEvents(json.events);
  }, []);

  /** match_mode==='search'(event-match의 AI 추천)는 제외 — 마이티끌은 사용자가 정책 1건을
   * 직접 담은/판정한 행위만 센다 (POST /api/policy-matches, /api/relevance 참고). */
  const loadSavedIds = useCallback(async (userId: string) => {
    const res = await fetch(`/api/policy-matches?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (!res.ok) return;
    type Match = { policy_id: string; match_mode: string; status: string };
    const ids = (json.matches as Match[])
      .filter((m) => m.match_mode !== "search" && (m.status === "recommended" || m.status === "applied"))
      .map((m) => m.policy_id);
    setSavedIds(ids);
    if (ids.length > 0) setOpenTab("my");
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
            try { const m = localStorage.getItem(`tikkeul.mymeta.${s.userId}`); if (m) setSavedMeta(JSON.parse(m)); } catch { /* 없음 */ }
            await Promise.all([loadEvents(s.userId), loadSavedIds(s.userId)]);
            void loadRecs(s);
            try {
              const pc = await fetch(`/api/profile-change?userId=${encodeURIComponent(s.userId)}`).then((r) => r.json());
              const last = (pc.changes ?? []).filter((c: { field: string }) => c.field === "region_sido").pop();
              if (last) setProfileNote(`${last.effective_from.slice(5).replace("-", "/")}부터 ${last.new_value}`);
            } catch { /* 이력 없음 */ }
          }
        }
      } catch {
        // 세션 없음
      }
      setLoaded(true);
    })();
  }, [loadEvents, loadSavedIds, loadRecs]);

  /** 낙관적 업데이트 후 서버에 반영 — 실패해도 UI를 되돌리진 않는다(기존 localStorage 방식과
   * 동일하게 "일단 눈에 보이는 상태"를 우선하되, 다음 로드 때 서버 상태로 다시 맞춰진다). */
  const setSaved = (id: string, action: "save" | "remove") => {
    setSavedIds((prev) => (action === "save" ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    if (!session) return;
    fetch("/api/policy-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.userId, policyId: id, action }),
    }).catch(() => {});
  };
  const addToMy = (id: string) => setSaved(id, "save");
  const removeFromMy = (id: string) => setSaved(id, "remove");

  const recFromRow = (p: DbPolicyRow): Rec => ({
    id: p.policy_id, title: p.title, benefit: [p.theme, p.provider].filter(Boolean).join(" · "), amountMaxKrw: 0,
    region: p.is_national ? "전국" : (p.region_sidos ?? []).join(", "), provider: p.provider, content: p.search_text ?? undefined,
    url: p.apply_url, source: "db", endDate: p.end_date, alwaysOpen: !!p.always_open,
  });
  // 마이티끌에 담긴 DB 정책(데모 추천 목록에 없는 id)의 기본정보를 불러온다
  useEffect(() => {
    const missing = savedIds.filter((id) => !recs.some((r) => r.id === id) && !demoRecs.some((r) => r.id === id) && !dbRecs[id] && !fetchedRef.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => fetchedRef.current.add(id));
    fetch(`/api/policies?ids=${encodeURIComponent(missing.join(","))}`)
      .then((r) => r.json())
      .then((json) => {
        const rows = (json.policies ?? []) as DbPolicyRow[];
        setDbRecs((prev) => { const next = { ...prev }; for (const p of rows) next[p.policy_id] = recFromRow(p); return next; });
      })
      .catch(() => {});
  }, [savedIds, recs, demoRecs, dbRecs]);

  const persistMeta = (userId: string, next: Record<string, SavedMeta>) => { try { localStorage.setItem(`tikkeul.mymeta.${userId}`, JSON.stringify(next)); } catch { /* 무시 */ } };
  const savedRecs: Rec[] = savedIds.map((id) => recs.find((r) => r.id === id) ?? demoRecs.find((r) => r.id === id) ?? dbRecs[id]).filter((r): r is Rec => !!r);
  const unsavedRecs = recs.filter((r) => !savedIds.includes(r.id));
  const amountOf = (r: Rec) => (r.source === "db" ? savedMeta[r.id]?.amountKrw ?? r.amountMaxKrw ?? 0 : r.amountMaxKrw);
  const monthlySaving = savedRecs.reduce((s, r) => s + amountOf(r), 0);

  // 담은 정책의 마감일 → 달력 표시 + 3일 이내 임박 알림
  const daysUntil = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(TODAY + "T00:00:00").getTime()) / 86400000);
  const deadlinesByDate = new Map<string, Rec[]>();
  for (const r of savedRecs) if (r.endDate) deadlinesByDate.set(r.endDate, [...(deadlinesByDate.get(r.endDate) ?? []), r]);
  const urgent = savedRecs
    .filter((r) => r.endDate && daysUntil(r.endDate) >= 0 && daysUntil(r.endDate) <= 3)
    .sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1));

  // 달력의 시험 일정 → 공식 회차의 접수 마감 (exam_schedules.ts: 주관기관 공지에서 확인한 값)
  const examDeadlines = events
    .map((ev) => {
      const info = examFeeFor(ev.title);
      if (!info) return null;
      const m = findExamSession(info.name, ev.start_at);
      const deadline = m?.session?.regEnd ?? null;
      return { ev, info, match: m, deadline };
    })
    .filter((x): x is { ev: CalendarEvent; info: NonNullable<ReturnType<typeof examFeeFor>>; match: ReturnType<typeof findExamSession>; deadline: string | null } => !!x);
  const examDeadlinesByDate = new Map<string, typeof examDeadlines>();
  for (const x of examDeadlines) if (x.deadline) examDeadlinesByDate.set(x.deadline, [...(examDeadlinesByDate.get(x.deadline) ?? []), x]);
  const urgentExams = examDeadlines
    .filter((x) => x.deadline && daysUntil(x.deadline) >= 0 && daysUntil(x.deadline) <= 7)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
  const alarmCount = urgent.length + urgentExams.length;
  /** 시험 일정 한 줄 요약: 공식 회차 접수 마감(정확한 날짜) / 같은 날 회차가 없으면 가까운 회차 안내 / 상시·미확보는 공식 일정 확인 */
  const examLine = (title: string, examDate: string) => {
    const info = examFeeFor(title);
    if (!info) return null;
    const m = findExamSession(info.name, examDate);
    const dl = m?.session?.regEnd ?? null;
    let status: string;
    if (!m || m.kind === "none" || !m.session) status = `${info.regNote} — 공식 일정 확인`;
    else {
      const prefix = m.kind === "exact" ? `${m.session.round ? m.session.round + " " : ""}` : `이 날엔 회차 없음 → 가까운 회차 ${fmtMD(m.session.examDate)}${m.session.round ? `(${m.session.round})` : ""} `;
      const late = m.session.lateRegEnd && daysUntil(m.session.regEnd) < 0 && daysUntil(m.session.lateRegEnd) >= 0 ? ` · 추가접수 ${fmtMD(m.session.lateRegEnd)}까지` : "";
      status = daysUntil(m.session.regEnd) < 0
        ? `${prefix}정기접수 마감 지남(${fmtMD(m.session.regEnd)})${late}`
        : `${prefix}접수 마감 ${fmtMD(m.session.regEnd)} · D-${daysUntil(m.session.regEnd)}`;
    }
    return { info, dl, status, source: m?.schedule.sourceLabel ?? null, sourceUrl: m?.schedule.source ?? info.scheduleUrl };
  };

  /** 일정 매칭 카드에서 마이티끌로 담기 — 연결 일정·시험비(참고)·혜택 요약을 함께 기억 */
  const saveFromMatch = (r: NonNullable<typeof matchRecs>[number]) => {
    if (!session) return;
    const fee = examFeeFor(matchFor);
    const examSupport = /응시료|시험|자격증|어학|검정/.test(`${r.title} ${r.benefit_summary}`);
    const amountKrw = fee && examSupport ? fee.feeKrw : 0;
    const rec: Rec = { id: r.policy_id, title: r.title, benefit: r.benefit_summary, amountMaxKrw: amountKrw, region: r.region, provider: r.provider, content: r.reason, url: r.apply_url, source: "db", endDate: r.end_date ?? null, alwaysOpen: !!r.always_open };
    setDbRecs((prev) => ({ ...prev, [r.policy_id]: rec }));
    setSavedMeta((prev) => {
      const next = { ...prev, [r.policy_id]: { linkedEvent: matchFor ? { title: matchFor, date } : undefined, examName: fee?.name, examFeeKrw: fee?.feeKrw ?? null, amountKrw, benefit: r.benefit_summary } };
      persistMeta(session.userId, next);
      return next;
    });
    setSaved(r.policy_id, "save");
    setOpenTab("my");
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    if (!session) return;
    if (!window.confirm(`'${ev.title}' 일정을 삭제할까요?`)) return;
    await fetch(`/api/events?eventId=${encodeURIComponent(ev.event_id)}&userId=${encodeURIComponent(session.userId)}`, { method: "DELETE" });
    await loadEvents(session.userId);
    if (matchFor === ev.title) { setMatchRecs(null); setMatchFor(null); setRegionChange(null); }
  };

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
          userId: session.userId,
          personaId: session.personaId,
          profileId: session.profileId ?? null,
          // detail.id는 지금은 RECS 데모 데이터의 고정 id — policy_eligibility에 같은 id로
          // 시드해두면 규칙엔진 경로를 타고, 없으면 지금처럼 LLM 폴백 판정으로 그대로 동작한다.
          policyId: detail.id,
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

  const applyRegionChange = async (effectiveFrom: string) => {
    if (!session || !regionChange || applyingChange) return;
    setApplyingChange(true);
    try {
      const res = await fetch("/api/profile-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.userId, field: "region_sido", oldValue: regionChange.from,
          newValue: regionChange.to, effectiveFrom, sourceEvent: matchFor,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "적용 실패");
      const label = `${effectiveFrom.slice(5).replace("-", "/")}부터 ${regionChange.to}`;
      setAppliedChange(label);
      setProfileNote(label);
    } catch (e) {
      alert(`거주지 변경 적용 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setApplyingChange(false);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !session || chatLoading) return;
    const message = query.trim();
    setQuery("");
    setChatLoading(true);
    setChatReply(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.userId,
          personaId: session.personaId,
          profileId: session.profileId ?? null,
          message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "요청 실패");
      setChatReply(json.reply);
      // 채팅 중 새로 저장된 매칭이 있을 수 있으니 마이티끌 목록도 갱신
      if (session) void loadSavedIds(session.userId);
    } catch (e) {
      setNotice(`AI 응답에 실패했어요: ${e instanceof Error ? e.message : e}`);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setChatLoading(false);
    }
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !title.trim() || saving) return;
    const eventTitle = title.trim();
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
    // 저장 여부와 무관하게 AI 매칭 실행 — 일정에 혜택 붙이기
    void matchEvent(eventTitle);
  };

  const matchEvent = async (eventTitle: string) => {
    setMatching(true);
    setMatchFor(eventTitle);
    setMatchRecs(null);
    setRegionChange(null);
    setAppliedChange(null);
    try {
      const res = await fetch("/api/event-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session?.userId ?? null, personaId: session?.personaId ?? null, profileId: session?.profileId ?? null, title: eventTitle, date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "매칭 실패");
      setMatchRecs(json.recommendations ?? []);
      if (json.regionChange) setRegionChange(json.regionChange);
    } catch {
      setMatchRecs([]);
    } finally {
      setMatching(false);
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
      <header className="mx-auto flex h-[64px] w-full max-w-[1600px] items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto text-[14.5px] text-mute">
          {alarmCount > 0 && <span className="mr-2 rounded-full bg-[#f6c453] px-2 py-0.5 text-[12.5px] font-bold text-ink" title="마감 임박 알림">🔔 {alarmCount}</span>}
          {profileNote && <span className="mr-2 rounded-full bg-[#2fbf5f] px-2 py-0.5 text-[12.5px] font-bold text-white">🏠 {profileNote}</span>}
          {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 ·{" "}
          <Link href="/app/start" className="underline">프로필 변경</Link>
        </span>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-5 pb-16">
        {/* ── 상단 검색바: 모르는 거 물어보기 ───────────── */}
        <form onSubmit={search} className="flex items-center gap-2 rounded-[16px] border border-line bg-leaf-deep p-2 pl-4">
          <span className="text-[16.5px]">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="모르는 거 물어보기 — 예: 국민취업지원제도가 뭐야?"
            className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-white placeholder-white/60 outline-none"
            aria-label="AI에게 질문"
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="rounded-[10px] bg-white px-4 py-2 text-[15px] font-bold text-ink transition hover:bg-mint disabled:opacity-60"
          >
            {chatLoading ? "생각 중…" : "물어보기"}
          </button>
        </form>
        {notice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[14.5px] font-bold text-leaf-deep">💬 {notice}</p>}
        {chatReply && (
          <div className="mt-2 whitespace-pre-wrap rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14.5px] leading-relaxed text-ink">
            🤖 {chatReply}
          </div>
        )}

        {/* ── 본문 3단: 사이드바 / 일정 등록 / 위젯 ────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr_220px]">
          {/* 좌측: 마이티끌 / 추천 아코디언 */}
          <aside className="flex flex-col gap-2">
            {/* 마이티끌 */}
            <section className="overflow-hidden rounded-[18px] border border-line bg-card">
              <button
                onClick={() => setOpenTab("my")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] font-bold ${openTab === "my" ? "bg-leaf-deep text-white" : ""}`}
              >
                마이티끌
                <span className="text-[13.5px]">{savedRecs.length}건 {openTab === "my" ? "▾" : "▸"}</span>
              </button>
              {openTab === "my" && (
                <div className="flex flex-col gap-2 p-3">
                  {savedRecs.length === 0 && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[14px] text-mute">
                      아직 담은 정책이 없어요. [추천]에서 담아보세요.
                    </p>
                  )}
                  {savedRecs.map((r) => (
                    <div key={r.id} className="rounded-[12px] border border-line bg-mint-soft/60 p-3">
                      <p className="text-[15px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[13.5px] text-mute">{savedMeta[r.id]?.benefit ?? r.benefit}{r.source === "db" && r.region ? ` · ${r.region}` : ""}</p>
                      {savedMeta[r.id]?.linkedEvent && (
                        <p className="mt-1 text-[13px] text-leaf-deep">
                          📅 {savedMeta[r.id]!.linkedEvent!.title} · {fmtMD(savedMeta[r.id]!.linkedEvent!.date)}
                          {savedMeta[r.id]?.examFeeKrw ? ` · ${savedMeta[r.id]!.examName} 응시료 ${savedMeta[r.id]!.examFeeKrw!.toLocaleString("ko-KR")}원` : ""}
                        </p>
                      )}
                      {savedMeta[r.id]?.linkedEvent && (() => { const x = examLine(savedMeta[r.id]!.linkedEvent!.title, savedMeta[r.id]!.linkedEvent!.date); return x ? (
                        <p className={`mt-0.5 text-[13px] ${x.dl && daysUntil(x.dl) >= 0 && daysUntil(x.dl) <= 7 ? "font-bold text-[#b45309]" : "text-mute"}`}>
                          📝 {x.info.name} {x.status} · <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="underline">공식 일정 ↗</a>
                        </p>
                      ) : null; })()}
                      {(r.endDate || r.alwaysOpen) && (
                        <p className={`mt-0.5 text-[13px] ${r.endDate && daysUntil(r.endDate) <= 3 && daysUntil(r.endDate) >= 0 ? "font-bold text-[#b45309]" : "text-mute"}`}>
                          {r.endDate ? `⏰ 마감 ${fmtMD(r.endDate)}${daysUntil(r.endDate) >= 0 ? ` · D-${daysUntil(r.endDate)}` : " · 마감됨"}` : "상시 신청"}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="rounded-full bg-mint px-2 py-0.5 text-[12.5px] font-bold text-leaf-deep">진행중</span>
                        <span className="flex gap-2">
                          <button onClick={() => openDetail(r)} className="text-[13px] font-bold text-leaf-deep underline">자세히보기</button>
                          <button onClick={() => removeFromMy(r.id)} className="text-[13px] font-bold text-mute underline">빼기</button>
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
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] font-bold ${openTab === "rec" ? "bg-leaf-deep text-white" : ""}`}
              >
                추천
                <span className="text-[13.5px]">{unsavedRecs.length}건 {openTab === "rec" ? "▾" : "▸"}</span>
              </button>
              {openTab === "rec" && (
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-mute">
                      {recLoading ? "AI가 정책 DB에서 내 프로필에 맞는 정책을 찾는 중…" : aiRecs && aiRecs.length > 0 ? "AI 추천 — 정책 DB에서 프로필(거주지·나이·상태) 기준 선별" : recError ? `AI 추천 실패(${recError}) — 기본 추천 표시` : "기본 추천"}
                    </p>
                    {session && !recLoading && (
                      <button onClick={() => loadRecs(session, true)} className="shrink-0 text-[12.5px] font-bold text-leaf-deep underline" title="정책 DB에서 다시 선별">🔄 다시</button>
                    )}
                  </div>
                  {unsavedRecs.length === 0 && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[14px] text-mute">전부 담았어요 👍</p>
                  )}
                  {unsavedRecs.map((r) => (
                    <div key={r.id} className="rounded-[12px] border border-line p-3">
                      <p className="text-[15px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[13.5px] text-mute">{r.benefit} · {r.region}{typeof r.score === "number" ? ` · 관련도 ${r.score}` : ""}</p>
                      {r.reason && <p className="mt-1 text-[13px] leading-snug text-ink/80">{r.reason}</p>}
                      {(r.endDate || r.alwaysOpen) && (
                        <p className={`mt-0.5 text-[12.5px] ${r.endDate && daysUntil(r.endDate) >= 0 && daysUntil(r.endDate) <= 3 ? "font-bold text-[#b45309]" : "text-mute"}`}>
                          {r.endDate ? `⏰ 마감 ${fmtMD(r.endDate)}${daysUntil(r.endDate) >= 0 ? ` · D-${daysUntil(r.endDate)}` : ""}` : "상시 신청"}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => addToMy(r.id)}
                          className="rounded-full bg-leaf px-3.5 py-1.5 text-[13.5px] font-bold text-white transition hover:bg-[#333333]"
                        >
                          + 담기
                        </button>
                        <button onClick={() => openDetail(r)} className="text-[13px] font-bold text-leaf-deep underline">자세히보기</button>
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
              <div className="flex items-center gap-2 text-[15.5px] font-bold">
                <button onClick={() => setYm(prevMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="이전 달">‹</button>
                <span className="min-w-[110px] text-center">{ym.y}년 {ym.m + 1}월</span>
                <button onClick={() => setYm(nextMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="다음 달">›</button>
              </div>
            </div>

            {alarmCount > 0 && (
              <div className="mt-3 rounded-[12px] border border-[#f6c453] bg-[#fff7e0] px-4 py-3">
                <p className="text-[14.5px] font-bold text-[#b45309]">🔔 마감 임박 알림 {alarmCount}건</p>
                <ul className="mt-1 flex flex-col gap-1 text-[14px]">
                  {urgentExams.map((x) => (
                    <li key={"ex-" + x.ev.event_id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#f6c453] px-1.5 py-0.5 text-[12px] font-bold">시험 접수</span>
                      <span className="font-semibold">{x.ev.title}</span>
                      <span className="text-[#b45309]">정기접수 마감 {fmtMD(x.deadline!)} · D-{daysUntil(x.deadline!)}</span>
                      <span className="text-[13px] text-mute">
                        {x.match?.kind === "exact" ? `시험 ${fmtMD(x.ev.start_at)}` : `일정 ${fmtMD(x.ev.start_at)} · 가까운 공식 회차 ${fmtMD(x.match!.session!.examDate)}`}
                        {x.match?.session?.round ? ` · ${x.match.session.round}` : ""}
                      </span>
                      <a href={x.match?.schedule.source ?? x.info.scheduleUrl} target="_blank" rel="noreferrer" className="text-[13px] font-bold underline">공식 일정 ↗</a>
                    </li>
                  ))}
                  {urgent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#f6c453] px-1.5 py-0.5 text-[12px] font-bold">정책 신청</span>
                      <span className="font-semibold">{r.title}</span>
                      <span className="text-[#b45309]">마감 {fmtMD(r.endDate!)} · D-{daysUntil(r.endDate!)}</span>
                      {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-[13px] font-bold underline">신청 페이지 ↗</a>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[12.5px] text-mute">시험 접수 마감은 각 주관기관이 공지한 2026년 공식 회차 일정 기준입니다(확인일 2026-09-05). 변경될 수 있으니 신청 전 공식 페이지를 확인하세요.</p>
              </div>
            )}

            {/* 요일 헤더 */}
            <div className="mt-4 grid grid-cols-7 text-center text-[13px] font-bold text-mute">
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
                    <span className={`text-[13.5px] font-bold ${cell === TODAY ? "text-leaf-deep" : ""}`}>
                      {Number(cell.slice(8))}
                      {cell === TODAY && <em className="ml-1 text-[10.5px] not-italic text-mute">오늘</em>}
                    </span>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {(eventsByDate.get(cell) ?? []).slice(0, 2).map((ev) => (
                        <span key={ev.event_id} className="group/pill flex items-center gap-1 rounded-[4px] bg-leaf-deep px-1 py-0.5 text-[11.5px] font-semibold text-white">
                          <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`${ev.title} 삭제`}
                            title="일정 삭제"
                            onClick={(e) => { e.stopPropagation(); void deleteEvent(ev); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void deleteEvent(ev); } }}
                            className="shrink-0 rounded px-0.5 text-white/60 opacity-0 transition group-hover/pill:opacity-100 hover:bg-white/20 hover:text-white"
                          >✕</span>
                        </span>
                      ))}
                      {(eventsByDate.get(cell)?.length ?? 0) > 2 && (
                        <span className="text-[11.5px] font-bold text-mute">+{(eventsByDate.get(cell)?.length ?? 0) - 2}</span>
                      )}
                      {(deadlinesByDate.get(cell) ?? []).slice(0, 1).map((r) => (
                        <span key={"dl-" + r.id} className="truncate rounded-[4px] bg-[#f6c453] px-1 py-0.5 text-[11.5px] font-semibold text-ink" title={`${r.title} 신청 마감`}>⏰ {r.title}</span>
                      ))}
                      {(examDeadlinesByDate.get(cell) ?? []).slice(0, 1).map((x) => (
                        <span key={"ex-" + x.ev.event_id} className="truncate rounded-[4px] border border-[#f6c453] bg-[#fff7e0] px-1 py-0.5 text-[11.5px] font-semibold text-[#b45309]" title={`${x.ev.title} 정기접수 마감${x.match?.session?.round ? ` (${x.match.session.round})` : ""}`}>📝 {x.info.name} 접수마감</span>
                      ))}
                    </div>
                  </button>
                ),
              )}
            </div>

            {/* 선택된 날짜 패널: 그 날 일정 + 추가 */}
            <div className="mt-4 rounded-[14px] bg-mint-soft/70 p-4">
              <p className="text-[15px] font-bold">
                {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일 ({WEEKDAY[new Date(date + "T00:00:00").getDay()]})
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {(eventsByDate.get(date) ?? []).map((ev) => (
                  <div key={ev.event_id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-[15px]">
                    <span className="font-semibold">{ev.title}</span>
                    {ev.location && <span className="text-[13.5px] text-mute">{ev.location}</span>}
                    {(() => { const x = examLine(ev.title, ev.start_at); return x ? (
                      <span className={`basis-full text-[13px] ${x.dl && daysUntil(x.dl) >= 0 && daysUntil(x.dl) <= 7 ? "font-bold text-[#b45309]" : "text-mute"}`}>
                        📝 {x.info.name} · {x.status} · 응시료 {x.info.feeKrw.toLocaleString("ko-KR")}원 ·{" "}
                        <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="underline">공식 일정 ↗</a>
                      </span>
                    ) : null; })()}
                    <span className="ml-auto text-[12px] font-semibold text-mute">
                      {ev.source === "seed" ? "기본 일정" : "내가 적음"}
                    </span>
                    <button onClick={() => deleteEvent(ev)} className="grid h-6 w-6 place-items-center rounded-full text-[14px] text-mute transition hover:bg-line hover:text-ink" aria-label="일정 삭제" title="일정 삭제">✕</button>
                  </div>
                ))}
                {(eventsByDate.get(date) ?? []).length === 0 && (
                  <p className="text-[14px] text-mute">이 날짜에 일정이 없어요.</p>
                )}
              </div>
              <form onSubmit={addEvent} className="mt-2.5 flex items-center gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="이 날짜에 일정 추가 — 예: SKT 면접"
                  required
                  className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-3 py-2.5 text-[15.5px]"
                  aria-label="일정 내용"
                />
                <button
                  type="submit"
                  disabled={saving || !title.trim()}
                  className="rounded-full bg-leaf px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "+ 등록"}
                </button>
              </form>
              {calNotice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[14px] font-bold text-leaf-deep">🚧 {calNotice}</p>}

              {/* 일정 → AI가 찾은 혜택 */}
              {(matching || matchRecs) && matchFor && (
                <div className="mt-3 rounded-[14px] border border-line bg-card p-3.5">
                  <p className="text-[14px] font-bold text-leaf-deep">
                    💡 “{matchFor}” 일정에 붙는 혜택 {matching && "— AI가 전국 정책에서 찾는 중…"}
                  </p>
                  {!matching && matchRecs && matchRecs.length === 0 && (
                    <p className="mt-1.5 text-[14px] text-mute">이 일정과 연결되는 정책을 찾지 못했어요.</p>
                  )}
                  {!matching && matchRecs && matchRecs.map((r) => (
                    <div key={r.policy_id} className="mt-2 rounded-[10px] bg-mint-soft/70 p-2.5">
                      <p className="text-[14.5px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[13px] text-mute">{r.provider} · {r.region} · 관련도 {r.score}점</p>
                      <p className="mt-1 text-[14px]">{r.reason}</p>
                      <p className="mt-0.5 text-[13.5px] font-bold text-leaf-deep">🎁 {r.benefit_summary}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {savedIds.includes(r.policy_id) ? (
                          <span className="rounded-full bg-mint px-2.5 py-1 text-[12.5px] font-bold text-leaf-deep">✓ 마이티끌에 담김</span>
                        ) : (
                          <button onClick={() => saveFromMatch(r)} className="rounded-full bg-leaf px-3 py-1 text-[12.5px] font-bold text-white transition hover:bg-[#333333]">+ 마이티끌에 담기</button>
                        )}
                        {r.end_date ? <span className="text-[12.5px] text-mute">마감 {fmtMD(r.end_date)}</span> : r.always_open ? <span className="text-[12.5px] text-mute">상시</span> : null}
                        {r.apply_url && (
                          <a href={r.apply_url} target="_blank" rel="noreferrer" className="text-[13px] font-bold underline">신청 페이지 ↗</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 거주지 변경 감지 → 프로필 변경 제안 + 델타 리포트 */}
              {!matching && regionChange && (
                <div className="mt-3 rounded-[14px] border-2 border-leaf-deep bg-card p-4">
                  <p className="text-[15px] font-bold">
                    🏠 거주지 변경 감지 — {regionChange.from ?? "미상"} → <span className="text-leaf-deep">{regionChange.to}</span>
                  </p>
                  <p className="mt-1 text-[14px] text-mute">
                    이사하면 받을 수 있는 정책이 통째로 바뀌어요. 프로필 거주지를 바꿀까요? 이후 추천·매칭이 {regionChange.to} 기준으로 전환됩니다.
                  </p>
                  {appliedChange ? (
                    <p className="mt-2 rounded-[10px] bg-[#2fbf5f] px-3 py-2 text-[14px] font-bold text-white">✓ 적용됨 — {appliedChange} 거주로 반영</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => applyRegionChange(regionChange.effectiveFrom)} disabled={applyingChange}
                        className="rounded-full bg-leaf px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60">
                        {regionChange.effectiveFrom.slice(5).replace("-", "/")}부터 적용
                      </button>
                      <button onClick={() => applyRegionChange(new Date().toISOString().slice(0, 10))} disabled={applyingChange}
                        className="rounded-full border border-line px-4 py-2 text-[14px] font-bold disabled:opacity-60">
                        지금부터 적용
                      </button>
                    </div>
                  )}

                  {regionChange.opening.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[14px] font-bold text-[#1f8f45]">🟢 {regionChange.to}로 가면 새로 열리는 혜택 ({regionChange.opening.length}건 · 지역 정책 {regionChange.openingTotal}건 중)</p>
                      {regionChange.opening.map((o) => (
                        <div key={o.policy_id} className="mt-1.5 rounded-[10px] bg-mint-soft/70 p-2.5">
                          <p className="text-[14.5px] font-bold leading-snug">{o.title} <span className="text-[12.5px] font-semibold text-mute">· {o.provider} · {o.score}점</span></p>
                          <p className="mt-0.5 text-[13.5px]">{o.reason}</p>
                          {o.apply_url && <a href={o.apply_url} target="_blank" rel="noreferrer" className="text-[13px] font-bold underline">신청 페이지 ↗</a>}
                        </div>
                      ))}
                    </div>
                  )}
                  {regionChange.closing.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[14px] font-bold text-[#b23b3b]">🔴 {regionChange.from}을(를) 떠나면 사라지는 혜택 ({regionChange.closing.length}건)</p>
                      {regionChange.closing.map((c) => (
                        <div key={c.policy_id} className="mt-1.5 rounded-[10px] bg-[#fbeaea] p-2.5">
                          <p className="text-[14.5px] font-bold leading-snug">{c.title} <span className="text-[12.5px] font-semibold text-mute">· {c.provider}</span></p>
                          <p className="mt-0.5 text-[13.5px]">{c.reason}</p>
                        </div>
                      ))}
                      <p className="mt-1.5 text-[13px] text-mute">💡 이사 전에 신청 가능한 것은 지금 챙겨두세요.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 우측: 요약 위젯 (원 2개) */}
          <aside className="flex flex-row gap-4 lg:flex-col">
            <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-full bg-[#2fbf5f] p-4 text-center text-white shadow-lift">
              <div>
                <p className="text-[13px] font-bold leading-tight opacity-90">이번 달<br />아낄 티끌</p>
                <p className="mt-1 text-[19px] font-bold leading-tight">{monthlySaving > 0 ? formatKrw(monthlySaving) : "0원"}</p>
                <p className="mt-0.5 text-[11.5px] opacity-75">담은 정책 예상액</p>
              </div>
            </div>
            <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-full bg-[#7ddf9a] p-4 text-center text-leaf-deep shadow-lift">
              <div>
                <p className="text-[13px] font-bold leading-tight">이번 달<br />담은 혜택</p>
                <p className="mt-1 text-[24px] font-bold leading-none">{savedRecs.length}건</p>
                <p className="mt-0.5 text-[11.5px] opacity-75">마이티끌 기준</p>
              </div>
            </div>
            <Link
              href="/app/simulate"
              className="block w-full max-w-[220px] rounded-2xl border border-line bg-card p-3 text-left shadow-lift transition hover:border-ink"
            >
              <p className="text-[12.5px] font-bold text-mute">취업 후엔?</p>
              <p className="mt-0.5 text-[15px] font-bold leading-snug">🎯 취업 후<br />시뮬레이션</p>
              <p className="mt-1 text-[12px] text-mute">연봉·목표 → 자산 배분·열리는 제도</p>
            </Link>
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
            <p className="mt-1 text-[14.5px] font-bold text-leaf-deep">{detail.benefit} · {detail.region}</p>

            <dl className="mt-4 flex flex-col gap-3 text-[15px]">
              <div>
                <dt className="font-bold text-mute">지원대상</dt>
                <dd className="mt-0.5">{detail.target ?? (detail.source === "db" ? (detail.reason ?? "아래 정책 원문·공식 페이지 참고") : "-")}</dd>
              </div>
              <div>
                <dt className="font-bold text-mute">지원내용</dt>
                <dd className="mt-0.5 whitespace-pre-line">
                  {detail.source === "db" && detail.content ? (
                    <ul className="flex flex-col gap-1">
                      {detail.content.split(" | ").map((seg) => seg.trim()).filter(Boolean).slice(0, 6).map((seg, i) => (
                        <li key={i} className="rounded-[8px] bg-mint-soft/70 px-2.5 py-1.5 text-[14px]">{seg}</li>
                      ))}
                    </ul>
                  ) : (detail.content ?? "-")}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-mute">신청방법</dt>
                <dd className="mt-0.5">{detail.method ?? "공식 페이지에서 확인"}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={judge}
                disabled={judging}
                className="rounded-full bg-leaf px-5 py-2.5 text-[15px] font-bold text-white transition hover:bg-[#333333] disabled:opacity-60"
              >
                {judging ? "AI가 판정 중…" : "🤖 나랑 맞는지 AI 판정"}
              </button>
              {!savedIds.includes(detail.id) && (
                <button onClick={() => addToMy(detail.id)} className="rounded-full border border-line px-4 py-2.5 text-[14.5px] font-bold transition hover:border-ink">
                  + 마이티끌에 담기
                </button>
              )}
              {detail.url && (
                <a href={detail.url} target="_blank" rel="noreferrer" className="text-[14.5px] font-bold text-leaf-deep underline">
                  공식 페이지 ↗
                </a>
              )}
            </div>

            {judgeError && <p className="mt-3 rounded-[10px] bg-mint px-3 py-2 text-[14px] font-bold text-[#d33]">⚠ {judgeError}</p>}

            {verdict && (
              <div className="mt-4 rounded-[14px] border border-line bg-mint-soft/70 p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[13.5px] font-bold ${ELIG_LABEL[verdict.eligibility].cls}`}>
                    {ELIG_LABEL[verdict.eligibility].text}
                  </span>
                  <span className="text-[14.5px] font-bold">관련도 {verdict.score}점</span>
                </div>
                {verdict.reasons.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1 text-[14.5px]">
                    {verdict.reasons.map((r) => <li key={r}>· {r}</li>)}
                  </ul>
                )}
                {verdict.missing_information.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[13.5px] font-bold text-mute">확인이 필요해요</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[14.5px]">
                      {verdict.missing_information.map((m) => <li key={m}>❓ {m}</li>)}
                    </ul>
                  </div>
                )}
                {verdict.evidence_todo.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[13.5px] font-bold text-mute">미리 챙겨두세요</p>
                    <ul className="mt-1 flex flex-col gap-1 text-[14.5px]">
                      {verdict.evidence_todo.map((m) => <li key={m}>📎 {m}</li>)}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[12.5px] text-mute">AI의 1차 판정입니다 — 최종 자격은 공식 기관에서 확인하세요.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
