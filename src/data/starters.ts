/**
 * 먼저 건네는 질문 템플릿 — 검색바 추천 질문 칩과 주간 선톡("이번 주 티끌")에 쓴다.
 * 문장은 덜 구체적으로: 사용자의 일정·결제 내역을 그대로 말하지 않는다 (카카오 선톡 Lesson 3).
 */
import type { StarterTemplate } from "@/types/interest";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: "fee", tag: "시험>응시료", question: "자격증 응시료 지원받을 수 있는 정책 있어?", opener: "시험 준비하시는 데 응시료 부담이 크죠. 응시료를 돌려받을 수 있는 정책을 찾아볼까요?" },
  { id: "cert", tag: "시험>자격증", question: "자격증 취득 비용 지원해주는 제도 있어?", opener: "자격증 준비 중이시라면, 취득 비용을 지원해주는 제도를 찾아볼까요?" },
  { id: "suit", tag: "면접>정장", question: "면접 정장 무료로 빌릴 수 있는 곳 있어?", opener: "면접 정장, 무료로 빌릴 수 있는 곳이 있어요. 찾아볼까요?" },
  { id: "interview", tag: "면접>면접비", question: "면접 볼 때 받을 수 있는 지원금 있어?", opener: "면접 시즌이시죠? 면접 준비에 쓸 수 있는 지원금을 찾아볼까요?" },
  { id: "transport", tag: "교통>교통비", question: "면접 보러 갈 때 교통비 지원받을 수 있어?", opener: "면접 보러 다니는 교통비도 지원받을 수 있어요. 찾아볼까요?" },
  { id: "rent", tag: "주거>월세", question: "청년 월세 지원 나도 받을 수 있어?", opener: "월세 부담을 덜어주는 청년 지원이 있어요. 받을 수 있는지 확인해볼까요?" },
  { id: "jeonse", tag: "주거>전세", question: "청년 전세 보증금 지원 조건 알려줘", opener: "전세 보증금 부담을 덜어주는 청년 지원이 있어요. 조건을 알아볼까요?" },
  { id: "move", tag: "주거>이사", question: "이사하면 받을 수 있는 지원 있어?", opener: "이사를 앞두고 계신다면, 새로 받을 수 있는 지원을 정리해볼까요?" },
  { id: "training", tag: "훈련>직업훈련", question: "국민내일배움카드로 뭘 들을 수 있어?", opener: "국민내일배움카드로 무료나 저렴하게 들을 수 있는 훈련이 많아요. 알아볼까요?" },
  { id: "course", tag: "훈련>교육비", question: "취업 강의 수강료 지원받을 수 있어?", opener: "취업 강의 수강료를 지원받을 수 있는 방법이 있어요. 찾아볼까요?" },
  { id: "allowance", tag: "수당>구직활동", question: "구직활동 지원금 나도 받을 수 있어?", opener: "구직활동 기간에 받을 수 있는 지원금이 있어요. 확인해볼까요?" },
  { id: "after-benefit", tag: "수당>실업급여", question: "구직급여 끝나면 받을 수 있는 지원 있어?", opener: "구직급여가 끝난 뒤에도 이어서 받을 수 있는 지원이 있어요. 미리 알아볼까요?" },
  { id: "intern", tag: "일경험>인턴", question: "청년 일경험 프로그램 신청할 수 있어?", opener: "경력을 쌓으면서 수당도 받는 청년 일경험 프로그램이 있어요. 알아볼까요?" },
  { id: "consult", tag: "상담>취업상담", question: "무료 취업 컨설팅 받을 수 있는 곳 있어?", opener: "자소서 첨삭이나 취업 상담을 무료로 받을 수 있는 곳이 있어요. 찾아볼까요?" },
  { id: "saving", tag: "금융>저축", question: "청년도약계좌 지금 가입해도 돼?", opener: "취업 준비 중에도 가입할 수 있는 청년 저축 상품이 있어요. 알아볼까요?" },
  { id: "loan", tag: "금융>대출", question: "학자금 대출 이자 지원받을 수 있어?", opener: "학자금 대출 이자를 지원받을 수 있는지 확인해볼까요?" },
  { id: "mind", tag: "건강>심리", question: "청년 마음건강 상담 무료로 받을 수 있어?", opener: "취업 준비로 지칠 때 무료로 받을 수 있는 마음건강 상담이 있어요. 알아볼까요?" },
  { id: "profile:kookchwi", tag: null, question: "국민취업지원제도 나도 받을 수 있어?", opener: "미취업 청년이 구직촉진수당을 받을 수 있는 국민취업지원제도, 해당되는지 확인해볼까요?" },
  { id: "default:kookchwi", tag: null, question: "국민취업지원제도가 뭐야?", opener: "" },
  { id: "default:rent", tag: null, question: "청년 월세 지원은 누가 받을 수 있어?", opener: "" },
  { id: "default:fee", tag: null, question: "자격증 응시료 지원 정책 알려줘", opener: "" },
];

/** 신호가 없는 사용자에게 보여줄 기본 질문 (순서대로). */
export const DEFAULT_STARTER_IDS = ["default:kookchwi", "default:rent", "default:fee"];
