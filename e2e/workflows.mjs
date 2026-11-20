/**
 * Signed-in workflow suite against the real backend (audit C-03 / M-14).
 *
 * Needs: Firebase Auth emulator (npm run emulators), the backend with FIREBASE_AUTH_EMULATOR_HOST
 * set, and the frontend in API mode with NEXT_PUBLIC_FIREBASE_USE_EMULATOR=true. Creates its own
 * throwaway emulator accounts — never point it at production.
 *
 *   BASE_URL=http://localhost:3000 API_URL=http://localhost:8000 node e2e/workflows.mjs [--real-research]
 *
 * --real-research also runs one research with the backend's configured model providers.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000";
const EMU = process.env.EMULATOR_URL ?? "http://127.0.0.1:9099";
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "pramaan-ai-prod";
const PASS = "E2e-Pass-2026!";
const REAL = process.argv.includes("--real-research");
const run = Date.now().toString(36);
const results = [];
const evidence = {};

if (!/localhost|127\.0\.0\.1/.test(BASE) || !/localhost|127\.0\.0\.1/.test(API)) {
  console.error("Refusing to run against a non-local stack.");
  process.exit(2);
}

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/* ---------------------------------------------------------------- accounts */

async function emu(path, body, owner = false) {
  const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/${path}?key=e2e`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(owner ? { Authorization: "Bearer owner" } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function api(token, path, init = {}) {
  const r = await fetch(`${API}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

async function account(label, name) {
  const email = `e2e.${label}.${run}@example.com`;
  const { body } = await emu("accounts:signUp", { email, password: PASS, returnSecureToken: true });
  await emu(`projects/${PROJECT}/accounts:update`, { localId: body.localId, emailVerified: true }, true);
  const signed = await emu("accounts:signInWithPassword", { email, password: PASS, returnSecureToken: true });
  const token = signed.body.idToken;
  await api(token, "/me", { method: "PATCH", body: JSON.stringify({ displayName: name, onboarded: true }) });
  return { email, name, token, uid: body.localId };
}

/* ---------------------------------------------------------------- browser */

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

async function session(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failed = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && r.url().startsWith(API) && failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, "")}`));
  await page.goto(`${BASE}/auth/login`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASS);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  return { ctx, page, consoleErrors, failed };
}

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e) });
    console.log(`  ✗ ${name}\n      ${String(e).split("\n")[0]}`);
  }
}

const MEMO = `# Zephyr-9 Turbine Programme — Internal Trial Memo ${run}

The Zephyr-9 turbine achieved a thermal efficiency of 47.3 percent during the March 2026 trial at the Kestrel facility. The trial ran for 312 hours.

The lead engineer for the Zephyr-9 programme is Dr. Ilse Varga. The programme budget approved for 2026 is 3.2 million euros.

The main open risk is blade coating erosion of 0.4 millimetres on the first-stage blades, measured after the trial.
`;

console.log(`Pramaan workflows → ${BASE} (API ${API})`);
const alice = await account("alice", "Alice E2E");
const bob = await account("bob", "Bob E2E");

/* ---------------------------------------------------------------- tests */

await test("H-06 search finds a project this tab never loaded (server search)", async () => {
  const name = `Kestrel turbine review ${run}`;
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  await api(alice.token, "/projects", { method: "POST", body: JSON.stringify({ name, description: "e2e" }) });
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.type(`Kestrel turbine review ${run}`);
  await page.getByText(name).first().waitFor({ timeout: 8000 });
  await ctx.close();
});

await test("M-02 research defaults follow the account to another browser", async () => {
  const a = await session(alice);
  await a.page.goto(`${BASE}/settings/research`);
  await a.page.getByRole("radio", { name: /Quick/ }).click();
  await a.page.getByText("Preferences saved.").waitFor();
  await a.ctx.close();
  const b = await session(alice); // fresh browser profile: empty localStorage
  await b.page.goto(`${BASE}/settings/research`);
  await b.page.waitForFunction(() => document.querySelector('[role=radio][aria-checked=true]')?.textContent?.includes("Quick"), null, { timeout: 10000 });
  await b.ctx.close();
});

await test("M-03 owner adds a viewer by email; viewer sees it under Shared with you", async () => {
  const p = (await api(alice.token, "/projects", { method: "POST", body: JSON.stringify({ name: `Shared ${run}`, description: "" }) })).body;
  const a = await session(alice);
  await a.page.goto(`${BASE}/projects/${p.id}/settings`);
  await a.page.getByLabel("Add a member by email").fill("nobody." + run + "@example.com");
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await a.page.getByText(/No Pramaan account uses that email/).waitFor();
  await a.page.getByLabel("Add a member by email").fill(bob.email.toUpperCase());
  await a.page.getByRole("button", { name: "Add", exact: true }).click();
  await a.page.getByText("Member added.").waitFor();
  await a.page.getByRole("listitem").filter({ hasText: "Bob E2E" }).first().waitFor();
  await a.ctx.close();
  const b = await session(bob);
  await b.page.goto(`${BASE}/projects`);
  await b.page.getByRole("tab", { name: /Shared with you/ }).or(b.page.getByRole("radio", { name: /Shared with you/ })).first().click();
  await b.page.getByText(`Shared ${run}`).waitFor({ timeout: 8000 });
  await b.page.goto(`${BASE}/projects/${p.id}/settings`);
  await b.page.getByRole("button", { name: "Leave project" }).waitFor();
  await b.ctx.close();
});

let docId;
await test("L-06 duplicate upload says 'Already in your library'", async () => {
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/library`);
  await page.waitForLoadState("networkidle");
  const file = { name: `zephyr-${run}.md`, mimeType: "text/markdown", buffer: Buffer.from(MEMO) };
  // The Upload button opens an inline dropzone that stays open (the button then reads "Close").
  const upload = async (f) => {
    if (!(await page.locator("input[type=file]").count())) await page.getByRole("button", { name: "Upload", exact: true }).first().click();
    await page.locator("input[type=file]").first().setInputFiles(f);
  };
  await upload(file);
  await page.getByText(`Uploading zephyr-${run}.md`).waitFor();
  await upload({ ...file, name: `copy-${run}.md` });
  await page.getByText("Already in your library").waitFor();
  const docs = (await api(alice.token, "/library")).body;
  docId = docs.find((d) => d.filename === `zephyr-${run}.md`)?.id;
  expect(docId, "document stored");
  expect(docs.filter((d) => d.filename.includes(run)).length === 1, "stored once");
  await ctx.close();
});

