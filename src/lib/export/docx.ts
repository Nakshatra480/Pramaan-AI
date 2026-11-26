/**
 * Word export: a real .docx (Office Open XML) with document styles, so it opens cleanly in Word, Google Docs,
 * Pages and LibreOffice. The `docx` library is loaded only when someone exports.
 */
import type { ExportDocument, Inline } from "./document";

const C = { ink: "1C1D1A", ink2: "3A3C36", muted: "686A62", faint: "8A8C83", line: "E7E4D6", accent: "3F5443", accentSoft: "EEF3EC", warm: "FAF8F2" };
const SERIF = "Georgia";
const SANS = "Arial"; // installed with Windows, macOS and Google Docs, so the document looks the same everywhere

export async function toDocx(d: ExportDocument): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    Footer,
    Header,
    HeadingLevel,
    InternalHyperlink,
    Bookmark,
    LevelFormat,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    TabStopType,
    TextRun,
    UnderlineType,
  } = await import("docx");

  const numeric = d.style === "numeric";
  const runs = (list: Inline[]) =>
    list.map((r) => {
      if (r.kind === "text") return new TextRun({ text: r.text });
      if (numeric) {
        return new InternalHyperlink({
          anchor: `src-${r.numbers[0]}`,
          children: [new TextRun({ text: r.label, superScript: true, color: C.accent, bold: true, underline: { type: UnderlineType.NONE } })],
        });
      }
      return new TextRun({ text: ` (${r.label})`, color: C.accent });
    });

  const h2 = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun(text)],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 4 } },
    });

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ children: [new TextRun({ text: "PRAMAAN AI · RESEARCH REPORT", color: C.accent, bold: true, size: 15, characterSpacing: 30 })], spacing: { after: 160 } }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(d.title)] }),
  ];
  if (d.question && d.question !== d.title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: d.question, italics: true, color: C.muted })],
        indent: { left: 200 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.line, space: 8 } },
        spacing: { after: 160 },
      }),
    );
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: [d.mode, d.date, `${d.sources.length} sources cited`].filter(Boolean).join("  ·  "), color: C.faint, size: 17 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 10 } },
      spacing: { after: 240 },
    }),
  );

  if (d.summary.length) {
    children.push(h2("Executive summary"));
    for (const p of d.summary) {
      children.push(
        new Paragraph({
          children: runs(p),
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.accentSoft },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.accent, space: 10 } },
          indent: { left: 240, right: 120 },
          spacing: { before: 60, after: 60, line: 300 },
        }),
      );
    }
  }

  if (d.findings.length) {
    children.push(h2("Key findings"));
    d.findings.forEach((f, i) => {
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 200, after: 40 },
          indent: { left: 600, hanging: 600 },
          tabStops: [{ type: TabStopType.LEFT, position: 600 }],
          children: [
            new TextRun({ text: String(i + 1).padStart(2, "0"), font: SERIF, size: 26, color: C.accent }),
            new TextRun({ text: `\t${f.title}`, bold: true, color: C.ink }),
          ],
        }),
        new Paragraph({
          children: runs(f.body),
          indent: { left: 600 },
          spacing: { after: 140 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 8 } },
        }),
      );
    });
  }

  if (d.analysis.length) {
    children.push(h2("Analysis"));
    for (const a of d.analysis) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(a.heading)] }));
      for (const p of a.paragraphs) children.push(new Paragraph({ children: runs(p) }));
    }
  }

  if (d.limitations.length) {
    children.push(h2("Limitations"));
    for (const l of d.limitations) {
      children.push(
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: C.warm },
          children: runs(l).map((r) => r),
          run: { color: C.muted, size: 20 },
        }),
      );
    }
  }

  if (d.sources.length) {
    children.push(h2(numeric ? "Sources" : "References"));
    for (const s of d.sources) {
      const detail = numeric ? [s.authors.slice(0, 3).join(", "), s.publisher, s.year].filter(Boolean).join(", ") : "";
      const text = numeric ? [] : [new TextRun({ text: s.reference.replace(s.url, "").trim(), color: C.ink })];
      children.push(
        new Paragraph({
          keepLines: true,
          indent: { left: 480, hanging: 480 },
          spacing: { before: 60, after: 60 },
          tabStops: [{ type: TabStopType.LEFT, position: 480 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
          children: [
            new Bookmark({ id: `src-${s.number}`, children: [new TextRun({ text: numeric ? `${s.number}` : "•", bold: true, color: C.accent })] }),
            new TextRun({ text: "\t" }),
            ...(numeric
              ? [new TextRun({ text: s.title, color: C.ink, bold: true }), new TextRun({ text: ` — ${detail}`, color: C.muted }), new TextRun({ text: `  ${s.type.toUpperCase()}`, color: C.accent, size: 14 })]
              : text),
            ...(s.url
              ? [new TextRun({ text: "", break: 1 }), new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, color: C.accent, size: 16, underline: {} })] })]
              : []),
          ],
          run: { size: 18 },
        }),
      );
    }
  }

  const doc = new Document({
    title: d.title,
    description: d.question,
    creator: "Pramaan AI",
    styles: {
      default: { document: { run: { font: SANS, size: 20, color: C.ink2 }, paragraph: { spacing: { after: 140, line: 288 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: SERIF, size: 52, color: C.ink }, paragraph: { spacing: { after: 160 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 32, color: C.ink }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 25, color: C.ink }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
      ],
      characterStyles: [{ id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont", run: { color: C.accent } }],
    },
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { color: C.accent } } }] }],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, right: 1200, bottom: 1300, left: 1200, header: 600, footer: 600 } } },
        headers: {
          default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Pramaan AI · Research report", color: C.faint, size: 15 })] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: 9500 }],
                children: [
                  new TextRun({ text: d.title.length > 80 ? `${d.title.slice(0, 77)}…` : d.title, color: C.faint, size: 15 }),
                  new TextRun({ children: ["\t", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], color: C.faint, size: 15 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
