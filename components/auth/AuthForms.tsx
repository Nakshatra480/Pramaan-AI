"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PramaanResearchAnimation } from "@/components/animations/PramaanResearchAnimation";
import { VerificationMark } from "@/components/animations/VerificationMark";
import { safeNext } from "@/lib/utils/redirect";
import { type FieldErrors, hasErrors, validateSignIn, validateSignUp } from "@/lib/utils/validation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { AuthError, services } from "@/lib/services";
import { authMessage } from "@/lib/firebase/types";
import { cn } from "@/lib/utils/cn";

function Heading({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.01em] text-[#1E1F1B]">{title}</h1>
      {body && <p className="mt-1.5 text-[14.5px] text-[#6A6A62]">{body}</p>}
    </div>
  );
}

/** Sign in / Create an account switcher shown above the login and signup forms. */
function AuthTabs({ active }: { active: "login" | "signup" }) {
  const tab = (key: "login" | "signup", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn("relative pb-3 text-[14.5px] transition-colors", active === key ? "text-[#1E1F1B] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[#1E1F1B]" : "text-[#65675E] hover:text-[#1E1F1B]")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Account" className="mb-8 flex gap-8 border-b border-[#E2DDD1] w-fit pr-5">
      {tab("login", "/auth/login", "Sign in")}
      {tab("signup", "/auth/signup", "Create an account")}
    </nav>
  );
}

const authInput = "h-11 rounded-[6px] border-[#E2DDD1] bg-[#FDFBF6] px-3.5 text-[14px] placeholder:text-[#A8A69C]";
const googleButton = "relative w-full h-11 rounded-[6px] border border-[#D9D4C7] bg-transparent text-[14px] font-normal text-[#1E1F1B] hover:bg-white/60";
const primaryButton = "w-full h-11 rounded-[6px] bg-[#232320] text-[14px] text-[#FBF8F1] hover:bg-[#33332F]";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="absolute left-4 top-1/2 -translate-y-1/2 size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-4 text-[13px] text-[#55554E]">
      <span className="h-px flex-1 bg-[#E2DDD1]" /> or <span className="h-px flex-1 bg-[#E2DDD1]" />
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn(authInput, "pr-12")} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center size-7 rounded text-ink-faint hover:text-ink">
        {show ? <Eye className="size-[18px]" /> : <EyeOff className="size-[18px]" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden text-[13px] text-danger">
          <span className="block rounded-lg bg-danger-soft px-3 py-2.5">{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** Redirect signed-in, verified users away from login/signup. */
/** Signed-in, verified visitors leave the auth pages — to `?next=` when it's a safe in-app path (audit M-01). */
function useRedirectIfAuthed() {
  const { user, status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated" && user?.emailVerified) router.replace(nextParam());
  }, [status, user, router]);
}

function param(name: string) {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
}

function nextParam() {
  return safeNext(param("next"));
}

/**
 * Firebase detects a closed Google popup by polling `popup.closed`, which Google's
 * Cross-Origin-Opener-Policy can break, so the promise may never settle. When focus
 * returns to this page and sign-in still hasn't finished shortly after, stop loading.
 */
function useGooglePopupRecovery(active: boolean, reset: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, 2500);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearTimeout(timer);
    };
  }, [active, reset]);
}

const CANCELLED = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"];

/** True for a Google sign-in the user dismissed — not worth an error message. */
function isCancelled(e: unknown) {
  const code = (e as { code?: string })?.code;
  return (code !== undefined && CANCELLED.includes(code)) || (e instanceof AuthError && e.message === "Google sign-in was cancelled.");
}

