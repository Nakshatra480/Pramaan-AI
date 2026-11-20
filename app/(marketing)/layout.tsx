import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <MarketingHeader />
      <main id="main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
