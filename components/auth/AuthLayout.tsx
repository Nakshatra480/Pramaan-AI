import { BookOpen, FileText, ShieldCheck } from "lucide-react";
import { Link } from "@/components/ui/Link";
import type { ReactNode } from "react";
import { BackendPrewarm } from "@/components/ui/ServerWakeHint";
import { PramaanMark } from "@/components/brand/PramaanMark";

const features = [
  { icon: FileText, title: "Verified claims", body: "Every claim is checked and cited." },
  { icon: BookOpen, title: "Multiple sources", body: "Web, academic papers and your documents." },
  { icon: ShieldCheck, title: "Your research, your control", body: "Secure, private and built for serious work." },
];

/** Framed split card: coastal editorial panel on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:h-dvh lg:overflow-hidden bg-[#F5F0E4] p-0 sm:p-5 lg:p-6 grid place-items-center">
      <BackendPrewarm />
      <div className="w-full max-w-[1280px] min-h-dvh sm:min-h-0 lg:h-full lg:max-h-[860px] grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden sm:rounded-[18px] bg-[#FBF8F1] shadow-[0_30px_80px_-30px_rgba(60,50,30,0.25),0_0_0_1px_rgba(60,50,30,0.04)]">
        <aside className="relative hidden lg:flex flex-col overflow-hidden bg-gradient-to-b from-[#F7F0E3] via-[#F4EADA] to-[#EFE3CF] px-12 py-8">
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-[62%] bg-cover bg-right"
            style={{ backgroundImage: "url(/auth/coast.png)", maskImage: "linear-gradient(to right, transparent, #000 38%)", WebkitMaskImage: "linear-gradient(to right, transparent, #000 38%)" }}
          />
          <Link href="/" aria-label="Pramaan AI home" className="relative z-10 flex items-center gap-3 self-start rounded-md">
            <PramaanMark size={26} sparkle={false} />
            <span className="font-display text-[20px] text-[#1E1F1B]">Pramaan AI</span>
          </Link>
          <div className="relative z-10 my-auto max-w-[400px]">
            <p className="text-[11px] font-medium tracking-[0.26em] uppercase text-[#5E7363]">AI research, grounded in evidence.</p>
            <h2 className="mt-4 font-display text-[clamp(44px,6.2vh,58px)] leading-[1.02] tracking-[-0.01em] text-[#1E1F1B]">
              Research,
              <br />
              <em className="text-[#5A6F5E]">with evidence.</em>
            </h2>
            <p className="mt-4 text-[15px] leading-[1.6] text-[#6A6A62]">
              Ask a question. Get a researched answer
              <br />
              you can trace back to the source.
            </p>
            <ul className="mt-7 space-y-4">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-center gap-4">
                  <span className="grid place-items-center size-10 shrink-0 rounded-full bg-[#E9E4D8] text-[#6A6A62]">
                    <Icon className="size-[18px]" strokeWidth={1.4} />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-[#1E1F1B]">{title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-[#65675E]">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <blockquote className="relative z-10 border-l border-[#BDB8A8] pl-5 font-display italic text-[19px] leading-[1.3] text-[#3C3D37]">
            &ldquo;A research assistant
            <br />
            &nbsp;that shows its work.&rdquo;
          </blockquote>
        </aside>
        <div className="relative flex flex-col px-6 sm:px-12 lg:px-16 py-8 lg:overflow-y-auto">
          <img src="/auth/leaf.png" alt="" aria-hidden className="pointer-events-none absolute right-0 top-0 w-[96px] select-none" />
          <Link href="/" aria-label="Pramaan AI home" className="lg:hidden flex items-center gap-3 self-start">
            <PramaanMark size={26} sparkle={false} />
            <span className="font-display text-[20px] text-[#1E1F1B]">Pramaan AI</span>
          </Link>
          <main id="main" className="flex-1 flex items-center py-8 lg:py-0">
            <div className="w-full max-w-[380px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