export function LoginForm() {
  const { signInWithEmail, signInWithGoogle, verification } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<"email" | "password">>({});
  useRedirectIfAuthed();
  const resetGoogle = useCallback(() => setLoading((l) => (l === "google" ? null : l)), []);
  useGooglePopupRecovery(loading === "google", resetGoogle);

  // Errors from the redirect fallback (popup blocked) arrive after the page reloads.
  useEffect(() => {
    const code = services.auth.takeRedirectError();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (code) setError(authMessage(code));
  }, []);

  const run = async (kind: "email" | "google") => {
    setError(undefined);
    setLoading(kind);
    try {
      if (kind === "google") await signInWithGoogle();
      else await signInWithEmail(email, password);
      router.replace(nextParam());
    } catch (e) {
      if (!isCancelled(e)) setError(e instanceof AuthError ? e.message : "Something went wrong. Please try again.");
      setLoading(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <AuthTabs active="login" />
      <Heading title="Welcome back." body="Continue your research with Pramaan." />
      <Button variant="secondary" size="lg" className={googleButton} leading={<GoogleIcon />} loading={loading === "google"} disabled={loading !== null} onClick={() => run("google")}>
        Continue with Google
      </Button>
      <Divider />
      <form
        noValidate
        className="space-y-4 [&_label]:text-[13.5px] [&_label]:font-normal [&_label]:text-[#1E1F1B] "
        onSubmit={(e) => {
          e.preventDefault();
          const errs = validateSignIn({ email, password });
          setFieldErrors(errs);
          if (!hasErrors(errs)) void run("email");
        }}
      >
        <Field label="Email" error={fieldErrors.email}>
          {(p) => <Input {...p} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={authInput} />}
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          {(p) => <PasswordInput {...p} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />}
        </Field>
        <FormError message={error} />
        <div className="pt-1.5">
          <Button type="submit" size="lg" className={primaryButton} trailing={<ArrowRight className="size-4" />} loading={loading === "email"} disabled={loading !== null}>
            Sign in
          </Button>
          <div className="mt-4 text-right">
            <Link href="/auth/forgot-password" className="text-[13.5px] text-[#1E1F1B] underline underline-offset-4 decoration-[#1E1F1B]/60 hover:decoration-[#1E1F1B]">
              Forgot password?
            </Link>
          </div>
        </div>
      </form>
      {verification === "code" && (
        <p className="mt-8 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] text-ink-faint">Preview build: authentication is simulated. Any email with a 6+ character password signs you in.</p>
      )}
    </motion.div>
  );
}

export function SignupForm() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<"name" | "email" | "password">>({});
  useRedirectIfAuthed();
  const resetGoogle = useCallback(() => setLoading((l) => (l === "google" ? null : l)), []);
  useGooglePopupRecovery(loading === "google", resetGoogle);
  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password) ? 3 : 2;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <AuthTabs active="signup" />
      <Heading title="Create your account." body="Start researching with evidence in under a minute." />
      <Button
        variant="secondary"
        size="lg"
        className={googleButton}
        leading={<GoogleIcon />}
        loading={loading === "google"}
        disabled={loading !== null}
        onClick={async () => {
          setError(undefined);
          setLoading("google");
          try {
            await signInWithGoogle();
            router.replace(nextParam());
          } catch (err) {
            if (!isCancelled(err)) setError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
            setLoading(null);
          }
        }}
      >
        Continue with Google
      </Button>
      <Divider />
      <form
        noValidate
        className="space-y-4 [&_label]:text-[13.5px] [&_label]:font-normal [&_label]:text-[#1E1F1B] "
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          const errs = validateSignUp({ name, email, password });
          setFieldErrors(errs);
          if (hasErrors(errs)) return;
          setLoading("email");
          try {
            await signUp(name.trim(), email.trim(), password);
            router.replace("/auth/verify");
          } catch (err) {
            setError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
            setLoading(null);
          }
        }}
      >
        <Field label="Name" error={fieldErrors.name}>
          {(p) => <Input {...p} required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className={authInput} />}
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          {(p) => <Input {...p} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className={authInput} />}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={fieldErrors.password}>
          {(p) => (
            <div>
              <PasswordInput {...p} required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
              <div className="mt-2 flex gap-1" aria-hidden>
                {[1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", strength >= i ? (strength === 1 ? "bg-warn" : "bg-accent") : "bg-muted")} />
                ))}
              </div>
            </div>
          )}
        </Field>
        <FormError message={error} />
        <Button type="submit" size="lg" className={primaryButton} trailing={<ArrowRight className="size-4" />} loading={loading === "email"} disabled={loading !== null}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-muted">
        Read how Pramaan handles your data in the{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          privacy notice
        </Link>
        .
      </p>
    </motion.div>
  );
}

