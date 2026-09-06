"use client";

import { useCallback, useEffect, useState } from "react";
import { Joyride, EVENTS, type Step, type EventData } from "react-joyride";

const SEEN_KEY = "tikkeul.tour.seen.v1";

const STEPS: Step[] = [
  {
    target: "#tour-search",
    title: "무엇이든 물어보세요",
    content: "궁금한 지원제도를 문장으로 물어보면 AI가 내 프로필과 대조해서 자격 여부까지 알려줘요. 답변 아래에서 바로 추가 질문도 이어갈 수 있어요.",
    placement: "bottom",
  },
  {
    target: "#tour-toggle",
    title: "취업 전 / 후 전환",
    content: "지금은 '취업전' 화면이에요. 취업하고 난 뒤 자산 계획이 궁금하면 '취업후'를 눌러 시뮬레이션 화면으로 이동해 보세요.",
    placement: "bottom",
  },
  {
    target: "#tour-saving",
    title: "이번 달 아낄 티끌",
    content: "마이티끌에 담아둔 정책들의 예상 절약 금액 합계예요.",
    placement: "right",
  },
  {
    target: "#tour-mytikkeul",
    title: "마이티끌 · 추천",
    content: "관심 있는 정책을 담아두면 여기서 모아볼 수 있어요. 추천 탭에서는 AI가 내 프로필 기준으로 고른 정책도 볼 수 있어요.",
    placement: "right",
  },
  {
    target: "#tour-calendar",
    title: "일정 등록",
    content: "시험·면접 같은 일정을 등록하면 AI가 그 일정에 붙는 지원 혜택을 자동으로 찾아줘요.",
    placement: "top",
  },
  {
    target: "#tour-profile",
    title: "내 프로필",
    content: "학력·취업상태·소득분위 등을 여기서 바로 수정할 수 있고, 바뀐 내용은 정책 판정에 실시간으로 반영돼요.",
    placement: "left",
  },
];

/** 처음 접속한 사용자에게 한 번만 자동으로 뜨는 화면 가이드 투어. */
export function OnboardingTour() {
  const [run, setRun] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* localStorage 접근 불가 — 그냥 안 띄움 */
    }
    if (seen) return;
    // 프로필 카드 등 조건부로 그려지는 대상들이 먼저 마운트될 시간을 준다
    const t = setTimeout(() => setRun(true), 700);
    return () => clearTimeout(t);
  }, []);

  const handleEvent = useCallback((data: EventData) => {
    if (data.type === EVENTS.TOUR_END) {
      setRun(false);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* 무시 */
      }
    }
  }, []);

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      options={{ primaryColor: "#2fbf5f", zIndex: 10000, buttons: ["back", "close", "skip", "primary"] }}
      locale={{ back: "이전", close: "닫기", last: "완료", next: "다음", skip: "건너뛰기" }}
    />
  );
}

/** 헤더의 "가이드 다시보기"에서 호출 — 이력을 지우고 새로고침해 투어를 다시 띄운다. */
export function restartOnboardingTour() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* 무시 */
  }
  window.location.reload();
}
