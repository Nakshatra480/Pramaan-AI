import { SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-8 sm:py-12 grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
      <aside className="min-w-0 lg:sticky lg:top-24 self-start">
        <p className="hidden lg:block eyebrow mb-4 px-3">Settings</p>
        <SettingsNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
