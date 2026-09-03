import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Compare } from "@/components/landing/Compare";
import { Trust } from "@/components/landing/Trust";
import { FinalCta } from "@/components/landing/FinalCta";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Compare />
        <Trust />
        <FinalCta />
      </main>
    </>
  );
}