export function VerifyForm() {
  const { verification } = useAuth();
  return verification === "link" ? <VerifyLinkForm /> : <VerifyCodeForm />;
}

/** Firebase: the user clicks an emailed link, which returns here with ?mode=verifyEmail&oobCode=… */
function VerifyLinkForm() {
  const { user, status, verifyEmail, sendVerificationEmail } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const applied = useRef(false);

  const check = async (code?: string | null) => {
    setLoading(true);
    setError(undefined);
    try {
      await verifyEmail(code);
      setDone(true);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "We couldn't verify your email.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const code = param("oobCode");
    // Firebase uses one action URL for all email links; route password resets onward.
    if (param("mode") === "resetPassword" && code) {
      router.replace(`/auth/reset-password?oobCode=${encodeURIComponent(code)}`);
      return;
    }
    if (param("mode") === "verifyEmail" && code && !applied.current) {
      applied.current = true;
      void check(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firebase's hosted handler verifies the email in another tab; re-check when the user returns.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "visible" && !done && !loading) void verifyEmail(null).then(() => setDone(true), () => undefined);
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [done, loading, verifyEmail]);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => router.replace("/onboarding"), 1400);
      return () => clearTimeout(t);
    }
  }, [done, router]);

  useEffect(() => {
    if (status === "unauthenticated" && !param("oobCode")) router.replace("/auth/login");
    if (user?.emailVerified && !done) router.replace(user.onboarded ? "/app" : "/onboarding");
  }, [status, user, router, done]);

  if (done)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <div className="flex justify-center">
          <PramaanResearchAnimation complete size={140} />
        </div>
        <h1 className="mt-6 font-display text-[36px] text-ink">Email verified.</h1>
        <p className="mt-2 text-[14.5px] text-ink-muted">Setting up your workspace…</p>
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="grid place-items-center size-12 rounded-xl border border-line bg-surface text-ink-muted mb-6">
        <Mail className="size-5" />
      </span>
      <Heading title="Check your email." body={<>We sent a verification link to <span className="text-ink">{user?.email ?? "your email"}</span>. Open it, then come back here.</>} />
      <FormError message={error} />
      <Button size="lg" className="w-full mt-4" loading={loading} onClick={() => void check()}>
        I&rsquo;ve verified my email
      </Button>
      <p className="mt-6 text-[13.5px] text-ink-muted">
        Didn&rsquo;t get it?{" "}
        <button
          type="button"
          className="text-ink font-medium hover:underline underline-offset-4"
          onClick={async () => {
            try {
              await sendVerificationEmail();
              toast({ title: "Verification email sent." });
            } catch (e) {
              toast({ title: e instanceof AuthError ? e.message : "Couldn't send the email.", tone: "error" });
            }
          }}
        >
          Resend link
        </button>
      </p>
    </motion.div>
  );
}

