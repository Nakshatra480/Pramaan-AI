/**
 * Follow-up routing for demo mode — mirrors the backend's keyword fallback
 * (backend/app/research/follow_ups.py): a request to change the report is a revision,
 * anything else is a question.
 */
const REVISE =
  /\b(re-?write|re-?generate|re-?do|re-?draft|re-?work|re-?structure|re-?format|re-?phrase|re-?word|revise|edit|update the (?:report|summary|findings)|make (?:it|the (?:report|summary|findings|analysis)|this)\b|(?:shorter|longer|simpler|briefer|more concise|more detailed|less technical|more technical)\b|shorten|lengthen|condense|simplify|expand (?:on )?(?:the|it|this|each)|(?:focus|concentrate) (?:more )?on|(?:add|include) (?:a |an )?(?:section|paragraph|table|comparison|chapter|part)|remove (?:the |a )?(?:section|paragraph|part)|drop the|leave out|exclude|(?:in|as|into|with) (?:bullet points|bullets|a table|plain (?:english|language)|layman'?s terms|simple terms)|for (?:executives|beginners|a (?:general|non-technical|technical) audience|students|investors|policymakers)|(?:change|adjust|switch) (?:the )?(?:tone|style|focus|format|structure|length)|translate (?:it|the report|this)|(?:new|another|different) version)/i;
const QUESTION_START = /^\s*(what|which|who|whom|whose|when|where|why|how|is|are|was|were|does|do|did|can|could|should|would|will|has|have)\b/i;
const POLITE_REQUEST = /^\s*(can|could|would|will) you\b/i;

export type FollowUpKind = "revise" | "question";

export function followUpKind(question: string): FollowUpKind {
  const q = question.trim();
  const asks = QUESTION_START.test(q) && q.endsWith("?") && !POLITE_REQUEST.test(q);
  return REVISE.test(q) && !asks ? "revise" : "question";
}

/** Response length a revision asks for ("make it shorter" → concise). */
export function revisionLength(instructions: string): "concise" | "comprehensive" | null {
  if (/\b(shorter|shorten|brief|briefer|concise|condense|summar|tl;?dr|one page|less detail|fewer)\b/i.test(instructions)) return "concise";
  if (/\b(longer|lengthen|more detail|in[- ]depth|deeper|comprehensive|expand|elaborate|thorough)\b/i.test(instructions)) return "comprehensive";
  return null;
}
