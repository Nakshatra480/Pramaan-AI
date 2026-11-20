"use client";

import { ArrowRight, Check, Download, KeyRound, Monitor, Moon, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PramaanLoader } from "@/components/brand/PramaanLoader";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { CHANNELS, MODES } from "@/components/research/research-options";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { PLANS } from "@/data/plans";
import { useResource } from "@/lib/hooks/use-resource";
import { nextReset } from "@/lib/mock/account";
import { services } from "@/lib/services";
import { cn } from "@/lib/utils/cn";
import type { CitationStyle, ResponseLength, ThemePreference, UserPreferences } from "@/types";
import { SettingsCard, SettingsPage, SettingsSection } from "./SettingsSection";
import { SETTINGS_NAV } from "./SettingsNav";

/** Persist a preference change; confirm only once it is actually saved. */
function useSavePref() {
  const { update } = usePreferences();
  const toast = useToast();
  return async (patch: Partial<UserPreferences>, message = "Preferences saved.") => {
    try {
      await update(patch);
      toast({ title: message });
    } catch {
      toast({ title: "Couldn't save to your account.", description: "The change applies on this device only. Try again in a moment.", tone: "error" });
    }
  };
}

/* ------------------------------------------------------------------ */

export function SettingsOverview() {
  const { user } = useAuth();
  return (
    <SettingsPage title="Settings" description="Tune how Pramaan researches, cites and looks.">
      {user && (
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
          <Avatar initials={user.initials} src={user.avatarUrl} size={48} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-ink">{user.name}</p>
            <p className="text-[13px] text-ink-muted truncate">{user.email}</p>
          </div>
          <Badge tone="sage" className="capitalize">
            {user.plan} plan
          </Badge>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {SETTINGS_NAV.slice(1).map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-[transform,box-shadow,border-color] duration-200">
              <span className="grid place-items-center size-9 rounded-lg border border-line text-ink-muted group-hover:text-ink">
                <n.icon className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-medium text-ink">{n.label}</span>
                <span className="block text-[12.5px] text-ink-muted">{n.description}</span>
              </span>
              <ArrowRight className="size-4 text-ink-faint mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

export function ProfileSettings() {
  const { user, updateProfile, sendPasswordReset } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!user) return null;
  const dirty = name !== user.name || email !== user.email;

  return (
    <SettingsPage title="Profile" description="How you appear across Pramaan and on shared research.">
      <SettingsSection title="Avatar">
        <div className="flex items-center gap-5">
          <Avatar initials={user.initials} src={user.avatarUrl} size={64} />
          {services.mode === "mock" ? (
            <div className="flex gap-2">
              <input
                ref={file}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await new Promise<string>((res) => {
                    const r = new FileReader();
                    r.onload = () => res(String(r.result));
                    r.readAsDataURL(f);
                  });
                  await updateProfile({ avatarUrl: url });
                  toast({ title: "Avatar updated." });
                }}
              />
              <Button variant="secondary" size="sm" leading={<Upload className="size-3.5" />} onClick={() => file.current?.click()}>
                Upload
              </Button>
              {user.avatarUrl && (
                <Button variant="ghost" size="sm" onClick={() => updateProfile({ avatarUrl: undefined })}>
                  Remove
                </Button>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted max-w-sm">
              {user.provider === "google" ? "Your avatar is your Google profile photo. Change it in your Google account." : "Pramaan shows your initials. Photo uploads aren't available yet."}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Details">
        <div className="space-y-4">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
          <Field
            label="Email"
            hint={
              services.mode === "api"
                ? "Your email is managed by your sign-in method."
                : email !== user.email
                  ? "We'll send a verification link to the new address."
                  : user.emailVerified
                    ? "Verified"
                    : "Not verified"
            }
          >
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" readOnly={services.mode === "api"} />}
          </Field>
          <Button
            disabled={!dirty || !name.trim()}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              await updateProfile(services.mode === "api" ? { name: name.trim() } : { name: name.trim(), email: email.trim() });
              setSaving(false);
              toast({ title: email !== user.email ? "Verification email sent." : "Profile updated." });
            }}
          >
            Save changes
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Sign-in" description="Authentication is handled by Firebase Authentication.">
        <SettingsCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] text-ink">{user.provider === "google" ? "Google account" : "Email and password"}</p>
              <p className="text-[12.5px] text-ink-muted">{user.email}</p>
            </div>
            {user.provider === "password" ? (
              <Button
                variant="secondary"
                size="sm"
                leading={<KeyRound className="size-3.5" />}
                onClick={async () => {
                  if (services.mode === "mock") return setPwOpen(true);
                  await sendPasswordReset(user.email);
                  toast({ title: "Password reset email sent.", description: "Follow the link to choose a new password." });
                }}
              >
                Change password
              </Button>
            ) : (
              <Badge tone="sage">Connected</Badge>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change password"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => (setPwOpen(false), toast({ title: "Password updated." }))}>Update password</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" data-autofocus />}</Field>
          <Field label="New password" hint="At least 8 characters.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" />}
          </Field>
        </div>
      </Dialog>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

const CITATION_PREVIEW: Record<CitationStyle, string> = {
  numeric: "Learned locomotion now transfers reliably to hardware [1].",
  apa: "Learned locomotion now transfers reliably to hardware (Moreau et al., 2026).",
  mla: "Learned locomotion now transfers reliably to hardware (Moreau et al.).",
  chicago: "Learned locomotion now transfers reliably to hardware (Moreau, Tanaka, and Iyer 2026).",
};

export function ResearchSettings() {
  const { prefs } = usePreferences();
  const save = useSavePref();

  return (
    <SettingsPage title="Research" description="Defaults for new research. You can change them for any single question.">
      <SettingsSection title="Default research mode">
        <div className="grid gap-2 lg:grid-cols-3" role="radiogroup" aria-label="Default research mode">
          {MODES.map((m) => {
            const on = prefs.defaultMode === m.value;
            return (
              <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => save({ defaultMode: m.value })} className={cn("text-left rounded-xl border p-4 transition-colors", on ? "border-accent bg-sage-soft/50" : "border-line bg-surface hover:border-line-strong")}>
                <span className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-ink">{m.label}</span>
                  {on && <Check className="size-4 text-accent" />}
                </span>
                <span className="block mt-1 text-[12.5px] text-ink-muted leading-snug">{m.description}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Default sources" description="Project Library is added automatically when you research inside a project.">
        <div className="flex flex-wrap gap-2">
          {CHANNELS.filter((c) => c.value !== "project").map((c) => {
            const on = prefs.defaultChannels.includes(c.value);
            return (
              <Chip
                key={c.value}
                selected={on}
                icon={<c.icon className="size-3.5" />}
                onToggle={() => {
                  const next = on ? prefs.defaultChannels.filter((x) => x !== c.value) : [...prefs.defaultChannels, c.value];
                  if (next.length) save({ defaultChannels: next });
                }}
              >
                {c.label}
              </Chip>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Citation style" description="How sources are marked inside reports. Author–date styles use each source's authors and year when they are known.">
        <div className="space-y-3">
          <label htmlFor="cite-style" className="sr-only">
            Citation style
          </label>
          <Select id="cite-style" value={prefs.citationStyle} onChange={(e) => save({ citationStyle: e.target.value as CitationStyle })} containerClassName="sm:w-72">
            <option value="numeric">Numeric — [1]</option>
            <option value="apa">APA</option>
            <option value="mla">MLA</option>
            <option value="chicago">Chicago</option>
          </Select>
          <p className="rounded-lg bg-subtle/70 border border-line px-4 py-3 font-display text-[17px] text-ink-2">{CITATION_PREVIEW[prefs.citationStyle]}</p>
        </div>
      </SettingsSection>

      <SettingsSection title="Response length" description="How long new reports are. Research mode still sets how many sources are read.">
        <Segmented<ResponseLength>
          label="Response length"
          value={prefs.responseLength}
          onChange={(v) => save({ responseLength: v })}
          options={[
            { value: "concise", label: "Concise" },
            { value: "balanced", label: "Balanced" },
            { value: "comprehensive", label: "Comprehensive" },
          ]}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

export function AISettings() {
  const steps = [
    ["Planning", "Turns your question into focused search queries."],
    ["Evidence ranking", "Ranks passages by meaning, using embeddings. If that service is unavailable, Pramaan ranks by keywords and says so in the report."],
    ["Claims and verification", "Extracts claims and checks each one against its evidence."],
    ["Synthesis", "Writes the report only from verified claims."],
  ];
  return (
    <SettingsPage title="AI" description="Pramaan chooses and runs the models for each research step.">
      <SettingsCard>
        <div className="flex items-start gap-4">
          <span className="grid place-items-center size-10 rounded-lg bg-sage-soft text-sage-ink shrink-0">
            <VerificationMark size={20} />
          </span>
          <div>
            <p className="text-[14px] font-medium text-ink">Managed by Pramaan</p>
            <p className="text-[13px] text-ink-muted mt-0.5">
              Hosted models handle each step. Citations are always generated deterministically from the evidence, never by a model. Choosing your own model or provider isn&rsquo;t available.
            </p>
          </div>
        </div>
      </SettingsCard>
      <SettingsSection title="What each step does">
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
          {steps.map(([t, d]) => (
            <div key={t} className="px-5 py-4">
              <dt className="text-[14px] font-medium text-ink">{t}</dt>
              <dd className="mt-0.5 text-[13px] text-ink-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

export function AppearanceSettings() {
  const { prefs } = usePreferences();
  const save = useSavePref();
  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <SettingsPage title="Appearance" description="Pramaan is designed for calm, long-form reading.">
      <SettingsSection title="Theme">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {themes.map((t) => {
            const on = prefs.theme === t.value;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => save({ theme: t.value }, "Appearance updated.")} className={cn("rounded-xl border p-2 text-left transition-colors", on ? "border-accent ring-2 ring-sage" : "border-line hover:border-line-strong")}>
                <ThemePreview variant={t.value} />
                <span className="flex items-center gap-1.5 px-1 pt-2.5 pb-0.5 text-[13px] font-medium text-ink">
                  <t.icon className="size-3.5" /> {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Motion">
        <SettingsCard>
          <Switch
            checked={prefs.reducedMotion}
            onChange={(v) => save({ reducedMotion: v }, v ? "Reduced motion on." : "Reduced motion off.")}
            label="Reduced motion"
            description="Disables continuous animations and simplifies transitions. Pramaan also follows your system setting."
          />
          <div className="flex items-center gap-5">
            <PramaanLoader size={64} label="Loading animation preview" />
            <p className="text-[13px] text-ink-muted">Preview — the loading animation {prefs.reducedMotion ? "is shown as a still image." : "plays while Pramaan works."}</p>
          </div>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}

function ThemePreview({ variant }: { variant: ThemePreference }) {
  const pane = (dark: boolean) => (
    <div className={cn("h-full w-full p-2 flex gap-1.5", dark ? "bg-[#121311]" : "bg-[#FAF8ED]")}>
      <div className={cn("w-1/4 rounded-sm", dark ? "bg-[#1E1F1B]" : "bg-[#F3F0E2]")} />
      <div className="flex-1 space-y-1.5 pt-1">
        <div className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-[#EEECE1]" : "bg-[#191A17]")} />
        <div className={cn("h-1 w-full rounded-full", dark ? "bg-[#3A3C35]" : "bg-[#D5D1BB]")} />
        <div className={cn("h-1 w-5/6 rounded-full", dark ? "bg-[#3A3C35]" : "bg-[#D5D1BB]")} />
        <div className="h-1.5 w-1/3 rounded-full bg-[#8FA392]" />
      </div>
    </div>
  );
  return (
    <div className="h-20 rounded-lg overflow-hidden border border-line flex">
      {variant === "system" ? (
        <>
          <div className="w-1/2 overflow-hidden">{pane(false)}</div>
          <div className="w-1/2 overflow-hidden">{pane(true)}</div>
        </>
      ) : (
        pane(variant === "dark")
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function NotificationsSettings() {
  const { prefs } = usePreferences();
  const save = useSavePref();
  const n = prefs.notifications;
  const set = (patch: Partial<typeof n>) => save({ notifications: { ...n, ...patch } }, "Notification settings saved.");

  return (
    <SettingsPage title="Notifications" description="What appears under the bell in Pramaan. Pramaan doesn't send notification emails.">
      <SettingsCard>
        <Switch checked={n.researchComplete} onChange={(v) => set({ researchComplete: v })} label="Research complete" description="When a research session finishes, with source and verified-claim counts." />
        <Switch checked={n.documentIndexed} onChange={(v) => set({ documentIndexed: v })} label="Document indexing" description="When an uploaded document or website is ready for research." />
      </SettingsCard>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

export function PrivacySettings() {
  const { prefs } = usePreferences();
  const { user } = useAuth();
  const router = useRouter();
  const save = useSavePref();
  const toast = useToast();
  const [confirm, setConfirm] = useState<"research" | "account" | null>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const word = confirm === "account" ? "DELETE" : "delete research";
  const needsPassword = confirm === "account" && services.mode === "api" && user?.provider === "password";
  const open = (c: "research" | "account") => {
    setTyped("");
    setPassword("");
    setError(null);
    setConfirm(c);
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await services.auth.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Export downloaded.", description: filename });
    } catch {
      toast({ title: "Couldn't export your data.", description: "Please try again.", tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      if (confirm === "account") {
        await services.auth.deleteAccount(needsPassword ? password : undefined);
        router.replace("/");
        toast({ title: "Your account has been deleted." });
      } else {
        await services.research.removeAll();
        setConfirm(null);
        toast({ title: "All research deleted." });
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setError(
        /wrong-password|invalid-credential/.test(code)
          ? "That password isn't right."
          : /popup-closed|cancelled-popup|user-cancelled/.test(code)
            ? "Confirm with Google to delete your account."
            : /user-mismatch/.test(code)
              ? "Choose the Google account you're signed in with."
              : "Nothing was deleted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title="Privacy" description="Your library and research are private to you unless you share them.">
      <SettingsSection title="Data retention" description="Research older than this is deleted automatically (checked every hour).">
        <label htmlFor="retention" className="sr-only">
          Data retention
        </label>
        <Select id="retention" value={String(prefs.retentionDays)} onChange={(e) => save({ retentionDays: Number(e.target.value) as UserPreferences["retentionDays"] })} containerClassName="sm:w-72">
          <option value="0">Keep everything</option>
          <option value="365">1 year</option>
          <option value="90">90 days</option>
          <option value="30">30 days</option>
        </Select>
      </SettingsSection>

      <SettingsSection title="Your data">
        <SettingsCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] text-ink">Export your data</p>
              <p className="text-[12.5px] text-ink-muted">Your profile, projects, library details and every research report with its sources, evidence and claims, as one JSON file. Original files can be downloaded from the library.</p>
            </div>
            <Button variant="secondary" size="sm" leading={<Download className="size-3.5" />} loading={exporting} onClick={exportData}>
              Export
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] text-ink">Delete all research</p>
              <p className="text-[12.5px] text-ink-muted">Removes every research session and follow-up. Projects and library stay.</p>
            </div>
            <Button variant="secondary" size="sm" className="text-danger" onClick={() => open("research")}>
              Delete research
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] text-ink">Delete account</p>
              <p className="text-[12.5px] text-ink-muted">Permanently deletes your sign-in, projects you own, your library files and your research.</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => open("account")}>
              Delete account
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>

      <Dialog
        open={confirm !== null}
        onClose={() => !busy && setConfirm(null)}
        title={confirm === "account" ? "Delete your account?" : "Delete all research?"}
        description={confirm === "account" ? "Everything is deleted immediately and can't be recovered. Export your data first if you want a copy." : "This can't be undone."}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={typed !== word || (needsPassword && !password)} loading={busy} onClick={confirmDelete}>
              {confirm === "account" ? "Delete account" : "Delete research"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === word && (!needsPassword || password) && !busy) void confirmDelete();
          }}
        >
          <Field label={`Type “${word}” to confirm`}>{(p) => <Input {...p} data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}</Field>
          {needsPassword && (
            <Field label="Your password" hint="Required to confirm it's you.">
              {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
            </Field>
          )}
          {confirm === "account" && services.mode === "api" && user?.provider === "google" && <p className="text-[12.5px] text-ink-muted">You&rsquo;ll be asked to confirm with Google.</p>}
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function BillingSettings() {
  const { user } = useAuth();
  const { data: usage, error } = useResource(() => services.auth.usage(), []);
  if (!user) return null;
  const plan = PLANS.find((p) => p.id === user.plan) ?? PLANS[0];
  const reset = usage ? nextReset(usage.periodStart).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" }) : null;
  const rows = usage
    ? [
        { label: "Research runs this month", value: String(usage.researchRunsThisMonth) },
        { label: "Deep Research runs this month", value: String(usage.deepRunsThisMonth) },
        { label: "Library storage", value: formatBytes(usage.storageBytes) },
        { label: "Documents in your library", value: String(usage.documents) },
      ]
    : [];

  return (
    <SettingsPage title="Billing" description="Your plan and what you've used this month.">
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Current plan</p>
            <p className="mt-2 font-display text-[36px] leading-none text-ink">{plan.name}</p>
            <p className="mt-2 text-[13.5px] text-ink-muted">Early access — usage limits aren&rsquo;t enforced yet.{reset ? ` Monthly counts restart on ${reset}.` : ""}</p>
          </div>
          <Badge tone="sage">Active</Badge>
        </div>
        {error ? (
          <p className="mt-6 text-[13px] text-ink-muted">Usage couldn&rsquo;t be loaded right now.</p>
        ) : (
          <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {(usage ? rows : [0, 1, 2, 3].map((k) => ({ label: `…${k}`, value: "" }))).map((u) => (
              <div key={u.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-3 text-[13px]">
                <dt className="text-ink-2">{usage ? u.label : <span className="inline-block h-3 w-40 rounded bg-subtle" />}</dt>
                <dd className="text-ink tabular font-medium">{u.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <SettingsSection title="Plans" description="Paid plans aren't available yet — there's nothing to buy and no payment details are collected.">
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((p) => {
            const current = p.id === plan.id;
            return (
              <div key={p.id} className={cn("rounded-xl border p-5 flex flex-col", current ? "border-accent bg-sage-soft/40" : "border-line bg-surface")}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                  <p className="text-[13px] text-ink-muted">
                    <span className="font-display text-[24px] text-ink">${p.price}</span> {p.price ? "/ mo" : ""}
                  </p>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-muted">{p.tagline}</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2 flex-1">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="size-3.5 mt-0.5 text-accent shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <p className={cn("mt-5 text-[12.5px] font-medium", current ? "text-sage-ink" : "text-ink-muted")}>{current ? "Your current plan" : "Coming soon"}</p>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Invoices">
        <p className="text-[13.5px] text-ink-muted">No invoices — nothing has been charged.</p>
      </SettingsSection>
    </SettingsPage>
  );
}
