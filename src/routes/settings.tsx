import { Outlet } from "react-router";
import { SettingsNav } from "@/components/settings/SettingsNav";
import {
  AISettings,
  AppearanceSettings,
  BillingSettings,
  NotificationsSettings,
  PrivacySettings,
  ProfileSettings,
  ResearchSettings,
  SettingsOverview,
} from "@/components/settings/SettingsPages";
import { usePageTitle } from "@/lib/navigation";

export function SettingsLayout() {
  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-8 sm:py-12 grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
      <aside className="min-w-0 lg:sticky lg:top-24 self-start">
        <p className="hidden lg:block eyebrow mb-4 px-3">Settings</p>
        <SettingsNav />
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function page(title: string, Body: () => React.ReactNode) {
  return function SettingsPage() {
    usePageTitle(title);
    return <Body />;
  };
}

export const Overview = page("Settings", SettingsOverview);
export const Profile = page("Profile settings", ProfileSettings);
export const Research = page("Research settings", ResearchSettings);
export const AI = page("AI settings", AISettings);
export const Appearance = page("Appearance settings", AppearanceSettings);
export const Notifications = page("Notifications settings", NotificationsSettings);
export const Privacy = page("Privacy settings", PrivacySettings);
export const Billing = page("Billing settings", BillingSettings);
