import { BRAND } from "@/config/brand";

export function Compare() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-[13px] font-extrabold tracking-widest text-leaf">
          WHAT MAKES IT DIFFERENT
        </p>
        <h2 className="mt-3 text-3xl font-medium leading-snug sm:text-[44px] sm:leading-[1.2]">
          내가 누구인지가 아니라,
          <br />
          지금 뭘 하는지를 봅니다
        </h2>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {/* 기존 방식 */}
        <article className="rounded-[24px] border border-line bg-card/70 p-8">
          <p className="text-[13px] font-extrabold text-mute">기존 정책 추천</p>
          <p className="mt-1 text-xl font-extrabold text-mute">Who you are</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-bold text-mute">
            {["나이", "거주지역", "소득", "취업 여부", "가구 형태"].map((t) => (
              <span key={t} className="rounded-full border border-line px-3.5 py-1.5">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-7 rounded-2xl bg-paper p-5 text-[14.5px]">
            <p className="font-bold text-mute">
              “당신이 받을 수 있는 정책은 <b>17개</b>입니다.”
            </p>
            <p className="mt-1.5 text-[13px] text-mute/80">
              …그래서 지금 뭘 해야 하는지는 알 수 없습니다.
            </p>
          </div>
        </article>

        {/* 티끌 방식 */}
        <article className="rounded-[24px] border-2 border-leaf bg-card p-8">
          <p className="text-[13px] font-extrabold text-leaf">{BRAND.name}</p>
          <p className="mt-1 text-xl font-extrabold text-leaf-deep">What you&apos;re doing</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-extrabold text-leaf-deep">
            {["다음 주 면접", "토익 접수", "SQLD 시험", "부트캠프 시작", "졸업 후 6개월"].map(
              (t) => (
                <span key={t} className="rounded-full bg-mint px-3.5 py-1.5">
                  {t}
                </span>
              ),
            )}
          </div>
          <div className="mt-7 rounded-2xl bg-mint-soft p-5 text-[14.5px]">
            <p className="font-extrabold text-leaf-deep">
              “이번 달 취준 비용 31만 원 중 <b className="text-leaf">14만 원</b>은 지원받을 수
              있어요.”
            </p>
            <p className="mt-1.5 text-[13px] font-bold text-mute">
              지금 신청할 것 2건 · 미리 챙길 증빙 1건 · 마감 D-6
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
