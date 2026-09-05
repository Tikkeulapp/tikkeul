"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { getPersona } from "@/data/personas";
import { SimulateView, type SimSession } from "@/components/app/SimulateView";

export default function SimulatePage() {
  const [session, setSession] = useState<SimSession | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tikkeul.session");
      setSession(raw ? (JSON.parse(raw) as SimSession) : null);
    } catch {
      setSession(null);
    }
  }, []);

  if (session === undefined) return null;
  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="text-xl font-bold">프로필이 없어요</p>
          <p className="mt-2 text-mute">페르소나를 고르거나 내 정보를 입력하면 시뮬레이션을 시작할 수 있어요.</p>
          <Link href="/app/start" className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white">시작하기</Link>
        </div>
      </main>
    );
  }

  const persona = session.personaId ? getPersona(session.personaId) : null;
  const displayName = session.name ?? "회원";

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-6xl items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto text-[14.5px] text-mute">
          {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 ·{" "}
          <Link href="/app/start" className="underline">프로필 변경</Link>
        </span>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 pb-16">
        <Link href="/app" className="inline-block text-[14px] text-mute underline">← 캘린더로 돌아가기</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-mute">취업 후엔 어떻게 될까</p>
            <h1 className="text-[28px] font-extrabold tracking-tight">🎯 취업 후 시뮬레이션</h1>
          </div>
          <p className="max-w-xl text-[14px] text-mute">
            숫자는 코드가 계산하고 AI는 해설만 합니다. 세금은 간이 계산, 주택가격·결혼비용은 출처를 표시한 참고값입니다.
          </p>
        </div>

        <SimulateView session={session} />
      </div>
    </main>
  );
}
