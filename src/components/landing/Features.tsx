"use client";

import { useState } from "react";

const FEATURES = [
  {
    key: "chat",
    label: "AI 채팅 상담",
    small: "정책이 궁금하면 그냥 물어보세요",
    preview: {
      title: "AI 채팅 상담",
      stat: "즉시",
      unit: "답변",
      copy: "“국민취업지원제도에 대해 알려줘” — 복잡한 제도를 내 상황에 맞춰 풀어서 설명합니다.",
      insight: "답변에는 공식 출처 링크가 함께 붙습니다.",
    },
  },
  {
    key: "calendar",
    label: "머니캘린더",
    small: "내 일정과 정책 마감일이 한곳에",
    preview: {
      title: "머니캘린더",
      stat: "1",
      unit: "개의 캘린더",
      copy: "면접·시험 일정 옆에 <b>정책 신청 마감일</b>이 함께 표시됩니다. 일정 관리가 곧 혜택 관리가 됩니다.",
      insight: "예산 조기마감 사업은 먼저 알려드립니다.",
    },
  },
  {
    key: "match",
    label: "이벤트 → 정책 자동 매칭",
    small: "일정을 적으면 혜택과 절약액이 붙음",
    preview: {
      title: "자동 정책 매칭",
      stat: "+50,000",
      unit: "원 / 면접 1회",
      copy: "“SKT 면접”이라고 적는 순간, 면접수당·정장대여·교통비 지원을 찾아 <b>예상 절약액</b>까지 계산합니다.",
      insight: "필요한 증빙 서류를 면접 전에 미리 안내합니다.",
    },
  },
  {
    key: "report",
    label: "절약 리포트",
    small: "이번 주·이번 달 아낀 티끌 합계",
    preview: {
      title: "절약 리포트",
      stat: "140,000",
      unit: "원 / 이번 달",
      copy: "“이번 달 예정된 취준 비용 31만 원 중 <b>14만 원</b>은 지원받을 수 있어요.” — 숫자로 확인합니다.",
      insight: "티끌이 쌓이는 걸 보면 취준이 덜 무섭습니다.",
    },
  },
] as const;

export function Features() {
  const [active, setActive] = useState<(typeof FEATURES)[number]["key"]>("match");
  const current = FEATURES.find((f) => f.key === active)!;

  return (
    <section id="features" className="bg-mint-soft/60 py-24">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="max-w-xl">
          <p className="text-[13px] font-semibold tracking-widest text-leaf">
            YOUR JOB-HUNT CO-PILOT
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-[40px] sm:leading-[1.1]">
            검색 포털이 아니라,
            <br />
            먼저 움직이는 Agent
          </h2>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* 탭 목록 */}
          <div className="flex flex-col gap-3">
            {FEATURES.map((f, i) => (
              <button
                key={f.key}
                onClick={() => setActive(f.key)}
                className={`flex items-center gap-4 rounded-2xl border p-5 text-left transition ${
                  active === f.key
                    ? "border-leaf bg-card"
                    : "border-line bg-card/60 hover:bg-card"
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    active === f.key ? "text-leaf" : "text-mute"
                  }`}
                >
                  0{i + 1}
                </span>
                <span>
                  <strong className="block text-[15px] font-semibold">{f.label}</strong>
                  <small className="text-[13px] text-mute">{f.small}</small>
                </span>
              </button>
            ))}
          </div>

          {/* 미리보기 */}
          <div className="rounded-[18px] border border-line bg-card p-8">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-leaf-deep">{current.preview.title}</span>
              <small className="text-[12px] font-bold text-mute">미리보기</small>
            </div>
            <p className="mt-6">
              <strong className="text-[44px] font-semibold tracking-tight text-leaf">
                {current.preview.stat}
              </strong>
              <span className="ml-1.5 font-bold text-mute">{current.preview.unit}</span>
            </p>
            <p
              className="mt-4 text-[15px] leading-relaxed text-ink/85 [&_b]:text-leaf-deep"
              dangerouslySetInnerHTML={{ __html: current.preview.copy }}
            />
            <p className="mt-6 rounded-xl bg-mint px-4 py-3 text-[13.5px] font-bold text-leaf-deep">
              💡 {current.preview.insight}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
