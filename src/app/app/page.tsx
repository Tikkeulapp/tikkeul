"use client";

import { isPublicOrg } from "@/data/ncs";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getPersona } from "@/data/personas";
import type { Persona } from "@/types/persona";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { formatKrw } from "@/lib/derive";
import { examFeeFor } from "@/data/exam_fees";
import { findExamSession } from "@/data/exam_schedules";
import { SIDO_CANONICAL } from "@/lib/region";
import { EmploymentToggle } from "@/components/app/EmploymentToggle";
import { OnboardingTour, restartOnboardingTour } from "@/components/app/OnboardingTour";

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

/** 챗봇 답변용 초경량 마크다운: **굵게**, [텍스트](url), "- " 불릿, 표(| a | b |)는 행으로. 그 외는 그대로 */
function renderChatMarkdown(text: string) {
  const inline = (line: string, key: string) => {
    const parts: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`/g;
    let last = 0; let m: RegExpExecArray | null; let i = 0;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1]) parts.push(<b key={`${key}-b${i}`} className="text-leaf-deep">{m[1]}</b>);
      else if (m[2]) parts.push(<a key={`${key}-a${i}`} href={m[3]} target="_blank" rel="noreferrer" className="font-bold underline">{m[2]} ↗</a>);
      else if (m[4]) parts.push(<code key={`${key}-c${i}`} className="rounded bg-mint-soft px-1 text-[13px]">{m[4]}</code>);
      last = m.index + m[0].length; i++;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };
  const lines = text.split("\n");
  return lines.map((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) return <div key={idx} className="h-2" />;
    if (/^\|?\s*-{3,}/.test(line.replace(/\|/g, "").trim()) && line.includes("|")) return null; // 표 구분선
    if (line.trim().startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter((c, i, a) => !(i === 0 && c === "") && !(i === a.length - 1 && c === ""));
      return <div key={idx} className="flex flex-wrap gap-x-3 gap-y-0.5 rounded bg-mint-soft/60 px-2 py-1 text-[13.5px]">{cells.map((c, ci) => <span key={ci}>{inline(c, `${idx}-${ci}`)}</span>)}</div>;
    }
    const bullet = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (bullet) return <div key={idx} className="flex gap-2 pl-1"><span className="text-mute">•</span><span>{inline(bullet[1], String(idx))}</span></div>;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) return <p key={idx} className="mt-1 font-bold">{inline(h[1], String(idx))}</p>;
    return <p key={idx}>{inline(line, String(idx))}</p>;
  });
}

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

const TODAY = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // KST 기준 오늘 — UTC 기준이면 한국 새벽에 날짜가 하루 어긋난다
/** 저장 실패로 event_id가 없을 때 매칭 결과를 묶어둘 임시 키 (이벤트 핸들러에서만 호출) */
const tempEventId = () => `tmp-${Date.now()}`;
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

type ProfileFieldProps = { value: string | null; saving: boolean; onSave: (value: string) => void };

const fieldClass = (value: string | null) =>
  !value ? "border-[#f6c453] bg-[#fff7e0] ring-1 ring-[#f6c453]" : "border-line bg-card";

function FieldSelect({ value, saving, onSave, options }: ProfileFieldProps & { options: string[] }) {
  return (
    <select
      value={value ?? ""}
      disabled={saving}
      onChange={(e) => { if (e.target.value) onSave(e.target.value); }}
      className={`rounded border px-1.5 py-0.5 text-[13px] disabled:opacity-50 ${fieldClass(value)}`}
    >
      <option value="" disabled>선택</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// 시·군·구는 정해진 목록이 없어 자유 입력 — 매 키 입력마다 저장하면 타이핑 중 계속 API를
// 두드리게 되니, 포커스를 벗어날 때(blur)만 값이 바뀌었으면 저장한다.
function FieldText({ value, saving, onSave, placeholder }: ProfileFieldProps & { placeholder?: string }) {
  return (
    <input
      key={value ?? ""}
      type="text"
      defaultValue={value ?? ""}
      placeholder={placeholder}
      disabled={saving}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== value) onSave(v);
      }}
      className={`w-24 rounded border px-1.5 py-0.5 text-right text-[13px] disabled:opacity-50 ${fieldClass(value)}`}
    />
  );
}

function FieldDate({ value, saving, onSave }: ProfileFieldProps) {
  return (
    <input
      type="date"
      value={value?.slice(0, 10) ?? ""}
      disabled={saving}
      onChange={(e) => { if (e.target.value) onSave(e.target.value); }}
      className={`rounded border px-1.5 py-0.5 text-[13px] disabled:opacity-50 ${fieldClass(value)}`}
    />
  );
}

function MissingBadge() {
  return (
    <span className="rounded border border-[#f6c453] bg-[#fff7e0] px-1.5 py-0.5 text-[11.5px] font-bold text-[#b45309]">❗ 입력 필요</span>
  );
}

export default function AppPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 검색바 (AI 채팅 — /api/chat)
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // 질문 하나로 끝나지 않고 답변 아래에서 바로 추가 질문을 이어갈 수 있게 — 매번 위 검색창을
  // 다시 눌러야 했던 걸 실제 채팅처럼 스레드로 유지한다. reply가 null이면 아직 응답 대기 중.
  type ChatTurn = { question: string; reply: string | null };
  const [chatThread, setChatThread] = useState<ChatTurn[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatQuestion = chatThread.length > 0 ? chatThread[chatThread.length - 1].question : null; // 최신 질문 (프로필 카드 자동 이어붙이기용)

  // 사이드바: 아코디언 (하나만 열림)
  const [openTab, setOpenTab] = useState<"my" | "rec" | "jobs" | null>("rec");
  /** 아코디언 헤더 클릭 — 이미 열려 있으면 닫는다 */
  const toggleTab = (tab: "my" | "rec" | "jobs") => setOpenTab((prev) => (prev === tab ? null : tab));
  // 채용 탭: 공공기관 채용공고에서 프로필(직무·지역) 기준 AI 선별 + 마감 임박(D-7)
  type JobRec = { id: string; source: string; title: string; company: string | null; region: string; ncs: string; career: string | null; education: string | null; hireTypes: string; salary: string | null; summary: string | null; requirements: string | null; deadline: string | null; deadlineTime: string | null; pbancBegin: string | null; dday: number | null; url: string | null; score: number; reason: string };
  const [jobRecs, setJobRecs] = useState<JobRec[] | null>(null);
  const [jobUrgent, setJobUrgent] = useState<JobRec[]>([]);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobCalSaved, setJobCalSaved] = useState<Set<string>>(new Set()); // 캘린더에 담은 공고

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
  const [ym, setYm] = useState(() => { const t = new Date(Date.now() + 9 * 3600000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; }); // 현재 달(KST)
  const [date, setDate] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)); // 선택된 날짜 = 오늘(KST)
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [calNotice, setCalNotice] = useState<string | null>(null);
  // 거주지 변경(이사) 감지 결과 + 적용 상태
  type DeltaItem = { policy_id: string; title: string; provider: string | null; region: string; apply_url: string | null; score?: number; reason: string };
  type RegionChange = { field: string; from: string | null; to: string; effectiveFrom: string; opening: DeltaItem[]; closing: DeltaItem[]; openingTotal: number };
  const [applyingChange, setApplyingChange] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null); // 헤더 배지용 (거주지 변경 이력)
  // 마감 임박 알림 닫기 — 오늘 날짜로 닫음 기록을 남겨서, 새로고침해도 오늘은 안 뜨고 날짜가
  // 바뀌면(새 임박 항목이 생길 수 있으니) 다시 뜨게 한다.
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  const dismissAlarm = () => {
    setAlarmDismissed(true);
    if (session) { try { localStorage.setItem(`tikkeul.alarmDismissed.${session.userId}`, TODAY); } catch { /* 무시 */ } }
  };
  // 우측 프로필 카드 실시간 반영 — 채팅으로 바뀐 학력/취업상태/소득·자산분위를 페르소나 기본값 위에 덮어씀
  const OVERRIDE_FIELDS = ["region_sido", "region_sigungu", "birth_date", "education_status", "employment_status", "income_bracket", "asset_bracket", "housing_type"] as const;
  const [profileOverrides, setProfileOverrides] = useState<Partial<Record<(typeof OVERRIDE_FIELDS)[number], string>>>({});
  const [resettingProfile, setResettingProfile] = useState(false);
  // 방금 챗봇이 판정에 필요하다고 한 필드만 담아둔다 — 비어있는 필드를 무조건 다 보여주는 대신
  // "지금 필요한 것"만 노출해 카드가 항상 빈칸투성이로 보이지 않게 한다.
  const [neededFields, setNeededFields] = useState<Set<string>>(new Set());

  // "내 정보로 시작하기"(직접입력) 사용자 — 페르소나처럼 코드에 declared가 없어 DB에서 직접 가져와야 함
  type DirectProfile = { name: string | null; age: number | null; birthDate: string | null; sido: string | null; sigungu: string | null; educationStatus: string | null; employmentStatus: string | null; incomeBracket: string | null; assetBracket: string | null; housingType: string | null };
  const [directProfile, setDirectProfile] = useState<DirectProfile | null>(null);
  const refreshDirectProfile = useCallback(async (s: Session) => {
    if (s.personaId) return; // 페르소나는 persona.declared + profileOverrides로 이미 처리
    try {
      const qs = new URLSearchParams({ userId: s.userId, ...(s.profileId ? { profileId: s.profileId } : {}) });
      const data = await fetch(`/api/profile-summary?${qs}`).then((r) => r.json());
      setDirectProfile(data);
    } catch { /* 무시 — 카드가 비어 보이는 정도 */ }
  }, []);

  // 검색바 추천 질문 칩과 "티끌이 이해한 나" 카드
  type StarterQ = { id: string; question: string };
  const [starters, setStarters] = useState<{ questions: StarterQ[] }>({ questions: [] });
  const [interestCard, setInterestCard] = useState<{ summary: string | null; items: { tag: string; label: string; sources: string[] }[] } | null>(null);
  /** 추천 질문은 LLM(Groq)이 생성하므로 하루 1회 브라우저 캐시. force=true면 다시 생성 (관심사 거절 등) */
  const loadStarters = useCallback(async (s: Session, force = false) => {
    const key = `tikkeul.starters.${s.userId}`;
    if (!force) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) { const c = JSON.parse(raw) as { date: string; data: typeof starters }; if (c.date === TODAY) { setStarters(c.data); return; } }
      } catch { /* 캐시 없음 */ }
    }
    try {
      const qs = new URLSearchParams({ userId: s.userId, ...(s.personaId ? { personaId: s.personaId } : {}), ...(s.profileId ? { profileId: s.profileId } : {}) });
      const json = await fetch(`/api/starters?${qs}`).then((r) => r.json());
      const data = { questions: json.questions ?? [] };
      setStarters(data);
      try { localStorage.setItem(key, JSON.stringify({ date: TODAY, data })); } catch { /* 무시 */ }
    } catch { /* 기본 문구로 둔다 */ }
  }, []);
  const loadInterestCard = useCallback(async (s: Session) => {
    try {
      const qs = new URLSearchParams({ userId: s.userId, ...(s.personaId ? { personaId: s.personaId } : {}) });
      const data = await fetch(`/api/interests?${qs}`).then((r) => r.json());
      setInterestCard(Array.isArray(data.items) ? data : null);
    } catch { /* 카드 숨김 */ }
  }, []);

  const refreshProfileOverrides = useCallback(async (userId: string) => {
    try {
      const pc = await fetch(`/api/profile-change?userId=${encodeURIComponent(userId)}`).then((r) => r.json());
      const changes = (pc.changes ?? []) as { field: string; new_value: string; effective_from: string }[];
      const next: Partial<Record<(typeof OVERRIDE_FIELDS)[number], string>> = {};
      for (const c of changes) {
        if (c.effective_from > TODAY) continue; // 아직 적용 전(예약된 미래 변경)은 반영하지 않음
        if ((OVERRIDE_FIELDS as readonly string[]).includes(c.field)) next[c.field as (typeof OVERRIDE_FIELDS)[number]] = c.new_value;
      }
      setProfileOverrides(next);
      const last = changes.filter((c) => c.field === "region_sido" && c.effective_from <= TODAY).pop();
      setProfileNote(last ? `${last.effective_from.slice(5).replace("-", "/")}부터 ${last.new_value}` : null);
    } catch { /* 이력 없음 */ }
  }, []);

  // 우측 카드에서 학력/취업상태/소득·자산분위를 채팅 없이 바로 고를 수 있게 — 자격 판정에 필요한
  // 정보를 안다면 굳이 말로 풀어 써야 할 이유가 없다. /api/profile-change가 이미 두 사용자 유형
  // (페르소나=이력만, 직접입력=원본도) 모두에서 resolveProfile 오버레이로 반영되므로 그대로 재사용.
  type EditableField = "region_sido" | "region_sigungu" | "birth_date" | "education_status" | "employment_status" | "income_bracket" | "asset_bracket" | "housing_type";
  const SIDO_OPTIONS = [...SIDO_CANONICAL];
  const EDUCATION_OPTIONS = ["재학", "휴학", "졸업유예", "졸업"];
  const EMPLOYMENT_OPTIONS = ["취업 준비 중", "이직 준비 중", "재취업 준비 중", "기타"];
  const INCOME_OPTIONS = ["~60%", "60~100%", "100~150%", "150%~"];
  const ASSET_OPTIONS = ["2억 미만", "2~4억", "4억 초과"];
  const HOUSING_OPTIONS = ["1인가구(월세)", "1인가구(전세)", "본가"];
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingField, setSavingField] = useState<EditableField | null>(null);

  const currentFieldValue = (field: EditableField): string | null => {
    if (persona) {
      if (field === "region_sido") return profileOverrides.region_sido ?? persona.declared.region.sido;
      if (field === "region_sigungu") return profileOverrides.region_sigungu ?? (profileOverrides.region_sido ? null : persona.declared.region.sigungu);
      if (field === "birth_date") return profileOverrides.birth_date ?? persona.declared.birthDate;
      if (field === "education_status") return profileOverrides.education_status ?? persona.declared.education.status;
      if (field === "employment_status") return profileOverrides.employment_status ?? persona.declared.employmentStatus;
      if (field === "income_bracket") return profileOverrides.income_bracket ?? persona.declared.incomeBracket;
      if (field === "housing_type") return profileOverrides.housing_type ?? persona.declared.household.housing;
      return profileOverrides.asset_bracket ?? persona.declared.assetBracket;
    }
    if (field === "region_sido") return directProfile?.sido ?? null;
    if (field === "region_sigungu") return directProfile?.sigungu ?? null;
    if (field === "birth_date") return directProfile?.birthDate ?? null;
    if (field === "education_status") return directProfile?.educationStatus ?? null;
    if (field === "employment_status") return directProfile?.employmentStatus ?? null;
    if (field === "income_bracket") return directProfile?.incomeBracket ?? null;
    if (field === "housing_type") return directProfile?.housingType ?? null;
    return directProfile?.assetBracket ?? null;
  };

  const saveProfileField = async (field: EditableField, value: string) => {
    if (!session || !value) return;
    setSavingField(field);
    const wasNeeded = neededFields.has(field) && !!chatQuestion; // 방금 챗봇이 이 필드가 없어서 못 답한 상태였는지
    try {
      await fetch("/api/profile-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, field, oldValue: currentFieldValue(field), newValue: value, effectiveFrom: TODAY, sourceEvent: "profile_card_edit" }),
      });
      await Promise.all([refreshProfileOverrides(session.userId), refreshDirectProfile(session)]);
      void loadRecs(session, true); // 자격 판정에 영향을 줄 수 있으니 추천도 새로 계산
      // 채팅이 "이 정보가 없어서 판단 못 함"이라고 멈춰 있던 상태였다면, 옆에서 정보만 채우고
      // 끝나는 게 아니라 방금 그 질문을 그대로 다시 물어봐서 대화가 이어지는 것처럼 답을 갱신한다.
      if (wasNeeded) void sendChatMessage(chatQuestion!);
    } finally {
      setSavingField(null);
    }
  };

  // 값이 없는 필드는 기본적으로 숨긴다 — 방금 챗봇이 그 필드를 물어봤을 때만("neededFields")
  // 눈에 띄게 드러낸다. 수정 모드에서는 사용자가 뭐든 채울 수 있어야 하니 전부 보여준다.
  const shouldShowField = (field: EditableField) => editingProfile || !!currentFieldValue(field) || neededFields.has(field);

  /** 프로필 편집 입력(FieldSelect/FieldText/FieldDate)에 넘길 값·저장 상태·저장 콜백 */
  const fieldProps = (field: EditableField): ProfileFieldProps => ({
    value: currentFieldValue(field),
    saving: savingField === field,
    onSave: (v) => void saveProfileField(field, v),
  });

  const resetProfileToDefault = async () => {
    if (!session || resettingProfile) return;
    if (!window.confirm("이 프로필의 모든 변경 이력을 지우고 초기 기본값으로 되돌릴까요?")) return;
    setResettingProfile(true);
    try {
      await fetch(`/api/profile-change?userId=${encodeURIComponent(session.userId)}`, { method: "DELETE" });
      setProfileOverrides({});
      setProfileNote(null);
      void loadRecs(session, true); // 거주지가 초기값으로 돌아갔을 수 있으니 추천도 다시
    } finally {
      setResettingProfile(false);
    }
  };

  // 일정 → AI 정책 매칭 결과 — 일정(event_id)별로 보관해 하루에 여러 일정이어도 각각 확인·유지 (브라우저 저장)
  type MatchRec = { policy_id: string; title: string; provider: string | null; region: string; score: number; reason: string; benefit_summary: string; apply_url: string | null; end_date?: string | null; always_open?: boolean };
  type MatchEntry = { title: string; date: string; loading: boolean; recs: MatchRec[] | null; regionChange: RegionChange | null; applied: string | null; at: string };
  const [matchMap, setMatchMap] = useState<Record<string, MatchEntry>>({});
  const persistMatches = (userId: string, map: Record<string, MatchEntry>) => {
    try { const clean: Record<string, MatchEntry> = {}; for (const [k, v] of Object.entries(map)) if (!v.loading) clean[k] = v; localStorage.setItem(`tikkeul.matches.${userId}`, JSON.stringify(clean)); } catch { /* 무시 */ }
  };

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

  /** 채용공고 추천 — 정책 추천과 같은 하루 캐시. 이사 적용 등 프로필 변경 시 force로 재계산. */
  const loadJobs = useCallback(async (s: Session, force = false) => {
    const key = `tikkeul.jobrecs.${s.userId}`;
    if (!force) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const c = JSON.parse(raw) as { date: string; recs: JobRec[]; urgent: JobRec[] };
          if (c.date === TODAY && c.recs.length) { setJobRecs(c.recs); setJobUrgent(c.urgent ?? []); return; }
        }
      } catch { /* 캐시 없음 */ }
    }
    setJobLoading(true); setJobError(null);
    try {
      const res = await fetch("/api/jobs/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: s.userId, personaId: s.personaId, profileId: s.profileId ?? null }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "채용 추천 실패");
      const list = (json.recommendations ?? []) as JobRec[];
      const urgent = (json.urgent ?? []) as JobRec[];
      setJobRecs(list); setJobUrgent(urgent);
      try { localStorage.setItem(key, JSON.stringify({ date: TODAY, recs: list, urgent })); } catch { /* 무시 */ }
    } catch (e) {
      setJobError(e instanceof Error ? e.message : "채용 추천 실패");
      setJobRecs([]);
    } finally {
      setJobLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = useCallback(async (userId: string) => {
    const res = await fetch(`/api/events?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (res.ok) setEvents(json.events);
  }, []);

  /** 추천 공고의 접수 시작일·마감일을 캘린더 일정으로 등록 (시작일은 미래일 때만) */
  const addJobToCalendar = useCallback(async (j: JobRec) => {
    if (!session || !j.deadline) return;
    const post = (date: string, label: string) =>
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, date, title: `📋 [${label}] ${(j.company ? j.company + " — " : "") + j.title}`.slice(0, 90) }),
      });
    const reqs = [post(j.deadline, `공고마감${j.deadlineTime ? ` ${j.deadlineTime}` : ""}`)];
    if (j.pbancBegin && j.pbancBegin > TODAY) reqs.push(post(j.pbancBegin, "접수시작"));
    const results = await Promise.all(reqs);
    if (results.every((r) => r.ok)) {
      setJobCalSaved((prev) => new Set(prev).add(j.id));
      void loadEvents(session.userId); // 달력에 즉시 반영
    }
  }, [session, loadEvents]);

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
            try { const mm = localStorage.getItem(`tikkeul.matches.${s.userId}`); if (mm) setMatchMap(JSON.parse(mm)); } catch { /* 없음 */ }
            try { setAlarmDismissed(localStorage.getItem(`tikkeul.alarmDismissed.${s.userId}`) === TODAY); } catch { /* 없음 */ }
            await Promise.all([loadEvents(s.userId), loadSavedIds(s.userId)]);
            void loadRecs(s);
            void loadJobs(s);
            void refreshProfileOverrides(s.userId);
            void refreshDirectProfile(s);
            void loadStarters(s);
            void loadInterestCard(s);
          }
        }
      } catch {
        // 세션 없음
      }
      setLoaded(true);
    })();
  }, [loadEvents, loadSavedIds, loadRecs, refreshProfileOverrides, refreshDirectProfile, loadStarters, loadInterestCard]);

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
  const saveFromMatch = (r: MatchRec, evTitle: string, evDate: string) => {
    if (!session) return;
    const fee = examFeeFor(evTitle);
    const examSupport = /응시료|시험|자격증|어학|검정/.test(`${r.title} ${r.benefit_summary}`);
    const amountKrw = fee && examSupport ? fee.feeKrw : 0;
    const rec: Rec = { id: r.policy_id, title: r.title, benefit: r.benefit_summary, amountMaxKrw: amountKrw, region: r.region, provider: r.provider, content: r.reason, url: r.apply_url, source: "db", endDate: r.end_date ?? null, alwaysOpen: !!r.always_open };
    setDbRecs((prev) => ({ ...prev, [r.policy_id]: rec }));
    setSavedMeta((prev) => {
      const next = { ...prev, [r.policy_id]: { linkedEvent: { title: evTitle, date: evDate }, examName: fee?.name, examFeeKrw: fee?.feeKrw ?? null, amountKrw, benefit: r.benefit_summary } };
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
    setMatchMap((prev) => { const next = { ...prev }; delete next[ev.event_id]; persistMatches(session.userId, next); return next; });
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

  const applyRegionChange = async (effectiveFrom: string, rc: RegionChange, eventId: string, sourceEvent: string) => {
    if (!session || applyingChange) return;
    setApplyingChange(true);
    try {
      const res = await fetch("/api/profile-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, field: "region_sido", oldValue: rc.from, newValue: rc.to, effectiveFrom, sourceEvent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "적용 실패");
      const label = `${effectiveFrom.slice(5).replace("-", "/")}부터 ${rc.to}`;
      setMatchMap((prev) => { const cur = prev[eventId]; if (!cur) return prev; const next = { ...prev, [eventId]: { ...cur, applied: label } }; persistMatches(session.userId, next); return next; });
      void refreshProfileOverrides(session.userId);
      void refreshDirectProfile(session);
      void loadRecs(session, true); // 거주지가 바뀌었으니 추천 탭을 새 지역 기준으로 다시
      void loadJobs(session, true); // 채용공고도 새 지역 기준으로 다시
    } catch (e) {
      alert(`거주지 변경 적용 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setApplyingChange(false);
    }
  };

  const sendChatMessage = async (message: string) => {
    if (!message.trim() || !session || chatLoading) return;
    setChatThread((prev) => [...prev, { question: message, reply: null }]);
    setChatLoading(true);
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
      setChatThread((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, reply: json.reply } : t)));
      setNeededFields(new Set(Array.isArray(json.missingFields) ? json.missingFields : []));
      // 채팅 중 새로 저장된 매칭이 있을 수 있으니 마이티끌 목록도 갱신
      if (session) void loadSavedIds(session.userId);
      // 대화에서 관심사가 새로 잡혔을 수 있으니 관심사 카드 갱신 (추천 질문은 하루 캐시 — 매 채팅마다 재생성하지 않음)
      if (session) void loadInterestCard(session);
      // 채팅으로 프로필(거주지 등)이 바뀌었으면 헤더 배지와 추천 탭을 새 프로필 기준으로 갱신
      if (session && Array.isArray(json.plan?.intents) && json.plan.intents.includes("profile_update")) {
        void loadRecs(session, true);
        void refreshProfileOverrides(session.userId);
        void refreshDirectProfile(session);
      }
    } catch (e) {
      setNotice(`AI 응답에 실패했어요: ${e instanceof Error ? e.message : e}`);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setChatLoading(false);
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || chatLoading) return;
    const message = query.trim();
    setQuery("");
    await sendChatMessage(message);
  };

  /** "티끌이 이해한 나"에서 "아니에요" — 관심사를 내리고 추천을 다시 계산 */
  const rejectInterest = async (tag: string) => {
    if (!session) return;
    setInterestCard((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.tag !== tag) } : prev));
    await fetch("/api/interests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.userId, tag }) });
    void loadInterestCard(session);
    void loadStarters(session, true);
    void loadRecs(session, true);
  };

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !title.trim() || saving) return;
    const eventTitle = title.trim();
    let newEventId: string | null = null;
    setSaving(true);
    setCalNotice(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.userId, date, title }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      newEventId = json.event?.event_id ?? null;
      setTitle("");
      await loadEvents(session.userId);
    } catch {
      setCalNotice("일정 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setTimeout(() => setCalNotice(null), 4000);
    } finally {
      setSaving(false);
    }
    // 저장된 일정에 AI 매칭 실행 — 일정에 혜택 붙이기 (일정별로 결과 유지)
    void matchEvent(eventTitle, newEventId ?? tempEventId(), date);
  };

  const matchEvent = async (eventTitle: string, eventId: string, eventDate: string) => {
    const userId = session?.userId;
    setMatchMap((prev) => ({ ...prev, [eventId]: { title: eventTitle, date: eventDate, loading: true, recs: prev[eventId]?.recs ?? null, regionChange: null, applied: null, at: new Date().toISOString() } }));
    let entry: MatchEntry;
    try {
      const res = await fetch("/api/event-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId ?? null, personaId: session?.personaId ?? null, profileId: session?.profileId ?? null, title: eventTitle, date: eventDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "매칭 실패");
      entry = { title: eventTitle, date: eventDate, loading: false, recs: json.recommendations ?? [], regionChange: json.regionChange ?? null, applied: null, at: new Date().toISOString() };
    } catch {
      entry = { title: eventTitle, date: eventDate, loading: false, recs: [], regionChange: null, applied: null, at: new Date().toISOString() };
    }
    setMatchMap((prev) => { const next = { ...prev, [eventId]: entry }; if (userId) persistMatches(userId, next); return next; });
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
      <OnboardingTour />
      <header className="relative mx-auto flex h-[64px] w-full max-w-[1600px] items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span className="text-[21px] font-bold">{BRAND.name}</span>
        {/* 취업전/채용/취업후 토글 — 헤더 정중앙 고정 */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <EmploymentToggle />
        </div>
        <span className="ml-auto flex items-center gap-2.5 text-[14.5px] text-mute">
          {alarmCount > 0 && !alarmDismissed && (
            <a href="#alarm" className="rounded-full bg-[#f6c453] px-2 py-0.5 text-[12.5px] font-bold text-ink hover:bg-[#f0b42e]" title="마감 임박 알림으로 이동">🔔 {alarmCount}</a>
          )}
          {profileNote && <span className="rounded-full bg-[#2fbf5f] px-2 py-0.5 text-[12.5px] font-bold text-white">🏠 {profileNote}</span>}
          <span>
            {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 ·{" "}
            <Link href="/app/start" className="underline">프로필 변경</Link> ·{" "}
            <button onClick={restartOnboardingTour} className="underline">가이드 다시보기</button>
          </span>
        </span>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-5 pb-16">
        {/* ── 상단 검색바: 모르는 거 물어보기 ───────────── */}
        {/* border-image는 border-radius를 무시해 모서리가 각지게 보이는 문제가 있어(직접 확인함),
            바깥 링을 그라데이션 배경으로 만들고 안쪽에 패딩만큼 띄워 "그라데이션 테두리"처럼 보이게 함 */}
        <div id="tour-search" className="rounded-[18px] bg-gradient-to-r from-[#dceeb1] to-[#c5b0f4] p-[2px] shadow-md">
        <form
          onSubmit={search}
          className="flex items-center gap-2 rounded-[16px] bg-gradient-to-r from-[#dceeb1] to-[#c5b0f4] p-2 pl-4"
        >
          <span className="text-[16.5px]">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`모르는 거 물어보기 — 예: ${starters.questions[0]?.question ?? "국민취업지원제도가 뭐야?"}`}
            className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-ink placeholder-ink/50 outline-none"
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
        </div>
        {notice && <p className="mt-2 rounded-[10px] bg-mint px-3 py-2 text-[14.5px] font-bold text-leaf-deep">💬 {notice}</p>}
        {/* 추천 질문 — 일정·관심사·프로필에 맞춘 질문 (신호가 없으면 기본 질문) */}
        {chatThread.length === 0 && starters.questions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-bold text-mute">이런 게 궁금하지 않으세요?</span>
            {starters.questions.map((q) => (
              <button
                key={q.id}
                onClick={() => void sendChatMessage(q.question)}
                disabled={chatLoading}
                className="rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink transition hover:border-ink disabled:opacity-50"
              >
                {q.question}
              </button>
            ))}
          </div>
        )}
        {chatThread.length > 0 && (
          <div className="mt-2 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14.5px] leading-relaxed text-ink">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-bold text-mute">대화</p>
              {!chatLoading && (
                <button onClick={() => { setChatThread([]); setFollowUp(""); }} className="text-[13px] text-mute underline" aria-label="대화 닫기">닫기</button>
              )}
            </div>
            <div className="mt-1.5 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
              {chatThread.map((turn, i) => {
                const isLast = i === chatThread.length - 1;
                return (
                  <div key={i} className={i > 0 ? "border-t border-line pt-3" : ""}>
                    <div className="flex items-start gap-2">
                      <span>🙋</span>
                      <p className="flex-1 font-semibold">{turn.question}</p>
                    </div>
                    <div className="mt-2 flex items-start gap-2">
                      <span>🤖</span>
                      {turn.reply ? (
                        <div className="min-w-0 flex-1 whitespace-pre-wrap">{renderChatMarkdown(turn.reply)}</div>
                      ) : isLast && chatLoading ? (
                        <p className="text-mute">생각 중… 프로필과 정책 DB를 대조하고 있어요 (5~20초)</p>
                      ) : (
                        <p className="text-mute">답변을 받지 못했어요. 다시 시도해 주세요.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 답변 아래에서 바로 추가 질문 — 매번 위 검색창을 다시 누를 필요 없이 이어서 물어봄 */}
            <form
              onSubmit={(e) => { e.preventDefault(); const m = followUp.trim(); if (!m) return; setFollowUp(""); void sendChatMessage(m); }}
              className="mt-3 flex items-center gap-2 border-t border-line pt-2.5"
            >
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="추가로 물어보기 — 예: 신청 방법 알려줘"
                disabled={chatLoading}
                className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-3 py-1.5 text-[14px] outline-none focus:border-ink disabled:opacity-60"
                aria-label="추가 질문"
              />
              <button
                type="submit"
                disabled={chatLoading || !followUp.trim()}
                className="shrink-0 rounded-[8px] bg-leaf px-3.5 py-1.5 text-[13.5px] font-bold text-white transition hover:bg-[#333333] disabled:opacity-50"
              >
                {chatLoading ? "…" : "전송"}
              </button>
            </form>
          </div>
        )}

        {/* ── 본문 3단: 사이드바 / 일정 등록 / 위젯 ────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr_220px]">
          {/* 좌측: 마이티끌 / 추천 아코디언 */}
          <aside className="flex flex-col gap-2">
            {/* 이번 달 아낄 티끌 — 캘린더 선택 날짜와 동일한 그린(bg-mint) */}
            <div id="tour-saving" className="rounded-[18px] border border-line bg-mint p-4 text-center text-ink">
              <p className="text-[12.5px] font-bold opacity-80">이번 달 아낄 티끌</p>
              <p className="mt-1 text-[34px] font-bold leading-none">{monthlySaving > 0 ? formatKrw(monthlySaving) : "0원"}</p>
            </div>

            {/* 마이티끌 */}
            <section id="tour-mytikkeul" className="overflow-hidden rounded-[18px] border border-line bg-card">
              <button
                onClick={() => toggleTab("my")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] font-bold ${openTab === "my" ? "bg-leaf-deep text-white" : ""}`}
              >
                마이티끌
                <span className="text-[13.5px]">{savedRecs.length}건 {openTab === "my" ? "▾" : "▸"}</span>
              </button>
              {openTab === "my" && (
                <div className="flex flex-col gap-2 p-3">
                  {savedRecs.length === 0 && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[14px] text-mute">
                      아직 담은 정책이 없어요. [추천티끌]에서 담아보세요.
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
                onClick={() => toggleTab("rec")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] font-bold ${openTab === "rec" ? "bg-leaf-deep text-white" : ""}`}
              >
                추천티끌
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

            {/* 채용 — 공공기관 채용공고에서 프로필(직무·지역) 기준 선별, 마감 임박 강조 */}
            <section className="overflow-hidden rounded-[18px] border border-line bg-card">
              <button
                onClick={() => toggleTab("jobs")}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] font-bold ${openTab === "jobs" ? "bg-leaf-deep text-white" : ""}`}
              >
                채용 공고
                <span className="text-[13.5px]">{jobRecs?.length ?? 0}건 {openTab === "jobs" ? "▾" : "▸"}</span>
              </button>
              {openTab === "jobs" && (
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-mute">
                      {jobLoading ? "AI가 공공기관 채용공고에서 내 직무·지역에 맞는 공고를 찾는 중…" : jobError ? `채용 추천 실패(${jobError})` : jobRecs && jobRecs.length > 0 ? "AI 추천 — 공공기관 채용공고에서 프로필(직무·지역) 기준 선별" : "추천할 공고가 아직 없어요"}
                    </p>
                    {session && !jobLoading && (
                      <button onClick={() => loadJobs(session, true)} className="shrink-0 text-[12.5px] font-bold text-leaf-deep underline" title="채용공고에서 다시 선별">🔄 다시</button>
                    )}
                  </div>
                  {jobUrgent.length > 0 && (
                    <div className="rounded-[10px] border border-[#f2b8b5] bg-[#fdecec] px-3 py-2">
                      <p className="text-[13px] font-bold text-[#c0392b]">⏰ 마감 임박</p>
                      {jobUrgent.map((j) => (
                        <p key={"u-" + j.id} className="mt-0.5 truncate text-[13px] text-ink" title={j.title}>
                          <b className="text-[#c0392b]">{j.dday === 0 ? "오늘" : `D-${j.dday}`}</b> · {j.title}
                        </p>
                      ))}
                    </div>
                  )}
                  {jobRecs && jobRecs.length === 0 && !jobLoading && (
                    <p className="rounded-[10px] bg-mint-soft px-3 py-2.5 text-[14px] text-mute">조건에 맞는 접수 중 공고가 없어요. [채용]에서 조건을 바꿔 검색해 보세요.</p>
                  )}
                  {(jobRecs ?? []).map((j) => (
                    <div key={j.id} className="rounded-[12px] border border-line p-3">
                      <p className="truncate text-[13px] font-bold text-leaf-deep">
                        <span className={`mr-1 rounded px-1 py-0.5 text-[11px] ${isPublicOrg(j.source, j.company) ? "bg-mint-soft text-leaf-deep" : "bg-[#efe9fb] text-[#6b4fbb]"}`}>{isPublicOrg(j.source, j.company) ? "공공" : "사기업"}</span>
                        {j.company ?? "기업 미상"}
                      </p>
                      <p className="text-[15px] font-bold leading-snug">{j.title}</p>
                      <p className="mt-0.5 text-[13.5px] text-mute">{j.region || "전국"}{j.ncs ? ` · ${j.ncs}` : ""}{j.career ? ` · ${j.career}` : ""}{j.salary ? ` · ${j.salary}` : ""} · 관련도 {j.score}</p>
                      {j.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink/80">{j.summary}</p>}
                      {j.requirements && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mute">자격 · {j.requirements}</p>}
                      <p className={`mt-0.5 text-[12.5px] ${j.dday !== null && j.dday <= 7 ? "font-bold text-[#c0392b]" : "text-mute"}`}>
                        {j.deadline ? `⏰ 접수 마감 ${j.deadline.slice(5).replace("-", "/")}${j.deadlineTime ? ` ${j.deadlineTime}` : ""}${j.dday !== null ? ` · ${j.dday === 0 ? "오늘 마감" : `D-${j.dday}`}` : ""}` : "⏰ 상시·채용 시 마감"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        {j.deadline && (
                          jobCalSaved.has(j.id)
                            ? <span className="text-[13px] font-bold text-leaf-deep">✓ 캘린더에 담김</span>
                            : <button onClick={() => void addJobToCalendar(j)} className="text-[13px] font-bold text-leaf-deep underline">📅 캘린더에 담기</button>
                        )}
                        {j.url?.startsWith("http") && (
                          <a href={j.url} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-leaf-deep underline">공고 원문 ↗</a>
                        )}
                      </div>
                    </div>
                  ))}
                  <Link href="/app/jobs" className="rounded-[10px] bg-mint px-3 py-2.5 text-center text-[14px] font-bold text-leaf-deep transition hover:opacity-80">
                    조건 바꿔 전체 공고 검색 →
                  </Link>
                </div>
              )}
            </section>
          </aside>

          {/* 중앙: 일정 등록 — 노션식 월 달력 */}
          <section id="tour-calendar" className="rounded-[18px] border border-line bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">마이 캘린더</h2>
              <div className="flex items-center gap-2 text-[15.5px] font-bold">
                <button onClick={() => setYm(prevMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="이전 달">‹</button>
                <span className="min-w-[110px] text-center">{ym.y}년 {ym.m + 1}월</span>
                <button onClick={() => setYm(nextMonth(ym))} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:border-ink" aria-label="다음 달">›</button>
              </div>
            </div>

            {alarmCount > 0 && !alarmDismissed && (
              <div id="alarm" className="mt-3 scroll-mt-4 rounded-[12px] border border-[#f6c453] bg-[#fff7e0] px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14.5px] font-bold text-[#b45309]">🔔 마감 임박 알림 {alarmCount}건</p>
                  <button onClick={dismissAlarm} className="shrink-0 rounded px-1 text-[13px] font-bold text-[#b45309]/70 hover:text-[#b45309]" title="오늘은 그만 보기" aria-label="알림 닫기">✕</button>
                </div>
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
                {(examDeadlinesByDate.get(date) ?? []).map((x) => (
                  <div key={"exdl-" + x.ev.event_id} className="rounded-[10px] border border-[#f6c453] bg-[#fff7e0] px-3 py-2.5 text-[14px]">
                    <p className="font-bold text-[#b45309]">📝 {x.info.name} {x.match?.session?.round ?? ""} 정기접수 마감일</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-[13.5px]">
                      <li>· 시험일 <b>{x.match?.session ? fmtMD(x.match.session.examDate) : fmtMD(x.ev.start_at)}</b>{x.match?.kind === "nearest" ? ` (내 일정 ${fmtMD(x.ev.start_at)} — 같은 날 회차가 없어 가까운 공식 회차 기준)` : ` — 내 일정 "${x.ev.title}"`}</li>
                      {x.match?.session?.regStart && <li>· 정기접수 {fmtMD(x.match.session.regStart)} ~ <b>{fmtMD(x.match.session.regEnd)}</b></li>}
                      {x.match?.session?.lateRegEnd && <li>· 특별·추가접수 마감 {fmtMD(x.match.session.lateRegEnd)} (추가 요금·취소좌석 등 조건은 공식 안내 확인)</li>}
                      {x.match?.session?.resultDate && <li>· 성적 발표 {fmtMD(x.match.session.resultDate)}</li>}
                      <li>· 응시료 {x.info.feeKrw.toLocaleString("ko-KR")}원{x.info.note ? ` (${x.info.note})` : ""} · {x.info.org}</li>
                      {x.match?.session?.note && <li>· {x.match.session.note}</li>}
                    </ul>
                    <p className="mt-1.5 text-[12.5px] text-mute">
                      출처: {x.match?.schedule.sourceLabel ?? x.info.org} (확인일 {x.match?.schedule.checkedAt ?? "-"}) ·{" "}
                      <a href={x.match?.schedule.source ?? x.info.scheduleUrl} target="_blank" rel="noreferrer" className="font-bold underline">공식 일정·접수 페이지 ↗</a>
                    </p>
                  </div>
                ))}
                {(deadlinesByDate.get(date) ?? []).map((r) => (
                  <div key={"pdl-" + r.id} className="rounded-[10px] border border-[#f6c453] bg-[#fff7e0] px-3 py-2.5 text-[14px]">
                    <p className="font-bold text-[#b45309]">⏰ 담은 정책 신청 마감일 — {r.title}</p>
                    <p className="mt-1 text-[13.5px]">{savedMeta[r.id]?.benefit ?? r.benefit}{r.provider ? ` · ${r.provider}` : ""} · 마감 {fmtMD(r.endDate!)}{daysUntil(r.endDate!) >= 0 ? ` (D-${daysUntil(r.endDate!)})` : " (마감됨)"}</p>
                    <div className="mt-1.5 flex gap-3 text-[13px]">
                      <button onClick={() => openDetail(r)} className="font-bold text-leaf-deep underline">자세히보기</button>
                      {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="font-bold underline">신청 페이지 ↗</a>}
                    </div>
                  </div>
                ))}
                {(eventsByDate.get(date) ?? []).length === 0 && !(examDeadlinesByDate.get(date)?.length || deadlinesByDate.get(date)?.length) && (
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

              {/* 일정별 → AI가 찾은 혜택 (하루에 여러 일정이어도 각각 유지) */}
              {(eventsByDate.get(date) ?? []).map((ev) => {
                const m = matchMap[ev.event_id];
                const rc = m?.regionChange ?? null;
                if (!m) {
                  return (
                    <div key={"m-" + ev.event_id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-dashed border-line bg-card px-3.5 py-2.5">
                      <p className="text-[14px] text-mute">💡 “{ev.title}” 일정에 붙는 혜택을 아직 찾지 않았어요.</p>
                      <button onClick={() => matchEvent(ev.title, ev.event_id, ev.start_at)} className="rounded-full bg-leaf px-3.5 py-1.5 text-[13px] font-bold text-white transition hover:bg-[#333333]">AI로 찾기</button>
                    </div>
                  );
                }
                return (
                  <div key={"m-" + ev.event_id}>
              {/* 일정 → AI가 찾은 혜택 */}
              {(m.loading || m.recs) && (
                <div className="mt-3 rounded-[14px] border border-line bg-card p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-bold text-leaf-deep">
                      💡 “{ev.title}” 일정에 붙는 혜택 {m.loading && "— AI가 전국 정책에서 찾는 중…"}
                    </p>
                    {!m.loading && <button onClick={() => matchEvent(ev.title, ev.event_id, ev.start_at)} className="shrink-0 text-[12.5px] text-mute underline" title="AI로 다시 찾기">🔄 다시</button>}
                  </div>
                  {!m.loading && m.recs && m.recs.length === 0 && (
                    <p className="mt-1.5 text-[14px] text-mute">이 일정과 연결되는 정책을 찾지 못했어요.</p>
                  )}
                  {!m.loading && m.recs && m.recs.map((r) => (
                    <div key={r.policy_id} className="mt-2 rounded-[10px] bg-mint-soft/70 p-2.5">
                      <p className="text-[14.5px] font-bold leading-snug">{r.title}</p>
                      <p className="mt-0.5 text-[13px] text-mute">{r.provider} · {r.region} · 관련도 {r.score}점</p>
                      <p className="mt-1 text-[14px]">{r.reason}</p>
                      <p className="mt-0.5 text-[13.5px] font-bold text-leaf-deep">🎁 {r.benefit_summary}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {savedIds.includes(r.policy_id) ? (
                          <span className="rounded-full bg-mint px-2.5 py-1 text-[12.5px] font-bold text-leaf-deep">✓ 마이티끌에 담김</span>
                        ) : (
                          <button onClick={() => saveFromMatch(r, ev.title, ev.start_at)} className="rounded-full bg-leaf px-3 py-1 text-[12.5px] font-bold text-white transition hover:bg-[#333333]">+ 마이티끌에 담기</button>
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
              {!m.loading && rc && (
                <div className="mt-3 rounded-[14px] border-2 border-leaf-deep bg-card p-4">
                  <p className="text-[15px] font-bold">
                    🏠 거주지 변경 감지 — {rc.from ?? "미상"} → <span className="text-leaf-deep">{rc.to}</span>
                  </p>
                  <p className="mt-1 text-[14px] text-mute">
                    이사하면 받을 수 있는 정책이 통째로 바뀌어요. 프로필 거주지를 바꿀까요? 이후 추천·매칭이 {rc.to} 기준으로 전환됩니다.
                  </p>
                  {m.applied ? (
                    <p className="mt-2 rounded-[10px] bg-[#2fbf5f] px-3 py-2 text-[14px] font-bold text-white">✓ 적용됨 — {m.applied} 거주로 반영</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => applyRegionChange(rc.effectiveFrom, rc, ev.event_id, ev.title)} disabled={applyingChange}
                        className="rounded-full bg-leaf px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60">
                        {rc.effectiveFrom.slice(5).replace("-", "/")}부터 적용
                      </button>
                      <button onClick={() => applyRegionChange(new Date().toISOString().slice(0, 10), rc, ev.event_id, ev.title)} disabled={applyingChange}
                        className="rounded-full border border-line px-4 py-2 text-[14px] font-bold disabled:opacity-60">
                        지금부터 적용
                      </button>
                    </div>
                  )}

                  {rc.opening.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[14px] font-bold text-[#1f8f45]">🟢 {rc.to}로 가면 새로 열리는 혜택 ({rc.opening.length}건 · 지역 정책 {rc.openingTotal}건 중)</p>
                      {rc.opening.map((o) => (
                        <div key={o.policy_id} className="mt-1.5 rounded-[10px] bg-mint-soft/70 p-2.5">
                          <p className="text-[14.5px] font-bold leading-snug">{o.title} <span className="text-[12.5px] font-semibold text-mute">· {o.provider} · {o.score}점</span></p>
                          <p className="mt-0.5 text-[13.5px]">{o.reason}</p>
                          {o.apply_url && <a href={o.apply_url} target="_blank" rel="noreferrer" className="text-[13px] font-bold underline">신청 페이지 ↗</a>}
                        </div>
                      ))}
                    </div>
                  )}
                  {rc.closing.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[14px] font-bold text-[#b23b3b]">🔴 {rc.from}을(를) 떠나면 사라지는 혜택 ({rc.closing.length}건)</p>
                      {rc.closing.map((c) => (
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
                );
              })}
            </div>
          </section>

          {/* 우측: 프로필 요약 — 얼굴 사진 + 기본/금융 정보(한 박스) + 혜택·티끌(각각 박스) */}
          <aside id="tour-profile" className="flex flex-col gap-3">
            <div className="rounded-[18px] border border-line bg-card p-4 text-center">
              <img
                src={persona ? `/avatars/${persona.id}.png` : "/avatars/random.png"}
                alt={`${displayName} 프로필 사진`}
                className="mx-auto h-24 w-24 rounded-full object-cover ring-[3px] ring-[#c5b0f4]"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/avatars/default.svg";
                }}
              />
              <p className="mt-2 text-[15px] font-bold">{persona ? `${persona.emoji} ${persona.name}` : displayName}</p>
              {persona && <p className="text-[12px] text-mute">{persona.tagline}</p>}
            </div>

            {(persona || directProfile) && (
              <div className="rounded-[18px] border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] font-bold text-mute">기본 정보</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingProfile((v) => !v)}
                      className="text-[11.5px] font-semibold text-leaf-deep underline decoration-dotted hover:opacity-70"
                      title="학력·취업상태·주거형태·소득/자산분위를 채팅 없이 바로 선택합니다"
                    >
                      {editingProfile ? "완료" : "수정"}
                    </button>
                    {persona && (
                      <button
                        onClick={resetProfileToDefault}
                        disabled={resettingProfile}
                        className="text-[11.5px] font-semibold text-mute underline decoration-dotted hover:text-ink disabled:opacity-50"
                        title="채팅으로 바뀐 내용을 모두 지우고 이 페르소나의 원래 기본값으로 되돌립니다"
                      >
                        ↺ 초기화
                      </button>
                    )}
                  </div>
                </div>
                <dl className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-mute">{editingProfile ? "생년월일" : "나이"}</dt>
                    <dd className="font-semibold">
                      {editingProfile
                        ? <FieldDate {...fieldProps("birth_date")} />
                        : (() => { const bd = currentFieldValue("birth_date"); return bd ? `${new Date().getFullYear() - Number(bd.slice(0, 4))}세` : <MissingBadge />; })()}
                    </dd>
                  </div>
                  {editingProfile ? (
                    <div className="flex flex-col gap-1">
                      <dt className="text-mute">거주지</dt>
                      <dd className="flex flex-col gap-1 font-semibold">
                        <FieldSelect {...fieldProps("region_sido")} options={SIDO_OPTIONS} />
                        <FieldText {...fieldProps("region_sigungu")} placeholder="시·군·구" />
                      </dd>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">거주지</dt>
                      <dd className="font-semibold">{`${currentFieldValue("region_sido") ?? ""} ${currentFieldValue("region_sigungu") ?? ""}`.trim() || <MissingBadge />}</dd>
                    </div>
                  )}
                  {shouldShowField("education_status") && (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">학력</dt>
                      <dd className="font-semibold">
                        {editingProfile
                          ? <FieldSelect {...fieldProps("education_status")} options={EDUCATION_OPTIONS} />
                          : persona
                            ? `${currentFieldValue("education_status")} · ${persona.declared.education.major}`
                            : currentFieldValue("education_status") ?? <MissingBadge />}
                      </dd>
                    </div>
                  )}
                  {shouldShowField("employment_status") && (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">취업상태</dt>
                      <dd className="font-semibold">{editingProfile ? <FieldSelect {...fieldProps("employment_status")} options={EMPLOYMENT_OPTIONS} /> : currentFieldValue("employment_status") ?? <MissingBadge />}</dd>
                    </div>
                  )}
                  {shouldShowField("housing_type") && (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">가구형태</dt>
                      <dd className="font-semibold">{editingProfile ? <FieldSelect {...fieldProps("housing_type")} options={HOUSING_OPTIONS} /> : currentFieldValue("housing_type") ?? <MissingBadge />}</dd>
                    </div>
                  )}
                  {shouldShowField("income_bracket") && (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">소득분위</dt>
                      <dd className="font-semibold">{editingProfile ? <FieldSelect {...fieldProps("income_bracket")} options={INCOME_OPTIONS} /> : currentFieldValue("income_bracket") ?? <MissingBadge />}</dd>
                    </div>
                  )}
                  {shouldShowField("asset_bracket") && (
                    <div className="flex items-center justify-between">
                      <dt className="text-mute">자산분위</dt>
                      <dd className="font-semibold">{editingProfile ? <FieldSelect {...fieldProps("asset_bracket")} options={ASSET_OPTIONS} /> : currentFieldValue("asset_bracket") ?? <MissingBadge />}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* 티끌이 이해한 나 — 관심사와 근거(신호 종류만). "아니에요"로 바로잡으면 추천이 다시 계산된다 */}
            {interestCard && interestCard.items.length > 0 && (
              <div className="rounded-[18px] border border-line bg-card p-4">
                <p className="text-[12.5px] font-bold text-mute">티끌이 이해한 나</p>
                {interestCard.summary && <p className="mt-1.5 text-[13.5px] font-semibold leading-snug">{interestCard.summary}</p>}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {interestCard.items.map((it) => (
                    <li key={it.tag} className="flex items-start justify-between gap-2 rounded-[10px] bg-mint-soft/70 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold">{it.label}</p>
                        {it.sources.length > 0 && <p className="text-[11.5px] text-mute">{it.sources.join(" · ")}에서</p>}
                      </div>
                      <button onClick={() => void rejectInterest(it.tag)} className="shrink-0 text-[11.5px] font-semibold text-mute underline decoration-dotted hover:text-ink" title="이 관심사를 추천에서 빼요">
                        아니에요
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-mute">추천 순서에만 쓰이고, 자격 판정에는 쓰이지 않아요.</p>
              </div>
            )}

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
