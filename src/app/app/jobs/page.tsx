"use client";

import Link from "next/link";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { getPersona } from "@/data/personas";
import { JobsView } from "@/components/app/JobsView";
import { EmploymentToggle } from "@/components/app/EmploymentToggle";
import { useStoredSession } from "@/components/app/useStoredSession";

export default function JobsPage() {
  const session = useStoredSession();

  if (session === undefined) return null;
  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="text-center">
          <p className="text-xl font-bold">프로필이 없어요</p>
          <p className="mt-2 text-mute">페르소나를 고르거나 내 정보를 입력하면 채용공고를 검색할 수 있어요.</p>
          <Link href="/app/start" className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white">시작하기</Link>
        </div>
      </main>
    );
  }

  const persona = session.personaId ? getPersona(session.personaId) : null;
  const displayName = session.name ?? "회원";

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-[1600px] items-center gap-2.5 px-6 font-semibold">
        <Link href="/app" className="flex items-center gap-2.5 transition hover:opacity-75" title="메인 캘린더로">
          <LogoMark size={28} />
          <span>{BRAND.name}</span>
        </Link>
        <span className="ml-auto flex items-center gap-2.5 text-[16px] text-mute">
          <EmploymentToggle />
          <span>
            {persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 ·{" "}
            <Link href="/app/start" className="underline">프로필 변경</Link>
          </span>
        </span>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-6 pb-16">
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-mute">지금 지원할 수 있는 곳</p>
            <h1 className="text-[34px] font-extrabold tracking-tight">📋 채용공고 검색</h1>
          </div>
          <p className="max-w-2xl text-[16px] text-mute">
            공공기관(잡알리오)·고용24·기업 공식 채널의 실제 공고입니다. 조건을 고르면 접수 중 공고가 마감 임박순으로 나옵니다.
          </p>
        </div>

        <JobsView session={session} />
      </div>
    </main>
  );
}
