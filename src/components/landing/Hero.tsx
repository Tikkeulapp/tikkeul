import { BRAND } from "@/config/brand";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 목업 캘린더에 그릴 2주 (9/13 ~ 9/26) */
const DAYS = Array.from({ length: 14 }, (_, i) => i + 13);

export function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
      {/* ── 카피 ─────────────────────────────── */}
      <div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-mint px-3.5 py-1.5 text-[13px] font-bold text-leaf-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-leaf" />
          취업준비생 금융 AI Agent
        </div>
        <h1 className="text-[48px] font-light leading-[1.02] tracking-[-0.03em] sm:text-[80px]">
          영끌 아닌,
          <br />
          <em className="not-italic text-leaf">
            티끌<span className="text-ink">.</span>
          </em>
        </h1>
        <p className="mt-5 text-lg font-bold text-leaf-deep">{BRAND.oneLiner}</p>
        <p className="mt-2 max-w-[46ch] text-[15.5px] text-mute">{BRAND.description}</p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="#cta"
            className="rounded-full bg-leaf px-6 py-3 text-[16px] font-medium text-white transition hover:bg-[#333333]"
          >
            내 혜택 캘린더 시작하기 →
          </a>
          <a href="#how" className="rounded-full border border-line bg-card px-6 py-3 text-[16px] font-medium text-ink transition hover:border-ink">
            어떻게 작동하나요?
          </a>
        </div>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-mute">
          <span>✓ 공식 정부 데이터 기반</span>
          <span>✓ 절약액은 계산 코드로</span>
          <span>✓ 모르면 추측하지 않음</span>
        </div>
      </div>

      {/* ── 제품 목업: 일정을 적으면 돈이 붙는 캘린더 ── */}
      <div className="relative pb-16" aria-label="서비스 화면 미리보기">
        <div className="rounded-[24px] border border-line bg-card p-6">
          {/* 창 상단 */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-mint" />
            </div>
            <p className="text-[13px] font-bold text-mute">
              {BRAND.name} 캘린더 · 2026년 9월
            </p>
          </div>

          {/* 미니 캘린더 */}
          <div className="rounded-[12px] border border-line bg-mint-soft/60 p-3">
            <div className="grid grid-cols-7 text-center text-[11px] font-bold text-mute">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
              {DAYS.map((day) => (
                <div key={day} className="relative py-1.5">
                  <span
                    className={
                      day === 18
                        ? "inline-grid h-7 w-7 place-items-center rounded-full bg-leaf font-semibold text-white"
                        : "inline-grid h-7 w-7 place-items-center rounded-full font-semibold text-ink/70"
                    }
                  >
                    {day}
                  </span>
                  {day === 18 && (
                    <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-leaf" />
                  )}
                </div>
              ))}
            </div>
            {/* 사용자가 적은 일정 */}
            <div className="mt-2 flex items-center gap-2 rounded-[12px] bg-card px-3 py-2.5 text-[13px] font-bold">
              <span className="rounded-[2px] bg-mint px-1.5 py-0.5 text-[11px] text-leaf-deep">
                9/18
              </span>
              ○○기업 면접
              <span className="ml-auto text-[11px] font-semibold text-mute">내가 적은 일정</span>
            </div>
          </div>

          {/* AI가 붙여준 혜택 */}
          <div className="mt-4 rounded-[24px] border border-line bg-card p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-leaf-deep">
              <span className="grid h-5 w-5 place-items-center rounded-[2px] bg-lime text-[11px] text-[#181818]">
                AI
              </span>
              면접 일정을 확인했어요 — 챙길 수 있는 혜택 3가지
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-bold">
              <span className="rounded-full bg-mint px-3 py-1.5 text-leaf-deep">
                청년 면접수당 최대 50,000원
              </span>
              <span className="rounded-full bg-mint px-3 py-1.5 text-leaf-deep">
                면접 정장 무료대여
              </span>
              <span className="rounded-full bg-butter px-3 py-1.5 text-ink">
                ⚠ 면접확인서 미리 받아두세요
              </span>
            </div>
          </div>

          {/* 채팅 한 줄 */}
          <div className="mt-4 flex items-center gap-2.5 rounded-[12px] border border-line bg-mint-soft/50 px-4 py-3 text-[13px]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leaf text-[12px] font-semibold text-white">
              티
            </span>
            <p className="text-ink/80">
              성남 면접이면 <b className="text-leaf-deep">교통비 지원</b>도 확인해볼게요.
            </p>
          </div>
        </div>

        {/* 떠 있는 절약액 카드 */}
        <div className="absolute bottom-0 -left-3 rounded-[24px] border border-line bg-card px-5 py-4 sm:-left-8">
          <p className="text-[12px] font-bold text-mute">이번 달 모은 티끌</p>
          <p className="text-[22px] font-semibold tracking-tight text-leaf">
            +140,000<span className="text-[14px] text-ink">원</span>
          </p>
        </div>
      </div>
    </section>
  );
}
