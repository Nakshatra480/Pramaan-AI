import { Outlet } from "react-router";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PricingPage, PrivacyPage } from "@/components/marketing/MarketingPages";
import { Hero } from "@/components/marketing/landing/Hero";
import { EvidenceChain, FinalCTA, HowItWorks, PricingSection, Properties, ReportShowcase, SourcesSection, TrustSection, WhyPramaan } from "@/components/marketing/landing/Story";
import { BackendPrewarm } from "@/components/ui/ServerWakeHint";
import { usePageTitle } from "@/lib/navigation";

export function MarketingLayout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <BackendPrewarm />
      <MarketingHeader />
      <main id="main" className="flex-1 overflow-x-clip">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

/** One continuous story: identity → why → how → the result → evidence → sources → pricing → trust → CTA. */
export function Landing() {
  usePageTitle();
  return (
    <>
      <Hero />
      <Properties />
      <WhyPramaan />
      <HowItWorks />
      <ReportShowcase />
      <EvidenceChain />
      <SourcesSection />
      <PricingSection />
      <TrustSection />
      <FinalCTA />
    </>
  );
}

export function Pricing() {
  usePageTitle("Pricing");
  return <PricingPage />;
}

export function Privacy() {
  usePageTitle("Privacy");
  return <PrivacyPage />;
}
