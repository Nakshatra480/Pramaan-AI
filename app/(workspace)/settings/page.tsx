import type { Metadata } from "next";
import { SettingsOverview } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsOverview />;
}
