import type { Metadata } from "next";
import { ProfileSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Profile settings" };

export default function Page() {
  return <ProfileSettings />;
}
