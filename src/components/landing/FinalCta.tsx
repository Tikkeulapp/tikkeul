import { BRAND } from "@/config/brand";
import { LogoMark } from "./LogoMark";

export function FinalCta() {
  return (
    <>
      <section id="cta" className="mx-auto w-full max-w-6xl px-5 py-24">
        <div className="rounded-[32px] bg-leaf-deep px-8 py-16 text-center text-white sm:px-16">
          <p className="text-[13px] font-extrabold tracking-widest text-lime">
            READY WHEN YOU ARE
          </p>
          <h2 className="mt-4 text-3xl font-medium leading-snug sm:text-[44px]">
            취업까지 가는 길,
            <br />
            티끌까지 챙겨드릴게요.
          </h2>
          <p className="mx-auto mt-4 max-w-[42ch] text-white/75">
            {BRAND.tagline} — 일정을 적는 것부터 시작하세요. 나머지는 {BRAND.name}이 챙깁니다.
          </p>
          <div className="mt-9">
            <span className="inline-flex cursor-default items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[15px] font-bold text-leaf-deep">
              내 혜택 캘린더 시작하기
              <em className="rounded-full bg-lime px-2.5 py-0.5 text-[11px] not-italic text-leaf-deep">준비 중</em>
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5 font-extrabold">
            <LogoMark size={28} />
            <span>{BRAND.name}</span>
          </div>
          <p className="text-[13px] text-mute">
            취업준비생을 위한 취준 비용 절감 AI Agent · {BRAND.competition}
          </p>
        </div>
      </footer>
    </>
  );
}
