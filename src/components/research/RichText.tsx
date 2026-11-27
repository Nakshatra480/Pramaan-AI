import { Fragment, useState, type ReactNode } from "react";
import { parseRichText } from "@/lib/utils/citations";
import { Citation } from "./Citation";

/**
 * Renders report text, turning `[n]` markers into interactive citations. A citation never wraps away from
 * its text: the word before it, the citation(s) and any punctuation right after stay on one line.
 */
export function RichText({ text }: { text: string }) {
  const segs = parseRichText(text);
  const out: ReactNode[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    if (seg.type === "text") {
      const next = segs[i + 1];
      if (next?.type === "cite") {
        const m = /^([\s\S]*?)(\S*)$/.exec(seg.value)!; // the last word joins the citation group
        if (m[1]) out.push(<Fragment key={`t${i}`}>{m[1]}</Fragment>);
        i = group(segs, i + 1, m[2], out);
        continue;
      }
      out.push(<Fragment key={`t${i}`}>{seg.value}</Fragment>);
      i++;
      continue;
    }
    i = group(segs, i, "", out);
  }
  return <>{out}</>;
}

/** Pushes "word[1][2]." as one unbreakable group starting at segs[start] (a citation); returns the next index. */
function group(segs: ReturnType<typeof parseRichText>, start: number, word: string, out: ReactNode[]): number {
  const cites: ReactNode[] = [];
  let i = start;
  for (;;) {
    const s = segs[i];
    if (s?.type === "cite") cites.push(<Citation key={`c${i}`} index={s.index} />);
    else if (!(s?.type === "text" && !s.value.trim() && segs[i + 1]?.type === "cite")) break; // only spaces between citations
    i++;
  }
  let tail = "";
  const after = segs[i];
  if (after?.type === "text") {
    const m = /^[.,;:!?)\]”’"'…]+/.exec(after.value);
    if (m) {
      tail = m[0];
      segs[i] = { type: "text", value: after.value.slice(tail.length) }; // the rest of the text renders as usual
    }
  }
  out.push(
    <span key={`g${start}`} className="whitespace-nowrap">
      {word}
      {cites.length > MAX_SHOWN + 1 ? <CitationRun cites={cites} /> : cites}
      {tail}
    </span>,
  );
  return i;
}

/** Citations shown before a long run collapses behind "+N" (printed copies always show every one). */
const MAX_SHOWN = 3;

function CitationRun({ cites }: { cites: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const more = cites.length - MAX_SHOWN;
  return (
    <>
      {cites.slice(0, MAX_SHOWN)}
      <span className={open ? "inline" : "hidden print:inline"}>{cites.slice(MAX_SHOWN)}</span>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Show ${more} more sources`}
          className="print:hidden mx-[1px] relative -top-[0.3em] inline-grid place-items-center h-[18px] px-1 rounded-[5px] border border-line text-[10.5px] font-semibold font-sans text-ink-muted tabular leading-none align-baseline hover:text-ink hover:border-line-strong"
        >
          +{more}
        </button>
      )}
    </>
  );
}