await test("M-13 / L-13 deleting a document asks first and doesn't refetch it", async () => {
  const extra = new FormData();
  extra.append("file", new Blob([MEMO.replace("Zephyr-9", "Zephyr-10")], { type: "text/markdown" }), `delete-me-${run}.md`);
  const doc = (await api(alice.token, "/library/upload", { method: "POST", body: extra })).body;
  const { page, ctx, failed } = await session(alice);
  await page.goto(`${BASE}/library/${doc.id}`);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByText("Delete this document?").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await api(alice.token, `/library/${doc.id}`)).status === 200, "still there after Cancel");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/library$/);
  await page.waitForTimeout(1500);
  expect((await api(alice.token, `/library/${doc.id}`)).status === 404, "deleted");
  const refetch = failed.filter((f) => f.includes(`/library/${doc.id}`));
  expect(!refetch.length, `refetched deleted record: ${refetch.join(", ")}`);
  await ctx.close();
});

await test("Composer attachments are uploaded, indexed and used", async () => {
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/research/new`);
  await page.locator('input[type=file]').first().setInputFiles({ name: `attach-${run}.md`, mimeType: "text/markdown", buffer: Buffer.from(MEMO.replace("Internal Trial Memo", "Attached Memo")) });
  await page.getByText(`attach-${run}.md`).waitFor();
  await page.getByText("Ready", { exact: true }).waitFor({ timeout: 120000 });
  const docs = (await api(alice.token, "/library")).body;
  const attached = docs.find((d) => d.filename === `attach-${run}.md`);
  expect(attached && attached.status === "ready", "attachment stored and indexed in the library");
  evidence.attachmentWarning = attached.warning ?? null;
  await ctx.close();
  return attached.warning ? `indexed (${attached.warning.slice(0, 40)}…)` : "indexed with semantic search";
});

await test("M-15 Research again asks before starting a new job", async () => {
  const r = (await api(alice.token, "/research", { method: "POST", body: JSON.stringify({ query: `What does the Zephyr-9 memo ${run} say?`, mode: "quick", sources: ["library"] }) })).body;
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/research/${r.researchId}`);
  const before = (await api(alice.token, "/research")).body.length;
  await page.getByRole("button", { name: /Research again/ }).first().waitFor({ timeout: 180000 });
  await page.getByRole("button", { name: /Research again/ }).first().click();
  await page.getByRole("dialog").getByText("Research this question again?").waitFor();
  expect((await api(alice.token, "/research")).body.length === before, "no job started before confirming");
  await page.getByRole("dialog").getByRole("button", { name: "Edit first" }).click();
  await page.waitForURL(/\/research\/new\?q=/);
  expect((await page.locator("#composer").inputValue()).includes("Zephyr-9"), "composer prefilled");
  await ctx.close();
});

