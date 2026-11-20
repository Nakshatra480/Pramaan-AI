import type { Metadata } from "next";
import { PrivacyPage } from "@/components/marketing/MarketingPages";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <PrivacyPage />;
}
