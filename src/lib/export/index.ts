/** Report export: one document model, rendered as PDF (print), Word (.docx) and Markdown. */
export { answerText, buildExportDocument, downloadBlob, plain, slugify, type ExportDocument } from "./document";
export { toMarkdown } from "./markdown";
export { printReport, toPrintHtml } from "./pdf";