if (REAL) {
  await test("Real research over an uploaded document cites it (H-01/H-02/H-03/M-05)", async () => {
    expect(docId, "uploaded document from the L-06 step");
    for (let i = 0; i < 60 && (await api(alice.token, `/library/${docId}`)).body.status !== "ready"; i++) await new Promise((res) => setTimeout(res, 2000));
    const p = (await api(alice.token, "/projects", { method: "POST", body: JSON.stringify({ name: `Zephyr real ${run}`, description: "" }) })).body;
    await api(alice.token, `/projects/${p.id}/documents/${docId}`, { method: "POST" });
    const started = (await api(alice.token, "/research", {
      method: "POST",
      body: JSON.stringify({ query: "What thermal efficiency did the Zephyr-9 turbine reach, who is the lead engineer, and what is the main open risk?", mode: "standard", sources: ["project"], projectId: p.id }),
    })).body;
    let r;
    for (let i = 0; i < 120; i++) {
      r = (await api(alice.token, `/research/${started.researchId}`)).body;
      if (["completed", "failed"].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 3000));
    }
    expect(r.status === "completed", `research ${r.status}: ${r.errorCode ?? ""}`);
    const text = JSON.stringify(r.report);
    const words = [...(r.report.summary ?? []), ...(r.report.findings ?? []).map((f) => f.body), ...(r.report.analysis ?? []).flatMap((a) => a.paragraphs)].join(" ").split(/\s+/).length;
    evidence.realResearch = { status: r.status, words, evidence: r.evidence.length, claims: r.metrics.verifiedClaims, warnings: r.metrics.warnings ?? [], limitations: r.report.limitations };
    expect(/47\.3/.test(text) && /Varga/.test(text), "report states the efficiency and the lead engineer");
    return `${words} words, ${r.evidence.length} passages, ${r.metrics.verifiedClaims} verified claims, warnings: ${(r.metrics.warnings ?? []).join(",") || "none"}`;
  });
}

await test("H-05 export downloads the account's data", async () => {
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/settings/privacy`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile(await download.path(), "utf8"));
  expect(data.format === "pramaan-export/1" && data.profile.email === alice.email, "export profile");
  expect(data.projects.some((p) => p.name === `Shared ${run}`), "export includes projects");
  expect(data.documents.some((d) => d.filename === `zephyr-${run}.md`), "export includes documents");
  await ctx.close();
  return `${data.projects.length} projects, ${data.documents.length} documents, ${data.research.length} research`;
});

await test("H-05 billing shows the account's real usage", async () => {
  const usage = (await api(alice.token, "/me/usage")).body;
  const { page, ctx } = await session(alice);
  await page.goto(`${BASE}/settings/billing`);
  const row = page.locator("dl > div").filter({ hasText: "Documents in your library" });
  await row.waitFor();
  expect((await row.locator("dd").innerText()).trim() === String(usage.documents), "documents count matches the API");
  await ctx.close();
  return `${usage.researchRunsThisMonth} runs, ${usage.documents} documents`;
});

await test("C-01 delete account removes the sign-in and all data", async () => {
  const carol = await account("carol", "Carol E2E");
  const p = (await api(carol.token, "/projects", { method: "POST", body: JSON.stringify({ name: `Carol ${run}`, description: "" }) })).body;
  const form = new FormData();
  form.append("file", new Blob([MEMO.replace("Zephyr", "Carol")], { type: "text/markdown" }), `carol-${run}.md`);
  await api(carol.token, "/library/upload", { method: "POST", body: form });
  const { page, ctx } = await session(carol);
  await page.goto(`${BASE}/settings/privacy`);
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Type “DELETE” to confirm/).fill("DELETE");
  await dialog.getByLabel("Your password").fill("wrong-password");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await dialog.getByText("That password isn't right.").waitFor();
  expect((await api(carol.token, `/projects/${p.id}`)).status === 200, "nothing deleted after a wrong password");
  await dialog.getByLabel("Your password").fill(PASS);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
  const signIn = await emu("accounts:signInWithPassword", { email: carol.email, password: PASS, returnSecureToken: true });
  expect(signIn.status === 400 && /EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS/.test(JSON.stringify(signIn.body)), "Firebase sign-in deleted");
  // The old (still unexpired) token now maps to a brand-new, empty profile: the old project is gone.
  expect((await api(carol.token, `/projects/${p.id}`)).status === 404, "project deleted");
  expect((await api(carol.token, "/library")).body.length === 0, "library deleted");
  await api(carol.token, "/me", { method: "DELETE" }); // clean up the re-created empty profile
  await ctx.close();
});

await browser.close();
const failedTests = results.filter((r) => !r.ok);
console.log(`\n${results.length - failedTests.length} passed, ${failedTests.length} failed`);
if (process.env.E2E_REPORT) (await import("node:fs")).writeFileSync(process.env.E2E_REPORT, JSON.stringify({ at: new Date().toISOString(), results, evidence }, null, 2));
process.exit(failedTests.length ? 1 : 0);
