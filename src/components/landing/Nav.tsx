import { BRAND } from "@/config/brand";
import { LogoMark } from "./LogoMark";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md border-b border-line/60">
      <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between px-5">
        <a href="#" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <LogoMark />
          <span className="text-[17px]">{BRAND.name}</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-mute md:flex">
          <a href="#how" className="transition hover:text-leaf-deep">
            서비스 소개
          </a>
          <a href="#features" className="transition hover:text-leaf-deep">
            주요 기능
          </a>
          <a href="#trust" className="transition hover:text-leaf-deep">
            데이터 원칙
          </a>
        </nav>
        <a
          href="#cta"
          className="rounded-none bg-leaf px-6 py-2.5 text-[13px] font-bold tracking-[0.08em] text-white transition hover:bg-[#9d2211]"
        >
          시작하기
        </a>
      </div>
    </header>
  );
}
