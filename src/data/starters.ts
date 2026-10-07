/**
 * 검색바 추천 질문 템플릿 — LLM 생성이 실패하거나 모자랄 때 채운다.
 * 문장은 덜 구체적으로: 사용자의 일정·결제 내역을 그대로 말하지 않는다 (카카오 선톡 Lesson 3).
 */
import type { StarterTemplate } from "@/types/interest";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: "fee", tag: "시험>응시료", question: "자격증 응시료 지원받을 수 있는 정책 있어?" },
  { id: "cert", tag: "시험>자격증", question: "자격증 취득 비용 지원해주는 제도 있어?" },
  { id: "suit", tag: "면접>정장", question: "면접 정장 무료로 빌릴 수 있는 곳 있어?" },
  { id: "interview", tag: "면접>면접비", question: "면접 볼 때 받을 수 있는 지원금 있어?" },
  { id: "transport", tag: "교통>교통비", question: "면접 보러 갈 때 교통비 지원받을 수 있어?" },
  { id: "rent", tag: "주거>월세", question: "청년 월세 지원 나도 받을 수 있어?" },
  { id: "jeonse", tag: "주거>전세", question: "청년 전세 보증금 지원 조건 알려줘" },
  { id: "move", tag: "주거>이사", question: "이사하면 받을 수 있는 지원 있어?" },
  { id: "training", tag: "훈련>직업훈련", question: "국민내일배움카드로 뭘 들을 수 있어?" },
  { id: "course", tag: "훈련>교육비", question: "취업 강의 수강료 지원받을 수 있어?" },
  { id: "allowance", tag: "수당>구직활동", question: "구직활동 지원금 나도 받을 수 있어?" },
  { id: "after-benefit", tag: "수당>실업급여", question: "구직급여 끝나면 받을 수 있는 지원 있어?" },
  { id: "intern", tag: "일경험>인턴", question: "청년 일경험 프로그램 신청할 수 있어?" },
  { id: "consult", tag: "상담>취업상담", question: "무료 취업 컨설팅 받을 수 있는 곳 있어?" },
  { id: "saving", tag: "금융>저축", question: "청년도약계좌 지금 가입해도 돼?" },
  { id: "loan", tag: "금융>대출", question: "학자금 대출 이자 지원받을 수 있어?" },
  { id: "mind", tag: "건강>심리", question: "청년 마음건강 상담 무료로 받을 수 있어?" },
  { id: "profile:kookchwi", tag: null, question: "국민취업지원제도 나도 받을 수 있어?" },
  { id: "default:kookchwi", tag: null, question: "국민취업지원제도가 뭐야?" },
  { id: "default:rent", tag: null, question: "청년 월세 지원은 누가 받을 수 있어?" },
  { id: "default:fee", tag: null, question: "자격증 응시료 지원 정책 알려줘" },
];

/** 신호가 없는 사용자에게 보여줄 기본 질문 (순서대로). */
export const DEFAULT_STARTER_IDS = ["default:kookchwi", "default:rent", "default:fee"];
