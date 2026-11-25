/** Upload rules — identical to the backend's (validation.py, MAX_UPLOAD_BYTES), so the UI never accepts what the server rejects (audit M-09). */
export const UPLOAD_ACCEPT = ".pdf,.docx,.txt,.md,.markdown";
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_HINT = "PDF, DOCX, TXT and Markdown · up to 20 MB";

const EXT = /\.(pdf|docx|txt|md|markdown)$/i;

export type UploadProblem = "type" | "size" | "empty";

export function uploadProblem(f: { name: string; size: number }): UploadProblem | null {
  if (!EXT.test(f.name)) return "type";
  if (f.size === 0) return "empty";
  if (f.size > UPLOAD_MAX_BYTES) return "size";
  return null;
}

export function splitUploads<F extends { name: string; size: number }>(files: F[]): { ok: F[]; rejected: { file: F; problem: UploadProblem }[] } {
  const ok: F[] = [];
  const rejected: { file: F; problem: UploadProblem }[] = [];
  for (const f of files) {
    const problem = uploadProblem(f);
    if (problem) rejected.push({ file: f, problem });
    else ok.push(f);
  }
  return { ok, rejected };
}

export function rejectionMessage(rejected: { file: { name: string }; problem: UploadProblem }[]): string {
  const why = (p: UploadProblem) => (p === "type" ? "unsupported type" : p === "size" ? "over 20 MB" : "empty file");
  const shown = rejected.slice(0, 3).map((r) => `${r.file.name} (${why(r.problem)})`);
  return `${shown.join(", ")}${rejected.length > 3 ? ` and ${rejected.length - 3} more` : ""}. Supported: ${UPLOAD_HINT}.`;
}
