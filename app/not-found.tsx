import Link from "next/link";
import { PramaanLogo } from "@/components/brand/PramaanLogo";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-16 flex items-center px-6">
        <Link href="/" aria-label="Pramaan AI">
          <PramaanLogo variant="compact" size="sm" />
        </Link>
      </header>
      <main id="main" className="flex-1 grid place-items-center px-4">
        <EmptyState title="There's no evidence of this page." description="The link may be broken, or the page may have moved." action={<ButtonLink href="/">Back to Pramaan</ButtonLink>} />
      </main>
    </div>
  );
}
