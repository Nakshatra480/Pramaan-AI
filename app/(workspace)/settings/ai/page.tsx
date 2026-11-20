import type { Metadata } from "next";
import { AISettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "AI settings" };

export default function Page() {
  return <AISettings />;
}
