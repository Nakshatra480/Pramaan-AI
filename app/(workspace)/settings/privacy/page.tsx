import type { Metadata } from "next";
import { PrivacySettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Privacy settings" };

export default function Page() {
  return <PrivacySettings />;
}
