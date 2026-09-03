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
          className="rounded-full bg-leaf px-5 py-2 text-sm font-medium text-white transition hover:bg-[#333333]"
        >
          시작하기
        </a>
      </div>
    </header>
  );
}
