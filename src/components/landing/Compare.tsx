import { BRAND } from "@/config/brand";

export function Compare() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-[13px] font-semibold tracking-widest text-leaf">
          WHAT MAKES IT DIFFERENT
        </p>
        <h2 className="mt-3 text-3xl font-light leading-tight sm:text-[44px] sm:leading-[1.1]">
          정책을 찾아다니지 마세요.
          <br />
          일정을 적으면 혜택이 따라옵니다
        </h2>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {/* 기존 방식 */}
        <article className="rounded-[24px] border border-line bg-card/70 p-8">
          <p className="text-[13px] font-semibold text-mute">기존 정책 검색</p>
          <p className="mt-1 text-xl font-semibold text-mute">조건으로 거르기</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-bold text-mute">
            {["나이", "거주지역", "소득", "취업 여부", "가구 형태"].map((t) => (
              <span key={t} className="rounded-full border border-line px-3.5 py-1.5">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-7 rounded-[12px] bg-paper p-5 text-[14.5px]">
            <p className="font-bold text-mute">
              “조건에 맞는 정책 <b>17개</b>”
            </p>
            <p className="mt-1.5 text-[13px] text-mute/80">
              …그중 지금 나한테 필요한 게 뭔지, 언제까지 신청해야 하는지는 직접 찾아야 합니다.
            </p>
          </div>
        </article>

        {/* 티끌 방식 */}
        <article className="rounded-[24px] border-2 border-leaf bg-card p-8">
          <p className="text-[13px] font-semibold text-leaf">{BRAND.name}</p>
          <p className="mt-1 text-xl font-semibold text-leaf-deep">일정에 혜택을 붙이기</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-semibold text-leaf-deep">
            {["9/20 토익 시험", "9/18 SKT 면접", "9/25 대전 이사", "취업 후 연봉 3,600만"].map(
              (t) => (
                <span key={t} className="rounded-full bg-mint px-3.5 py-1.5">
                  {t}
                </span>
              ),
            )}
          </div>
          <div className="mt-7 rounded-[12px] bg-mint-soft p-5 text-[14.5px]">
            <p className="font-semibold text-leaf-deep">
              “토익 응시료 <b className="text-leaf">52,500원</b> 지원 가능 · 정기접수 9/7 마감(D-1) · 면접수당 5만 원”
            </p>
            <p className="mt-1.5 text-[13px] font-bold text-mute">
              지금 신청할 것 · 미리 챙길 증빙 · 마감일까지 한 화면에서
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