function VerifyCodeForm() {
  const { user, status, verifyEmail, sendVerificationEmail } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signup");
    if (user?.emailVerified && !done) router.replace(user.onboarded ? "/app" : "/onboarding");
  }, [status, user, router, done]);

  const submit = async (code: string) => {
    setLoading(true);
    setError(undefined);
    try {
      await verifyEmail(code);
      setDone(true);
      setTimeout(() => router.replace("/onboarding"), 1400);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : "That code didn't work.");
      setLoading(false);
    }
  };

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = [...digits];
      clean.slice(0, 6 - i).split("").forEach((c, j) => (next[i + j] = c));
      setDigits(next);
      refs.current[Math.min(5, i + clean.length)]?.focus();
      if (next.every(Boolean)) void submit(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void submit(next.join(""));
  };

  if (done)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <div className="flex justify-center">
          <PramaanResearchAnimation complete size={140} />
        </div>
        <h1 className="mt-6 font-display text-[36px] text-ink">Email verified.</h1>
        <p className="mt-2 text-[14.5px] text-ink-muted">Setting up your workspace…</p>
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="grid place-items-center size-12 rounded-xl border border-line bg-surface text-ink-muted mb-6">
        <Mail className="size-5" />
      </span>
      <Heading title="Check your email." body={<>We sent a 6-digit code to <span className="text-ink">{user?.email ?? "your email"}</span>.</>} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(digits.join(""));
        }}
      >
        <fieldset>
          <legend className="sr-only">Verification code</legend>
          <div className="flex gap-2 justify-between">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                autoFocus={i === 0}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1}`}
                maxLength={6}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
                }}
                className={cn("w-full aspect-[5/6] max-w-[54px] rounded-lg border bg-raised text-center font-display text-[28px] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-4 focus:ring-sage/50", error ? "border-danger" : "border-line")}
              />
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <FormError message={error} />
        </div>
        <Button type="submit" size="lg" className="w-full mt-4" loading={loading} disabled={digits.some((x) => !x)}>
          Verify email
        </Button>
      </form>
      <p className="mt-6 text-[13.5px] text-ink-muted">
        Didn&rsquo;t get it?{" "}
        <button
          type="button"
          className="text-ink font-medium hover:underline underline-offset-4"
          onClick={async () => {
            await sendVerificationEmail();
            toast({ title: "Verification email sent." });
          }}
        >
          Resend code
        </button>
      </p>
      <p className="mt-8 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[12px] text-ink-faint">Preview build: enter any 6 digits.</p>
    </motion.div>
  );
}

export function ForgotPasswordForm() {
  const { sendPasswordReset, verification } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <AnimatePresence mode="wait">
      {sent ? (
        <motion.div key="sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <VerificationMark size={40} />
          <Heading title="Check your inbox." body={<>If an account exists for <span className="text-ink">{email}</span>, you&rsquo;ll receive a link to reset your password.</>} />
          <div className="flex flex-col gap-2">
            {verification === "code" && (
              <ButtonLink href="/auth/reset-password" size="lg">
                Open reset link
              </ButtonLink>
            )}
            <ButtonLink href="/auth/login" variant={verification === "code" ? "ghost" : "primary"} leading={<ArrowLeft className="size-4" />}>
              Back to sign in
            </ButtonLink>
          </div>
          {verification === "code" && <p className="mt-6 text-[12px] text-ink-faint">Preview build: the button above stands in for the emailed link.</p>}
        </motion.div>
      ) : (
        <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          <Heading title="Reset your password." body="Enter your email and we'll send you a reset link." />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                await sendPasswordReset(email);
                setSent(true);
              } catch (err) {
                setError(err instanceof AuthError ? err.message : "Couldn't send the reset email.");
              } finally {
                setLoading(false);
              }
            }}
          >
            <Field label="Email">{(p) => <Input {...p} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <FormError message={error} />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
          <Link href="/auth/login" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Back to sign in
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ResetPasswordForm() {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <VerificationMark size={40} />
        <Heading title="Password updated." body="You can now sign in with your new password." />
        <ButtonLink href="/auth/login" size="lg" className="w-full">
          Sign in
        </ButtonLink>
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Heading title="Choose a new password." />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) {
            setError("Passwords don't match.");
            return;
          }
          setError(undefined);
          setLoading(true);
          try {
            await resetPassword(password, param("oobCode"));
            setDone(true);
          } catch (err) {
            setError(err instanceof AuthError ? err.message : "Couldn't reset password.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field label="New password" hint="At least 8 characters.">
          {(p) => <PasswordInput {...p} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm password">{(p) => <PasswordInput {...p} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
    </motion.div>
  );
}
