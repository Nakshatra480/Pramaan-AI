/**
 * End-to-end smoke suite (audit M-14). Drives a running Pramaan frontend with Playwright.
 *
 *   BASE_URL=http://localhost:3000 node e2e/smoke.mjs
 *
 * Works against a demo build (VITE_DATA_SOURCE=mock — no backend or secrets needed, used in CI).
 * Set PW_CHANNEL=chrome to use a locally installed Chrome instead of Playwright's Chromium.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];

async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn(page, ctx);
    if (errors.length) throw new Error(`Uncaught page errors: ${errors.join(" | ")}`);
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e) });
    console.log(`  ✗ ${name}\n      ${String(e).split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function signIn(page, next = "") {
  await page.goto(`${BASE}/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email").fill("e2e.user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
console.log(`Pramaan e2e smoke → ${BASE}`);

await test("security headers are sent (M-11)", async (page) => {
  const res = await page.goto(`${BASE}/`);
  const h = res.headers();
  expect(h["content-security-policy"]?.includes("frame-ancestors 'none'"), "CSP with frame-ancestors");
  expect(h["x-frame-options"] === "DENY", "X-Frame-Options");
  expect(h["x-content-type-options"] === "nosniff", "nosniff");
  expect(!h["x-powered-by"], "no X-Powered-By");
});

await test("pricing does not sell plans that can't be bought (H-05)", async (page) => {
  await page.goto(`${BASE}/pricing`);
  await page.getByText("Coming soon").first().waitFor(); // client-rendered: wait for the page, not just the HTML
  expect((await page.getByText("Coming soon").count()) >= 3, "paid plans marked Coming soon");
  expect((await page.getByRole("link", { name: /Choose (Personal|Pro|Team)/ }).count()) === 0, "no Choose <paid plan> links");
});

await test("privacy notice exists and is linked from sign-up (L-05); /about is gone (L-11)", async (page) => {
  await page.goto(`${BASE}/auth/signup`);
  await page.getByRole("link", { name: "privacy notice" }).click();
  await page.waitForURL(/\/privacy$/);
  expect(await page.getByRole("heading", { level: 1, name: /How Pramaan handles your data/ }).isVisible(), "privacy heading");
  const about = await page.goto(`${BASE}/about`);
  expect(about.status() === 404, `/about should 404, got ${about.status()}`);
  await page.getByText("There's no evidence of this page.").waitFor({ timeout: 10000 });
});

await test("sign-up shows styled field errors, not browser bubbles (L-04)", async (page) => {
  await page.goto(`${BASE}/auth/signup`);
  await page.getByRole("button", { name: "Create account" }).click();
  expect(await page.getByText("Enter your name.").isVisible(), "name error");
  expect(await page.getByText("Enter your email address.").isVisible(), "email error");
  expect((await page.getByLabel("Name").getAttribute("aria-invalid")) === "true", "aria-invalid");
});

await test("sign-in honours ?next= (M-01)", async (page) => {
  await signIn(page, "/library");
  await page.waitForURL(/\/library$/, { timeout: 15000 });
});

await test("settings fit a 768 px tablet without sideways scrolling (M-08)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of ["/settings/research", "/settings/privacy", "/settings/billing"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 0, `${path} overflows by ${overflow}px`);
  }
});

await test("billing shows real usage and no fake plan switching (H-05, L-10)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.goto(`${BASE}/settings/billing`);
  await page.getByText("Research runs this month", { exact: true }).waitFor();
  expect((await page.getByText(/resets on 1 October/).count()) === 0, "no hardcoded reset date");
  expect((await page.getByRole("button", { name: /Upgrade to|Switch to/ }).count()) === 0, "no upgrade buttons");
});

await test("AI settings no longer offer fake providers or a fake connection test (H-05, L-14)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.goto(`${BASE}/settings/ai`);
  await page.getByText("Managed by Pramaan").waitFor();
  const text = await page.textContent("main");
  expect(!/Ollama|Test connection|localhost:11434/i.test(text ?? ""), "no Ollama / test connection");
});

await test("search returns results (H-06)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.keyboard.type("settings");
  await page.getByText("Appearance").first().waitFor({ timeout: 5000 });
});

await test("composer enforces the question length limit (M-07)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.goto(`${BASE}/research/new`);
  await page.locator("#composer").fill("x".repeat(2100));
  expect(await page.getByText("2,100 / 2,000").isVisible(), "counter shown");
  expect(await page.getByRole("button", { name: /Research/ }).last().isDisabled(), "submit disabled over the limit");
});

await test("typing in a dialog's second field keeps focus there (focus-trap regression)", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.goto(`${BASE}/projects`);
  await page.getByRole("button", { name: /New project/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").pressSequentially("Nakshatra");
  await dialog.getByLabel("Description").click();
  await page.keyboard.type("Just testing the description");
  expect((await dialog.getByLabel("Description").inputValue()) === "Just testing the description", "description received the typing");
  expect((await dialog.getByLabel("Project name").inputValue()) === "Nakshatra", "name unchanged");
  expect(await dialog.getByLabel("Description").evaluate((el) => el === document.activeElement), "focus stayed in Description");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
});

await test("no custom keyboard shortcuts remain", async (page) => {
  await signIn(page);
  await page.waitForURL(/\/(app|research|onboarding)/, { timeout: 15000 });
  await page.goto(`${BASE}/history`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  for (const combo of ["Meta+K", "Control+K", "Meta+N", "Meta+B", "Meta+/", "Control+/"]) await page.keyboard.press(combo);
  await page.waitForTimeout(400);
  expect((await page.getByRole("dialog").count()) === 0, "no dialog opened by a shortcut");
  expect(page.url() === url, "no navigation from a shortcut");
  expect((await page.getByText("Keyboard shortcuts").count()) === 0, "no shortcuts entry");
});

/** Stand-ins for the browser speech engines (headless Chrome has no voices or microphone). */
const fakeSpeech = () => {
  window.__spoken = [];
  const synth = {
    getVoices: () => [{ name: "Test Voice", lang: "en-US", voiceURI: "test", localService: true }],
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      window.__spoken.push(u.text);
      this.u = u;
      this.t = setTimeout(() => u.onend?.(), 80);
    },
    cancel() {
      clearTimeout(this.t);
      this.u?.onerror?.({ error: "interrupted" });
      this.u = null;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text;
  };
  const Recognition = class {
    start() {
      setTimeout(() => {
        this.onstart?.();
        setTimeout(() => this.onresult?.({ results: [{ 0: { transcript: "how do heat pumps perform in cold climates" }, isFinal: true }] }), 150);
      }, 20);
    }
    stop() {
      setTimeout(() => this.onend?.(), 10);
    }
    abort() {
      this.onend?.();
    }
  };
  window.SpeechRecognition = Recognition;
  window.webkitSpeechRecognition = Recognition;
};

