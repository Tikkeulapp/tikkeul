/**
 * 관심 태그 택소노미 (UFO-lite) — 취준 비용 관점의 계층형 태그.
 * 키워드 앞쪽 1~2개는 정책 검색어로도 쓰이므로 정책 원문에 나올 법한 말을 먼저 둔다.
 * 관심사는 추천 "순위"에만 쓰인다. 자격 판정·금액에는 절대 쓰지 않는다 (CLAUDE.md).
 */
import type { InterestTagDef } from "@/types/interest";
import { NCS_NAME_BY_CODE } from "@/data/ncs";

export const INTEREST_TAGS: InterestTagDef[] = [
  { id: "시험>응시료", label: "시험 응시료", keywords: ["응시료", "시험비", "검정료"] },
  { id: "시험>자격증", label: "자격증·어학", keywords: ["자격증", "자격 취득", "어학", "토익", "컴활", "한국사", "시험"] },
  { id: "면접>정장", label: "면접 정장", keywords: ["정장", "면접복장"] },
  { id: "면접>면접비", label: "면접 비용", keywords: ["면접", "증명사진"] },
  { id: "교통>교통비", label: "교통비", keywords: ["교통비", "대중교통", "승차권", "KTX", "SRT", "고속버스"] },
  { id: "주거>월세", label: "월세·주거비", keywords: ["월세", "임차료", "주거비"] },
  { id: "주거>전세", label: "전세·보증금", keywords: ["전세", "보증금"] },
  { id: "주거>이사", label: "이사", keywords: [/이사(?!장|회|관|국)/, "이삿짐", "전입"] },
  { id: "훈련>직업훈련", label: "직업훈련", keywords: ["직업훈련", "내일배움", "훈련"] },
  { id: "훈련>교육비", label: "교육·강의", keywords: ["교육비", "강의", "인강", "수강"] },
  { id: "수당>구직활동", label: "구직활동 수당", keywords: ["구직활동", "청년수당", "구직촉진", "취업수당"] },
  { id: "수당>실업급여", label: "실업급여·재취업", keywords: ["구직급여", "실업급여", "재취업"] },
  { id: "일경험>인턴", label: "인턴·일경험", keywords: ["인턴", "일경험", "체험형"] },
  { id: "상담>취업상담", label: "취업 상담·컨설팅", keywords: ["취업상담", "컨설팅", "멘토링", "첨삭", "자기소개서"] },
  { id: "금융>저축", label: "저축·자산형성", keywords: ["적금", "저축", "자산형성", "도약계좌"] },
  { id: "금융>대출", label: "대출·이자지원", keywords: ["대출", "이자지원", "학자금"] },
  { id: "건강>심리", label: "마음건강", keywords: ["심리", "마음건강"] },
];


/** 부모 태그 → 카드 머리 문장용 넓은 라벨 (덜 구체적으로 말하기 위해 자식 라벨 대신 사용). */
export const INTEREST_PARENT_LABEL: Record<string, string> = {
  시험: "시험 준비 비용",
  면접: "면접 준비",
  교통: "교통비",
  주거: "주거",
  훈련: "직업훈련·교육",
  수당: "구직 수당",
  일경험: "인턴·일경험",
  상담: "취업 상담",
  금융: "저축·대출",
  건강: "마음건강",
};

/** 관심 근거(신호 종류) → 카드에 보여줄 말. 날짜·구체 내역은 쓰지 않는다. */
export const INTEREST_SOURCE_LABEL: Partial<Record<string, string>> = {
  save: "담은 정책",
  calendar: "캘린더 일정",
  spend: "취준 지출",
  chat: "대화",
  view: "살펴본 정책",
  job_save: "캘린더에 담은 공고",
  job_view: "열어본 공고",
  job_keyword: "검색한 강점 키워드",
};

/** 채용 관심 태그(ncs:·org:·hire:·region:·kw:) → 카드·LLM용 라벨. 채용 태그가 아니면 null. */
export function jobTagLabel(tag: string): string | null {
  const i = tag.indexOf(":");
  if (i <= 0) return null;
  const ns = tag.slice(0, i);
  const v = tag.slice(i + 1);
  if (!v) return null;
  switch (ns) {
    case "ncs": return `${NCS_NAME_BY_CODE.get(v) ?? v} 분야`;
    case "org": return v === "public" ? "공공기관 공고" : v === "private" ? "사기업 공고" : null;
    case "hire": return `${v} 채용`;
    case "region": return `${v} 근무`;
    case "kw": return `'${v}' 관련 공고`;
    default: return null;
  }
}

export const isJobTag = (tag: string) => jobTagLabel(tag) !== null;
