import type { Metadata } from "next";
import { NotificationsSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Notifications settings" };

export default function Page() {
  return <NotificationsSettings />;
}
