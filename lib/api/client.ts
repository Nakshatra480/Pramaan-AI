/**
 * Central API client.
 * 1. obtains the current Firebase ID token (Firebase handles caching/refresh)
 * 2. attaches `Authorization: Bearer <token>` (+ App Check when configured)
 * 3. on 401, force-refreshes the token once and retries; if still 401, signs out
 * 4. parses the backend error envelope into ApiError
 */
import { appCheckToken } from "@/lib/firebase/app-check";
import { firebase } from "@/lib/firebase/auth";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Body;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
}

let onUnauthenticated: () => void = () => {};
/** Registered by the auth adapter: called when the session can't be recovered. */
export function setUnauthenticatedHandler(fn: () => void) {
  onUnauthenticated = fn;
}

function url(path: string, query?: RequestOptions["query"]) {
  const u = new URL(`${API_URL}/api/v1${path}`);
  Object.entries(query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && u.searchParams.set(k, String(v)));
  return u.toString();
}

async function headers(auth: boolean, forceRefresh: boolean, json: boolean): Promise<Headers> {
  const h = new Headers({ Accept: "application/json" });
  if (json) h.set("Content-Type", "application/json");
  if (auth) {
    const token = await firebase.idToken(forceRefresh);
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    h.set("Authorization", `Bearer ${token}`);
    const ac = await appCheckToken();
    if (ac) h.set("X-Firebase-AppCheck", ac);
  }
  return h;
}

const FIELD_LABELS: Record<string, string> = { query: "Question", question: "Question", name: "Name", title: "Title", url: "Website address", email: "Email" };

/** "Question: Use at most 2,000 characters." from FastAPI/Pydantic details (audit M-07). */
export function validationMessage(details: { field?: string; message?: string }[]): string {
  const d = details[0]!;
  const field = (d.field ?? "").split(".").pop() ?? "";
  const label = FIELD_LABELS[field] ?? (field ? field[0]!.toUpperCase() + field.slice(1) : "");
  const msg = (d.message ?? "is invalid")
    .replace(/^String should have at most (\d+) characters?$/, (_, n) => `Use at most ${Number(n).toLocaleString("en")} characters.`)
    .replace(/^String should have at least (\d+) characters?$/, (_, n) => `Use at least ${n} characters.`)
    .replace(/^Value error, /, "");
  return label ? `${label}: ${msg}` : msg;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as {
      error?: { code?: string; message?: string; request_id?: string; requestId?: string; details?: { field?: string; message?: string }[] };
    };
    const message = error?.code === "VALIDATION_FAILED" && error.details?.length ? validationMessage(error.details) : (error?.message ?? "Something went wrong.");
    return new ApiError(res.status, error?.code ?? "HTTP_ERROR", message, error?.request_id ?? error?.requestId);
  } catch {
    return new ApiError(res.status, "HTTP_ERROR", res.status >= 500 ? "Pramaan is having trouble right now. Please try again." : "Something went wrong.");
  }
}

async function send(path: string, opts: RequestOptions, forceRefresh: boolean): Promise<Response> {
  const isForm = opts.body instanceof FormData;
  try {
    return await fetch(url(path, opts.query), {
      method: opts.method ?? "GET",
      headers: await headers(opts.auth !== false, forceRefresh, opts.body !== undefined && !isForm),
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    if (process.env.NODE_ENV !== "production") {
      // Dev diagnostic: never includes tokens — only the target and the browser's reason.
      console.warn(`[pramaan/api] ${opts.method ?? "GET"} ${API_URL}/api/v1${path} failed before a response: ${(e as Error).message}. Is the backend running and does CORS_ORIGINS include ${typeof window !== "undefined" ? window.location.origin : "this origin"}?`);
    }
    throw new ApiError(0, "NETWORK", "You appear to be offline, or Pramaan can't be reached.");
  }
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts, false);
  // Rate limited: honour Retry-After (bounded) and retry up to twice.
  for (let attempt = 0; res.status === 429 && attempt < 2; attempt++) {
    const wait = Math.min(5, Number(res.headers.get("Retry-After")) || 2) * 1000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, wait));
    res = await send(path, opts, false);
  }
  // A 403 EMAIL_NOT_VERIFIED right after verification means the cached token predates it: refresh once.
  if (res.status === 403 && opts.auth !== false && (await res.clone().json().catch(() => null))?.error?.code === "EMAIL_NOT_VERIFIED") {
    res = await send(path, opts, true);
  }
  if (res.status === 401 && opts.auth !== false) {
    res = await send(path, opts, true);
    if (res.status === 401) {
      onUnauthenticated();
      throw await toError(res);
    }
  }
  if (!res.ok) throw await toError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Authenticated binary download (original files). Returns the blob and the server-provided filename. */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  let res = await send(path, {}, false);
  if (res.status === 401) res = await send(path, {}, true);
  if (!res.ok) throw await toError(res);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  const plain = /filename="([^"]+)"/i.exec(cd)?.[1];
  return { blob: await res.blob(), filename: star ? decodeURIComponent(star) : plain || "document" };
}

/**
 * Server-Sent Events over fetch (EventSource can't send Authorization headers).
 * Reconnects with backoff, fetching a fresh token each time. Returns an unsubscribe function.
 */
export function apiStream(path: string, onEvent: (type: string, data: unknown) => void, onEnd?: () => void): () => void {
  const controller = new AbortController();
  let attempt = 0;

  const run = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        const res = await send(path, { signal: controller.signal }, attempt > 0);
        if (!res.ok || !res.body) {
          if (res.status === 401 || res.status === 404) return onEnd?.();
          throw new Error(`stream ${res.status}`);
        }
        attempt = 0;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let type = "message";
            const data: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) type = line.slice(7);
              else if (line.startsWith("data: ")) data.push(line.slice(6));
            }
            if (data.length) onEvent(type, JSON.parse(data.join("\n")));
          }
        }
        return onEnd?.(); // server closes the stream after a terminal event
      } catch (e) {
        if (controller.signal.aborted || (e as Error).name === "AbortError") return;
        attempt += 1;
        await new Promise((r) => setTimeout(r, Math.min(15000, 1000 * 2 ** attempt)));
      }
    }
  };
  void run();
  return () => controller.abort();
}