await test("voice input dictates into the research composer", async (page, ctx) => {
  await ctx.addInitScript(fakeSpeech);
  await signIn(page, "/research/new");
  await page.waitForURL(/\/research\/new/, { timeout: 15000 });
  await page.getByLabel("Research question").fill("Context first.");
  await page.getByRole("button", { name: "Ask with your voice" }).click();
  await page.getByRole("button", { name: "Stop voice input" }).waitFor();
  await page.waitForFunction(() => document.querySelector("#composer").value.includes("heat pumps"));
  expect((await page.getByLabel("Research question").inputValue()) === "Context first. How do heat pumps perform in cold climates", "dictation appended to typed text");
  await page.getByRole("button", { name: "Stop voice input" }).click();
  await page.getByRole("button", { name: "Ask with your voice" }).waitFor();
});

await test("Listen narrates the report beside Share and Export", async (page, ctx) => {
  await ctx.addInitScript(fakeSpeech);
  await signIn(page, "/research/r-glp1-cardio");
  const listen = page.getByRole("button", { name: /Listen to this report/ });
  await listen.waitFor({ timeout: 15000 });
  const tops = await page.evaluate(() => ["Share", "Export", "Research again"].map((n) => document.querySelector(`[aria-label="${n}"]`).getBoundingClientRect().top));
  const listenTop = (await listen.boundingBox()).y;
  expect(tops.every((t) => Math.abs(t - listenTop) < 6), "Listen sits on the Share / Export / Research again row");
  await listen.click();
  await page.getByRole("region", { name: "Report narration" }).waitFor();
  await page.waitForFunction(() => window.__spoken.length >= 3);
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken[0].startsWith("GLP-1"), "starts with the report title");
  expect(!spoken.some((t) => /\[\d+\]/.test(t)), "citation markers are not read aloud");
  await page.getByRole("button", { name: "Pause narration" }).click();
  const n = await page.evaluate(() => window.__spoken.length);
  await page.waitForTimeout(400);
  expect(n === (await page.evaluate(() => window.__spoken.length)), "pause stops speech");
  await page.getByRole("button", { name: "Stop narration" }).click();
  expect((await page.getByRole("region", { name: "Report narration" }).count()) === 0, "player closes");
});

await test("follow-ups: questions get a sourced answer, change requests a separate revised report", async (page) => {
  await signIn(page, "/research/r-glp1-cardio");
  await page.getByLabel("Follow-up question").waitFor({ timeout: 15000 });
  const original = await page.locator("#summary").innerText();
  await page.getByLabel("Follow-up question").fill("Which trial showed the biggest reduction?");
  await page.getByLabel("Ask follow-up").click();
  await page.getByText("Sources for this answer").waitFor({ timeout: 15000 });
  await page.getByLabel("Follow-up question").fill("Make the report shorter and simpler");
  await page.getByLabel("Ask follow-up").click();
  await page.getByText(/Regenerating the report with your changes/).first().waitFor({ timeout: 15000 });
  await page.getByText("Revised report", { exact: true }).waitFor({ timeout: 90000 });
  expect((await page.locator("#summary").innerText()) === original, "original report unchanged");
  expect((await page.locator('[id^="rev-"][id$="-summary"]').count()) === 1, "revised report shown under the follow-up");
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
