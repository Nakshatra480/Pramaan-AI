import type { Metadata } from "next";
import { ResearchSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Research settings" };

export default function Page() {
  return <ResearchSettings />;
}
