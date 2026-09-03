"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPersona, type Persona } from "@/data/personas";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";

/**
 * 앱 메인 (임시) — 다음 단계에서 캘린더 + 채팅이 여기 들어온다.
 * 지금은 선택된 페르소나와 시드 일정만 보여준다.
 */
export default function AppPage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tikkeul.session");
      if (raw) {
        const { personaId } = JSON.parse(raw);
        setPersona(getPersona(personaId) ?? null);
      }
    } catch {
      // 세션 없음 — 아래에서 시작 화면으로 안내
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!persona) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="text-lg font-bold">프로필이 선택되지 않았어요</p>
          <Link
            href="/app/start"
            className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white"
          >
            프로필 선택하러 가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-4xl items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto text-[13px] text-mute">
          {persona.emoji} {persona.name}님 · <Link href="/app/start" className="underline">프로필 변경</Link>
        </span>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 pb-24 pt-8">
        <h1 className="text-2xl font-semibold">
          {persona.name}님의 캘린더에 이 일정들을 불러왔어요
        </h1>
        <div className="mt-6 flex flex-col gap-2">
          {persona.seedEvents.map((e) => (
            <div
              key={e.date + e.title}
              className="flex items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-[14.5px]"
            >
              <span className="rounded-[6px] bg-mint px-2 py-0.5 text-[12px] font-bold text-leaf-deep">
                {e.date.slice(5).replace("-", "/")}
              </span>
              <span className="font-semibold">{e.title}</span>
              {e.location && <span className="text-[12.5px] text-mute">{e.location}</span>}
            </div>
          ))}
        </div>
        <p className="mt-8 rounded-[12px] bg-mint-soft px-4 py-3 text-[13.5px] text-mute">
          🚧 다음 단계: 이 자리에 <b className="text-ink">머니캘린더 + AI 채팅</b>이 들어옵니다.
          일정을 추가하면 AI가 의미를 읽고 받을 수 있는 혜택을 붙여줍니다.
        </p>
      </section>
    </main>
  );
}
