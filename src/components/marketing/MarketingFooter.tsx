import { Link } from "@/components/ui/Link";
import { PramaanLogo } from "@/components/brand/PramaanLogo";

const LINKS = [
  ["How it works", "/#how-it-works"],
  ["Sources", "/#sources"],
  ["Pricing", "/#pricing"],
  ["Trust & privacy", "/#trust"],
  ["Privacy notice", "/privacy"],
  ["Sign in", "/auth/login"],
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PramaanLogo size="sm" />
          <p className="text-[13px] text-ink-muted">Research, with evidence.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map(([label, href]) => (
              <li key={label}>
                <Link href={href} className="text-[13.5px] text-ink-muted hover:text-ink transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
