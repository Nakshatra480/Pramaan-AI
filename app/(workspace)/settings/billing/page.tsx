import type { Metadata } from "next";
import { BillingSettings } from "@/components/settings/SettingsPages";

export const metadata: Metadata = { title: "Billing settings" };

export default function Page() {
  return <BillingSettings />;
}
