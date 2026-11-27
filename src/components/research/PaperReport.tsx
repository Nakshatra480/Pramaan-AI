import { ExternalLink } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { renderDiagram } from "@/lib/diagrams";
import { cn } from "@/lib/utils/cn";
import { paperParts, visualNumbers } from "@/lib/paper";
import type { ReportBlock, ResearchReport } from "@/types";
import { Citation } from "./Citation";
import { EmbeddedCtx, EvidenceSection, Section, SourcesSection } from "./ReportParts";
import { RichText } from "./RichText";

export function PaperBody({ report }: { report: ResearchReport }) {
  const embedded = useContext(EmbeddedCtx);
  const parts = paperParts(report);
  const labels = visualNumbers(parts);
  return (
    <>
      <Section id="abstract" title="Abstract" index={0}>
        <div className="rounded-xl border border-line bg-surface/70 px-5 py-5 sm:px-7 sm:py-6">
          <div className="prose-report [&_p]:text-[15.5px]">
            {report.summary.map((p, i) => (
              <p key={i}>
                <RichText text={p} />
              </p>
            ))}
          </div>
        </div>
      </Section>

      {parts.map((part, i) => (
        <Section
          key={part.id}
          id={part.id}
          index={i + 1}
          title={
            <>
              <span className="mr-3 align-[0.12em] font-sans text-[0.62em] font-medium text-ink-faint tabular">{part.number}</span>
              {part.heading}
            </>
          }
        >
          {part.limitations ? (
            <ul className="space-y-2.5 prose-report">
              {part.limitations.map((l, j) => (
                <li key={j} className="flex gap-3 text-[15.5px] leading-relaxed text-ink-2">
                  <span className="mt-[11px] size-1 rounded-full bg-ink-faint shrink-0" aria-hidden />
                  <span>
                    <RichText text={l} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-7">
              {part.blocks.map((b, j) => (
                <Block key={j} block={b} label={labels.get(b)} />
              ))}
            </div>
          )}
        </Section>
      ))}

      <EvidenceSection index={parts.length + 1} title="Appendix: Claim verification" collapsible />
      <SourcesSection index={parts.length + 2} title="References" />
      {embedded ? null : <span className="sr-only">End of paper.</span>}
    </>
  );
}

function Block({ block, label }: { block: ReportBlock; label?: string }) {
  switch (block.type) {
    case "paragraph":
      return (
        <div className="prose-report">
          <p>
            <RichText text={block.text} />
          </p>
        </div>
      );
    case "list":
      return (
        <ul className="prose-report list-disc pl-6 space-y-1.5 marker:text-ink-faint">
          {block.items.map((item, i) => (
            <li key={i} className="text-[15.5px] leading-relaxed text-ink-2">
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return <PaperTable block={block} label={label} />;
    case "diagram":
      return <PaperDiagram block={block} label={label} />;
    case "figure":
      return <PaperFigure block={block} label={label} />;
  }
}

function Caption({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <figcaption className={cn("text-[13.5px] leading-relaxed text-ink-muted", className)}>
      {label && <span className="font-semibold text-ink-2">{label}.</span>} {children}
    </figcaption>
  );
}

function PaperTable({ block, label }: { block: Extract<ReportBlock, { type: "table" }>; label?: string }) {
  return (
    <figure className="break-inside-avoid">
      <Caption label={label} className="mb-2.5">
        <RichText text={block.caption} />
      </Caption>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-left text-[13.5px] leading-snug">
          <thead className="bg-subtle/80">
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} scope="col" className="px-3.5 py-2.5 font-semibold text-ink border-b border-line whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-b-0 even:bg-surface/50">
                {row.map((cell, j) => (
                  <td key={j} className={cn("px-3.5 py-2.5 align-top text-ink-2", j === 0 && "font-medium text-ink")}>
                    <RichText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function PaperDiagram({ block, label }: { block: Extract<ReportBlock, { type: "diagram" }>; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    renderDiagram(block.code)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [block.code]);
  if (failed) return null; // a diagram that can't be drawn is left out rather than shown broken
  return (
    <figure className="break-inside-avoid">
      <div className="rounded-xl border border-line bg-white px-4 py-5 sm:px-6">
        {svg ? (
          // Mermaid output (securityLevel "strict") of server-generated code.
          <div
            role="img"
            aria-label={label ? `${label}: ${block.caption.replace(/\s?\[\d+\]/g, "")}` : undefined}
            className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="h-40 animate-pulse rounded-lg bg-subtle/60" aria-hidden />
        )}
      </div>
      <Caption label={label} className="mt-2.5">
        <RichText text={block.caption} />
      </Caption>
    </figure>
  );
}

function PaperFigure({ block, label }: { block: Extract<ReportBlock, { type: "figure" }>; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null; // an image that no longer loads is left out
  return (
    <figure className="break-inside-avoid">
      <div className="overflow-hidden rounded-xl border border-line bg-subtle/50">
        <img
          src={block.url}
          alt={block.caption}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="mx-auto block max-h-[440px] w-auto max-w-full object-contain"
        />
      </div>
      <Caption label={label} className="mt-2.5">
        {block.caption}
        {block.caption && !/[.!?]$/.test(block.caption) ? "." : ""}{" "}
        <span className="text-ink-faint">
          Source:{" "}
          {block.sourceUrl ? (
            <a
              href={block.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-2 hover:text-ink"
            >
              {block.credit || new URL(block.sourceUrl).hostname}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            block.credit
          )}
          {block.sourceIndex ? <Citation index={block.sourceIndex} /> : null}
        </span>
      </Caption>
    </figure>
  );
}
