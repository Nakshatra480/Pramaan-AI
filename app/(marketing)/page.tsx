import { Hero } from "@/components/marketing/landing/Hero";
import { EvidenceChain, FinalCTA, HowItWorks, PricingSection, Properties, ReportShowcase, SourcesSection, TrustSection, WhyPramaan } from "@/components/marketing/landing/Story";

/** One continuous story: identity → why → how → the result → evidence → sources → pricing → trust → CTA. */
export default function LandingPage() {
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
